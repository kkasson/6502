/**
  * 6502 Microprocessor & Assembler Simulator
  *
  *
  * Copyright 2016 Kevin Kasson
  *
  * This software is provided for educational use only.  Reproduction or modification of any kind is forbidden without the permission of the author.
  * 
  * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  */

/*
Memory Map:
$0000 to $00FF - Zero Page RAM
$0100 to $01FF - Stack Memory
$0200 to $06AF - Memory Mapped Output to 160 x 128 screen
$06B0 - Writing anything to this location clears the screen
$06B1 - Memory Mapped Sound device - Beeps when anything is written to it.
$06B2 - $06DF - Reserved for Memory Mapped Devices
$06E0 - $06EF - Memory Mapped to keyboard - $06E0 is left key, $06E1 up, $06E2 right, $06E3 down, $06E4 enter.
$06F0 - $06F2 - Memmory Mapped to mouse - $06F0 is left button, $06F1 is right button, $06F2 is middle button.
$06F3 - $06FF - Reserved.
$0700 to $7FFF - RAM
$8000 to $FFFF - Program code.  Program execution begins at $8000.
$FFFA to $FFFB - Stores location of NMI handler routine
$FFFC to $FFFD - Stores location of Reset handler routine
$FFFE to $FFFF - Stores location of BRK handler routine
*/

//Exception Definitions:
var exceptions = { //Thist variable is an object which contains all the exception messages.  The exceptions could just be defined as functions without this object, but it adds a little clarity to call it exception.labelNotFound instead of just labelNotFound
  labelNotFound: function (label,branch = false) { this.num = (branch ? 2 : 1); this.message = "Could not resolve " + (branch ? "branch " : "") + "label \"" + label + "\"."; },
  branchOutOfRange: function (label,range) { this.num = 3; this.message = "Branch label \"" + label + "\" is out of range: " + range + "."; },
  operandTypeError: function (operand,type,command) { this.num = 4; this.message = "Invalid operand type for instruction " + command + ".  Operand: " + operand + "."; },
  reservedWord: function(cons) { this.num = 5; this.message = cons + " is a reserved keyword."; },
  constantAlreadyDefined: function(cons) { this.num = 6; this.message = "Constant " + cons + " has already been defined."; },
  constantNotDefined: function (cons) { this.num = 7; this.message = "Constant " + cons + " has not yet been defined."; },
  getHighLowByteArgs: function () { this.num = 8; this.message = "Second argument of getHighLowByte must be either \"<\" or \">\"."; },
  orgArgs: function () { this.num = 9; this.message = "No memory location given for ORG directive."; },
  dataUnclosed: function (str) { this.num = 10; this.message = "Unclosed string found in data directive: " + str; },
  dataMalformedAfterString: function (data) { this.num = 11; this.message = "Found garbage data after string in data directive: " + data; },
  dataMalformed: function (data) { this.num = 12; this.message = "Data given in data directive is malformed: " + data; },
  dataHighLowError: function () { this.num = 13; this.message = "High/low byte (\"<\" and \">\") cannot be specified when declaring a word."; },
  labelAlreadyDefined: function (label) { this.num = 14; this.message = "Label " + label + " has already been defined."; },
  labelAndConstant: function (label) { this.num = 15; this.message = "Label " + label + " is already defined as a constant."; },
  unknownInstruction: function (ins) { this.num = 16; this.message = "Unknown instruction \"" + ins + "\"."; },
  convertValueError: function (v) { this.num = 17; this.message = "Could not convert value " + v + "."; },
  addValueError: function (i,v) { this.num = 18; this.message = "Could not add " + i + " to " + v + "."; },
  labelSingleByte: function() { this.num = 19; this.message = "Label cannot be used for single-byte instruction.  Please specify high (\">\") or low (\"<\") byte."; },
  orgArgInvalid: function(v) { this.num = 20; this.message = "Invalid memory location given for ORG directive: " + v; },
  invalidAddressingMode: function (operand,t,command) { this.num = 21; this.message="Addressing";
    if (t & IMMEDIATE) { (this.message = "Immediate addressing"); }
    else if (t & ZEROPAGE) { (this.message = "Zero Page addressing"); }
    else if (t & ZEROPAGEX) { (this.message = "Zero Page, X addressing"); }
    else if (t & ZEROPAGEY) { (this.message = "Zero Page, Y addressing"); }
    else if (t & ABSOLUTE) { (this.message = "Absolute addressing"); }
    else if (t & ABSOLUTEX) { (this.message = "Absolute, X addressing"); }
    else if (t & ABSOLUTEY) { (this.message = "Absolute, Y addressing"); }
    else if (t & INDIRECT) { (this.message = "Indirect addressing"); }
    else if (t & INDIRECTX) { (this.message = "Indirect, X addressing"); }
    else if (t & INDIRECTY) { (this.message = "Indirect, Y addressing"); }
    this.message += " mode not available for instruction " + command + ".  Operand: " + operand + ".";
  },
  operandError: function (operand) { this.num = 22; this.message = "Could not parse operand: " + operand + "."; },
};

//Constant Definitions: //These constants are used when determining the label type...I could just use a single variable with values 0 through 9, but this way I can use expressions like (getOperandType & ZEROPAGE) for clarity.
var IMMEDIATE = 1;
var ZEROPAGE = 2;
var ZEROPAGEX = 4;
var ZEROPAGEY = 8;
var ABSOLUTE = 16;
var ABSOLUTEX = 32;
var ABSOLUTEY = 64;
var INDIRECT = 128;
var INDIRECTX = 256;
var INDIRECTY = 512;

//Object Definitions: //These objects control certain aspects of the simulator.

var statusWindowObj = function() { //This object controls the Processor Status text area.
  var wind = document.getElementById('statuswindow');
  function write(val) {
    wind.appendChild(document.createTextNode(val));
    wind.appendChild(document.createElement("br"));
    wind.scrollTop = wind.scrollHeight;
  }
  function writeError(val) {
    var s = document.createElement("span");
    s.style="color: #ff1010;";
    s.appendChild(document.createTextNode(val));
    wind.appendChild(s);
    wind.appendChild(document.createElement("br"));
    wind.scrollTop = wind.scrollHeight;
  }
  function clear() { return wind.innerHTML = ""; }
  return { write: write, writeError: writeError, clear: clear }
}

var memoryObj = function() { //This object controls the memory associated with the Processor.
  var mem = new Array(65536); //Memory is from $0000 to $FFFF
  var PC = 0x0800; //The Program Counter starts at $0800

  function writeByte(v,addr=undefined) { //This function writes a byte to memory.
    //If the addr argument is defined, the function writes the value v to that address.
    //Otherwise, the function acts as a way to push memory to the current location.
    //The byte is written to the current memory location, and then the Program Counter is incremented.  This functionality is used when assembling the code.

    if (addr == undefined) { //Check if we've been given a location,
      addr = this.PC; //And if not use the current location.
      this.PC += 1; //And increment the Program Counter.
    }
    if (isNaN(v)) { return mem[addr] = v; } //This allows us to write undefined bytes to memory.

    mem[addr] = v & 0xff; //Otherwise, just write the value. (& 0xff, since memory locations are 8-bit)

    //Check if we've written to any memory-mapped devices:
    if ((addr > 0x1ff) && (addr < 0x6b0)) { //$0200 through $06af is memory-mapped to the 160 x 128 screen.
      screen.drawPixel(((addr - 512) % 40),(Math.floor((addr - 512) / 40)), memory.read(addr));
    }
    if ((addr == 0x6b0) && (v > 0)) { screen.clear(); memory.writeByte(0,addr); } //Writing anything to $06b0 clears the screen.
    if ((addr == 0x6b1) && (v > 0)) { beep(); memory.writeByte(0,addr) } //Memory $06b1 is mapped to a beeper.
    return true;
  }
  function writeWord(v,addr=undefined) { //This function is the same as writeByte, but ensures that two bytes are written.
    if (addr == undefined) { 
      mem[this.PC] = v & 0xff;
      this.PC += 1;
      mem[this.PC] = (v >> 8) & 0xff;
      this.PC += 1;
      return this.PC;
    }
    else {
      mem[addr] = v & 0xff;
      mem[addr+1] = (v >> 8) & 0xff;
      return 0;
    }
  }
  function read(addr) { return mem[addr]; } //Returns the contents of memory location addr.
  function readWord(addr) { return (mem[addr] | (mem[addr+1] << 8)); } //Returns the contents of the word at memory location addr, read in little-endian style.
  function reset() { //Clears all memory and resets the Program Counter.
    mem = new Array(65536);
    this.PC = 0x0800;
  }
  return { read:read, readWord: readWord, writeByte: writeByte, writeWord: writeWord, reset: reset, PC: PC,
           get size() { return mem.length; }
         }
}

var screenObj = function() { //This object handles the output screen.
  //The screen is a memory-mapped 160x120 display, one third of a typical 480x360 display.
  //To reduce the amount of memory reserved to the screen, each memory location write a 4-pixel square to the screen.
  //The screen is mapped from $0200 to $06af.  The pixel is turned on by writing a color to the memory location.
  //The color is stored as an 8-bit RGB value.  Bits 0 and 1 are the blue element, bits 2 3 and 4 are green, and bits 5 6 and 7 are red.
  //A red value of 000 is #00 and 111 is #FF.  The intermediate values are intermediate colors.  This allows 256 colors to be used.
  //For example, a color value of 01110011 gives #6C90FF, a medium blue.
  //Writing any value besides 0 to $06b0 clears the whole screen.

  var ctx = document.getElementById('canvas').getContext("2d");
  function drawPixel(x,y,color) { return (ctx.fillStyle = "#" + d2h(36 * ((color >> 5) & 7) + 3) + d2h(36 * ((color >> 2) & 7) + 3) + d2h(85 * (color & 3))) & ctx.fillRect(x*4,y*4,4,4); }
  function clear() { return (ctx.fillStyle = "#000000") & ctx.fillRect(0,0,160,120); }
  clear();
  return { clear: clear, drawPixel: drawPixel }
}

var MPUObj = function() { //This object stores internal microprocessor (MPU) data, such as the register values.
  var A = 0;
  var X = 0;
  var Y = 0;
  function reset() {
    this.A = 0;
    this.X = 0;
    this.Y = 0;
  }
  return { A:A, X:X, Y:Y, reset: reset }
}

var debugObj = function() { //This object handles the debug window.
  function updateDebug() {
    v = P.getFlags().toString(2);
    while (v.length < 8) {
      v = "0" + v;
    }
    document.getElementById('debugFlags').innerText = v;
    document.getElementById('debugPC').innerText = "$" + d2h(memory.PC,4);
    document.getElementById('debugA').innerText = "$" + d2h(MPU.A);
    document.getElementById('debugX').innerText = "$" + d2h(MPU.X);
    document.getElementById('debugY').innerText = "$" + d2h(MPU.Y);
    document.getElementById('debugSP').innerText = "$" + d2h(stack.SP);
  }
  return { updateDebug: updateDebug }
}

var PObj = function() { //This object represents the processor status flags.
  var flags = 36;  //The Interrupt flag and bit 5 are both set when the processor is powered on.
  function reset() { return this.flags = 36; } //Resets all flags
  function setBit(v) { //Set the vth bit of the processor flags.  Must be between 0 and 7.
    if ((v < 0) || (v > 7)) { return false; }
    return this.flags |= Math.pow(2,v);
  }
  function clearBit(v) { //Clears the vth bit of the processor flags.  Must be between 0 and 7.
    if ((v < 0) || (v > 7)) { return false; }
    return this.flags = (this.flags & (~Math.pow(2,v)));
  }
  function setFlagsTo(v) { return this.flags = v; } //Sets the current flags to a given value.  Used, for example, when pulling processor flags from the stack.
  function getFlags() { return this.flags; } //Returns the current flags.
  function setZN(v) { //This function takes in the result of an instruction and sets the Z and N flags accordingly.
    return ((((v & 0x80) > 0) ? this.flags |= 0xa0 : this.flags &= 0x7f) & ((v == 0) ? this.flags |= 0x02 : this.flags &= 0xfd));
  }
  return { reset: reset, setBit: setBit, clearBit: clearBit, setFlagsTo: setFlagsTo, getFlags: getFlags, setZN: setZN,
           get C() { return (this.flags & 1) > 0; }, set C(v) { if (v) { return this.flags|= 1; } else { return this.flags = (this.flags & (~1) | 32) } }, //Create getters
           get Z() { return (this.flags & 2) > 0; }, set Z(v) { if (v) { return this.flags|= 2; } else { return this.flags = (this.flags & (~2) | 32) } }, //and setters
           get I() { return (this.flags & 4) > 0; }, set I(v) { if (v) { return this.flags|= 4; } else { return this.flags = (this.flags & (~4) | 32) } }, //for each
           get D() { return (this.flags & 8) > 0; }, set D(v) { if (v) { return this.flags|= 8; } else { return this.flags = (this.flags & (~8) | 32) } }, //flag.
           get B() { return (this.flags & 16) > 0; }, set B(v) { if (v) { return this.flags|= 16; } else { return this.flags = (this.flags & (~16) | 32) } },
           get V() { return (this.flags & 64) > 0; }, set V(v) { if (v) { return this.flags|= 64; } else { return this.flags = (this.flags & (~64) | 32) } },
           get N() { return (this.flags & 128) > 0; }, set N(v) { if (v) { return this.flags|= 128; } else { return this.flags = (this.flags & (~128) | 32) } }
  }
}

var stackObj = function() { //This object allows an easy implementation of the stack and stack pointer.  The stack is hardwired to memory locations $0100 to $01FF.
  var SP = 0xff; //Start the stack pointer at $FF.  This should be coded in the assembly code initialization routine, but we'll also do it here also.
  function push(val) { //Pushes a value onto the stack and increments the stack pointer.
    var s = memory.writeByte(val,(0x100 + this.SP));
    this.SP -= 1;
    if (this.SP < 0) { //Check if the stack pointer has overflowed.  If the stack pointer is below memory location $0100, move it back to $01FF.
      this.SP = 0xff; //This means the first objects written to the stack will begin to be overwritten.
    }
    return s; //Return the assigned value, if the assignement was successful.
  }
  function pull() { //Pulls a value from the stack and decrements the stack pointer.
    this.SP+=1;
    if (this.SP > 0xff) { //Check for overflow.  If the stack pointer is above memory location $01FF, move it to $0100.
      this.SP = 0;
    }
    return memory.read(0x100 + this.SP); // Return the pulled value.
  }
  function reset() { //Resets the stack pointer to $ff.
    return this.SP = 0xff;
  }
  return { push: push, pull: pull, reset: reset, SP: SP }
}

//Variable Declarations:
var verbose = false;
var debugOn = false;
var instructionTimer = null;
var programExecuting = false;
var statusWindow = new statusWindowObj();
var screen = new screenObj();
var debug = new debugObj();
var P = new PObj();
var MPU = new MPUObj();
var stack = new stackObj();
var memory = new memoryObj();
var constants = new Object();
var labels = new Object();
var labelTracker = new Array();
var labelByteTracker = new Array();
var branchTracker = new Array();
var output = "";
var input = "";
var reserved = { ADC:1,AND:1,ASL:1,BCC:1,BCS:1,BEQ:1,BIT:1,BMI:1,BNE:1,BPL:1,BRK:1,BVC:1,BVS:1,CLC:1,
                 CLD:1,CLI:1,CLV:1,CMP:1,CPX:1,CPY:1,DEC:1,DEX:1,DEY:1,EOR:1,INC:1,INX:1,INY:1,JMP:1,
                 JSR:1,LDA:1,LDX:1,LDY:1,LSR:1,NOP:1,ORA:1,PHA:1,PHP:1,PLA:1,PLP:1,ROL:1,ROR:1,RTI:1,
                 RTS:1,SBC:1,SEC:1,SED:1,SEI:1,STA:1,STX:1,STY:1,TAX:1,TAY:1,TSX:1,TXA:1,TXS:1,TYA:1,
                 EQU:1,ORG:1,HLT:1,OUT:1,OUY:1,IN:1,WAI:1,DEFINE:1,".ORG":1,".DB":1,".DW":1 } //Stores reserved words which cannot be used as labels or constants.

//Math and conversion functions:
function d2h(d,l=2) { //Convert a decimal value to a hex string.
  //If the second argument is given, pads the string with 0s to that length.
  //d2h(127,4) returns "007f".

  var h = (+d).toString(16);
  while (h.length < l) { h = "0" + h; }
  return h;
}

function getTwosComplement(v) { //Converts an 8-bit value to its Two's Complement equivalent.
  //getTwosComplement(250) returns -6.
  //If the value is lower than 128, i.e. positive, the original value is returned.

  if (v & 128) { return -(((~v) & 0xff) + 1); }
  else return v;
}

function bcd(b) { //Takes in a packed Binary Coded Decimal number and returns the equivalent decimal number.
  //bcd(147) returns 93.  In binary, 147 is 10010011.  In packed BCD format, the high and low nibbles of the byte represent the two digits of a decimal number.
  //1001 is 9 and 0011 is 3, so 10010011 is converted to 93.

  return (b & 15) + (((b >>> 4) & 15) * 10);
}


