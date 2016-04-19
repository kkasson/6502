function refreshScript(src) {
  var oldElement = document.getElementById('js');
  var parent = oldElement.parentNode;
  var scriptElement = document.createElement('script');
  scriptElement.type = 'text/javascript';
  scriptElement.src = src + '?' + (new Date).getTime();
  scriptElement.id = 'js';
  parent.removeChild(oldElement);
  parent.appendChild(scriptElement);
}

$(document).ready(function () {
  $("#textAmber").click(function () {
    $("#output").css({"color":"#FFF000", "background-color":"#111111"});
  });
  $("#textGreen").click(function () {
    $("#output").css({"color":"#00FF00", "background-color":"#111111"});
  });
  $("#textGray").click(function () {
    $("#output").css({"color":"#C0C0C0", "background-color":"#111111"});
  });
  $("#textBlack").click(function () {
    $("#output").css({"color":"#000000", "background-color":"#FFFFFF"});
  });

  $("#firstButton").click(function() {
    $(this).addClass("navClicked").siblings(".navButton").removeClass("navClicked");
    $("#pageOne").slideDown().siblings().hide();
  });
  $("#secondButton").click(function() {
    $(this).addClass("navClicked").siblings(".navButton").removeClass("navClicked");
    $("#pageTwo").slideDown().siblings().hide();
  });
  $("#thirdButton").click(function() {
    $(this).addClass("navClicked").siblings(".navButton").removeClass("navClicked");
    $("#pageThree").slideDown().siblings().hide();
  });
  $("#assemblerDocumentationLink").click(function() {
    $("#secondButton").addClass("navClicked").siblings(".navButton").removeClass("navClicked");
    $("#pageTwo").slideDown().siblings().hide();
  });
  $("#sourceCodeLink").click(function() {
    $("#thirdButton").addClass("navClicked").siblings(".navButton").removeClass("navClicked");
    $("#pageThree").slideDown().siblings().hide();
  });
  $("#sourceCodeLinkSecond").click(function() {
    $("#thirdButton").addClass("navClicked").siblings(".navButton").removeClass("navClicked");
    $("#pageThree").slideDown().siblings().hide();
  });

  $("#keypressbutton").click(function () {
    $(this).parent().parent().parent().find('span').css({"font-weight":"normal"});
    $(this).css({"font-weight":"bold"});
    $("#keypressexamplediv").slideDown().siblings(".codepage").hide();
    $("#loadExamplebutton").unbind('click').click(function() {
       document.getElementById('inputbox').value = document.getElementById('keypressexample').textContent.trim();
    });
  });
  $("#pixeltestbutton").click(function () {
    $(this).parent().parent().parent().find('span').css({"font-weight":"normal"});
    $(this).css({"font-weight":"bold"});
    $("#pixeltestexamplediv").slideDown().siblings(".codepage").hide();
    $("#loadExamplebutton").unbind('click').click(function() {
       document.getElementById('inputbox').value = document.getElementById('pixeltestexample').textContent.trim();
    });
  });
  $("#reverselettersbutton").click(function () {
    $(this).parent().parent().parent().find('span').css({"font-weight":"normal"});
    $(this).css({"font-weight":"bold"});
    $("#reverselettersexamplediv").slideDown().siblings(".codepage").hide();
    $("#loadExamplebutton").unbind('click').click(function() {
       document.getElementById('inputbox').value = document.getElementById('reverselettersexample').textContent.trim();
    });
  });
  $("#modulobutton").click(function () {
    $(this).parent().parent().parent().find('span').css({"font-weight":"normal"});
    $(this).css({"font-weight":"bold"});
    $("#moduloExampleDiv").slideDown().siblings(".codepage").hide();
    $("#loadExamplebutton").unbind('click').click(function() {
       document.getElementById('inputbox').value = document.getElementById('moduloExample').textContent.trim();
    });
  });
  $("#stringSubroutinebutton").click(function () {
    $(this).parent().parent().parent().find('span').css({"font-weight":"normal"});
    $(this).css({"font-weight":"bold"});
    $("#stringSubroutineExampleDiv").slideDown().siblings(".codepage").hide();
    $("#loadExamplebutton").unbind('click').click(function() {
       document.getElementById('inputbox').value = document.getElementById('stringSubroutineExample').textContent.trim();
    });
  });
  $("#loadExamplebutton").click(function() {
     document.getElementById('inputbox').value = document.getElementById('keypressexample').textContent.trim();
  });
});