function getOperandType(v) { //Tests an operand to determine which addressing mode is being used.
  if (v in constants) { v = constants[v]; }
  else if ((v.substring(0,1) == "#") && (v.substring(1) in constants)) { v = "#" + constants[v.substring(1)]; }
  if (/^#([0-9]+|\$[A-F0-9]+|%[01]+)$/i.test(v)) return IMMEDIATE;
  if (/^\(([0-9]+|\$[A-F0-9]+|%[01]+)\)$/i.test(v)) return INDIRECT;
  if (/^\(([0-9]+|\$[A-F0-9]+|%[01]+),X\)$/i.test(v)) {
    var n = 256;
    var a = v.substring(1,v.indexOf(","));
    if (a.substring(0,1) == "$") { n = parseInt(a.substring(1),16); }
    else if (a.substring(0,1) == "%") { n = parseInt(a.substring(1),2); }
    else n = parseInt(a,10);
    if (n < 256) return INDIRECTX;
  }
  if (/^\(([0-9]+|\$[A-F0-9]+|%[01]+)\),Y$/i.test(v)) {
    var n = 256;
    var a = v.substring(1,v.indexOf(")"));
    if (a.substring(0,1) == "$") { n = parseInt(a.substring(1),16); }
    else if (a.substring(0,1) == "%") { n = parseInt(a.substring(1),2); }
    else n = parseInt(a,10);
    if (n < 256) return INDIRECTY;
  }
  if (/^([0-9]+|\$[A-F0-9]+|%[0-1]+)(,(X|Y))?$/i.test(v)) {
     var n = 256;
     var xy = 0;
     var t = v;
     if (t.indexOf(",") > -1) {
       if (t.substring(t.indexOf(",") + 1).toUpperCase() == "X") { xy = ZEROPAGEX - ZEROPAGE; }
       else { xy = ZEROPAGEY - ZEROPAGE; }
       t = t.substring(0,t.indexOf(","));
     }
     if (t.substring(0,1) == "$") { n = parseInt(t.substring(1),16); }
     else if (t.substring(0,1) == "%") { n = parseInt(t.substring(1),2); }
     else { n = parseInt(t,10); }
     if (n < 256) return ZEROPAGE + xy;
  }
  if (/^([0-9]+|\$[A-F0-9]+|%[0-1]+),X$/i.test(v)) return ABSOLUTEX;
  if (/^([0-9]+|\$[A-F0-9]+|%[0-1]+),Y$/i.test(v)) return ABSOLUTEY;
  if (/^([0-9]+|\$[A-F0-9]+|%[0-1]+)$/i.test(v)) return ABSOLUTE;
  return 0; //Return 0 if the operand doesn't match any acceptable addressing modes.
}

function convertValue(v) { //Converts a string value to its numerical equivalent.
  //In 6502 assembly language hex values begin with $ and binary values with %
  //This function takes, for example, $ff and returns 255.  It also attempts to resolve labels and constants.

  if (v in labels) {
    return labels[v];
  }
  hlb = v.substring(0,1);
  if ((hlb == "<") || (hlb == ">")) {
    v = v.substring(1);
  }
  else { hlb = undefined; }
  if (v in constants) {
    v = constants[v];
  }
  v = getHighLowByte(v,hlb);
  var matches = v.match(/^[#\(]?([0-9]+|\$[A-F0-9]+|%[0-1]+)[,\)]?.*/i);
  if (matches == null) throw new exceptions.convertValueError(v);
  if (matches[1].substring(0,1) == "$") {
    return parseInt(matches[1].substring(1),16);
  }
  if (matches[1].substring(0,1) == "%") {
    return parseInt(matches[1].substring(1),2);
  }
  return parseInt(matches[1],10);
}

function writeInstruction(operand,im,zp,zpx,zpy,abs,abx,aby,inx,iny,command) { //This function takes an operand and bytes to write for each addressing mode and write the appropriate instruction to memory.
  //writeInstruction("#$55",0x11,...) will write 0x11 and 0x55 to memory.
  //writeInstruction ("#$55",undefined,0x20,...) will throw an error, because there is no instruction given for the matching addressing mode.

  //This first section of the function resolves constants in the operand.
  if (operand.substring(0,1) != "(") {
    if (operand.indexOf(",") > -1) {
      if (operand.substring(0,operand.indexOf(",")) in constants) {
        operand = constants[operand.substring(0,operand.indexOf(","))] + operand.substring(operand.indexOf(","));
      }
    }
  }
  else {
    if (operand.indexOf("),") > -1) { //Indirect Y
      if (operand.substring(1,operand.indexOf("),")) in constants) { //If it's a constant, replace it.
        operand = "(" + constants[operand.substring(1,operand.indexOf("),"))] + operand.substring(operand.indexOf("),"));
      }
      else if (/^([0-9]+|\$[A-F0-9]+|%[01]+).*/.test(operand.substring(1)) == false) { //Otherwise, check if it starts with a literal,
        if ((operand.substring(1,2) != "<") && (operand.substring(1,2) != ">")) { //And if not, check if a high/low byte is already defined.  If not, force the low byte.
          operand = "(<" + operand.substring(1);
        }
      }
    }
    else if (operand.indexOf(",") > -1) { //Indirect X
      if (operand.substring(1,operand.indexOf(",")) in constants) { //If it's a constant, replace it.
        operand = "(" + constants[operand.substring(1,operand.indexOf(","))] + operand.substring(operand.indexOf(","));
      }
      else if (/^([0-9]+|\$[A-F0-9]+|%[01]+).*/.test(operand.substring(1)) == false) { //Otherwise, check if it starts with a literal,
        if ((operand.substring(1,2) != "<") && (operand.substring(1,2) != ">")) { //And if not, check if a high/low byte is already defined.  If not, force the low byte.
          operand = "(<" + operand.substring(1);
        }
      }
    }
  }
  if (operand in constants) { operand = constants[operand]; }
  var hlb = "";
  if (operand.substring(0,2) == "(<") { hlb = "<"; operand = "(" + operand.substring(2); }
  else if (operand.substring(0,2) == "(>") { hlb = ">"; operand = "(" + operand.substring(2); }
  else if (operand.substring(0,1) == "<") { hlb = "<"; operand=operand.substring(1); }
  else if (operand.substring(0,1) == ">") { hlb = ">"; operand=operand.substring(1); }
  var t = getOperandType(getOperand(operand,false,false,hlb));
  if ((hlb != "") && (t < INDIRECTX) && (t > ZEROPAGEY)) { t = (t >> 3) & 255; }
  if ((t & ZEROPAGE) && (zp == undefined)) { t = ABSOLUTE; }
  if ((t & ZEROPAGEX) && (zpx == undefined)) { t = ABSOLUTEX; }
  if ((t & ZEROPAGEY) && (zpy == undefined)) { t = ABSOLUTEY; }
  if (t & IMMEDIATE) {
    if (im != undefined) { memory.writeByte(im); }
    else { throw new exceptions.invalidAddressingMode(operand,t,command); }
  }
  else if (t & ZEROPAGE) {
    if (zp != undefined) { memory.writeByte(zp); }
    else { throw new exceptions.invalidAddressingMode(operand,t,command); }
  }
  else if (t & ZEROPAGEX) {
    if (zpx != undefined) { memory.writeByte(zpx); }
    else { throw new exceptions.invalidAddressingMode(operand,t,command); }
  }
  else if (t & ZEROPAGEY) {
    if (zpy != undefined) { memory.writeByte(zpy); }
    else { throw new exceptions.invalidAddressingMode(operand,t,command); }
  }
  else if (t & ABSOLUTE) {
    if (abs != undefined) { memory.writeByte(abs); }
    else { throw new exceptions.invalidAddressingMode(operand,t,command); }
  }
  else if (t & ABSOLUTEX) {
    if (abx != undefined) { memory.writeByte(abx); }
    else { throw new exceptions.invalidAddressingMode(operand,t,command); }
  }
  else if (t & ABSOLUTEY) {
    if (aby != undefined) { memory.writeByte(aby); }
    else { throw new exceptions.invalidAddressingMode(operand,t,command); }
  }
  else if (t & INDIRECT) {
    throw new exceptions.invalidAddressingMode(operand,t,command);
  }
  else if (t & INDIRECTX) {
    if (inx != undefined) { memory.writeByte(inx); }
    else { throw new exceptions.invalidAddressingMode(operand,t,command); }
  }
  else if (t & INDIRECTY) {
    if (iny != undefined) { memory.writeByte(iny); }
    else { throw new exceptions.invalidAddressingMode(operand,t,command); }
  }
  else { throw new exceptions.operandTypeError(hlb + operand,t,command); }
  if ((t & ABSOLUTE) || (t & ABSOLUTEX) || (t & ABSOLUTEY) || (t & INDIRECT)) {
    var r = getOperand(operand,true);
    if (r == undefined) {
      labelTracker.push(memory.PC);
      if (t & INDIRECT) { operand = operand.substring(1,operand.indexOf(")")); }
      if ((t & ABSOLUTEX) || (t & ABSOLUTEY)) { operand = operand.substring(0,operand.indexOf(",")); }
      labelTracker.push(hlb + operand);
      memory.writeByte(undefined);
      memory.writeByte(undefined);
    }
    else {
      memory.writeWord(convertValue(r));
    }
  }
  else {
    var r = getOperand(operand,true);
    if (r == undefined) {
      if (hlb == "") {
        throw new exceptions.labelSingleByte();
      }
      else {
        if (operand.substring(0,1) == "(") { operand = operand.substring(1); }
        if (operand.indexOf("),") > -1) { operand = operand.substring(0,operand.indexOf(")")); }
        if (operand.indexOf(",") > -1) { operand = operand.substring(0,operand.indexOf(",")); }
        labelByteTracker.push(memory.PC);
        labelByteTracker.push(hlb + operand);
        memory.writeByte(undefined);
      }
    }
    else {
      memory.writeByte(convertValue(r));
    }
  }
  return true;
}

function writeBranchInstruction(br,operand,command) { //Write a branch instruction, or pushes a label to the BranchTracker if the operand is a label.
  if (operand in constants) { operand = constants[operand]; }
  var r = getOperand(operand,true,true);
  if (r == undefined) {
    memory.writeByte(br)
    branchTracker.push(memory.PC);
    branchTracker.push(operand);
    memory.writeByte(undefined);
  }
  else {
    var t = getOperandType(getOperand(operand,false));
    if (t == 0) {
      throw new exceptions.operandTypeError(operand,t,command);
    }
    else if (t & ZEROPAGE) {
      memory.writeByte(br);
      memory.writeByte(convertValue(getOperand(operand,true,true)));
    }
    else {
      throw new exceptions.invalidAddressingMode(operand,t,command);
    }
  }
}

function writeJumpInstruction(abs,ind,operand,command) { //Write a jump instruction, or pushes a label to the LabelTracker if the operand is a label.
  if ((operand.substring(0,1) == "(") && (operand.substring(1,operand.length-1) in constants)) { operand = "(" + constants[operand.substring(1,operand.length-1)]; + operand.substring(operand.length-1); }
  else if (operand in constants) { operand = constants[operand]; }
  var t = getOperandType(getOperand(operand,false));
  if (t == 0) {
    throw new exceptions.operandTypeError(operand,t,command);
  }
  else if ((t & ZEROPAGE) || (t & ABSOLUTE) || (t & INDIRECT)) {
    if (t & INDIRECT) { memory.writeByte(ind); operand = operand.substring(1,operand.length-1); }
    else memory.writeByte(abs);
  }
  else {
    throw new exceptions.invalidAddressingMode(operand,t,command);
  }
  var r = getOperand(operand,true);
  if (r == undefined) {
    labelTracker.push(memory.PC);
    labelTracker.push(operand);
    memory.writeByte(undefined);
    memory.writeByte(undefined);
  }
  else {
    memory.writeWord(convertValue(r));
  }
}



function getOperand(operand,remove,strict = false,hlb = "") {
  var matches = operand.match(/^(\(|#)?(<|>)?(([0-9]+|\$[A-F0-9]+|%[01]+)|([A-Z0-9_]+))((\+|-)(([0-9]+|\$[A-F0-9]+|%[01]+)|([A-Z0-9_]+)))?(\)?,?(X|Y)?\)?)?$/i);
  if (matches == null) throw new exceptions.operandError(operand);
  if (strict) {
    if ((matches[1] != undefined) || (matches[11] != undefined)) { return undefined; }
  }
  if (matches[3] == undefined) throw new exceptions.operandError(operand);
  if ((/^([0-9]+|\$[A-F0-9]+|%[01]+)$/i.test(matches[3]) == false) && (!(matches[3] in constants))) {
      if (remove) return undefined; //If the first term isn't a constant or a literal, it might be a label.  We return undefined to signify that we should add it to the label tracker.
      else {
        if (hlb == "") { matches[3] = "$2111"; }
        else { matches[3] = "$02"; }
      }
  }
  if (matches[6] != undefined) {
    if ((/^([0-9]+|\$[A-F0-9]+|%[01]+)$/i.test(matches[6].substring(1)) == false) && (!(matches[6].substring(1) in constants))) {
      if (remove) return undefined;
      else {
        if (hlb == "") { matches[6] = "$-0001"; }
        else { matches[6] = "-$01"; }
      }
    }
  }
  if (remove) return getHighLowByte(addValue(matches[3],matches[6]),matches[2]);
  return ((matches[1] == undefined) ? "" : matches[1])+getHighLowByte(addValue(matches[3],matches[6]),matches[2])+((matches[11] == undefined) ? "" : matches[11]);
}


function sanitizeAssembly(asm) {  //This functions cleans up the assembly code before it's processed.  It removes excess whitespace and comments, and outputs an array containing each assembly instruction.
  //It also removes spaces between items in a .db/.dw/.dd construct and puts all the data in a single array element so it can be processed later.
  var outputarray = new Array();
  var inputarray = asm.replace(/[ \t]+/g," ").split(/\n/g); //First replace excess spaces and tabs with a single space, and then split it at the line breaks
  for (j=0;j<inputarray.length;j++) { //Loop through each line
    if (inputarray[j].indexOf(";") > -1) { //And check if it contains a comment
      inputarray[j] = inputarray[j].substring(0,inputarray[j].indexOf(";")); //Remove the comment, if so
    }
    inputarray[j]=inputarray[j].trim(); //Trim the excess whitespace

    if (inputarray[j].length > 0) { //This section checks for labels that are not marked with a : and attempts to parse them as labels.
      // This allows syntax such as this:
      //
      //        DEX
      // label1 INY
      //        ADC #$a4
      //
      // As well as this:
      //
      //        DEY
      // label7
      //        INY
      //
      // In order to be parsed correctly, these unmarked labels must be the only instruction on the line, or must be followed by a reserved word.

      if (inputarray[j].indexOf(" ") < 0) {
        if (!(inputarray[j].toUpperCase() in reserved)) {
          if (inputarray[j].substring(inputarray[j].length - 1) != ":") {
            inputarray[j] = inputarray[j] + ":";
          }
        }
      }
      else if (!(inputarray[j].substring(0,inputarray[j].indexOf(" ")).toUpperCase() in reserved)) {
        var t = inputarray[j].substring(inputarray[j].indexOf(" ")+1);
        if (t.indexOf(" ") > -1) {
          if ((t.substring(0,1) != "=") && ((t.substring(0,3).toUpperCase() != "EQU"))) {
            if (t.substring(0,t.indexOf(" ")).toUpperCase() in reserved) {
              if (inputarray[j].substring(inputarray[j].indexOf(" ")-1,inputarray[j].indexOf(" ")) != ":") {
                inputarray[j] = inputarray[j].substring(0,inputarray[j].indexOf(" ")) + ":" + inputarray[j].substring(inputarray[j].indexOf(" "));
              }
            }
          }
        }
        else {
          if (t.toUpperCase() in reserved) {
            if (inputarray[j].substring(inputarray[j].indexOf(" ")-1,inputarray[j].indexOf(" ")) != ":") {
              inputarray[j] = inputarray[j].substring(0,inputarray[j].indexOf(" ")) + ":" + inputarray[j].substring(inputarray[j].indexOf(" "));
            }
          }
        }
      }
    }

    var regex = /^(\w*: )?\.d[bw] /ig
    if (regex.test(inputarray[j])) { //If the line is declaring data, clean up the data so we can parse it correctly later.
      var out = inputarray[j].substring(0,inputarray[j].indexOf(".d") + 4);
      inputarray[j] = inputarray[j].substring(inputarray[j].indexOf(".d") + 4);
      var quotechar = "";
      for (i=0;i<inputarray[j].length;i++) {
        if (inputarray[j].substring(i,i+1) == '"') {
          if (quotechar == "") {
            quotechar = '"';
            out += '"';
            continue;
          }
          else if (quotechar == '"') {
            quotechar = "";
            out += '"';
            continue;
          }
          else if (quotechar == '"') {
            out += '"';
            continue;
          }
        }
        else if (inputarray[j].substring(i,i+1) == "'") {
          if (quotechar == "") {
            quotechar = "'";
            out += "'";
            continue;
          }
          else if (quotechar == "'") {
            quotechar = "";
            out += "'";
            continue;
          }
          else if (quotechar == '"') {
            out += "'";
            continue;
          }
        }
        else if (inputarray[j].substring(i,i+1) == " ") {
          if (quotechar != "") {
            out += quotechar + ",32," + quotechar;
            continue;
          }
        }
        else out += inputarray[j].substring(i,i+1);
      }
      inputarray[j]=out;
    }
    if (inputarray[j].length > 1) { outputarray.push(inputarray[j]); } //If the line isn't empty, add it to the output array.
  }
  return outputarray.join("\n").replace(/\n/g," ").split(" "); //Output the sanitized array.
}

function addConstant(cons,val) { //Defines a constant
  //First argument is the constant to be defined.
  //Second argument is what to define it as, which can be a literal input or another constant, + or - another term.
  //For example, addConstant("screenSecondLocation","screenLocation+$ff")

  var hlb = val.substring(0,1);
  if ((hlb == ">") || (hlb == "<")) { val = val.substring(1); }
  else { hlb = undefined; }
  if (val.indexOf("+") > -1) { val = addValue(val.substring(0,val.indexOf("+")),val.substring(val.indexOf("+"))); }
  else if (val.indexOf("-") > -1) { val = addValue(val.substring(0,val.indexOf("-")),val.substring(val.indexOf("-"))); }
  else { val = addValue(val,undefined); }
  val = getHighLowByte(val,hlb);
  if (cons.toUpperCase() in reserved) { throw new exceptions.reservedWord(cons); } //Throw an exception if it's a reserved word.
  if (cons in constants) { //Throw an exception if it's already been defined...
    if (typeof constants[cons] === "function") {
      throw new exceptions.reservedWord(cons); //either by being a JavaScript function...
    }
    else {
      throw new exceptions.constantAlreadyDefined(cons); //or by being previously defined in the assembly code.
    }
  }
  constants[cons] = val; //If it's a valid constant, assign it.
  return constants[cons];
}

function addValue(i,v) { //Adds two values, either constants or literal values.
  //First argument is either a constant or an assembly input.
  //It can be a decimal string, a hexadecimal string starting with $, or a binary string starting with %
  //The return value is in the same format as the first argument, either decimal, hex, or binary.
  //The second argument begins with + or - and is followed by a constant or another assembly-type value.
  //If the second argument is undefined, the first input is returned.  If the first input is a constant,
  //it is replaced with the constant value before being returned.
  //If the first value is less than 0xff and the sum is greater than 0xff, it is wrapped around before being returned.

  if (i in constants) i = constants[i];
  if (/^([0-9]+|\$[A-F0-9]+|%[01]+)$/i.test(i) == false) { return i + (v != undefined ? v : ""); }
  if (v == undefined) { return i; }
  var matches = v.match(/^[+-](([0-9]+|\$[A-F0-9]+|%[01]+)|([\w]+))$/i);
  if (matches == null) throw new exceptions.addValueError(i,v);
  if (matches[2] != null) { var s = matches[2]; }
  if (matches[3] != null) {
    if (matches[3] in constants) { var s = constants[matches[3]]; }
    else throw new exceptions.constantNotDefined(v.substring(1));
  }
  v = convertValue(s) * ((v.substring(0,1) == "-") ? -1 : 1);
  var w = 255;
  if (i.substring(0,1) == "$") {
    if (i.length > 3) { w = 65535; }
    return "$" + ((parseInt(i.substring(1),16) + parseInt(v)) & w).toString(16);
  }
  if (i.substring(0,1) == "%") {
    if (i.length > 9) { w = 65535; }
    return "%" + ((parseInt(i.substring(1),2) + parseInt(v)) & w).toString(2);
  }
  if (parseInt(i,10) > 255) { w = 65535; }
  return ((parseInt(i,10) + parseInt(v)) & w).toString();
}

function getHighLowByte(i,v) { //Returns either the high or low byte of an input.
  //First argument is either a decimal string, hexadecimal string starting with $ or binary string starting with %
  //Second argument is either "<" for low byte, ">" for high byte, or undefined to just return the input.

  if (v == undefined) { return i; } //Return input
  if ((v != "<") && (v != ">")) { throw new exceptions.getHighLowByteArgs(); }
  var base = 10;
  if (i.substring(0,1) == "$") { i = i.substring(1); base = 16; }
  else if (i.substring(0,1) == "%") { i = i.substring(1); base = 2; }
  var t = parseInt(i,base);
  if (v == ">") { t = t >> 8; }
  return ((base == 16) ? "$" : ((base == 2) ? "%" : "")) + (t & 255).toString(base);
}


function assembleProgram() {
try {
  //Step 0: Reset the variables.
  clearInterval(instructionTimer);
  instructionTimer = null;
  programExecuting = false;
  labels = new Object();
  constants = new Object();
  memory.reset();
  labelTracker = new Array();
  labelByteTracker = new Array();
  branchTracker = new Array();

  //Step 1: Clean up assembly code by removing excess whitespace, comments, etc.
  statusWindow.write("Assembling code...");
  var inputarray = sanitizeAssembly(document.getElementById("inputbox").value);
  if (verbose) statusWindow.write("Defining constants...");

//document.getElementById('inputbox').value="";

  //Step 2: Define constants.
  for (j=0;j<inputarray.length-2;j++) {
    if (inputarray[j].toUpperCase() == "DEFINE") {
      if ((inputarray[j+3] == "+") || (inputarray[j+3] == "-")) {
        inputarray[j+2] = inputarray[j+2] + inputarray[j+3] + inputarray[j+4];
        inputarray.splice(j+3,2);
      }
      if (verbose) statusWindow.write("Adding constant " + inputarray[j+1] + "...");
      addConstant(inputarray[j+1],inputarray[j+2]); //Add the constant
      inputarray.splice(j,3); //Remove the define directive
      j-=1;
    }
    else if ((inputarray[j+1] == "=") || (inputarray[j+1].toUpperCase() == "EQU")) {
      if ((inputarray[j+3] == "+") || (inputarray[j+3] == "-")) {
        inputarray[j+2] = inputarray[j+2] + inputarray[j+3] + inputarray[j+4];
        inputarray.splice(j+3,2);
      }
      if (verbose) statusWindow.write("Adding constant " + inputarray[j] + "...");
      addConstant(inputarray[j],inputarray[j+2]);
      inputarray.splice(j,3); //Remove the define directive
      j-=1;
    }
  }

  statusWindow.write("Converting to machine code...");

//console.log(inputarray);

  //Step 3: Convert assembly instructions into machine code.
  for (j=0;j<inputarray.length;j++) { //Loop through each instruction

    //Check for origin directive
    if ((inputarray[j].toUpperCase() == "ORG") || (inputarray[j].toUpperCase() == ".ORG")) {
      if (j == inputarray.length - 1) { throw new exceptions.orgArgs; } //ORG needs a memory location, so throw an exception if this is the last instruction.
      if (inputarray[j+1] in constants) { inputarray[j+1] = constants[inputarray[j+1]]; } //If a constant is given, replace it with the value.
      if (/^([0-9]+|\$[A-F0-9]+|%[01]+)$/i.test(inputarray[j+1]) == false) { throw new exceptions.orgArgInvalid(inputarray[j+1]); }  //If the memory location is not a valid format, throw an exception.
                                                                             //We allow constants to be used for the org directive, but not labels.
      memory.PC = convertValue(inputarray[j+1]); //Otherwise, set the current location to what the ORG tells us.
      j=j+1; //Skip ahead to the next instruction
      if (verbose) statusWindow.write("Found Origin directive, setting Program Counter to $" + d2h(memory.PC));
      continue; //Go to the next iteration, since we're done processing this command.
    }

    //Check if it's .db
    if (inputarray[j].toUpperCase() == ".DB") {
      j=j+1; //If so, skip ahead to the data
      var s = inputarray[j]; //And assign the data string to the temporary variable s.
      while (s.length > 0) { //Now we'll parse the data and load it.

/// /([0-9]+|\$[A-F0-9]+|%[01]+|"[\w']+"|'[\w"]+')(,|$)/ig
//var matches = s.match(w.match(/([0-9]+|\$[A-F0-9]+|%[01]+|"[\w']+"|'[\w"]+'|[A-Z0-9_]+)?(,|$)/ig));

        if ((s.substring(0,1) == "'") | (s.substring(0,1) == '"')) { //Check if we have a quote-enclosed string
          var quotechar = s.substring(0,1);
          s = s.substring(1); //If so, move past the quote and begin parsing characters.
          if (s.indexOf(quotechar) < 0) { throw new exceptions.dataUnclosed(inputarray[j]); } //Throw an exception if the data is malformed
          var bytes = s.substring(0,s.indexOf(quotechar)); //We'll assign the rest of the string to this variable
          for (n=0;n<bytes.length;n++) { //And then loop through and add a byte for each character
            memory.writeByte(s.substring(n,n+1).charCodeAt()); //Store the byte to memory
          }
          s = s.substring(s.indexOf(quotechar) + 1); //Move ahead past the string
          if (s.length > 0) { //If this isn't the last data,
            if (s.substring(0,1) == ",") { //And the next character is a comma,
              s = s.substring(1); //Then we'll move past the comma and continue.
            }
            else {
              throw new exceptions.dataMalformedAfterString(inputarray[j],1); //Otherwise the data is malformed
            }
          }
          continue;
        }
        if (/^[<>]?([0-9]+|\$[A-F0-9]+|%[0-1]+)(,|$).*/i.test(s) == false) {  //If the next data isn't a literal value we need to check if it's a constant or a label
          var y = s; //Assign the rest of the string to the temporary variable y
          if (s.indexOf(",") > -1) {
            y = s.substring(0,s.indexOf(",")); //And cut it off at the next comma, if there is one.
          }
          if ((y.substring(0,1) == "<") || (y.substring(0,1) == ">")) { y = y.substring(1); } //If there's a high or low byte delimiter, remove it
          if (!(y in constants)) { //And check if it's the value is a constant
            var hlb = s.substring(0,1); //If it's not a constant, we'll assign it to the label tracker.
            if ((hlb != "<") && (hlb !=">")) { hlb = "<"; } //Labels are two-bytes long, and we're only declaring individual bytes.  If no delimiter is given, use the low byte of the label.
            labelByteTracker.push(memory.PC);
            labelByteTracker.push(hlb + y);
	    memory.writeByte(undefined);
            if (s.indexOf(",") < 0) { break; } //If this was the last data, then break the loop.
            s = s.substring(s.indexOf(",") + 1);  //Otherwise, move to the next data and continue.
            continue;
          }
        }
        if (s.indexOf(",") < 0) { //If the data was either a constant or a literal value, check if this is the last data, and if so assign it and break the loop.
          memory.writeByte(convertValue(s));
          break;
        }
        else { //Otherwise assign it and continue parsing.
          memory.writeByte(convertValue(s.substring(0,s.indexOf(","))));
          s = s.substring(s.indexOf(",") + 1);
        }
      }
      continue; //We've finished parsing this directive, so move to the next instruction.
    }

    //Check if it's .dw
    if (inputarray[j].toUpperCase() == ".DW") { //.dw doesn't allow strings, so it's easier to parse.  We still need to watch for labels though.
      //If there's a label named interruptLocation, then .dw interruptLocation will declare the memory location of the interruptLocation label at the current two bytes.
      //Since the labels aren't resolved yet, we declare undefined bytes and add the labels and memory locations to the labelTracker.
      j=j+1;
      var s = inputarray[j].split(",");
      for (k=0;k<s.length;k++) {
        if ((s[k].substring(0,1) == "<") || ((s[k].substring(0,1) == ">"))) {  //High and low byte delimiters resolve to only one byte.  Since we're declaring two bytes, we can't have them.
          throw new exceptions.dataHighLowError();
        }
        var plus = "";
        if (s[k].indexOf("+") > -1) {
          plus = s[k].substring(s[k].indexOf("+"));
          s[k] = s[k].substring(0,s[k].indexOf("+"));
        }
        if (s[k].indexOf("-") > -1) {
          plus = s[k].substring(s[k].indexOf("-"));
          s[k] = s[k].substring(0,s[k].indexOf("-"));
        }
        if ((s[k] in constants) || (/^[0-9]+|\$[A-F0-9]+|%[01]+$/i.test(s[k]))) {
          if (plus == "") {
            memory.writeWord(convertValue(addValue(s[k],undefined)));
            continue;
          }
          else {
            if ((plus.substring(1) in constants) || (/^[0-9]+|\$[A-F0-9]+|%[01]+$/i.test(plus))) {
              memory.writeWord(convertValue(addValue(s[k],plus)));
              continue;
            }
          }
        }
        labelTracker.push(memory.PC)
        labelTracker.push(s[k] + plus);
        memory.writeByte(undefined);
        memory.writeByte(undefined);
      }
      continue; //We've finished parsing this directive, so move to the next instruction.
    }

    //Check if it's a label
    if (/^[A-Z0-9_]+:$/i.test(inputarray[j])) {
      var k = inputarray[j].substring(0,inputarray[j].indexOf(":")); //If so, get the name of the label
      if (k.toUpperCase() in reserved) { throw new exceptions.reservedWord(k); } //Throw an exception if the label is reserved
      if (k in labels) { //Check if the label is already defined,
        if (typeof labels[k] === "function") { //either by being a JavaScript function,
          throw new exceptions.reservedWord(k);
        }
        else { //or by already being defined.
          throw new exceptions.labelAlreadyDefined(k);
        }
      }
      if (k in constants) { //Check if this label has already been declared as a constant
        throw new exceptions.labelAndConstant(k);
      }
      if (verbose) statusWindow.write("Defining label " + k + "...");
      labels[k] = memory.PC; //Otherwise, load it into the labels
      continue;
    }

//console.log(inputarray[j]);

    //If it's not a directive, constant, or label, we'll try to parse it as an instruction.
    switch (inputarray[j].toUpperCase()) {
      case "ADC":
        j+=1;
        writeInstruction(inputarray[j],0x69,0x65,0x75,undefined,0x6d,0x7d,0x79,0x61,0x71,inputarray[j-1]);
        break;
      case "AND":
        j+=1;
        writeInstruction(inputarray[j],0x29,0x25,0x35,undefined,0x2d,0x3d,0x39,0x21,0x31,inputarray[j-1]);
        break;
      case "ASL":
        if (inputarray[j+1].toUpperCase() == "A") { //Certain instructions can use both implied and explicit addressing mode.
          //ASL A and ASL should both shift the accumulator, while ASL $00ff shifts an address.
          //Here we're checking for an explicitly declared A
          memory.writeByte(0x0a);
          j+=1;
          break;
        }
        if ((inputarray[j+1].toUpperCase() in reserved) || (inputarray[j+1].substring(inputarray[j+1].length - 1) == ":")) {
          //And here we're checking for an implicit A.  If the next instruction is a reserved word or a label declaration, then we know it's not the operand of this instruction.
          //In that case, we write the implicit instruction and continue on.
          memory.writeByte(0x0a);
          break;
        }
        j+=1;
        writeInstruction(inputarray[j],undefined,0x06,0x16,undefined,0x0e,0x1e,undefined,undefined,undefined,inputarray[j-1]);
        break;
      case "BCC":
        j=j+1;
        writeBranchInstruction(0x90,inputarray[j],inputarray[j-1]);
        break;
      case "BCS":
        j=j+1;
        writeBranchInstruction(0xb0,inputarray[j],inputarray[j-1]);
        break;
      case "BEQ":
        j=j+1;
        writeBranchInstruction(0xf0,inputarray[j],inputarray[j-1]);
        break;
      case "BIT":
        j=j+1;
        writeInstruction(inputarray[j],undefined,0x24,undefined,undefined,0x2c,undefined,undefined,undefined,undefined,inputarray[j-1]);
        break;
      case "BMI":
        j=j+1;
        writeBranchInstruction(0x30,inputarray[j],inputarray[j-1]);
        break;
      case "BNE":
        j=j+1;
        writeBranchInstruction(0xd0,inputarray[j],inputarray[j-1]);
        break;
      case "BPL":
        j=j+1;
        writeBranchInstruction(0x10,inputarray[j],inputarray[j-1]);
        break;
      case "BRK":
        memory.writeByte(0x00);
        break;
      case "BVC":
        j=j+1;
        writeBranchInstruction(0x50,inputarray[j],inputarray[j-1]);
        break;
      case "BVS":
        j=j+1;
        writeBranchInstruction(0x70,inputarray[j],inputarray[j-1]);
        break;
      case "CLC":
        memory.writeByte(0x18);
        break;
      case "CLD":
        memory.writeByte(0xd8);
        break;
      case "CLI":
        memory.writeByte(0x58);
        break;
      case "CLV":
        memory.writeByte(0xB8);
        break;
      case "CMP":
        j+=1;
        writeInstruction(inputarray[j],0xc9,0xc5,0xd5,undefined,0xcd,0xdd,0xd9,0xc1,0xd1,inputarray[j-1]);
        break;
      case "CPX":
        j+=1;
        writeInstruction(inputarray[j],0xe0,0xe4,undefined,undefined,0xec,undefined,undefined,undefined,undefined,inputarray[j-1]);
        break;
      case "CPY":
        j+=1;
        writeInstruction(inputarray[j],0xc0,0xc4,undefined,undefined,0xcc,undefined,undefined,undefined,undefined,inputarray[j-1]);
        break;
      case "DEC":
        j+=1;
        writeInstruction(inputarray[j],undefined,0xc6,0xd6,undefined,0xce,0xde,undefined,undefined,undefined,inputarray[j-1]);
        break;
      case "DEX":
        memory.writeByte(0xca);
        break;
      case "DEY":
        memory.writeByte(0x88);
        break;
      case "EOR":
        j+=1;
        writeInstruction(inputarray[j],0x49,0x45,0x55,undefined,0x4d,0x5d,0x59,0x41,0x51,inputarray[j-1]);
        break;
      case "INC":
        j+=1;
        writeInstruction(inputarray[j],undefined,0xe6,0xf6,undefined,0xee,0xfe,undefined,undefined,undefined,inputarray[j-1]);
        break;
      case "INX":
        memory.writeByte(0xe8);
        break;
      case "INY":
        memory.writeByte(0xc8);
        break;
      case "JMP":
        j+=1;
        writeJumpInstruction(0x4c,0x6c,inputarray[j],inputarray[j-1]);
        break;
      case "JSR":
        j+=1;
        writeJumpInstruction(0x20,undefined,inputarray[j],inputarray[j-1]);
        break;
      case "LDA":
        j+=1;
        writeInstruction(inputarray[j],0xa9,0xa5,0xb5,undefined,0xad,0xbd,0xb9,0xa1,0xb1,inputarray[j-1]);
        break;
      case "LDX":
        j+=1;
        writeInstruction(inputarray[j],0xa2,0xa6,undefined,0xb6,0xae,undefined,0xbe,undefined,undefined,inputarray[j-1]);
        break;
      case "LDY":
        j+=1;
        writeInstruction(inputarray[j],0xa0,0xa4,0xb4,undefined,0xac,0xbc,undefined,undefined,undefined,inputarray[j-1]);
        break;
      case "LSR":
        if (inputarray[j+1].toUpperCase() == "A") {
          memory.writeByte(0x4a);
          j+=1;
          break;
        }
        if ((inputarray[j+1].toUpperCase() in reserved) || (inputarray[j+1].substring(inputarray[j+1].length - 1) == ":")) {
          memory.writeByte(0x4a);
          break;
        }
        j+=1;
        writeInstruction(inputarray[j],undefined,0x46,0x56,undefined,0x4e,0x5e,undefined,undefined,undefined,inputarray[j-1]);
        break;
      case "NOP":
        memory.writeByte(0xea);
        break;
      case "ORA":
        j+=1;
        writeInstruction(inputarray[j],0x09,0x05,0x15,undefined,0x0d,0x1d,0x19,0x01,0x11,inputarray[j-1]);
        break;
      case "PHA":
        memory.writeByte(0x48);
        break;
      case "PHP":
        memory.writeByte(0x08);
        break;
      case "PLA":
        memory.writeByte(0x68);
        break;
      case "PLP":
        memory.writeByte(0x28);
        break;
      case "ROL":
        if (inputarray[j+1].toUpperCase() == "A") {
          memory.writeByte(0x2a);
          j+=1;
          break;
        }
        if ((inputarray[j+1].toUpperCase() in reserved) || (inputarray[j+1].substring(inputarray[j+1].length - 1) == ":")) {
          memory.writeByte(0x2a);
          break;
        }
        j+=1;
        writeInstruction(inputarray[j],undefined,0x26,0x36,undefined,0x2e,0x3e,undefined,undefined,undefined,inputarray[j-1]);
        break;
      case "ROR":
        if (inputarray[j+1].toUpperCase() == "A") {
          memory.writeByte(0x6a);
          j+=1;
          break;
        }
        if ((inputarray[j+1].toUpperCase() in reserved) || (inputarray[j+1].substring(inputarray[j+1].length - 1) == ":")) {
          memory.writeByte(0x6a);
          break;
        }
        j+=1;
        writeInstruction(inputarray[j],undefined,0x66,0x76,undefined,0x6e,0x7e,undefined,undefined,undefined,inputarray[j-1]);
        break;
      case "RTI":
        memory.writeByte(0x40);
        break;
      case "RTS":
        memory.writeByte(0x60);
        break;
      case "SBC":
        j+=1;
        writeInstruction(inputarray[j],0xe9,0xe5,0xf5,undefined,0xed,0xfd,0xf9,0xe1,0xf1,inputarray[j-1]);
        break;
      case "SEC":
        memory.writeByte(0x38);
        break;
      case "SED":
        memory.writeByte(0xf8);
        break;
      case "SEI":
        memory.writeByte(0x78);
        break;
      case "STA":
        j+=1;
        writeInstruction(inputarray[j],undefined,0x85,0x95,undefined,0x8d,0x9d,0x99,0x81,0x91,inputarray[j-1]);
        break;
      case "STX":
        j+=1;
        writeInstruction(inputarray[j],undefined,0x86,undefined,0x96,0x8e,undefined,undefined,undefined,undefined,inputarray[j-1]);
        break;
      case "STY":
        j+=1;
        writeInstruction(inputarray[j],undefined,0x84,0x94,undefined,0x8c,undefined,undefined,undefined,undefined,inputarray[j-1]);
        break;
      case "TAX":
        memory.writeByte(0xaa);
        break;
      case "TAY":
        memory.writeByte(0xa8);
        break;
      case "TSX":
        memory.writeByte(0xba);
        break;
      case "TXA":
        memory.writeByte(0x8a);
        break;
      case "TXS":
        memory.writeByte(0x9a);
        break;
      case "TYA":
        memory.writeByte(0x98);
        break;
      case "HLT":
        memory.writeByte(0x02);
        break;
      case "OUT":
        memory.writeByte(0xf2);
        break;
      case "OUY":
        memory.writeByte(0xfa);
        break;
      case "IN":
        memory.writeByte(0xf3);
        break;
      case "WAI":
        memory.writeByte(0xf7);
        break;
      default: //If we've encountered an unknown instruction, throw an exception.
        if (inputarray[j].length > 0) { throw new exceptions.unknownInstruction(inputarray[j]); }
    }
  }

  for (j=0;j<labelTracker.length;j+=2) { //Now that all the instructions have been parsed, we can resolve the labels.
    var lab = labelTracker[j+1];
    var plus = "";
    if (lab.indexOf("+") > -1) {
      plus = lab.substring(lab.indexOf("+"));
      lab = lab.substring(0,lab.indexOf("+"));
    }
    else if (lab.indexOf("-") > -1) {
      plus = lab.substring(lab.indexOf("-"));
      lab = lab.substring(0,lab.indexOf("-"));
    }
    hlb=undefined;
    if (lab.substring(0,1) == "<") { hlb = "<"; lab = lab.substring(1); }
    if (lab.substring(0,1) == ">") { hlb = ">"; lab = lab.substring(1); }
    if ((lab in labels == false) && (plus.substring(1) in labels == false)) {
      throw new exceptions.labelNotFound(lab + plus);
    }
    if (lab in labels) {
      lab = labels[lab];
    }
    if (plus.substring(1) in labels) {
      plus = plus.substring(0,1) + labels[plus.substring(1)];
    }
    memory.writeWord(convertValue(getHighLowByte(addValue(lab.toString(),plus.toString() == "" ? undefined : plus.toString()),hlb)),labelTracker[j]);
  }

  for (j=0;j<labelByteTracker.length;j+=2) {
    var lab = labelByteTracker[j+1];
    var hlb = lab.substring(0,1);
    lab = lab.substring(1);
    var plus = "";
    if (lab.indexOf("+") > -1) {
      plus = lab.substring(lab.indexOf("+"));
      lab = lab.substring(0,lab.indexOf("+"));
    }
    else if (lab.indexOf("-") > -1) {
      plus = lab.substring(lab.indexOf("-"));
      lab = lab.substring(0,lab.indexOf("-"));
    }
    if ((lab in labels == false) && (plus.substring(1) in labels == false)) {
      throw new exceptions.labelNotFound(lab + plus);
    }
    if (lab in labels) {
      lab = labels[lab];
    }
    if (plus.substring(1) in labels) {
      plus = plus.substring(0,1) + labels[plus.substring(1)];
    }
    memory.writeByte(convertValue(getHighLowByte(addValue(lab.toString(),plus.toString() == "" ? undefined : plus.toString()),hlb)),labelByteTracker[j]);
  }

  for (j=0;j<branchTracker.length;j+=2) {
    var lab = branchTracker[j+1];
    var plus = undefined;
    if (lab.indexOf("+") > -1) {
      plus = lab.substring(lab.indexOf("+"));
      lab = lab.substring(0,lab.indexOf("+"));
    }
    else if (lab.indexOf("-") > -1) {
      plus = lab.substring(lab.indexOf("-"));
      lab = lab.substring(0,lab.indexOf("-"));
    }
    if (lab in labels) { //Check if the branch label is defined
      var v = convertValue(addValue(labels[lab].toString(),plus));
      var distance = v - branchTracker[j] - 1;
      if ((distance > 127) || (distance < -128)) {
        throw new exceptions.branchOutOfRange(branchTracker[j+1],distance);
      }
      if (distance < 0) { distance = ((((~(-distance)) + 1) & 0xff) | 128); } //Convert to Two's Complement
      memory.writeByte(distance,branchTracker[j]);
    }
    else { //Throw an exception if the label is not found.
      throw new exceptions.labelNotFound(branchTracker[j+1],true);
    }

  }

  //If we've made it this far without an exception, the code assembled correctly.

  statusWindow.write("Resolved " + Object.keys(constants).length + " constants and " + Object.keys(labels).length + " labels.");
  var bytes = 0; //Let's check how many bytes of code we've written,
  for (i=0;i<memory.size;i++) { if (memory.read(i) != undefined) { bytes+=1; } }
  statusWindow.write("Code assembled successfully: " + bytes + " bytes."); //output that to the status window,
  return true; //and we're done.
}
catch (e) {
  if (e.num) { //Check if it's one of our exceptions, or a generic JavaScript exception.
    statusWindow.writeError("Error #" + e.num + ": " + e.message); //If it's ours, we'll write the error to the Status window.
   statusWindow.write("Could not assemble code."); //If there's an exception, then we can't assemble the code.
    beep();
    return false;
  }
  else {
    statusWindow.write("Could not assemble code."); //If there's an exception, then we can't assemble the code.
    throw e; //Otherwise it's a JavaScript exception, so throw it back.
  }
}
}

function dumpMachineCode(binary=false) {
  var w = window.open("", "Machine Code", "width=500,height=400,resizable=yes,scrollbars=yes,toolbar=no,location=no,menubar=no,status=no");
  w.document.write("<html><head><title>Machine Code</title></head><body><pre><code>");
  var row = "";
  var rowUsed = false;
  for (j=0;j<=65535;j++) {
    if (binary == false) {
      if (memory.read(j) != undefined) {
        rowUsed = true;
        var h = d2h(memory.read(j));
        row += h + " ";
      }
      else {
        row += "&nbsp;&nbsp; ";
      }
      if ((j % 16 == 15) || (j == 65535)) {
        if (rowUsed) {
          var h = d2h(j-15,4);
          w.document.write(h + ": " + row + "<br />");
        }
        rowUsed=false;
        row="";
      }
    }
    else {
      if (memory.read(j) != undefined) {
        rowUsed = true;
        var h = memory.read(j).toString(2);
        while (h.length < 8) { h = "0" + h; }
        row += h + " ";
      }
      else {
        row += "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ";
      }
      if ((j % 6 == 5) || (j == 65535)) {
        if (rowUsed) {
          var h = d2h(j - ((j == 65535) ? 3 : 5),4);
          w.document.write(h + ": " + row + "<br />");
        }
        rowUsed=false;
        row="";
      }
    }
  }

  w.document.write("</code></pre></body></html>");
  w.document.close();
}

function brkInterrupt() {
  clearInterval(instructionTimer);
  instructionTimer = null;
  if (debugOn) {
    stack.push((memory.PC >>> 8) & 255);
    stack.push(memory.PC & 255);
    stack.push(P.getFlags() | 16);
    memory.PC=memory.read(65534) | (memory.read(65535) << 8);
    return doInstruction(1);
  }
  return setTimeout(function(){ stack.push((memory.PC >>> 8) & 255); stack.push(memory.PC & 255); stack.push(P.getFlags() | 16); memory.PC=memory.read(65534) | (memory.read(65535) << 8); var interval = parseInt(document.getElementById('executionInterval').value,10); if (isNaN(interval)) { interval = 0; } instructionTimer = setInterval(doInstruction,interval); },0);
}

//Input Handlers:
window.onmousedown = function(event) {
  if (programExecuting == false) return true;
  if (document.getElementById('mousemaskableinterrupt').checked) {
    if (!P.I) {
      statusWindow.write("Maskable-interrupt: mouse down!");
      memory.writeByte(event.buttons,0x6f0);
      return brkInterrupt();
    }
    return true;
  }

  if (event.buttons & 1) { //Left button pressed
    memory.writeByte(1,1776);
  }
  if (event.buttons & 2) { //Right button pressed
    memory.writeByte(1,1777);
  }
  if (event.buttons & 4) { //Middle button pressed
    memory.writeByte(1,1778);
  }
  return true;
}

window.onkeydown = function(event) {
  if (event.keyCode == 27) {
    if (programExecuting) {
      statusWindow.write("Stopped program execution.");
      return programExecuting = false & clearInterval(instructionTimer) & (instructionTimer = null);
    }
    else return true;
  }
  if (programExecuting == false) return true;
  if (document.getElementById('keymaskableinterrupt').checked) {
    if (!P.I) {
      statusWindow.write("Maskable-interrupt: key down!");
      memory.writeByte(event.keyCode,0x6e0);
      return brkInterrupt();
    }
    return true;
  }
  if (event.keyCode == 37) {
    return memory.writeByte(1,1760);
  }
  if (event.keyCode == 38) {
    return memory.writeByte(1,1761);
  }
  if (event.keyCode == 39) {
    return memory.writeByte(1,1762);
  }
  if (event.keyCode == 40) {
    return memory.writeByte(1,1763);
  }
  if (event.shiftKey) {
    if (event.keyCode == 48) return memory.writeByte(41,1764);
    if (event.keyCode == 49) return memory.writeByte(33,1764);
    if (event.keyCode == 50) return memory.writeByte(64,1764);
    if (event.keyCode == 51) return memory.writeByte(35,1764);
    if (event.keyCode == 52) return memory.writeByte(36,1764);
    if (event.keyCode == 53) return memory.writeByte(37,1764);
    if (event.keyCode == 54) return memory.writeByte(94,1764);
    if (event.keyCode == 55) return memory.writeByte(38,1764);
    if (event.keyCode == 56) return memory.writeByte(42,1764);
    if (event.keyCode == 57) return memory.writeByte(40,1764);
    if (event.keyCode == 186) return memory.writeByte(58,1764);
    if (event.keyCode == 219) return memory.writeByte(123,1764);
    if (event.keyCode == 220) return memory.writeByte(124,1764);
    if (event.keyCode == 221) return memory.writeByte(125,1764);
    if (event.keyCode == 222) return memory.writeByte(34,1764);
    if (event.keyCode == 189) return memory.writeByte(95,1764);
    if (event.keyCode == 187) return memory.writeByte(43,1764);
    if (event.keyCode == 188) return memory.writeByte(60,1764);
    if (event.keyCode == 190) return memory.writeByte(62,1764);
    if (event.keyCode == 191) return memory.writeByte(63,1764);
    if (event.keyCode == 192) return memory.writeByte(126,1764);
  }
  if (event.keyCode == 186) return memory.writeByte(59,1764);
  if (event.keyCode == 219) return memory.writeByte(91,1764);
  if (event.keyCode == 220) return memory.writeByte(92,1764);
  if (event.keyCode == 221) return memory.writeByte(93,1764);
  if (event.keyCode == 222) return memory.writeByte(39,1764);
  if (event.keyCode == 189) return memory.writeByte(45,1764);
  if (event.keyCode == 187) return memory.writeByte(61,1764);
  if (event.keyCode == 188) return memory.writeByte(44,1764);
  if (event.keyCode == 190) return memory.writeByte(46,1764);
  if (event.keyCode == 191) return memory.writeByte(47,1764);
  if (event.keyCode == 192) return memory.writeByte(96,1764);
  if ((event.keyCode >= 65) && (event.keyCode <= 90) && (event.shiftKey == false)) {
    return memory.writeByte(event.keyCode + 32,1764);
  }
  if (((event.keyCode >= 65) && (event.keyCode <= 90)) || (event.keyCode == 32) || (event.keyCode == 9) || ((event.keyCode >= 48) && (event.keyCode <= 57))) {
    return memory.writeByte(event.keyCode,1764);
  }
  if (event.keyCode == 13) {
    return memory.writeByte(1,1765);
  }
}


function beep() { var snd = new Audio("data:audio/wav;base64,//uQRAAAAWMSLwUIYAAsYkXgoQwAEaYLWfkWgAI0wWs/ItAAAGDgYtAgAyN+QWaAAihwMWm4G8QQRDiMcCBcH3Cc+CDv/7xA4Tvh9Rz/y8QADBwMWgQAZG/ILNAARQ4GLTcDeIIIhxGOBAuD7hOfBB3/94gcJ3w+o5/5eIAIAAAVwWgQAVQ2ORaIQwEMAJiDg95G4nQL7mQVWI6GwRcfsZAcsKkJvxgxEjzFUgfHoSQ9Qq7KNwqHwuB13MA4a1q/DmBrHgPcmjiGoh//EwC5nGPEmS4RcfkVKOhJf+WOgoxJclFz3kgn//dBA+ya1GhurNn8zb//9NNutNuhz31f////9vt///z+IdAEAAAK4LQIAKobHItEIYCGAExBwe8jcToF9zIKrEdDYIuP2MgOWFSE34wYiR5iqQPj0JIeoVdlG4VD4XA67mAcNa1fhzA1jwHuTRxDUQ//iYBczjHiTJcIuPyKlHQkv/LHQUYkuSi57yQT//uggfZNajQ3Vmz+Zt//+mm3Wm3Q576v////+32///5/EOgAAADVghQAAAAA//uQZAUAB1WI0PZugAAAAAoQwAAAEk3nRd2qAAAAACiDgAAAAAAABCqEEQRLCgwpBGMlJkIz8jKhGvj4k6jzRnqasNKIeoh5gI7BJaC1A1AoNBjJgbyApVS4IDlZgDU5WUAxEKDNmmALHzZp0Fkz1FMTmGFl1FMEyodIavcCAUHDWrKAIA4aa2oCgILEBupZgHvAhEBcZ6joQBxS76AgccrFlczBvKLC0QI2cBoCFvfTDAo7eoOQInqDPBtvrDEZBNYN5xwNwxQRfw8ZQ5wQVLvO8OYU+mHvFLlDh05Mdg7BT6YrRPpCBznMB2r//xKJjyyOh+cImr2/4doscwD6neZjuZR4AgAABYAAAABy1xcdQtxYBYYZdifkUDgzzXaXn98Z0oi9ILU5mBjFANmRwlVJ3/6jYDAmxaiDG3/6xjQQCCKkRb/6kg/wW+kSJ5//rLobkLSiKmqP/0ikJuDaSaSf/6JiLYLEYnW/+kXg1WRVJL/9EmQ1YZIsv/6Qzwy5qk7/+tEU0nkls3/zIUMPKNX/6yZLf+kFgAfgGyLFAUwY//uQZAUABcd5UiNPVXAAAApAAAAAE0VZQKw9ISAAACgAAAAAVQIygIElVrFkBS+Jhi+EAuu+lKAkYUEIsmEAEoMeDmCETMvfSHTGkF5RWH7kz/ESHWPAq/kcCRhqBtMdokPdM7vil7RG98A2sc7zO6ZvTdM7pmOUAZTnJW+NXxqmd41dqJ6mLTXxrPpnV8avaIf5SvL7pndPvPpndJR9Kuu8fePvuiuhorgWjp7Mf/PRjxcFCPDkW31srioCExivv9lcwKEaHsf/7ow2Fl1T/9RkXgEhYElAoCLFtMArxwivDJJ+bR1HTKJdlEoTELCIqgEwVGSQ+hIm0NbK8WXcTEI0UPoa2NbG4y2K00JEWbZavJXkYaqo9CRHS55FcZTjKEk3NKoCYUnSQ0rWxrZbFKbKIhOKPZe1cJKzZSaQrIyULHDZmV5K4xySsDRKWOruanGtjLJXFEmwaIbDLX0hIPBUQPVFVkQkDoUNfSoDgQGKPekoxeGzA4DUvnn4bxzcZrtJyipKfPNy5w+9lnXwgqsiyHNeSVpemw4bWb9psYeq//uQZBoABQt4yMVxYAIAAAkQoAAAHvYpL5m6AAgAACXDAAAAD59jblTirQe9upFsmZbpMudy7Lz1X1DYsxOOSWpfPqNX2WqktK0DMvuGwlbNj44TleLPQ+Gsfb+GOWOKJoIrWb3cIMeeON6lz2umTqMXV8Mj30yWPpjoSa9ujK8SyeJP5y5mOW1D6hvLepeveEAEDo0mgCRClOEgANv3B9a6fikgUSu/DmAMATrGx7nng5p5iimPNZsfQLYB2sDLIkzRKZOHGAaUyDcpFBSLG9MCQALgAIgQs2YunOszLSAyQYPVC2YdGGeHD2dTdJk1pAHGAWDjnkcLKFymS3RQZTInzySoBwMG0QueC3gMsCEYxUqlrcxK6k1LQQcsmyYeQPdC2YfuGPASCBkcVMQQqpVJshui1tkXQJQV0OXGAZMXSOEEBRirXbVRQW7ugq7IM7rPWSZyDlM3IuNEkxzCOJ0ny2ThNkyRai1b6ev//3dzNGzNb//4uAvHT5sURcZCFcuKLhOFs8mLAAEAt4UWAAIABAAAAAB4qbHo0tIjVkUU//uQZAwABfSFz3ZqQAAAAAngwAAAE1HjMp2qAAAAACZDgAAAD5UkTE1UgZEUExqYynN1qZvqIOREEFmBcJQkwdxiFtw0qEOkGYfRDifBui9MQg4QAHAqWtAWHoCxu1Yf4VfWLPIM2mHDFsbQEVGwyqQoQcwnfHeIkNt9YnkiaS1oizycqJrx4KOQjahZxWbcZgztj2c49nKmkId44S71j0c8eV9yDK6uPRzx5X18eDvjvQ6yKo9ZSS6l//8elePK/Lf//IInrOF/FvDoADYAGBMGb7FtErm5MXMlmPAJQVgWta7Zx2go+8xJ0UiCb8LHHdftWyLJE0QIAIsI+UbXu67dZMjmgDGCGl1H+vpF4NSDckSIkk7Vd+sxEhBQMRU8j/12UIRhzSaUdQ+rQU5kGeFxm+hb1oh6pWWmv3uvmReDl0UnvtapVaIzo1jZbf/pD6ElLqSX+rUmOQNpJFa/r+sa4e/pBlAABoAAAAA3CUgShLdGIxsY7AUABPRrgCABdDuQ5GC7DqPQCgbbJUAoRSUj+NIEig0YfyWUho1VBBBA//uQZB4ABZx5zfMakeAAAAmwAAAAF5F3P0w9GtAAACfAAAAAwLhMDmAYWMgVEG1U0FIGCBgXBXAtfMH10000EEEEEECUBYln03TTTdNBDZopopYvrTTdNa325mImNg3TTPV9q3pmY0xoO6bv3r00y+IDGid/9aaaZTGMuj9mpu9Mpio1dXrr5HERTZSmqU36A3CumzN/9Robv/Xx4v9ijkSRSNLQhAWumap82WRSBUqXStV/YcS+XVLnSS+WLDroqArFkMEsAS+eWmrUzrO0oEmE40RlMZ5+ODIkAyKAGUwZ3mVKmcamcJnMW26MRPgUw6j+LkhyHGVGYjSUUKNpuJUQoOIAyDvEyG8S5yfK6dhZc0Tx1KI/gviKL6qvvFs1+bWtaz58uUNnryq6kt5RzOCkPWlVqVX2a/EEBUdU1KrXLf40GoiiFXK///qpoiDXrOgqDR38JB0bw7SoL+ZB9o1RCkQjQ2CBYZKd/+VJxZRRZlqSkKiws0WFxUyCwsKiMy7hUVFhIaCrNQsKkTIsLivwKKigsj8XYlwt/WKi2N4d//uQRCSAAjURNIHpMZBGYiaQPSYyAAABLAAAAAAAACWAAAAApUF/Mg+0aohSIRobBAsMlO//Kk4soosy1JSFRYWaLC4qZBYWFRGZdwqKiwkNBVmoWFSJkWFxX4FFRQWR+LsS4W/rFRb/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////VEFHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU291bmRib3kuZGUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMjAwNGh0dHA6Ly93d3cuc291bmRib3kuZGUAAAAAAAAAACU="); snd.play(); }

function pauseProgram() {
  if (programExecuting) {
    document.getElementById('debugCheck').checked = true;
    debugOn=true;
    clearInterval(instructionTimer);
    instructionTimer = null;
  }
}

function execute() {
  if (debugOn && programExecuting) return doInstruction(1);
  statusWindow.clear();
  if (!assembleProgram()) return;
  try {
    if (programExecuting == false) {
      clearInterval(instructionTimer);
      instructionTimer = null;
      screen.clear(); //Reset the canvas and output box
      document.getElementById('output').innerHTML = "";
      output = "";
      input = "";
      memory.writeByte(0,0x6e0);
      memory.writeByte(0,0x6e1);
      memory.writeByte(0,0x6e2);
      memory.writeByte(0,0x6e3);
      memory.writeByte(0,0x6e4);
      memory.writeByte(0,0x6e5);
      memory.writeByte(0,0x6f0);
      memory.writeByte(0,0x6f1);
      memory.writeByte(0,0x6f2);
      stack.reset();
      P.reset()
      MPU.reset();
      var resetHandler = memory.readWord(0xfffc);
      if (resetHandler > 0) { //If the code has a reset handler, we'll start the program there.  Otherwise we'll start at the default of $0800;
        memory.PC = resetHandler;
      }
      else {
        memory.PC = 0x0800;
      }
      statusWindow.write("Starting program execution at $" + d2h(memory.PC,4));
    }
    var interval = parseInt(document.getElementById('executionInterval').value,10);
    if (isNaN(interval)) { interval = 0; }
    if (debugOn) doInstruction(1);
    else instructionTimer = setInterval(doInstruction,interval);
    programExecuting = true;
  }
  catch (e) {
    if (e.num) {
      statusWindow.writeError("Error #" + e.num + ": " + e.message);
      return;
    }
    else throw e;
  }
}

function doInstruction(n) {
  var t = n || parseInt(document.getElementById('executionIterations').value);
  if (isNaN(t)) t = 97;
  for (i=0;i<t;i++) {
    if (executeInstruction() == false) { break; }
  }
  debug.updateDebug();
}

function executeInstruction() {
  if (memory.PC >= memory.size) { return false; }  //If the program counter is past the end of memory, just end.
  if (debugOn) { console.log("$" + d2h(memory.read(memory.PC))); } //Should we debug?
  memory.writeByte(Math.floor(Math.random() * 255),0xfe); //Memory $06ff is a random number generator.  It generates a new number after every instruction.
  switch (memory.read(memory.PC)) { //Switch statement for all of our processor instructions.
    case 0x69: //ADC Immediate
      var b = memory.read(memory.PC + 1);
      var binary_sum = MPU.A + b + (P.C ? 1 : 0);
      P.setZN(binary_sum & 255);
      if (P.D) {
        var al = (MPU.A & 0x0f) + (b & 0x0f) + (P.C ? 1 : 0);
        if (al >= 0x0a) al = ((al + 0x06) & 0x0f) + 0x10;
        MPU.A = (MPU.A & 0xf0) + (b & 0xf0) + al;
        var zna = getTwosComplement(MPU.A) + getTwosComplement(b) + getTwosComplement(al);
        (MPU.A & 128) ? P.setBit(7) : P.clearBit(7);
        ((zna < -128) || (zna > 127)) ? P.setBit(6) : P.clearBit(6);
        if (MPU.A >= 0xa0) MPU.A = MPU.A + 0x60;
        (MPU.A >= 0x100) ? P.setBit(0) : P.clearBit(0);
        MPU.A = MPU.A & 255;
      }
      else {
        (!((MPU.A ^ b) & 128) && ((b ^ binary_sum) & 128)) ? P.setBit(6) : P.clearBit(6);
        (binary_sum > 255) ? P.setBit(0) : P.clearBit(0);
        MPU.A = binary_sum & 255;
      }
      memory.PC+=2;
      break;
    case 0x65: //ADC Zero Page
      var addr = memory.read(memory.PC + 1);
      var b = memory.read(addr);
      var binary_sum = MPU.A + b + (P.C ? 1 : 0);
      P.setZN(binary_sum & 255);
      if (P.D) {
        var al = (MPU.A & 0x0f) + (b & 0x0f) + (P.C ? 1 : 0);
        if (al >= 0x0a) al = ((al + 0x06) & 0x0f) + 0x10;
        MPU.A = (MPU.A & 0xf0) + (b & 0xf0) + al;
        var zna = getTwosComplement(MPU.A) + getTwosComplement(b) + getTwosComplement(al);
        (MPU.A & 128) ? P.setBit(7) : P.clearBit(7);
        ((zna < -128) || (zna > 127)) ? P.setBit(6) : P.clearBit(6);
        if (MPU.A >= 0xa0) MPU.A = MPU.A + 0x60;
        (MPU.A >= 0x100) ? P.setBit(0) : P.clearBit(0);
        MPU.A = MPU.A & 255;
      }
      else {
        (!((MPU.A ^ b) & 128) && ((b ^ binary_sum) & 128)) ? P.setBit(6) : P.clearBit(6);
        (binary_sum > 255) ? P.setBit(0) : P.clearBit(0);
        MPU.A = binary_sum & 255;
      }
      memory.PC+=2;
      break;
    case 0x75: //ADC Zero Page X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var b = memory.read(addr);
      var binary_sum = MPU.A + b + (P.C ? 1 : 0);
      P.setZN(binary_sum & 255);
      if (P.D) {
        var al = (MPU.A & 0x0f) + (b & 0x0f) + (P.C ? 1 : 0);
        if (al >= 0x0a) al = ((al + 0x06) & 0x0f) + 0x10;
        MPU.A = (MPU.A & 0xf0) + (b & 0xf0) + al;
        var zna = getTwosComplement(MPU.A) + getTwosComplement(b) + getTwosComplement(al);
        (MPU.A & 128) ? P.setBit(7) : P.clearBit(7);
        ((zna < -128) || (zna > 127)) ? P.setBit(6) : P.clearBit(6);
        if (MPU.A >= 0xa0) MPU.A = MPU.A + 0x60;
        (MPU.A >= 0x100) ? P.setBit(0) : P.clearBit(0);
        MPU.A = MPU.A & 255;
      }
      else {
        (!((MPU.A ^ b) & 128) && ((b ^ binary_sum) & 128)) ? P.setBit(6) : P.clearBit(6);
        (binary_sum > 255) ? P.setBit(0) : P.clearBit(0);
        MPU.A = binary_sum & 255;
      }
      memory.PC+=2;
      break;
    case 0x6d: //ADC Absolute
      var addr = memory.readWord(memory.PC + 1);
      var b = memory.read(addr);
      var binary_sum = MPU.A + b + (P.C ? 1 : 0);
      P.setZN(binary_sum & 255);
      if (P.D) {
        var al = (MPU.A & 0x0f) + (b & 0x0f) + (P.C ? 1 : 0);
        if (al >= 0x0a) al = ((al + 0x06) & 0x0f) + 0x10;
        MPU.A = (MPU.A & 0xf0) + (b & 0xf0) + al;
        var zna = getTwosComplement(MPU.A) + getTwosComplement(b) + getTwosComplement(al);
        (MPU.A & 128) ? P.setBit(7) : P.clearBit(7);
        ((zna < -128) || (zna > 127)) ? P.setBit(6) : P.clearBit(6);
        if (MPU.A >= 0xa0) MPU.A = MPU.A + 0x60;
        (MPU.A >= 0x100) ? P.setBit(0) : P.clearBit(0);
        MPU.A = MPU.A & 255;
      }
      else {
        (!((MPU.A ^ b) & 128) && ((b ^ binary_sum) & 128)) ? P.setBit(6) : P.clearBit(6);
        (binary_sum > 255) ? P.setBit(0) : P.clearBit(0);
        MPU.A = binary_sum & 255;
      }
      memory.PC+=2;
      break;
    case 0x7d: //ADC Absolute X
      var addr = (memory.readWord(memory.PC + 1) + MPU.X) & 65535;
      var b = memory.read(addr);
      var binary_sum = MPU.A + b + (P.C ? 1 : 0);
      P.setZN(binary_sum & 255);
      if (P.D) {
        var al = (MPU.A & 0x0f) + (b & 0x0f) + (P.C ? 1 : 0);
        if (al >= 0x0a) al = ((al + 0x06) & 0x0f) + 0x10;
        MPU.A = (MPU.A & 0xf0) + (b & 0xf0) + al;
        var zna = getTwosComplement(MPU.A) + getTwosComplement(b) + getTwosComplement(al);
        (MPU.A & 128) ? P.setBit(7) : P.clearBit(7);
        ((zna < -128) || (zna > 127)) ? P.setBit(6) : P.clearBit(6);
        if (MPU.A >= 0xa0) MPU.A = MPU.A + 0x60;
        (MPU.A >= 0x100) ? P.setBit(0) : P.clearBit(0);
        MPU.A = MPU.A & 255;
      }
      else {
        (!((MPU.A ^ b) & 128) && ((b ^ binary_sum) & 128)) ? P.setBit(6) : P.clearBit(6);
        (binary_sum > 255) ? P.setBit(0) : P.clearBit(0);
        MPU.A = binary_sum & 255;
      }
      memory.PC+=2;
      break;
    case 0x79: //ADC Absolute Y
      var addr = (memory.readWord(memory.PC + 1) + MPU.Y) & 65535;
      var b = memory.read(addr);
      var binary_sum = MPU.A + b + (P.C ? 1 : 0);
      P.setZN(binary_sum & 255);
      if (P.D) {
        var al = (MPU.A & 0x0f) + (b & 0x0f) + (P.C ? 1 : 0);
        if (al >= 0x0a) al = ((al + 0x06) & 0x0f) + 0x10;
        MPU.A = (MPU.A & 0xf0) + (b & 0xf0) + al;
        var zna = getTwosComplement(MPU.A) + getTwosComplement(b) + getTwosComplement(al);
        (MPU.A & 128) ? P.setBit(7) : P.clearBit(7);
        ((zna < -128) || (zna > 127)) ? P.setBit(6) : P.clearBit(6);
        if (MPU.A >= 0xa0) MPU.A = MPU.A + 0x60;
        (MPU.A >= 0x100) ? P.setBit(0) : P.clearBit(0);
        MPU.A = MPU.A & 255;
      }
      else {
        (!((MPU.A ^ b) & 128) && ((b ^ binary_sum) & 128)) ? P.setBit(6) : P.clearBit(6);
        (binary_sum > 255) ? P.setBit(0) : P.clearBit(0);
        MPU.A = binary_sum & 255;
      }
      memory.PC+=2;
      break;
    case 0x61: //ADC Indirect X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var b = memory.read(memory.readWord(addr));
      var binary_sum = MPU.A + b + (P.C ? 1 : 0);
      P.setZN(binary_sum & 255);
      if (P.D) {
        var al = (MPU.A & 0x0f) + (b & 0x0f) + (P.C ? 1 : 0);
        if (al >= 0x0a) al = ((al + 0x06) & 0x0f) + 0x10;
        MPU.A = (MPU.A & 0xf0) + (b & 0xf0) + al;
        var zna = getTwosComplement(MPU.A) + getTwosComplement(b) + getTwosComplement(al);
        (MPU.A & 128) ? P.setBit(7) : P.clearBit(7);
        ((zna < -128) || (zna > 127)) ? P.setBit(6) : P.clearBit(6);
        if (MPU.A >= 0xa0) MPU.A = MPU.A + 0x60;
        (MPU.A >= 0x100) ? P.setBit(0) : P.clearBit(0);
        MPU.A = MPU.A & 255;
      }
      else {
        (!((MPU.A ^ b) & 128) && ((b ^ binary_sum) & 128)) ? P.setBit(6) : P.clearBit(6);
        (binary_sum > 255) ? P.setBit(0) : P.clearBit(0);
        MPU.A = binary_sum & 255;
      }
      memory.PC+=2;
      break;
    case 0x71: //ADC Indirect Y
      var addr = memory.read(memory.PC + 1);
      var b = memory.read((memory.readWord(addr) + MPU.Y) & 65535);
      var binary_sum = MPU.A + b + (P.C ? 1 : 0);
      P.setZN(binary_sum & 255);
      if (P.D) {
        var al = (MPU.A & 0x0f) + (b & 0x0f) + (P.C ? 1 : 0);
        if (al >= 0x0a) al = ((al + 0x06) & 0x0f) + 0x10;
        MPU.A = (MPU.A & 0xf0) + (b & 0xf0) + al;
        var zna = getTwosComplement(MPU.A) + getTwosComplement(b) + getTwosComplement(al);
        (MPU.A & 128) ? P.setBit(7) : P.clearBit(7);
        ((zna < -128) || (zna > 127)) ? P.setBit(6) : P.clearBit(6);
        if (MPU.A >= 0xa0) MPU.A = MPU.A + 0x60;
        (MPU.A >= 0x100) ? P.setBit(0) : P.clearBit(0);
        MPU.A = MPU.A & 255;
      }
      else {
        (!((MPU.A ^ b) & 128) && ((b ^ binary_sum) & 128)) ? P.setBit(6) : P.clearBit(6);
        (binary_sum > 255) ? P.setBit(0) : P.clearBit(0);
        MPU.A = binary_sum & 255;
      }
      memory.PC+=2;
      break;
    case 0x29: //AND Immediate
      var b = memory.read(memory.PC + 1);
      MPU.A = (MPU.A & b) & 255;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0x25: //AND Zero Page
      var addr = memory.read(memory.PC + 1);
      var b = memory.read(addr);
      MPU.A = (MPU.A & b) & 255;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0x35: //AND Zero Page X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var b = memory.read(addr);
      MPU.A = (MPU.A & b) & 255;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0x2d: //AND Absolute
      var addr = memory.readWord(memory.PC + 1);
      var b = memory.read(addr);
      MPU.A = (MPU.A & b) & 255;
      P.setZN(MPU.A);
      memory.PC+=3;
      break;
    case 0x3d: //AND Absolute X
      var addr = (memory.readWord(memory.PC + 1) + MPU.X) & 65535;
      var b = memory.read(addr);
      MPU.A = (MPU.A & b) & 255;
      P.setZN(MPU.A);
      memory.PC+=3;
      break;
    case 0x39: //AND Absolute Y
      var addr = (memory.readWord(memory.PC + 1) + MPU.Y) & 65535;
      var b = memory.read(addr);
      MPU.A = (MPU.A & b) & 255;
      P.setZN(MPU.A);
      memory.PC+=3;
      break;
    case 0x21: //AND Indirect X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var b = memory.read(memory.readWord(addr));
      MPU.A = (MPU.A & b) & 255;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0x31: //AND Indirect Y
      var addr = memory.read(memory.PC + 1);
      var b = memory.read((memory.readWord(addr) + MPU.Y) & 65535);
      MPU.A = (MPU.A & b) & 255;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0x0a: //ASL Accumulator
      (MPU.A & 128) ? P.setBit(0) : P.clearBit(0);
      MPU.A = ((MPU.A << 1) & 254);
      P.setZN(MPU.A);
      memory.PC+=1;
      break;
    case 0x06: //ASL Zero Page
      var addr = memory.read(memory.PC + 1);
      var b = memory.read(addr);
      (b & 128) ? P.setBit(0) : P.clearBit(0);
      var v = ((b << 1) & 254);
      memory.writeByte(v,addr);
      P.setZN(v);
      memory.PC+=2;
      break;
    case 0x16: //ASL Zero Page X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var b = memory.read(addr);
      (b & 128) ? P.setBit(0) : P.clearBit(0);
      var v = ((b << 1) & 254);
      memory.writeByte(v,addr);
      P.setZN(v);
      memory.PC+=2;
      break;
    case 0x0e: //ASL Absolute
      var addr = memory.readWord(memory.PC + 1);
      var b = memory.read(addr);
      (b & 128) ? P.setBit(0) : P.clearBit(0);
      var v = ((b << 1) & 254);
      memory.writeByte(v,addr);
      P.setZN(v);
      memory.PC+=3;
      break;
    case 0x1e: //ASL Absolute X
      var addr = (memory.readWord(memory.PC + 1) + MPU.X) & 65535;
      var b = memory.read(addr);
      (b & 128) ? P.setBit(0) : P.clearBit(0);
      var v = ((b << 1) & 254);
      memory.writeByte(v,addr);
      P.setZN(v);
      memory.PC+=3;
      break;
    case 0x90: //BCC
      memory.PC = memory.PC + 2 + (P.C ? 0 : getTwosComplement(memory.read(memory.PC + 1)));
      break;
    case 0xb0: //BCS
      memory.PC = memory.PC + 2 + (P.C ? getTwosComplement(memory.read(memory.PC + 1)) : 0);
      break;
    case 0xf0: //BEQ
      memory.PC = memory.PC + 2 + (P.Z ? getTwosComplement(memory.read(memory.PC + 1)) : 0);
      break;
    case 0x24: //BIT Zero Page
      var t = MPU.A & memory.read(memory.read(memory.PC + 1));
      (t & 64) ? P.setBit(6) : P.clearBit(6);
      P.setZN(t);
      memory.PC+=2;
      break;
    case 0x2c: //BIT Absolute
      var t = MPU.A & memory.read(memory.readWord(memory.PC + 1));
      (t & 64) ? P.setBit(6) : P.clearBit(6);
      P.setZN(t);
      memory.PC+=3;
      break;
    case 0x30: //BMI
      memory.PC = memory.PC + 2 + (P.N ? getTwosComplement(memory.read(memory.PC + 1)) : 0);
      break;
    case 0xd0: //BNE
      memory.PC = memory.PC + 2 + (P.Z ? 0 : getTwosComplement(memory.read(memory.PC + 1)));
      break;
    case 0x10: //BPL
      memory.PC = memory.PC + 2 + (P.N ? 0 : getTwosComplement(memory.read(memory.PC + 1)));
      break;
    case 0x00: //BRK
      memory = memory.PC + 2;
      brkInterrupt();
      return false;
      break;
    case 0x50: //BVC
      memory.PC = memory.PC + 2 + (P.V ? 0 : getTwosComplement(memory.read(memory.PC + 1)));
      break;
    case 0x70: //BVS
      memory.PC = memory.PC + 2 + (P.V ? getTwosComplement(memory.read(memory.PC + 1)) : 0);
      break;
    case 0x18: //CLC
      P.clearBit(0);
      memory.PC+=1;
      break;
    case 0xd8: //CLD
      P.clearBit(3);
      memory.PC+=1;
      break;
    case 0x58: //CLI
      P.clearBit(2);
      memory.PC+=1;
      break;
    case 0xb8: //CLV
      P.clearBit(6);
      memory.PC+=1;
      break;
    case 0xc9: //CMP Immediate
      var b = memory.read(memory.PC + 1);
      var t = MPU.A - b;
      (t >= 0) ? P.setBit(0) : P.clearBit(0);
      P.setZN(t);
      memory.PC+=2;
      break;
    case 0xc5: //CMP Zero Page
      var addr = memory.read(memory.PC + 1);
      var b = memory.read(addr);
      var t = MPU.A - b;
      (t >= 0) ? P.setBit(0) : P.clearBit(0);
      P.setZN(t);
      memory.PC+=2;
      break;
    case 0xd5: //CMP Zero Page X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var b = memory.read(addr);
      var t = MPU.A - b;
      (t >= 0) ? P.setBit(0) : P.clearBit(0);
      P.setZN(t);
      memory.PC+=2;
      break;
    case 0xcd: //CMP Absolute
      var addr = memory.readWord(memory.PC + 1);
      var b = memory.read(addr);
      var t = MPU.A - b;
      (t >= 0) ? P.setBit(0) : P.clearBit(0);
      P.setZN(t);
      memory.PC+=3;
      break;
    case 0xdd: //CMP Absolute X
      var addr = (memory.readWord(memory.PC + 1) + MPU.X) & 65535;
      var b = memory.read(addr);
      var t = MPU.A - b;
      (t >= 0) ? P.setBit(0) : P.clearBit(0);
      P.setZN(t);
      memory.PC+=3;
      break;
    case 0xd9: //CMP Absolute Y
      var addr = (memory.readWord(memory.PC + 1) + MPU.Y) & 65535;
      var b = memory.read(addr);
      var t = MPU.A - b;
      (t >= 0) ? P.setBit(0) : P.clearBit(0);
      P.setZN(t);
      memory.PC+=3;
      break;
    case 0xc1: //CMP Indirect X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var b = memory.read(memory.readWord(addr));
      var t = MPU.A - b;
      (t >= 0) ? P.setBit(0) : P.clearBit(0);
      P.setZN(t);
      memory.PC+=2;
      break;
    case 0xd1: //CMP Indirect Y
      var addr = memory.read(memory.PC + 1);
      var b = memory.read((memory.readWord(addr) + MPU.Y) & 65535);
      var t = MPU.A - b;
      (t >= 0) ? P.setBit(0) : P.clearBit(0);
      P.setZN(t);
      memory.PC+=2;
      break;
    case 0xe0: //CPX Immediate
      var t = MPU.X - memory.read(memory.PC + 1);
      P.setZN(t);
      (t >= 0) ? P.setBit(0) : P.clearBit(0);
      memory.PC+=2;
      break;
    case 0xe4: //CPX Zero Page
      var t = MPU.X - memory.read(memory.read(memory.PC + 1));
      P.setZN(t);
      (t >= 0) ? P.setBit(0) : P.clearBit(0);
      memory.PC+=2;
      break;
    case 0xec: //CPX Absolute
      var t = MPU.X - memory.read(memory.readWord(memory.PC + 1));
      P.setZN(t);
      (t >= 0) ? P.setBit(0) : P.clearBit(0);
      memory.PC+=3;
      break;
    case 0xc0: //CPY Immediate
      var t = MPU.Y - memory.read(memory.PC + 1);
      P.setZN(t);
      (t >= 0) ? P.setBit(0) : P.clearBit(0);
      memory.PC+=2;
      break;
    case 0xc4: //CPY Zero Page
      var t = MPU.Y - memory.read(memory.read(memory.PC + 1));
      P.setZN(t);
      (t >= 0) ? P.setBit(0) : P.clearBit(0);
      memory.PC+=2;
      break;
    case 0xcc: //CPY Absolute
      var t = MPU.Y - memory.read(memory.readWord(memory.PC + 1));
      P.setZN(t);
      (t >= 0) ? P.setBit(0) : P.clearBit(0);
      memory.PC+=3;
      break;
    case 0xc6: //DEC Zero Page
      var addr = memory.read(memory.PC + 1);
      var v = (memory.read(addr) - 1) & 255;
      memory.writeByte(v,addr);
      P.setZN(v);
      memory.PC+=2;
      break;
    case 0xd6: //DEC Zero Page X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var v = (memory.read(addr) - 1) & 255;
      memory.writeByte(v,addr);
      P.setZN(v);
      memory.PC+=2;
      break;
    case 0xce: //DEC Absolute
      var addr = memory.readWord(memory.PC + 1);
      var v = (memory.read(addr) - 1) & 255;
      memory.writeByte(v,addr);
      P.setZN(v);
      memory.PC+=3;
      break;
    case 0xde: //DEC Absolute X
      var addr = (memory.readWord(memory.PC + 1) + MPU.X) & 65535;
      var v = (memory.read(addr) - 1) & 255;
      memory.writeByte(v,addr);
      P.setZN(v);
      memory.PC+=3;
      break;
    case 0xca: //DEX
      MPU.X = (MPU.X - 1) & 255;
      P.setZN(MPU.X);
      memory.PC+=1;
      break;
    case 0x88: //DEY
      MPU.Y = (MPU.Y - 1) & 255;
      P.setZN(MPU.Y);
      memory.PC+=1;
      break;
    case 0x49: //EOR Immediate
      var b = memory.read(memory.PC + 1);
      MPU.A = (MPU.A ^ b) & 255;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0x45: //EOR Zero Page
      var addr = memory.read(memory.PC + 1);
      var b = memory.read(addr);
      MPU.A = (MPU.A ^ b) & 255;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0x55: //EOR Zero Page X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var b = memory.read(addr);
      MPU.A = (MPU.A ^ b) & 255;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0x4d: //EOR Absolute
      var addr = memory.readWord(memory.PC + 1);
      var b = memory.read(addr);
      MPU.A = (MPU.A ^ b) & 255;
      P.setZN(MPU.A);
      memory.PC+=3;
      break;
    case 0x5d: //EOR Absolute X
      var addr = (memory.readWord(memory.PC + 1) + MPU.X) & 65535;
      var b = memory.read(addr);
      MPU.A = (MPU.A ^ b) & 255;
      P.setZN(MPU.A);
      memory.PC+=3;
      break;
    case 0x59: //EOR Absolute Y
      var addr = (memory.readWord(memory.PC + 1) + MPU.Y) & 65535;
      var b = memory.read(addr);
      MPU.A = (MPU.A ^ b) & 255;
      P.setZN(MPU.A);
      memory.PC+=3;
      break;
    case 0x41: //EOR Indirect X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var b = memory.read(memory.readWord(addr));
      MPU.A = (MPU.A ^ b) & 255;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0x51: //EOR Indirect Y
      var addr = memory.read(memory.PC + 1);
      var b = memory.read((memory.readWord(addr) + MPU.Y) & 65535);
      MPU.A = (MPU.A ^ b) & 255;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0xe6: //INC Zero Page
      var addr = memory.read(memory.PC + 1);
      var v = (memory.read(addr) + 1) & 255;
      memory.writeByte(v,addr);
      P.setZN(v);
      memory.PC+=2;
      break;
    case 0xf6: //INC Zero Page X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var v = (memory.read(addr) + 1) & 255;
      memory.writeByte(v,addr);
      P.setZN(v);
      memory.PC+=2;
      break;
    case 0xee: //INC Absolute
      var addr = memory.readWord(memory.PC + 1);
      var v = (memory.read(addr) + 1) & 255;
      memory.writeByte(v,addr);
      P.setZN(v);
      memory.PC+=3;
      break;
    case 0xfe: //INC Absolute X
      var addr = (memory.readWord(memory.PC + 1) + MPU.X) & 65535;
      var v = (memory.read(addr) + 1) & 255;
      memory.writeByte(v,addr);
      P.setZN(v);
      memory.PC+=3;
      break;
    case 0xe8: //INX
      MPU.X = (MPU.X + 1) & 255;
      P.setZN(MPU.X);
      memory.PC+=1;
      break;
    case 0xc8: //INY
      MPU.Y = (MPU.Y + 1) & 255;
      P.setZN(MPU.Y);
      memory.PC+=1;
      break;
    case 0x4c: //JMP Absolute
      memory.PC = memory.readWord(memory.PC + 1);
      break;
    case 0x6c: //JMP Indirect
      memory.PC = memory.readWord(memory.readWord(memory.PC + 1));
      break;
    case 0x20: //JSR
      stack.push(((memory.PC + 2) >> 8) & 0xff);
      stack.push((memory.PC + 2) & 0xff);
      memory.PC = memory.readWord(memory.PC + 1);
      break;
    case 0xa9: //LDA Immediate
      var b = memory.read(memory.PC + 1);
      MPU.A = b;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0xa5: //LDA Zero Page
      var addr = memory.read(memory.PC + 1);
      var b = memory.read(addr);
      MPU.A = b;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0xb5: //LDA Zero Page X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var b = memory.read(addr);
      MPU.A = b;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0xad: //LDA Absolute
      var addr = memory.readWord(memory.PC + 1);
      var b = memory.read(addr);
      MPU.A = b;
      P.setZN(MPU.A);
      memory.PC+=3;
      break;
    case 0xbd: //LDA Absolute X
      var addr = (memory.readWord(memory.PC + 1) + MPU.X) & 65535;
      var b = memory.read(addr);
      MPU.A = b;
      P.setZN(MPU.A);
      memory.PC+=3;
      break;
    case 0xb9: //LDA Absolute Y
      var addr = (memory.readWord(memory.PC + 1) + MPU.Y) & 65535;
      var b = memory.read(addr);
      MPU.A = b;
      P.setZN(MPU.A);
      memory.PC+=3;
      break;
    case 0xa1: //LDA Indirect X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var b = memory.read(memory.readWord(addr));
      MPU.A = b;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0xb1: //LDA Indirect Y
      var addr = memory.read(memory.PC + 1);
      var b = memory.read((memory.readWord(addr) + MPU.Y) & 65535);
      MPU.A = b;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0xa2: //LDX Immediate
      MPU.X = memory.read(memory.PC + 1);
      P.setZN(MPU.X);
      memory.PC+=2;
      break;
    case 0xa6: //LDX Zero Page
      MPU.X = memory.read(memory.read(memory.PC + 1));
      P.setZN(MPU.X);
      memory.PC+=2;
      break;
    case 0xb6: //LDX Zero Page Y
      MPU.X = memory.read((memory.read(memory.PC + 1) + MPU.Y) & 255);
      P.setZN(MPU.X);
      memory.PC+=2;
      break;
    case 0xae: //LDX Absolute
      MPU.X = memory.read(memory.readWord(memory.PC + 1));
      P.setZN(MPU.X);
      memory.PC+=3;
      break;
    case 0xbe: //LDX Absolute Y
      MPU.X = memory.read((memory.readWord(memory.PC + 1) + MPU.Y) & 65535);
      P.setZN(MPU.X);
      memory.PC+=3;
      break;
    case 0xa0: //LDY Immediate
      MPU.Y = memory.read(memory.PC + 1);
      P.setZN(MPU.Y);
      memory.PC+=2;
      break;
    case 0xa4: //LDY Zero Page
      MPU.Y = memory.read(memory.read(memory.PC + 1));
      P.setZN(MPU.Y);
      memory.PC+=2;
      break;
    case 0xb4: //LDY Zero Page X
      MPU.Y = memory.read((memory.read(memory.PC + 1) + MPU.X) & 255);
      P.setZN(MPU.Y);
      memory.PC+=2;
      break;
    case 0xac: //LDY Absolute
      MPU.Y = memory.read(memory.readWord(memory.PC + 1));
      P.setZN(MPU.Y);
      memory.PC+=3;
      break;
    case 0xbc: //LDY Absolute X
      MPU.Y = memory.read((memory.readWord(memory.PC + 1) + MPU.X) & 65535);
      P.setZN(MPU.Y);
      memory.PC+=3;
      break;
    case 0xea: //No OPeration.  Do nothing.
      memory.PC+=1;
      break;
    case 0x09: //ORA Immediate
      var b = memory.read(memory.PC + 1);
      MPU.A = (MPU.A | b) & 255;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0x05: //ORA Zero Page
      var addr = memory.read(memory.PC + 1);
      var b = memory.read(addr);
      MPU.A = (MPU.A | b) & 255;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0x15: //ORA Zero Page X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var b = memory.read(addr);
      MPU.A = (MPU.A | b) & 255;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0x0d: //ORA Absolute
      var addr = memory.readWord(memory.PC + 1);
      var b = memory.read(addr);
      MPU.A = (MPU.A | b) & 255;
      P.setZN(MPU.A);
      memory.PC+=3;
      break;
    case 0x1d: //ORA Absolute X
      var addr = (memory.readWord(memory.PC + 1) + MPU.X) & 65535;
      var b = memory.read(addr);
      MPU.A = (MPU.A | b) & 255;
      P.setZN(MPU.A);
      memory.PC+=3;
      break;
    case 0x19: //ORA Absolute Y
      var addr = (memory.readWord(memory.PC + 1) + MPU.Y) & 65535;
      var b = memory.read(addr);
      MPU.A = (MPU.A | b) & 255;
      P.setZN(MPU.A);
      memory.PC+=3;
      break;
    case 0x01: //ORA Indirect X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var b = memory.read(memory.readWord(addr));
      MPU.A = (MPU.A | b) & 255;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0x11: //ORA Indirect Y
      var addr = memory.read(memory.PC + 1);
      var b = memory.read((memory.readWord(addr) + MPU.Y) & 65535);
      MPU.A = (MPU.A | b) & 255;
      P.setZN(MPU.A);
      memory.PC+=2;
      break;
    case 0x48: //PHA
      stack.push(MPU.A);
      memory.PC+=1;
      break;
    case 0x08: //PHP
      stack.push(P.getFlags());
      memory.PC+=1;
      break;
    case 0x68: //PLA
      MPU.A = stack.pull();
      P.setZN(MPU.A);
      memory.PC+=1;
      break;
    case 0x28: //PLP
      P.setFlagsTo(stack.pull());
      memory.PC+=1;
      break;
    case 0x4a: //LSR Accumulator
      P.clearBit(7);
      (MPU.A & 1) ? P.setBit(0) : P.clearBit(0);
      MPU.A = ((MPU.A >>> 1) & 127);
      (MPU.A == 0) ? P.setBit(1) : P.clearBit(1);
      memory.PC+=1;
      break;
    case 0x46: //LSR Zero Page
      var addr = memory.read(memory.PC + 1);
      var b = memory.read(addr);
      P.clearBit(7);
      (b & 1) ? P.setBit(0) : P.clearBit(0);
      memory.writeByte(((b >>> 1) & 127),addr);
      (b == 0) ? P.setBit(1) : P.clearBit(1);
      memory.PC+=2;
      break;
    case 0x56: //LSR Zero Page X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var b = memory.read(addr);
      P.clearBit(7);
      (b & 1) ? P.setBit(0) : P.clearBit(0);
      memory.writeByte(((b >>> 1) & 127),addr);
      (b == 0) ? P.setBit(1) : P.clearBit(1);
      memory.PC+=2;
      break;
    case 0x4e: //LSR Absolute
      var addr = memory.readWord(memory.PC + 1);
      var b = memory.read(addr);
      P.clearBit(7);
      (b & 1) ? P.setBit(0) : P.clearBit(0);
      memory.writeByte(((b >>> 1) & 127),addr);
      (b == 0) ? P.setBit(1) : P.clearBit(1);
      memory.PC+=3;
      break;
    case 0x5e: //LSR Absolute X
      var addr = (memory.readWord(memory.PC + 1) + MPU.X) & 65535;
      var b = memory.read(addr);
      P.clearBit(7);
      (b & 1) ? P.setBit(0) : P.clearBit(0);
      memory.writeByte(((b >>> 1) & 127),addr);
      (b == 0) ? P.setBit(1) : P.clearBit(1);
      memory.PC+=3;
      break;
    case 0x2a: //ROL Accumulator
      var old_bit = MPU.A & 128;
      MPU.A = ((MPU.A << 1) & 254) | (P.C ? 1 : 0);
      old_bit ? P.setBit(0) : P.clearBit(0);
      P.setZN(MPU.A);
      memory.PC+=1;
      break;
    case 0x26: //ROL Zero Page
      var addr = memory.read(memory.PC + 1);
      var b = memory.read(addr);
      var old_bit = b & 128;
      var v = ((b << 1) & 254) | (P.C ? 1 : 0);
      memory.writeByte(v,addr);
      old_bit ? P.setBit(0) : P.clearBit(0);
      P.setZN(v);
      memory.PC+=2;
      break;
    case 0x36: //ROL Zero Page X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var b = memory.read(addr);
      var old_bit = b & 128;
      var v = ((b << 1) & 254) | (P.C ? 1 : 0);
      memory.writeByte(v,addr);
      old_bit ? P.setBit(0) : P.clearBit(0);
      P.setZN(v);
      memory.PC+=2;
      break;
    case 0x2e: //ROL Absolute
      var addr = memory.readWord(memory.PC + 1);
      var b = memory.read(addr);
      var old_bit = b & 128;
      var v = ((b << 1) & 254) | (P.C ? 1 : 0);
      memory.writeByte(v,addr);
      old_bit ? P.setBit(0) : P.clearBit(0);
      P.setZN(v);
      memory.PC+=3;
      break;
    case 0x3e: //ROL Absolute X
      var addr = (memory.readWord(memory.PC + 1) + MPU.X) & 65535;
      var b = memory.read(addr);
      var old_bit = b & 128;
      var v = ((b << 1) & 254) | (P.C ? 1 : 0);
      memory.writeByte(v,addr);
      old_bit ? P.setBit(0) : P.clearBit(0);
      P.setZN(v);
      memory.PC+=3;
      break;
    case 0x6a: //RORA
      var old_bit = MPU.A & 1;
      MPU.A = ((MPU.A >>> 1) & 127) | (P.C ? 128 : 0);
      old_bit ? P.setBit(0) : P.clearBit(0);
      P.setZN(MPU.A);
      memory.PC+=1;
      break;
    case 0x66: //ROR Zero Page
      var addr = memory.read(memory.PC + 1);
      var b = memory.read(addr);
      var old_bit = b & 1;
      var v = ((b >>> 1) & 127) | (P.C ? 128 : 0);
      memory.writeByte(v,addr);
      old_bit ? P.setBit(0) : P.clearBit(0);
      P.setZN(v);
      memory.PC+=2;
      break;
    case 0x76: //ROR Zero Page X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var b = memory.read(addr);
      var old_bit = b & 1;
      var v = ((b >>> 1) & 127) | (P.C ? 128 : 0);
      memory.writeByte(v,addr);
      old_bit ? P.setBit(0) : P.clearBit(0);
      P.setZN(v);
      memory.PC+=2;
      break;
    case 0x6e: //ROR Absolute
      var addr = memory.readWord(memory.PC + 1);
      var b = memory.read(addr);
      var old_bit = b & 1;
      var v = ((b >>> 1) & 127) | (P.C ? 128 : 0);
      memory.writeByte(v,addr);
      old_bit ? P.setBit(0) : P.clearBit(0);
      P.setZN(v);
      memory.PC+=3;
      break;
    case 0x7e: //ROR Absolute X
      var addr = (memory.readWord(memory.PC + 1) + MPU.X) & 65535;
      var b = memory.read(addr);
      var old_bit = b & 1;
      var v = ((b >>> 1) & 127) | (P.C ? 128 : 0);
      memory.writeByte(v,addr);
      old_bit ? P.setBit(0) : P.clearBit(0);
      P.setZN(v);
      memory.PC+=3;
      break;
    case 0x40: //RTI
      P.setFlagsTo(stack.pull());
      memory.PC=(stack.pull() | (stack.pull() << 8));
      break;
    case 0x60: //RTS
      memory.PC=(stack.pull() | (stack.pull() << 8)) + 1;
      break;
    case 0xe9: //SBC Immediate
      var b = memory.read(memory.PC + 1);
      var binary_diff = MPU.A - b - (P.C ? 0 : 1);
      P.setZN(binary_diff);
      var twos = getTwosComplement(MPU.A) - getTwosComplement(b) - (P.C ? 0 : 1);
      ((twos < -128) || (twos > 127)) ? P.setBit(6) : P.clearBit(6);
      if (P.D) {
        var al = (MPU.A & 0x0f) - (b & 0x0f) - (P.C ? 0 : 1);
        if (al < 0) al = ((al - 0x06) & 0x0f) - 0x10
        MPU.A = (MPU.A & 0xf0) - (b & 0xf0) + al;
        if (MPU.A < 0) MPU.A = MPU.A - 0x60
        MPU.A = MPU.A & 255;
      }
      else {
        MPU.A = binary_diff & 255;
      }
      (binary_diff >= 0) ? P.setBit(0) : P.clearBit(0);
      memory.PC+=2;
      break;
    case 0xe5: //SBC Zero Page
      var addr = memory.read(memory.PC + 1);
      var b = memory.read(addr);
      var binary_diff = MPU.A - b - (P.C ? 0 : 1);
      P.setZN(binary_diff);
      var twos = getTwosComplement(MPU.A) - getTwosComplement(b) - (P.C ? 0 : 1);
      ((twos < -128) || (twos > 127)) ? P.setBit(6) : P.clearBit(6);
      if (P.D) {
        var al = (MPU.A & 0x0f) - (b & 0x0f) - (P.C ? 0 : 1);
        if (al < 0) al = ((al - 0x06) & 0x0f) - 0x10
        MPU.A = (MPU.A & 0xf0) - (b & 0xf0) + al;
        if (MPU.A < 0) MPU.A = MPU.A - 0x60
        MPU.A = MPU.A & 255;
      }
      else {
        MPU.A = binary_diff & 255;
      }
      (binary_diff >= 0) ? P.setBit(0) : P.clearBit(0);
      memory.PC+=2;
      break;
     case 0xf5: //SBC Zero Page X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var b = memory.read(addr);
      var binary_diff = MPU.A - b - (P.C ? 0 : 1);
      P.setZN(binary_diff);
      var twos = getTwosComplement(MPU.A) - getTwosComplement(b) - (P.C ? 0 : 1);
      ((twos < -128) || (twos > 127)) ? P.setBit(6) : P.clearBit(6);
      if (P.D) {
        var al = (MPU.A & 0x0f) - (b & 0x0f) - (P.C ? 0 : 1);
        if (al < 0) al = ((al - 0x06) & 0x0f) - 0x10
        MPU.A = (MPU.A & 0xf0) - (b & 0xf0) + al;
        if (MPU.A < 0) MPU.A = MPU.A - 0x60
        MPU.A = MPU.A & 255;
      }
      else {
        MPU.A = binary_diff & 255;
      }
      (binary_diff >= 0) ? P.setBit(0) : P.clearBit(0);
      memory.PC+=2;
      break;
    case 0xed: //SBC Absolute
      var addr = memory.readWord(memory.PC + 1);
      var b = memory.read(addr);
      var binary_diff = MPU.A - b - (P.C ? 0 : 1);
      P.setZN(binary_diff);
      var twos = getTwosComplement(MPU.A) - getTwosComplement(b) - (P.C ? 0 : 1);
      ((twos < -128) || (twos > 127)) ? P.setBit(6) : P.clearBit(6);
      if (P.D) {
        var al = (MPU.A & 0x0f) - (b & 0x0f) - (P.C ? 0 : 1);
        if (al < 0) al = ((al - 0x06) & 0x0f) - 0x10
        MPU.A = (MPU.A & 0xf0) - (b & 0xf0) + al;
        if (MPU.A < 0) MPU.A = MPU.A - 0x60
        MPU.A = MPU.A & 255;
      }
      else {
        MPU.A = binary_diff & 255;
      }
      (binary_diff >= 0) ? P.setBit(0) : P.clearBit(0);
      memory.PC+=2;
      break;
    case 0xfd: //SBC Absolute X
      var addr = (memory.readWord(memory.PC + 1) + MPU.X) & 65535;
      var b = memory.read(addr);
      var binary_diff = MPU.A - b - (P.C ? 0 : 1);
      P.setZN(binary_diff);
      var twos = getTwosComplement(MPU.A) - getTwosComplement(b) - (P.C ? 0 : 1);
      ((twos < -128) || (twos > 127)) ? P.setBit(6) : P.clearBit(6);
      if (P.D) {
        var al = (MPU.A & 0x0f) - (b & 0x0f) - (P.C ? 0 : 1);
        if (al < 0) al = ((al - 0x06) & 0x0f) - 0x10
        MPU.A = (MPU.A & 0xf0) - (b & 0xf0) + al;
        if (MPU.A < 0) MPU.A = MPU.A - 0x60
        MPU.A = MPU.A & 255;
      }
      else {
        MPU.A = binary_diff & 255;
      }
      (binary_diff >= 0) ? P.setBit(0) : P.clearBit(0);
      memory.PC+=2;
      break;
    case 0xf9: //SBC Absolute Y
      var addr = (memory.readWord(memory.PC + 1) + MPU.Y) & 65535;
      var b = memory.read(addr);
      var binary_diff = MPU.A - b - (P.C ? 0 : 1);
      P.setZN(binary_diff);
      var twos = getTwosComplement(MPU.A) - getTwosComplement(b) - (P.C ? 0 : 1);
      ((twos < -128) || (twos > 127)) ? P.setBit(6) : P.clearBit(6);
      if (P.D) {
        var al = (MPU.A & 0x0f) - (b & 0x0f) - (P.C ? 0 : 1);
        if (al < 0) al = ((al - 0x06) & 0x0f) - 0x10
        MPU.A = (MPU.A & 0xf0) - (b & 0xf0) + al;
        if (MPU.A < 0) MPU.A = MPU.A - 0x60
        MPU.A = MPU.A & 255;
      }
      else {
        MPU.A = binary_diff & 255;
      }
      (binary_diff >= 0) ? P.setBit(0) : P.clearBit(0);
      memory.PC+=2;
      break;
    case 0xe1: //SBC Indirect X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      var b = memory.read(memory.readWord(addr));
      var binary_diff = MPU.A - b - (P.C ? 0 : 1);
      P.setZN(binary_diff);
      var twos = getTwosComplement(MPU.A) - getTwosComplement(b) - (P.C ? 0 : 1);
      ((twos < -128) || (twos > 127)) ? P.setBit(6) : P.clearBit(6);
      if (P.D) {
        var al = (MPU.A & 0x0f) - (b & 0x0f) - (P.C ? 0 : 1);
        if (al < 0) al = ((al - 0x06) & 0x0f) - 0x10
        MPU.A = (MPU.A & 0xf0) - (b & 0xf0) + al;
        if (MPU.A < 0) MPU.A = MPU.A - 0x60
        MPU.A = MPU.A & 255;
      }
      else {
        MPU.A = binary_diff & 255;
      }
      (binary_diff >= 0) ? P.setBit(0) : P.clearBit(0);
      memory.PC+=2;
      break;
    case 0xf1: //SBC Indirect Y
      var addr = memory.read(memory.PC + 1);
      var b = memory.read((memory.readWord(addr) + MPU.Y) & 65535);
      var binary_diff = MPU.A - b - (P.C ? 0 : 1);
      P.setZN(binary_diff);
      var twos = getTwosComplement(MPU.A) - getTwosComplement(b) - (P.C ? 0 : 1);
      ((twos < -128) || (twos > 127)) ? P.setBit(6) : P.clearBit(6);
      if (P.D) {
        var al = (MPU.A & 0x0f) - (b & 0x0f) - (P.C ? 0 : 1);
        if (al < 0) al = ((al - 0x06) & 0x0f) - 0x10
        MPU.A = (MPU.A & 0xf0) - (b & 0xf0) + al;
        if (MPU.A < 0) MPU.A = MPU.A - 0x60
        MPU.A = MPU.A & 255;
      }
      else {
        MPU.A = binary_diff & 255;
      }
      (binary_diff >= 0) ? P.setBit(0) : P.clearBit(0);
      memory.PC+=2;
      break;
    case 0x38: //SEC
      P.setBit(0);
      memory.PC+=1;
      break;
    case 0xf8: //SED
      P.setBit(3)
      memory.PC+=1;
      break;
    case 0x78: //SEI
      P.setBit(2);
      memory.PC+=1;
      break;
    case 0x85: //STA Zero Page
      var addr = memory.read(memory.PC + 1);
      memory.writeByte(MPU.A,addr);
      memory.PC+=2;
      break;
    case 0x95: //STA Zero Page X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      memory.writeByte(MPU.A,addr);
      memory.PC+=2;
      break;
    case 0x8d: //STA Absolute
      var addr = memory.readWord(memory.PC + 1);
      memory.writeByte(MPU.A,addr);
      memory.PC+=3;
      break;
    case 0x9d: //STA Absolute X
      var addr = (memory.readWord(memory.PC + 1) + MPU.X) & 65535;
      memory.writeByte(MPU.A,addr);
      memory.PC+=3;
      break;
    case 0x99: //STA Absolute Y
      var addr = (memory.readWord(memory.PC + 1) + MPU.Y) & 65535;
      memory.writeByte(MPU.A,addr);
      memory.PC+=3;
      break;
    case 0x81: //STA Indirect X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      memory.writeByte(MPU.A,memory.readWord(addr));
      memory.PC+=2;
      break;
    case 0x91: //STA Indirect Y
      var addr = (memory.readWord(memory.read(memory.PC + 1)) + MPU.Y) & 65535;
      memory.writeByte(MPU.A,addr);
      memory.PC+=2;
      break;
    case 0x86: //STX Zero Page
      var addr = memory.read(memory.PC + 1);
      memory.writeByte(MPU.X,addr);
      memory.PC+=2;
      break;
    case 0x96: //STX Zero Page Y
      var addr = (memory.read(memory.PC + 1) + MPU.Y) & 255;
      memory.writeByte(MPU.X,addr);
      memory.PC+=2;
      break;
    case 0x8e: //STX Absolute
      var addr = memory.readWord(memory.PC + 1);
      memory.writeByte(MPU.X,addr);
      memory.PC+=3;
      break;
    case 0x84: //STY Zero Page
      var addr = memory.read(memory.PC + 1);
      memory.writeByte(MPU.Y,addr);
      memory.PC+=2;
      break;
    case 0x94: //STY Zero Page X
      var addr = (memory.read(memory.PC + 1) + MPU.X) & 255;
      memory.writeByte(MPU.Y,addr);
      memory.PC+=2;
      break;
    case 0x8c: //STY Absolute
      var addr = memory.readWord(memory.PC + 1);
      memory.writeByte(MPU.Y,addr);
      memory.PC+=3;
      break;
    case 0xaa: //TAX
      MPU.X = MPU.A
      P.setZN(MPU.X);
      memory.PC+=1;
      break;
    case 0xa8: //TAY
      MPU.Y = MPU.A
      P.setZN(MPU.Y);
      memory.PC+=1;
      break;
    case 0xba: //TSX
      MPU.X = stack.SP
      P.setZN(MPU.X);
      memory.PC+=1;
      break;
    case 0x8a: //TXA
      MPU.A = MPU.X
      P.setZN(MPU.A);
      memory.PC+=1;
      break;
    case 0x9a: //TXS
      stack.SP = MPU.X
      memory.PC+=1;
      break;
    case 0x98: //TYA
      MPU.A = MPU.Y
      P.setZN(MPU.A);
      memory.PC+=1;
      break;
    case 0x02: //HLT
      clearInterval(instructionTimer);
      instructionTimer = null;
      programExecuting = false;
      statusWindow.write("Program execution halted.");
      return false;
      break;
    case 0xf2: //OUT
      if (MPU.A == 13) {
        document.getElementById('output').appendChild(document.createElement("br"));
      }
      else {
        document.getElementById('output').appendChild(document.createTextNode(String.fromCharCode(MPU.A)));
      }
      memory.PC+=1;
      break;
    case 0xfa: //OUY
      if (((MPU.A << 8) | MPU.Y) == 13) {
        document.getElementById('output').appendChild(document.createElement("br"));
      }
      else {
        document.getElementById('output').appendChild(document.createTextNode(String.fromCharCode((MPU.A << 8) | MPU.Y)));
      }
      memory.PC+=1;
      break;
    case 0xf3: //IN
      if (input.length < 1) {
        var p = prompt("Enter your input: (move this dialog to see console output, if necessary)");
        if (p == null) { p = ""; }
        input = p + String.fromCharCode(0);
      }
      MPU.A = input.substring(0,1).charCodeAt();
      input = input.substring(1);
      P.setZN(MPU.A);
      memory.PC+=1;
      break;
    case 0xf7: //WAI
      clearInterval(instructionTimer);
      instructionTimer = false;
      return false;
      break;
    default: //Handle any erroneous instructions.
      if (memory.read(memory.PC) != undefined) {
        clearInterval(instructionTimer);
        instructionTimer = null;
        programExecuting = false;
        statusWindow.writeError("Encountered invalid instruction at $" + d2h(memory.PC,4) + ": $" + d2h(memory.read(memory.PC)) + ".");
        return false;
      }
      break;
}
return true;
}









function disassembleProgram() {
var outputarray= new Array();
for (i=0;i<memory.size;i++) {
  if (i >= memory.size - 3) { //Implement this in switch
    outputarray.push("$" + d2h(i,4) + ": " + ".DB " + memory.read(i) + "," + memory.read(i+1) + "," + memory.read(i+2));
    break;
  }
  switch (memory.read(i)) { //Switch statement for all of our processor instructions.
    case 0x69: //ADC Immediate
      outputarray.push("$" + d2h(i,4) + ": " + "ADC #$" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0x65: //ADC Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "ADC $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0x75: //ADC Zero Page X
      outputarray.push("$" + d2h(i,4) + ": " + "ADC $" + d2h(memory.read(i+1)) + ",X");
      i=i+1;
      break;
    case 0x6d: //ADC Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "ADC $" + d2h(memory.readWord(i+1)));
      i=i+2;
      break;
    case 0x7d: //ADC Absolute X
      outputarray.push("$" + d2h(i,4) + ": " + "ADC $" + d2h(memory.readWord(i+1)) + ",X");
      i=i+2;
      break;
    case 0x79: //ADC Absolute Y
      outputarray.push("$" + d2h(i,4) + ": " + "ADC $" + d2h(memory.readWord(i+1)) + ",Y");
      i=i+2;
      break;
    case 0x61: //ADC Indirect X
      outputarray.push("$" + d2h(i,4) + ": " + "ADC ($" + d2h(memory.read(i+1)) + ",X)");
      i=i+1;
      break;
    case 0x71: //ADC Indirect Y
      outputarray.push("$" + d2h(i,4) + ": " + "ADC ($" + d2h(memory.read(i+1)) + "),Y");
      i=i+1;
      break;
    case 0x29: //AND Immediate
      outputarray.push("$" + d2h(i,4) + ": " + "AND #$" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0x25: //AND Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "AND $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0x35: //AND Zero Page X
      outputarray.push("$" + d2h(i,4) + ": " + "AND $" + d2h(memory.read(i+1)) + ",X");
      i=i+1;
      break;
    case 0x2d: //AND Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "AND $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0x3d: //AND Absolute X
      outputarray.push("$" + d2h(i,4) + ": " + "AND $" + d2h(memory.readWord(i+1),4) + ",X");
      i=i+2;
      break;
    case 0x39: //AND Absolute Y
      outputarray.push("$" + d2h(i,4) + ": " + "AND $" + d2h(memory.readWord(i+1),4) + ",Y");
      i=i+2;
      break;
    case 0x21: //AND Indirect X
      outputarray.push("$" + d2h(i,4) + ": " + "AND ($" + d2h(memory.read(i+1)) + ",X)");
      i=i+1;
      break;
    case 0x31: //AND Indirect Y
      outputarray.push("$" + d2h(i,4) + ": " + "AND ($" + d2h(memory.read(i+1)) + "),Y");
      i=i+1;
      break;
    case 0x0a: //ASL Accumulator
      outputarray.push("$" + d2h(i,4) + ": " + "ASL");
      break;
    case 0x06: //ASL Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "ASL $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0x16: //ASL Zero Page X
      outputarray.push("$" + d2h(i,4) + ": " + "ASL $" + d2h(memory.read(i+1)) + ",X");
      i=i+1;
      break;
    case 0x0e: //ASL Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "ASL $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0x1e: //ASL Absolute X
      outputarray.push("$" + d2h(i,4) + ": " + "ASL $" + d2h(memory.readWord(i+1),4) + ",X");
      i=i+2;
      break;
    case 0x90: //BCC
      outputarray.push("$" + d2h(i,4) + ": " + "BCC $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0xb0: //BCS
      outputarray.push("$" + d2h(i,4) + ": " + "BCS $" + d2h(memory.read(i+1)));
      i+=1;
      break;
    case 0xf0: //BEQ
      outputarray.push("$" + d2h(i,4) + ": " + "BEQ $" + d2h(memory.read(i+1)));
      i+=1;
      break;
    case 0x24: //BIT Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "BIT $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0x2c: //BIT Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "BIT $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0x30: //BMI
      outputarray.push("$" + d2h(i,4) + ": " + "BMI $" + d2h(memory.read(i+1)));
      i+=1;
      break;
    case 0xd0: //BNE
      outputarray.push("$" + d2h(i,4) + ": " + "BNE $" + d2h(memory.read(i+1)));
      i+=1;
      break;
    case 0x10: //BPL
      outputarray.push("$" + d2h(i,4) + ": " + "BPL $" + d2h(memory.read(i+1)));
      i+=1;
      break;
    case 0x00: //BRK
      outputarray.push("$" + d2h(i,4) + ": " + "BRK");
      break;
    case 0x50: //BVC
      outputarray.push("$" + d2h(i,4) + ": " + "BVC $" + d2h(memory.read(i+1)));
      i+=1;
      break;
    case 0x70: //BVS
      outputarray.push("$" + d2h(i,4) + ": " + "BVS $" + d2h(memory.read(i+1)));
      i+=1;
      break;
    case 0x18: //CLC
      outputarray.push("$" + d2h(i,4) + ": " + "CLC");
      break;
    case 0xd8: //CLD
      outputarray.push("$" + d2h(i,4) + ": " + "CLD");
      break;
    case 0x58: //CLI
      outputarray.push("$" + d2h(i,4) + ": " + "CLI");
      break;
    case 0xb8: //CLV
      outputarray.push("$" + d2h(i,4) + ": " + "CLV");
      break;
    case 0xc9: //CMP Immediate
      outputarray.push("$" + d2h(i,4) + ": " + "CMP #$" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0xc5: //CMP Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "CMP $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0xd5: //CMP Zero Page X
      outputarray.push("$" + d2h(i,4) + ": " + "CMP $" + d2h(memory.read(i+1)) + ",X");
      i=i+1;
      break;
    case 0xcd: //CMP Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "CMP $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0xdd: //CMP Absolute X
      outputarray.push("$" + d2h(i,4) + ": " + "CMP $" + d2h(memory.readWord(i+1),4) + ",X");
      i=i+2;
      break;
    case 0xd9: //CMP Absolute Y
      outputarray.push("$" + d2h(i,4) + ": " + "CMP $" + d2h(memory.readWord(i+1),4) + ",Y");
      i=i+2;
      break;
    case 0xc1: //CMP Indirect X
      outputarray.push("$" + d2h(i,4) + ": " + "CMP ($" + d2h(memory.read(i+1)) + ",X)");
      i=i+1;
      break;
    case 0xd1: //CMP Indirect Y
      outputarray.push("$" + d2h(i,4) + ": " + "CMP ($" + d2h(memory.read(i+1)) + "),Y");
      i=i+1;
      break;
    case 0xe0: //CPX Immediate
      outputarray.push("$" + d2h(i,4) + ": " + "CPX #$" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0xe4: //CPX Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "CPX $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0xec: //CPX Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "CPX $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0xc0: //CPY Immediate
      outputarray.push("$" + d2h(i,4) + ": " + "CPY #$" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0xc4: //CPY Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "CPY $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0xcc: //CPY Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "CPY $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0xc6: //DEC Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "DEC $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0xd6: //DEC Zero Page X
      outputarray.push("$" + d2h(i,4) + ": " + "DEC $" + d2h(memory.read(i+1)) + ",X");
      i=i+1;
      break;
    case 0xce: //DEC Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "DEC $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0xde: //DEC Absolute X
      outputarray.push("$" + d2h(i,4) + ": " + "DEC $" + d2h(memory.readWord(i+1),4) + ",X");
      i=i+2;
      break;
    case 0xca: //DEX
      outputarray.push("$" + d2h(i,4) + ": " + "DEX");
      break;
    case 0x88: //DEY
      outputarray.push("$" + d2h(i,4) + ": " + "DEY");
      break;
    case 0x49: //EOR Immediate
      outputarray.push("$" + d2h(i,4) + ": " + "EOR #$" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0x45: //EOR Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "EOR $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0x55: //EOR Zero Page X
      outputarray.push("$" + d2h(i,4) + ": " + "EOR $" + d2h(memory.read(i+1)) + ",X");
      i=i+1;
      break;
    case 0x4d: //EOR Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "EOR $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0x5d: //EOR Absolute X
      outputarray.push("$" + d2h(i,4) + ": " + "EOR $" + d2h(memory.readWord(i+1),4) + ",X");
      i=i+2;
      break;
    case 0x59: //EOR Absolute Y
      outputarray.push("$" + d2h(i,4) + ": " + "EOR $" + d2h(memory.readWord(i+1),4) + ",Y");
      i=i+2;
      break;
    case 0x41: //EOR Indirect X
      outputarray.push("$" + d2h(i,4) + ": " + "EOR ($" + d2h(memory.read(i+1)) + ",X)");
      i=i+1;
      break;
    case 0x51: //EOR Indirect Y
      outputarray.push("$" + d2h(i,4) + ": " + "EOR ($" + d2h(memory.read(i+1)) + "),Y");
      i=i+1;
      break;
    case 0xe6: //INC Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "INC $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0xf6: //INC Zero Page X
      outputarray.push("$" + d2h(i,4) + ": " + "INC $" + d2h(memory.read(i+1)) + ",X");
      i=i+1;
      break;
    case 0xee: //INC Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "INC $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0xfe: //INC Absolute X
      outputarray.push("$" + d2h(i,4) + ": " + "INC $" + d2h(memory.readWord(i+1),4) + ",X");
      i=i+2;
      break;
    case 0xe8: //INX
      outputarray.push("$" + d2h(i,4) + ": " + "INX");
      break;
    case 0xc8: //INY
      outputarray.push("$" + d2h(i,4) + ": " + "INY");
      break;
    case 0x4c: //JMP Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "JMP $" + d2h(memory.readWord(i+1),4));
      i+=2;
      break;
    case 0x6c: //JMP Indirect
      outputarray.push("$" + d2h(i,4) + ": " + "JMP ($" + d2h(memory.readWord(i+1),4) + ")");
      i+=2;
      break;
    case 0x20: //JSR
      outputarray.push("$" + d2h(i,4) + ": " + "JSR $" + d2h(memory.readWord(i+1),4));
      i+=2;
      break;
    case 0xa9: //LDA Immediate
      outputarray.push("$" + d2h(i,4) + ": " + "LDA #$" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0xa5: //LDA Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "LDA $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0xb5: //LDA Zero Page X
      outputarray.push("$" + d2h(i,4) + ": " + "LDA $" + d2h(memory.read(i+1)) + ",X");
      i=i+1;
      break;
    case 0xad: //LDA Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "LDA $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0xbd: //LDA Absolute X
      outputarray.push("$" + d2h(i,4) + ": " + "LDA $" + d2h(memory.readWord(i+1),4) + ",X");
      i=i+2;
      break;
    case 0xb9: //LDA Absolute Y
      outputarray.push("$" + d2h(i,4) + ": " + "LDA $" + d2h(memory.readWord(i+1),4) + ",Y");
      i=i+2;
      break;
    case 0xa1: //LDA Indirect X
      outputarray.push("$" + d2h(i,4) + ": " + "LDA ($" + d2h(memory.read(i+1)) + ",X)");
      i=i+1;
      break;
    case 0xb1: //LDA Indirect Y
      outputarray.push("$" + d2h(i,4) + ": " + "LDA ($" + d2h(memory.read(i+1)) + "),Y");
      i=i+1;
      break;
    case 0xa2: //LDX Immediate
      outputarray.push("$" + d2h(i,4) + ": " + "LDX #$" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0xa6: //LDX Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "LDX $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0xb6: //LDX Zero Page Y
      outputarray.push("$" + d2h(i,4) + ": " + "LDX $" + d2h(memory.read(i+1)) + ",Y");
      i=i+1;
      break;
    case 0xae: //LDX Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "LDX $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0xbe: //LDX Absolute Y
      outputarray.push("$" + d2h(i,4) + ": " + "LDX $" + d2h(memory.readWord(i+1),4) + ",Y");
      i=i+2;
      break;
    case 0xa0: //LDY Immediate
      outputarray.push("$" + d2h(i,4) + ": " + "LDY #$" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0xa4: //LDY Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "LDY $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0xb4: //LDY Zero Page X
      outputarray.push("$" + d2h(i,4) + ": " + "LDY $" + d2h(memory.read(i+1)) + ",X");
      i=i+1;
      break;
    case 0xac: //LDY Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "LDY $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0xbc: //LDY Absolute X
      outputarray.push("$" + d2h(i,4) + ": " + "LDY $" + d2h(memory.readWord(i+1),4) + ",X");
      i=i+2;
      break;
    case 0xea: //No OPeration.  Do nothing.
      outputarray.push("$" + d2h(i,4) + ": " + "NOP");
      break;
    case 0x09: //ORA Immediate
      outputarray.push("$" + d2h(i,4) + ": " + "ORA #$" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0x05: //ORA Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "ORA $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0x15: //ORA Zero Page X
      outputarray.push("$" + d2h(i,4) + ": " + "ORA $" + d2h(memory.read(i+1)) + ",X");
      i=i+1;
      break;
    case 0x0d: //ORA Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "ORA $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0x1d: //ORA Absolute X
      outputarray.push("$" + d2h(i,4) + ": " + "ORA $" + d2h(memory.readWord(i+1),4) + ",X");
      i=i+2;
      break;
    case 0x19: //ORA Absolute Y
      outputarray.push("$" + d2h(i,4) + ": " + "ORA $" + d2h(memory.readWord(i+1),4) + ",Y");
      i=i+2;
      break;
    case 0x01: //ORA Indirect X
      outputarray.push("$" + d2h(i,4) + ": " + "ORA ($" + d2h(memory.read(i+1)) + ",X)");
      i=i+1;
      break;
    case 0x11: //ORA Indirect Y
      outputarray.push("$" + d2h(i,4) + ": " + "ORA ($" + d2h(memory.read(i+1)) + "),Y");
      i=i+1;
      break;
    case 0x48: //PHA
      outputarray.push("$" + d2h(i,4) + ": " + "PHA");
      break;
    case 0x08: //PHP
      outputarray.push("$" + d2h(i,4) + ": " + "PHP");
      break;
    case 0x68: //PLA
      outputarray.push("$" + d2h(i,4) + ": " + "PLA");
      break;
    case 0x28: //PLP
      outputarray.push("$" + d2h(i,4) + ": " + "PLP");
      break;
    case 0x4a: //LSR Accumulator
      outputarray.push("$" + d2h(i,4) + ": " + "LSR");
      break;
    case 0x46: //LSR Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "LSR $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0x56: //LSR Zero Page X
      outputarray.push("$" + d2h(i,4) + ": " + "LSR $" + d2h(memory.read(i+1)) + ",X");
      i=i+1;
      break;
    case 0x4e: //LSR Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "LSR $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0x5e: //LSR Absolute X
      outputarray.push("$" + d2h(i,4) + ": " + "LSR $" + d2h(memory.readWord(i+1),4) + ",X");
      i=i+2;
      break;
    case 0x2a: //ROL Accumulator
      outputarray.push("$" + d2h(i,4) + ": " + "ROL");
      break;
    case 0x26: //ROL Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "ROL $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0x36: //ROL Zero Page X
      outputarray.push("$" + d2h(i,4) + ": " + "ROL $" + d2h(memory.read(i+1)) + ",X");
      i=i+1;
      break;
    case 0x2e: //ROL Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "ROL $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0x3e: //ROL Absolute X
      outputarray.push("$" + d2h(i,4) + ": " + "ROL $" + d2h(memory.readWord(i+1),4) + ",X");
      i=i+2;
      break;
    case 0x6a: //ROR Accumulator
      outputarray.push("$" + d2h(i,4) + ": " + "ROR");
      break;
    case 0x66: //ROR Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "ROR $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0x76: //ROR Zero Page X
      outputarray.push("$" + d2h(i,4) + ": " + "ROR $" + d2h(memory.read(i+1)) + ",X");
      i=i+1;
      break;
    case 0x6e: //ROR Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "ROR $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0x7e: //ROR Absolute X
      outputarray.push("$" + d2h(i,4) + ": " + "ROR $" + d2h(memory.readWord(i+1),4) + ",X");
      i=i+2;
      break;
    case 0x40: //RTI
      outputarray.push("$" + d2h(i,4) + ": " + "RTI");
      break;
    case 0x60: //RTS
      outputarray.push("$" + d2h(i,4) + ": " + "RTS");
      break;
    case 0xe9: //SBC Immediate
      outputarray.push("$" + d2h(i,4) + ": " + "SBC #$" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0xe5: //SBC Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "SBC $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0xf5: //SBC Zero Page X
      outputarray.push("$" + d2h(i,4) + ": " + "SBC $" + d2h(memory.read(i+1)) + ",X");
      i=i+1;
      break;
    case 0xed: //SBC Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "SBC $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0xfd: //SBC Absolute X
      outputarray.push("$" + d2h(i,4) + ": " + "SBC $" + d2h(memory.readWord(i+1),4) + ",X");
      i=i+2;
      break;
    case 0xf9: //SBC Absolute Y
      outputarray.push("$" + d2h(i,4) + ": " + "SBC $" + d2h(memory.readWord(i+1),4) + ",Y");
      i=i+2;
      break;
    case 0xe1: //SBC Indirect X
      outputarray.push("$" + d2h(i,4) + ": " + "SBC ($" + d2h(memory.read(i+1)) + ",X)");
      i=i+1;
      break;
    case 0xf1: //SBC Indirect Y
      outputarray.push("$" + d2h(i,4) + ": " + "SBC ($" + d2h(memory.read(i+1)) + "),Y");
      i=i+1;
      break;
    case 0x38: //SEC
      outputarray.push("$" + d2h(i,4) + ": " + "SEC");
      break;
    case 0xf8: //SED
      outputarray.push("$" + d2h(i,4) + ": " + "SED");
      break;
    case 0x78: //SEI
      outputarray.push("$" + d2h(i,4) + ": " + "SEI");
      break;
    case 0x85: //STA Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "STA $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0x95: //STA Zero Page X
      outputarray.push("$" + d2h(i,4) + ": " + "STA $" + d2h(memory.read(i+1)) + ",X");
      i=i+1;
      break;
    case 0x8d: //STA Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "STA $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0x9d: //STA Absolute X
      outputarray.push("$" + d2h(i,4) + ": " + "STA $" + d2h(memory.readWord(i+1),4) + ",X");
      i=i+2;
      break;
    case 0x99: //STA Absolute Y
      outputarray.push("$" + d2h(i,4) + ": " + "STA $" + d2h(memory.readWord(i+1),4) + ",Y");
      i=i+2;
      break;
    case 0x81: //STA Indirect X
      outputarray.push("$" + d2h(i,4) + ": " + "STA ($" + d2h(memory.read(i+1)) + ",X)");
      i=i+1;
      break;
    case 0x91: //STA Indirect Y
      outputarray.push("$" + d2h(i,4) + ": " + "STA ($" + d2h(memory.read(i+1)) + "),Y");
      i=i+1;
      break;
    case 0x86: //STX Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "STX $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0x96: //STX Zero Page Y
      outputarray.push("$" + d2h(i,4) + ": " + "STX $" + d2h(memory.read(i+1)) + ",Y");
      i=i+1;
      break;
    case 0x8e: //STX Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "STX $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0x84: //STY Zero Page
      outputarray.push("$" + d2h(i,4) + ": " + "STY $" + d2h(memory.read(i+1)));
      i=i+1;
      break;
    case 0x94: //STY Zero Page X
      outputarray.push("$" + d2h(i,4) + ": " + "STY $" + d2h(memory.read(i+1)) + ",X");
      i=i+1;
      break;
    case 0x8c: //STY Absolute
      outputarray.push("$" + d2h(i,4) + ": " + "STY $" + d2h(memory.readWord(i+1),4));
      i=i+2;
      break;
    case 0xaa: //TAX
      outputarray.push("$" + d2h(i,4) + ": " + "TAX");
      break;
    case 0xa8: //TAY
      outputarray.push("$" + d2h(i,4) + ": " + "TAY");
      break;
    case 0xba: //TSX
      outputarray.push("$" + d2h(i,4) + ": " + "TSX");
      break;
    case 0x8a: //TXA
      outputarray.push("$" + d2h(i,4) + ": " + "TXA");
      break;
    case 0x9a: //TXS
      outputarray.push("$" + d2h(i,4) + ": " + "TXS");
      break;
    case 0x98: //TYA
      outputarray.push("$" + d2h(i,4) + ": " + "TYA");
      break;
    case 0x02: //HLT
      outputarray.push("$" + d2h(i,4) + ": " + "HLT");
      break;
    case 0xf2: //OUT
      outputarray.push("$" + d2h(i,4) + ": " + "OUT");
      break;
    case 0xf3: //IN
      outputarray.push("$" + d2h(i,4) + ": " + "IN");
      break;
    case 0xf7: //WAI
      outputarray.push("$" + d2h(i,4) + ": " + "WAI");
      break;
    default: //Otherwise, just push some bytes.
      if (memory.read(i) != undefined) {
        outputarray.push("$" + d2h(i,4) + ": " + ".db $" + d2h(memory.read(i)));
      }
      break;
}
}
return outputarray.join("\r\n").toUpperCase();
}
