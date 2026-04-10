goog.provide('kettos.live');

goog.require('kettos.live.functions');
goog.require('kettos.live.auth');
goog.require('kettos.common');
goog.require('kettos.common.Chart');
goog.require('kettos.common.FA.Graph');
goog.require('kettos.common.FA.Table');
goog.require('kettos.common.FA.CurveSelection');
goog.require('kettos.live.net');

goog.require('goog.string');
goog.require('goog.dom');
goog.require('goog.dom.classes');
goog.require('goog.events');
goog.require('goog.net.XhrIo');
goog.require('goog.Timer');
goog.require('goog.ui.ProgressBar');
goog.require('goog.ui.TabPane');
goog.require('goog.Uri');

// kettos.live.local
// = undefined for base module
// = true for local server running

goog.events.listen(window, 'load', function() {
  kettos.live.net.initListening();

  kettos.live.outputTimer_ = new goog.Timer(500);
  kettos.live.outputTimer_.start();

  kettos.live.observers = {};

  kettos.live.initBody_();

  kettos.live.initWidgets_();

  var event = new Event(kettos.constants.InitializationEndEvent);
  window.dispatchEvent(event);
});

kettos.live.initBody_ = function() {
  kettos.live.initBodyStyle_();
  var editorVersion = pageContainer.getAttribute('data-editor-version');
  if (editorVersion && editorVersion.length > 0) {
    kettos.live.checkVersion_(editorVersion);
  }
}

kettos.live.initBodyStyle_ = function() {
	var pageContainer = goog.dom.getElement('pageContainer');
	var width = pageContainer.getAttribute('data-width');
	var height = pageContainer.getAttribute('data-height');
	document.body.style.width = width;
	document.body.style.height = height;
	document.body.style.margin = "0";
	if (kettos.common.isNewDisplay() && width == "800" && height == "480") {
		document.body.style.zoom = 1.25;
		// new display has not same aspect ratio, therefore we add a black rectangle on top of a white unused space at right side
		var fill = goog.dom.createDom('div', {style: 'position:absolute;right:0px;top:0px;width:19.2px;height:100%;background-color:#000;'});
		document.body.appendChild(fill);
	}
	document.body.style.visibility = "visible";
}

kettos.live.checkVersion_ = function(editorVersion) {
  if (typeof VERSION !== 'undefined'){
    var editorVersionArray = editorVersion.split(".");
    var liveJSversionArray = VERSION.split(".");
    for(var i = 0; i < liveJSversionArray.length; i++) {
	    var editorPartVersion = parseInt(editorVersionArray[i]);
	    var livePartVersion = parseInt(liveJSversionArray[i]);
      if (editorVersionArray.length  > (i-1) && editorPartVersion > livePartVersion) {
        new kettos.dialog.Alert("This page was created using the Web Editor of version " + editorVersion +
                                " and it might not be served properly by this system of version " + VERSION + "<br/><br/>" +
                                "To resolve this issue upgrade the system's live.js file to same or higher version.");
      }
      if (editorPartVersion < livePartVersion) {
      	break;
      }
    }
  }
}

kettos.live.initWidgets_ = function(parentElement) {
  kettos.live.handlePriorityWidgets_(parentElement);
  kettos.live.handleAllWidgets_(parentElement);
}

kettos.live.handlePriorityWidgets_ = function(parentElement) {
  kettos.live.handleWidgets_('priority', parentElement);
}

kettos.live.handleAllWidgets_ = function(parentElement) {
  kettos.live.handleWidgets_('widget', parentElement);
}

kettos.live.handleWidgets_ = function(className, parentElement) {
  var widgets = goog.dom.getElementsByClass(className, parentElement);
  kettos.live.counter = 0;
  for (i = 0; i < widgets.length; i++) {
    var type = widgets[i].getAttribute('data-type');
    if (!type) {
      continue;
    }

    if (!widgets[i].firstChild.id) {
      widgets[i].firstChild.id = 'w' + kettos.live.counter;
      kettos.live.counter++;
    }
    try {
      kettos.live[type](widgets[i].firstChild, widgets[i]);              // call function according to the type
    } catch (e) {
      console.log(type, e);
    }
  }
}

kettos.live.treatLinks_ = function(element) {
  var links = goog.dom.getElementsByTagNameAndClass(goog.dom.TagName.SPAN, 'link', element);
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href');
    if (href) {
      links[i].removeAttribute('href');
      kettos.live.addReference_(links[i], href);
    }
  }
}

kettos.live.addReference_ = function(element, href) {
  element.style.cursor = 'pointer';

  var uri = new goog.Uri(href);

  // five kinds of links supported
  // a) starting with http://, no change: http://google.com ----> http://google.com
  // b) starting with /, no change: /local ----> /local (not working in preview)
  // c) starting with ~, redirect to honeywell context: ~page.html ----> ../honeywell/servlet?page=page.html (not working in preview)
  // d) otherwise, without dynamic module: page.html?module=1 ----> ?project=myProject&page=page.html&module=1 (current project)
  // e) same, but with dynamic module: page.html?module=dynamic ----> ?project=myProject&page=page.html&module=3 (current module)

  var cont = kettos.live.treatLocalURL_(uri);
  if (!cont) {
    // link not supposed to work in the preview mode, do not add handler then
    goog.events.listen(element, 'click', function(e) {
      new kettos.dialog.Alert('This type of link does not work in the preview mode.');
    });
    return;
  }

  var queryData = uri.getQueryData();
  goog.events.listen(element, 'click', function(e) {
    if (queryData.get('module') == 'dynamic') {
      var module = kettos.live.functions.getRefModule(element);
      if (module === null) {
        queryData.remove('module');
      } else {
        queryData.set('module', module);
      }
    }
    if (queryData.get('register') == 'dynamic') {
      var register = kettos.live.functions.getRefRegister(element)
      if (register === null) {
        queryData.remove('register');
      } else {
        queryData.set('register', register);
      }
    }

    // changing window.location does NOT prevent the rest of the JS to be run, so we need to enforce omitting the future redirects explicitely
    if (!kettos.live.redirected) {
      kettos.live.redirected = true;
      window.location.href = decodeURIComponent(uri.toString());
    }
  });

  return uri.toString();
}

kettos.live.treatLocalURL_ = function(uri) {
  var queryData = uri.getQueryData();
  if (uri.getDomain() == '') {
    if (uri.getPath().indexOf('/') == 0) {
      // honeywell slate page, do not do anything
      return !kettos.live.local;
    }
    var path = uri.getPath();
    if (uri.getPath().indexOf('~') == 0) {
      if (kettos.live.local) {
        // not working in preview
        return false;
      }
      // link into honeywell editor page, do the rewrite
      uri.setPath('../honeywell/servlet');
      path = path.substring(1);
    } else {
      // local editor page
      uri.setPath(null);
      // set project unless already specified by the user
      if (queryData.get('project') == null && kettos.live.local) {
        queryData.set('project', kettos.live.functions.getAttributeFromUrl('project'));
      }
    }
    queryData.set('page', path);
    uri.setQueryData(queryData);
  }
  return true;
}

kettos.live.getCurrentProject_ = function() {
  var uri = new goog.Uri(document.URL);
  return uri.getQueryData().get('project');
}

kettos.live.getFA_ = function(element) {
  // if FaModule is missing, don't even try getting data
  if (!kettos.live.FaModule) {
    if (!kettos.live.FaModuleWarning) {
      kettos.live.FaModuleWarning = true;
      new kettos.dialog.Alert('No FA Module is set. The FA widgets will not work properly.');
    }
    return null;
  }

  // kettos.live.dataFA:
  // undefined?   no one has asked for it yet, initiate the request (i.e. ask for it)
  // null?        someone has asked for it, but the response hasn't arrived
  // value?       someone has asked for it and the response has arrived
  if (kettos.live.dataFA === undefined) {
    kettos.live.dataFA = null;

    kettos.live.net.listenForShortcut(function(json) {
      kettos.live.dataFA = kettos.live.formatFA_(json);
    });
  }

  return kettos.live.dataFA;
}

kettos.live.getFaShortcutRequest = function () {

  var id = {id: kettos.live.FaModule};
  if (!kettos.live.dataFA || kettos.live.local) {
    return {sc: 'FA', d: id};
  }

  var shortcutList = [{sc: 'FAC', d: id}];
  var faa1 = false, faa2 = false, fav = false;

  for (var i = 0; i < kettos.live.dataFA.content.curves.length; i++) {
    var curve = kettos.live.dataFA.content.curves[i];
    shortcutList.push({sc: 'FA' + (curve.index + 1), d: id});
    switch(curve.index) {
      case 0:
      case 1: faa1 = true; break;
      case 2:
      case 3: faa2 = true; break;
      case 4:
      case 5: fav = true; break;
    }
  }

  //require trim, if any of trim widgets is used
  var widgets = goog.dom.getElementsByClass('widget');
  for (var i = 0; i < widgets.length; i++) {
    var dataType = widgets[i].getAttribute('data-type');
    if (dataType && dataType.toLowerCase().indexOf('trim') > -1 && kettos.live.functions.isVisible(widgets[i])) {
      shortcutList.push({sc: 'FAT', d: id});
      break;
    }
  }

  if(faa1) {
    shortcutList.push({sc: 'FAA1', d: id});
  }
  if(faa2) {
    shortcutList.push({sc: 'FAA2', d: id});
  }
  if(fav) {
    shortcutList.push({sc: 'FAV', d: id});
  }

  return shortcutList;
}

kettos.live.formatFA_ = function(json) {
  if (!json || !json.r || json.r.length == 0) {
    return null;
  }
  var result = {};

  // load into map
  var map = {};
  var prefixLength = json.r[0].id.indexOf('r') + 1;         // length of mXr (in mXrY)
  for (var i = 0; i < json.r.length; i++) {
    map[json.r[i].id.substring(prefixLength)] = kettos.common.sanitize(json.r[i].v);
  }

  var pointsAmount = kettos.live.parse_(map[2001]);
  var actuatorsAmount = kettos.live.parse_(map[141]);
  var vfdsAmount = kettos.live.parse_(map[142]);

  var throttle = {};
  throttle.commanded = parseFloat(map[110]);
  throttle.measured = parseFloat(map[118]);
  throttle.isLocked = map[119] == '2';
  throttle.points = [];
  for (var i = 0; i < pointsAmount; i++) {
    throttle.points[i] = parseFloat(map[2023+i]);
  }
  throttle.specialPoints = [];
  for (var i = 0; i < 5; i++) {
    throttle.specialPoints[i] = parseFloat(map[2018+i]);
  }
  result.throttle = throttle;

  var state = {};
  state.canPointMove = parseInt(map[120]);
  state.selectedPoint = kettos.live.parse_(map[121]);;
  state.selectedPoint = state.selectedPoint == 0 ? null : state.selectedPoint - 1;
  state.validSegments = kettos.live.parseBitmap_(map[2014], pointsAmount - 1);
  var config = {};
  config.largeLR = parseInt(map[106]);
  config.smallLR = parseInt(map[107]);
  config.largeUD = parseInt(map[108]);
  config.smallUD = parseInt(map[109]);
  state.config = config;
  var enabled = {};
  var enabledFlags = parseInt(map[105]);
  enabled.create = !!(enabledFlags & 1);
  enabled.delete = !!(enabledFlags & 2);
  enabled.update = !!(enabledFlags & 4);
  enabled.upDown = !!(enabledFlags & 8);
  enabled.trim = !!(enabledFlags & 16);
  enabled.presets = !!(enabledFlags & 32);
  enabled.confirmPrepurge = !!(enabledFlags & 64);
  enabled.confirmLightoff = !!(enabledFlags & 128);
  state.enabled = enabled;
  result.state = state;

  var trim = {};
  trim.actuator = kettos.live.parseCurveIndex_(parseInt(map[148]) - 1, actuatorsAmount);

  var limits = {};
  limits.min = kettos.live.parseBitmap_(map[2016], pointsAmount);
  limits.max = kettos.live.parseBitmap_(map[2015], pointsAmount);
  trim.limits = limits;
  trim.setpoint = [];
  trim.min = [];
  trim.max = [];
  for (var i = 0; i < pointsAmount; i++) {
    trim.setpoint.push(parseFloat(map[2327 + i]));
    trim.min.push(parseFloat(map[2279 + i]));
    trim.max.push(parseFloat(map[2303 + i]));
  }
  result.trim = trim;

  var content = {};
  content.selectedCurve = kettos.live.parseCurveIndex_(kettos.live.parse_(map[123]), actuatorsAmount);

  content.curves = [];
  for (var i = 0; i < actuatorsAmount; i++) {
    content.curves.push(kettos.live.makeCurve_(map, i, pointsAmount, false));
  }
  for (var i = 0; i < vfdsAmount; i++) {
    content.curves.push(kettos.live.makeCurve_(map, 4 + i, pointsAmount, true));
  }
  result.content = content;

  return result;
}

kettos.live.parse_ = function(value) {
  var result = parseInt(value);
  return isNaN(result) ? 0 : result;
}

kettos.live.parseCurveIndex_ = function(indexStartingWith1, actuatorsAmount) {
  if (indexStartingWith1 == 0) {
    return null;
  } // else {
  if (indexStartingWith1 <= actuatorsAmount) {
    return indexStartingWith1 - 1;
  } // else {
  return indexStartingWith1 - 5 + actuatorsAmount;
}

kettos.live.parseBitmap_ = function(bitmap, amount) {
  var result = [];
  var coef = 1;
  bitmap = parseInt(bitmap);
  for (var i = 0; i < amount; i++) {
    result.push(!!(bitmap & coef));
    coef <<= 1;
  }
  return result;
}

kettos.live.getIndex_ = function(base, index) {
  return base + index * 17 + (index == 5 ? 12: 0);
}

kettos.live.SHAPES = ['disc', 'cross', 'circle'];
kettos.live.COLORS = ['', 'black', 'red', 'orange', 'brown', 'green', 'blue', 'magenta', 'purple', 'cyan', 'grey'];
kettos.live.makeCurve_ = function(map, index, pointsAmount, isVFD) {
  var curve = {};
  curve.isVFD = isVFD;
  curve.inactive = !!(map[111] & Math.pow(2, index));
  curve.index = index;
  var state = parseInt(map[kettos.live.getIndex_(204, index)]);
  // the enum is so .. weird, I'll rather do it by a switch
  switch (state) {
    // on curve and moving
    case 2:
      curve.shape = 'cross';
      curve.position = 'on';
      break;
    // above curve and moving
    case 4:
      curve.shape = 'cross';
      curve.position = 'above';
      break;
    // above curve and stopped
    case 5:
      curve.shape = 'circle';
      curve.position = 'above';
      break;
    // below curve and moving
    case 6:
      curve.shape = 'cross';
      curve.position = 'below';
      break;
    // below curve and stopped
    case 7:
      curve.shape = 'circle';
      curve.position = 'below';
      break;
    // on curve and stopped
    case 3:
    default:
      curve.shape = 'disc';
      curve.position = 'on';
      break;
  }

  curve.name = map[kettos.live.getIndex_(206, index)];
  curve.color = kettos.live.COLORS[parseInt(map[kettos.live.getIndex_(208, index)])];
  curve.points = [];
  for (var i = 0; i < pointsAmount; i++) {
    curve.points[i] = parseFloat(map[2052+29*index + i]);
  }

  var actual = {};
  actual.commandedPerc = parseFloat(map[kettos.live.getIndex_(200, index)]);
  actual.commanded = parseFloat(map[kettos.live.getIndex_(201, index)]);
  actual.measuredPerc = parseFloat(map[kettos.live.getIndex_(202, index)]);
  actual.measured = parseFloat(map[kettos.live.getIndex_(203, index)]);
  curve.actual = actual;

  curve.specialPoints = [];
  for (var i = 0; i < 5; i++) {
    curve.specialPoints[i] = parseFloat(map[2047+i + 29*index]);
  }

  curve.endPoints = {};
  curve.endPoints.closed = parseFloat(map[kettos.live.getIndex_(210, index)]);
  curve.endPoints.open = parseFloat(map[kettos.live.getIndex_(211, index)]);

  return curve;
}

//////////////////////////////////////////////////
// NUMERIC
//////////////////////////////////////////////////

// Numeric Input
//////////////////////////////////////////////////

kettos.live.NumInput = function(div) {
  var input = div.firstChild;
  var digits = parseInt(div.getAttribute('data-digits'));
  kettos.live.net.listenForValues(div, function(value) {
    if (document.activeElement != input || input.getAttribute('readonly') != null) {
      input.value = isNaN(digits) ? value : parseFloat(value).toFixed(digits);
    }
  });
  goog.events.listen(div, 'change', kettos.live.net.getFuncOnChange({el: div}));
}

// Numeric Output
//////////////////////////////////////////////////

kettos.live.NumOutput = function(div) {
  var input = div.firstChild;
  var digits = parseInt(div.getAttribute('data-digits'));
  kettos.live.net.listenForValues(div, function(value) {
    input.value = isNaN(digits) ? value : parseFloat(value).toFixed(digits);
  });
}

// Formatted Output
//////////////////////////////////////////////////

kettos.live.NumRtfOutput = function(div) {
  div.innerHTML = div.innerHTML.
    replace('{value}', '<value></value>').
    replace('{label}', '<label></label>').
    replace('{shortUnit}', '<su></su>').
    replace('{longUnit}', '<lu></lu>').
    replace('{description}', '<desc></desc>');
  var valueElement = goog.dom.getElementsByTagNameAndClass('value', null, div)[0];
  var labelElement = goog.dom.getElementsByTagNameAndClass('label', null, div)[0];
  var shortUnitElement = goog.dom.getElementsByTagNameAndClass('su', null, div)[0];
  var longUnitElement = goog.dom.getElementsByTagNameAndClass('lu', null, div)[0];
  var descElement = goog.dom.getElementsByTagNameAndClass('desc', null, div)[0];

  kettos.live.net.listenForAttr(div, valueElement != null, labelElement != null, shortUnitElement != null, longUnitElement != null, descElement != null, function(json) {
    if (valueElement) {
      var digits = parseInt(div.getAttribute('data-digits'));
      var value = json.v;
      if (!isNaN(digits) && !isNaN(parseFloat(value))) {
        value = parseFloat(value).toFixed(digits);
      }
      valueElement.innerHTML = json.sv ? 'Error!' : kettos.common.sanitize(value);
    }
    if (labelElement) {
      labelElement.innerHTML = json.sl ? 'Error!' : kettos.common.sanitize(json.l);
    }
    if (shortUnitElement) {
      shortUnitElement.innerHTML = json.su ? 'Error!' : kettos.common.sanitize(json.u);
    }
    if (longUnitElement) {
      longUnitElement.innerHTML = json.sU ? 'Error!' : kettos.common.sanitize(json.U);
    }
    if (descElement) {
      descElement.innerHTML = json.sd ? 'Error!' : kettos.common.sanitize(json.d);
    }
  });

  kettos.live.treatLinks_(div);
}


// Slider
//////////////////////////////////////////////////

kettos.live.Slider = function(div) {
  kettos.live.net.listenForValues(div);
  goog.events.listen(div, 'change', kettos.live.net.getFuncOnChange({el: div}));
}

// Gauge
//////////////////////////////////////////////////

kettos.live.Gauge = function(div, widget) {
  var canvas = div.firstChild;
  var min = parseFloat(div.getAttribute('data-min'));
  var max = parseFloat(div.getAttribute('data-max'));

  var gauge = kettos.common.Gauge.create(canvas, div);

  kettos.live.net.listenForValues(div, function(value) {
    value = Math.min(max, Math.max(min, parseFloat(value)));
    gauge.setValue(value);
  });
}


// Horizontal Bar
//////////////////////////////////////////////////

kettos.live.HBar = function(div) {
  kettos.live.Bar_(div, false);
}

// Vertical Bar
//////////////////////////////////////////////////

kettos.live.VBar = function(div) {
  kettos.live.Bar_(div, true);
}

// Bar Helper function
kettos.live.Bar_ = function(div, vertical) {
  var bar = new goog.ui.ProgressBar();
  if (vertical) {
    bar.setOrientation(goog.ui.ProgressBar.Orientation.VERTICAL);
  }
  bar.decorate(div.firstChild);
  var min = div.getAttribute('data-min');
  var max = div.getAttribute('data-max');
  if (min) {
    bar.setMinimum(parseInt(min));
  }
  if (max) {
    bar.setMaximum(parseInt(max));
  }
  kettos.live.net.listenForValues(div, function(value) {
    bar.setValue(value);
  });
}


// Output Image
//////////////////////////////////////////////////

kettos.live.OutImage = function(div) {
  var image = div.firstChild;
  var operator = div.getAttribute('data-operator');
  var spans = goog.dom.getElementsByClass('limit', div);

  kettos.live.net.listenForValues(div, function(value) {
    for (var i = 0; i < spans.length; i++) {
      var limit = parseFloat(spans[i].getAttribute('data-limit'));
      value = parseFloat(value);
      if (kettos.common.Operators[operator].func(value, limit)) {
        image.src = kettos.common.makeImage_(spans[i].getAttribute('data-src'), kettos.live.getCurrentProject_(), '', kettos.live.local);
        return;
      }
    }
    // otherwise
    image.src = kettos.common.makeImage_(goog.dom.getElementByClass('otherwise', div).getAttribute('data-src'), kettos.live.getCurrentProject_(), '', kettos.live.local);
  });
}

// LiveGraph
//////////////////////////////////////////////////

kettos.live.LiveGraph = function(div) {
  var data = [];

  kettos.common.Chart.draw(div, data);

  kettos.live.net.listenForValues(div, function(value) {
    data.splice(0, 0, parseFloat(value));
    kettos.common.Chart.update(div, data);
  });
}


//////////////////////////////////////////////////
// BOOLEAN
//////////////////////////////////////////////////

// Switch
//////////////////////////////////////////////////

kettos.live.Switch = function(div) {
  var image = div.firstChild;
  image.style.cursor = 'pointer';

  var on = div.getAttribute('data-onValue');
  var off = div.getAttribute('data-offValue');

  var onSrc = kettos.common.makeImage_(div.getAttribute('data-onSrc'), kettos.live.getCurrentProject_(), kettos.live.Switch.DEFAULT_ON, kettos.live.local);
  var offSrc = kettos.common.makeImage_(div.getAttribute('data-offSrc'), kettos.live.getCurrentProject_(), kettos.live.Switch.DEFAULT_OFF, kettos.live.local);

  var getValue = function() {
    if (image.getAttribute('src') == onSrc) {
      return on;
    } else {
      return off == '' ? null : off;
    }
  }

  var setValue = function(value) {
    image.setAttribute('src', parseFloat(value) == parseFloat(on) ? onSrc : offSrc);
  }

  var click = function() {
    if (getValue() != on || off != '') {
      setValue(parseFloat(getValue()) == parseFloat(on) ? off : on);
    }
  }

  kettos.live.net.listenForValues(div, setValue);
  goog.events.listen(image, 'click', kettos.live.net.getFuncOnChange({el: div, getValue: getValue, performChange: click}));
}
kettos.live.Switch.DEFAULT_ON = 'img/icons/misc/dialSwitch2PosLeft.gif';
kettos.live.Switch.DEFAULT_OFF = 'img/icons/misc/dialSwitch2PosRight.gif';

// BinaryImage
//////////////////////////////////////////////////

kettos.live.BinaryImage = function(div, dummy, onDefault, offDefault) {
  var image = div.firstChild;

  var on = div.getAttribute('data-onValue');

  var onSrc = kettos.common.makeImage_(div.getAttribute('data-onSrc'), kettos.live.getCurrentProject_(), onDefault||kettos.live.BinaryImage.DEFAULT_ON, kettos.live.local);
  var offSrc = kettos.common.makeImage_(div.getAttribute('data-offSrc'), kettos.live.getCurrentProject_(), offDefault||kettos.live.BinaryImage.DEFAULT_OFF, kettos.live.local);

  var setValue = function(value) {
    image.setAttribute('src', parseFloat(value) == parseFloat(on) ? onSrc : offSrc);
  }

  kettos.live.net.listenForValues(div, setValue);
}
kettos.live.BinaryImage.DEFAULT_ON = 'img/icons/equipment/fanLeftTrue.gif';
kettos.live.BinaryImage.DEFAULT_OFF = 'img/icons/equipment/fanLeftFalse.gif';

// BinaryLED
//////////////////////////////////////////////////

kettos.live.BinaryLED = function(div) {
  kettos.live.BinaryImage(div, undefined, kettos.live.BinaryLED.DEFAULT_ON, kettos.live.BinaryLED.DEFAULT_OFF);
}
kettos.live.BinaryLED.DEFAULT_ON = 'img/icons/misc/ledGreen.png';
kettos.live.BinaryLED.DEFAULT_OFF = 'img/icons/misc/ledRed.png';

// Button
//////////////////////////////////////////////////

kettos.live.Button = function(div) {
}

// Command
//////////////////////////////////////////////////

kettos.live.Command = function(div) {
  goog.events.listen(div, 'click', kettos.live.net.getFuncOnChange({el: div, getValue: function() {
    return div.getAttribute('data-command');
  }}));
}

// LinkButton
//////////////////////////////////////////////////

kettos.live.LinkButton = function(div) {
  var href = div.getAttribute('data-href');

  if (href) {
    kettos.live.addReference_(div, href);
  }
}

// DataButton
//////////////////////////////////////////////////

kettos.live.DataButton = function(div) {
  var button = div.firstChild;
  goog.events.listen(button, 'click', function(e) {
    var href = kettos.common.makeData_(div.getAttribute('data-src'), kettos.live.getCurrentProject_(), '', kettos.live.local);
    window.location.href = decodeURIComponent(href);
  });
}

// BackButton
//////////////////////////////////////////////////

kettos.live.BackButton = function(div) {
  var button = div.firstChild;
  goog.events.listen(button, 'click', function(e) {
    window.history.back();
  });
}

//////////////////////////////////////////////////
// TEXT
//////////////////////////////////////////////////

// Text
//////////////////////////////////////////////////

kettos.live.Text = function(div) {
  kettos.live.treatLinks_(div);
}

// Text Input
//////////////////////////////////////////////////

kettos.live.TextInput = function(div) {
  kettos.live.net.listenForValues(div);
  goog.events.listen(div, 'change', kettos.live.net.getFuncOnChange({el: div}));
}

// Text Output
//////////////////////////////////////////////////

kettos.live.TextOutput = function(div) {
  kettos.live.net.listenForValues(div);
}

// Tooltip
//////////////////////////////////////////////////

kettos.live.Tooltip = function(div) {
}

// Select Box
//////////////////////////////////////////////////

kettos.live.SelectBox = function(div) {
  var select = div.firstChild;
  kettos.live.net.getEnum(div, function(json) {
    select.innerHTML = '';
    var data = {};
    for (var i = 0; i < json.length; i++) {
      // select.appendChild(goog.dom.createDom('option', {'value': json[i].k}, json[i].v));
      data[json[i].k] = json[i].v;
    }
    kettos.live.SelectBox.data[div.id] = data;
  });
  kettos.live.net.listenForValues(div, function(value) {
    value = kettos.live.checkEnumValue_(parseFloat(value));
    var data = kettos.live.SelectBox.data[div.id];
    if (select.innerHTML === '' && data) {
      for (var key in data) {
        if (data.hasOwnProperty(key)) {
          select.appendChild(goog.dom.createDom('option', {'value': key}, data[key]));
        }
      }
    }
    if (document.activeElement != select || select.getAttribute('readonly') != null) {
      select.value = value;
    }
  });
  goog.events.listen(div, 'change', kettos.live.net.getFuncOnChange({el: div}));
}
kettos.live.SelectBox.data = {};

// Enum Output
//////////////////////////////////////////////////

kettos.live.EnumOutput = function(div) {
  var input = div.firstChild;
  var fixed = div.getAttribute('data-fixed');
  var refresh = div.getAttribute('data-refresh') === '';

  var isComplete = function (value) {
    if(value.indexOf('%d') > -1 || value.indexOf('%s') > -1 || value.indexOf('%f') > -1) {
      return false;
    }
    return true;
  }

  var writeFunction = function(json) {
    if (json[0]) {
      input.value = json[0].v;
    } else {
      input.value = '';
      console.error('Obtained no JSON response for Enum Text Output');
    }
    return isComplete(input.value);
  }

  // four combinations of fixed/non-fixed, refresh/static

  // fixed
  if (fixed) {
    // fixed, refresh
    if (refresh) {
      kettos.live.net.addTimerListener(function() {
        kettos.live.net.getEnum(div, writeFunction, fixed);
      });
    // fixed, static
    } else {
      // ask for one enum value once and that's it
      kettos.live.net.getEnum(div, writeFunction, fixed);
    }
  // non-fixed
  } else {
    var callback = function(json) {
      if (!json) {
        return;
      }
      var data = {};
      for (var i = 0; i < json.length; i++) {
        data[json[i].k] = json[i].v;
      }
      kettos.live.EnumOutput.data[div.id] = data;
    };
    // ask for all enum values once
    kettos.live.net.getEnum(div, callback);
    // ask for values periodically, show the static representation of them
    kettos.live.net.listenForValues(div, function(value) {
      value = kettos.live.checkEnumValue_(value);
      var data = kettos.live.EnumOutput.data[div.id];
      if (data) {
        input.value = data[value] === undefined ? '' : data[value];
        // if dynamic refresh is selected or current string is incomplete, then ask again for enum values
        if(refresh || !isComplete(input.value)) {
          kettos.live.net.getEnum(div, callback);
        }
      }
    });
  }
}
kettos.live.EnumOutput.data = {};

kettos.live.checkEnumValue_ = function(value) {
  if (kettos.live.local) {
    value = Math.floor(Math.random() * 5);  //Enum value for local live mode needs to have a value between 0 and 4
  }
  return value;
}

// Radio Select Input
//////////////////////////////////////////////////

kettos.live.RadioSelectInput = function(div) {
  var select = div.firstChild;
  var orientation = div.getAttribute('data-orientation');
  var group = 'g' + new Date().getTime();
  div.innerHTML = '';
  var makeRadio = function(value, label) {
    var radio = goog.dom.createDom('input', {'type': 'radio', 'value': value, 'name': group});
    return goog.dom.createDom('div', orientation=='v'?'radio-vertical':'radio-horizontal', goog.dom.createDom('label', null, [radio, label]));
  }
  var checkRadio = function(container, value) {
    var radios = goog.dom.getElementsByTagNameAndClass('input', null, container);
    for(var i = 0; i < radios.length; i++) {
      if (radios[i].value == parseFloat(value)) {
        radios[i].checked = true;
        break;
      } else {
        radios[i].checked = false;
      }
    }
  }
  kettos.live.net.getEnum(div, function(json) {
        var data = {};
    for (var i = 0; i < json.length; i++) {
      data[json[i].k] = json[i].v;
    }
    kettos.live.RadioSelectInput.data[div.id] = data;
  });

  kettos.live.net.listenForValues(div, function(value) {
    var value = kettos.live.checkEnumValue_(value);
    var data = kettos.live.RadioSelectInput.data[div.id];
    if (div.innerHTML === '' && data) {
      for (var key in data) {
        if (data.hasOwnProperty(key)) {
          div.appendChild(makeRadio(key, data[key]));
        }
      }
    }
    if (document.activeElement != div) {
      checkRadio(div, value);
    }

  });
  goog.events.listen(div, 'change', kettos.live.net.getFuncOnChange({el: div, getValue: function () { return event.target.value; }}));
}
kettos.live.RadioSelectInput.data = {};

// Conditional Text
//////////////////////////////////////////////////

kettos.live.CondText = function(div) {
  var text = div.firstChild;
  var operator = div.getAttribute('data-operator');
  var spans = goog.dom.getElementsByClass('limit', div);

  text.innerHTML = '';

  kettos.live.net.listenForValues(div, function(value) {
    for (var i = 0; i < spans.length; i++) {
      var limit = parseFloat(spans[i].getAttribute('data-limit'));
      value = parseFloat(value);
      if (kettos.common.Operators[operator].func(value, limit)) {
        text.innerHTML = kettos.common.sanitize(spans[i].getAttribute('data-text'));
        return;
      }
    }
    // otherwise
    text.innerHTML = kettos.common.sanitize(goog.dom.getElementByClass('otherwise', div).getAttribute('data-text'));
  });
}
//////////////////////////////////////////////////
// TEXT - LANGUAGE
//////////////////////////////////////////////////

// Language Selection
//////////////////////////////////////////////////

kettos.live.LanguageSelection = function(div) {
  var currentLanguage = kettos.live.cookie.getItem('language') || 'en';
  var select = div.firstChild;
  while (select.firstChild) {
    select.removeChild(select.firstChild);
  }
  kettos.live.net.sendRequest('gl', {}, function(json) {
    for(var i = 0; i < json.r.length; i++) {
      var option = goog.dom.createDom('option', {value: json.r[i].k}, json.r[i].v);
      if (json.r[i].k == currentLanguage) {
        option.selected = 'selected';
      }
      select.appendChild(option);
    }
  });

  goog.events.listen(select, 'change', function() {
    var expires = new Date();
    expires.setTime(expires.getTime() + (12 * 60 * 60 * 1000));
    var secure = window.location.protocol == 'https:';
    kettos.live.cookie.setItem('language', select.value, expires, '/', undefined, secure);
    parent.document.location.reload(true);
  });
}

// Language Text
//////////////////////////////////////////////////

kettos.live.LanguageText = function(div) {
  var stringType = kettos.live.getLanguageStringType_(div);
  var instanceNum = kettos.live.getLanguageInstanceNumber_(div);
  var element = div;
  while (element.firstChild instanceof HTMLElement) {
    element = element.firstChild;
  }
  element.innerHTML = '';
  kettos.live.net.listenForStrings(div, function(json) {
    element.innerHTML = kettos.live.getValueFromResponse_(json, stringType, instanceNum);
  });
}

// Common Language Text
//////////////////////////////////////////////////

kettos.live.CommonLanguageText = function(div) {
  var enumId = kettos.live.local ? Math.floor(Math.random() * 5) : parseInt(div.getAttribute('data-id'));
  var element = div;
  while (element.firstChild instanceof HTMLElement) {
    element = element.firstChild;
  }
  var defaultText = element.innerHTML;
  kettos.live.net.getEnum(div, function(json) {
    for(var i=0; i<json.length; i++) {
      if (json[i].k == enumId) {
        element.innerHTML = json[i].v;
        break;
      }
    }
  });
}

// Language Text Input
//////////////////////////////////////////////////

kettos.live.LanguageTextInput = function(div) {
  var stringType = kettos.live.getLanguageStringType_(div);
  var instanceNum = kettos.live.getLanguageInstanceNumber_(div);
  kettos.live.net.listenForStrings(div, function(json) {
    var input = div.firstChild;
    if (document.activeElement != input || input.getAttribute('readonly') != null) {
      input.value = kettos.live.getValueFromResponse_(json, stringType, instanceNum);
    }
  });

  goog.events.listen(div, 'change',
    function (e) {
      var t = parseInt(stringType) * 1000 + parseInt(instanceNum);
      var json = {'id': div.getAttribute('data-mr'), 't': t, 's': div.firstChild.value };
      kettos.live.net.sendRequest('sa', json, function(json) {
        if (json.s != 0 && json.em) {
          new kettos.dialog.Alert(json.em);
        }
        //reload
        var event = new Event(kettos.constants.StringRequestEvent);
        window.dispatchEvent(event);
      });
    }
  );
}

// Language widgets common functions
//////////////////////////////////////////

kettos.live.getLanguageStringType_ = function(div) {
  var stringType = parseInt(div.getAttribute('data-string-type')) || 1;
  // Strings index starts with 1, so we need to decrement it...
  return --stringType;
}

kettos.live.getLanguageInstanceNumber_ = function(div) {
	if (div.getAttribute('data-simple') === "true") {
		return 0;
	} else {
		return parseInt(div.getAttribute('data-instance-number')) || 0;
	}
}

kettos.live.getValueFromResponse_ = function(json, stringType, instanceNum) {
  for (var i = 0; i < json.r[stringType].length; i++) {
    if (json.r[stringType][i].k == instanceNum) {
      var value = json.s == 1 ? 'Error!' : kettos.common.sanitize(json.r[stringType][i].v);
      break;
    }
  }
  return value;
}

//////////////////////////////////////////////////
// CONTAINER
//////////////////////////////////////////////////

// ModalDialog
//////////////////////////////////////////////////

kettos.live.ModalDialog = function(div, widget) {
  // this widget is displayed only if loaded via Modal Button AJAX request, in other cases just remove it
  goog.dom.removeNode(widget);
}

// ModalButton
//////////////////////////////////////////////////

kettos.live.ModalButton = function(div) {
  var button = div.firstChild;
  kettos.live.addModalDialogListener_(div, button);
}
kettos.live.ModalButton.data = {};

kettos.live.addModalDialogListener_ = function(div, element) {
  goog.events.listen(element, 'click', function(e) {
    var data = kettos.live.ModalButton.data[div.id];
    if (!data || data.failed) {
      if (!data) {
        // part: first time clicked
        data = {};
        data.request = new goog.net.XhrIo();

        goog.events.listen(data.request, goog.net.EventType.COMPLETE, function(e) {
          data.replied = true;
          var div = goog.dom.createElement('div');
          div.style.display = 'hidden';
          div.innerHTML = e.target.getResponseText().split('<bo' + 'dy').pop().split('</bo' + 'dy>')[0];
          var dialogs = goog.dom.getElementsByTagNameAndClass('div', 'modal-dialog', div);
          // if zero, do nothing, if more than one, ignore all except the first
          if (dialogs.length < 1) {
            data.failed = true;
            new kettos.dialog.Alert('No such page with a Modal Dialog Box found!');
            return;
          }
          data.failed = false;
          data.bg = goog.dom.createDom('div', 'modal-dialog-bg');
          data.bg.style.opacity = 0.5;
          document.body.appendChild(data.bg);
          data.dialog = dialogs[0].parentNode.parentNode;
          data.dialog.style.zIndex = 2147483647;
          document.body.appendChild(data.dialog);

          // expecting 1, but to be sure
          var closeButtons = goog.dom.getElementsByTagNameAndClass('span', 'modal-dialog-title-close', data.dialog);
          for (var i = 0; i < closeButtons.length; i++) {
            goog.events.listen(closeButtons[i], 'click', function() {
              data.dialog.style.display = 'none';
              data.bg.style.display = 'none';
            });
          }

          // make inner widgets live
          kettos.live.initWidgets_(data.dialog);
        });

        kettos.live.ModalButton.data[div.id] = data;
      }

      // part: first time clicked OR it failed before
      var uri = new goog.Uri(div.getAttribute('data-ref'));
      kettos.live.treatLocalURL_(uri);
      data.request.send(uri.toString(), 'GET');
    } else if (data.replied) {
      // part: 2+ time clicked AND reply was OK
      data.dialog.style.display = '';
      data.bg.style.display = '';
    }
    // part: 2+ time clicked AND reply was not received yet (do nothing, just wait some more for reply)
  });
}

// Pane
//////////////////////////////////////////////////

kettos.live.Pane = function(div) {
}

// Tab
//////////////////////////////////////////////////

kettos.live.Tab = function(div) {
  var tabPaneDiv = div.firstChild;
  var ul = tabPaneDiv.firstChild;
  var ulItems = goog.dom.getChildren(ul);
  var content = goog.dom.getChildren(tabPaneDiv)[2];
  var contentItems = goog.dom.getChildren(content);

  // we need to reconstruct the source code from which this Tab was created
  goog.dom.removeNode(tabPaneDiv);
  var newPaneDiv = goog.dom.createDom('div');
  goog.dom.appendChild(div, newPaneDiv);
  var tabPane = new goog.ui.TabPane(newPaneDiv);

  for (var i = 0; i < ulItems.length; i++) {
    // when the page moves, the children appear to be shifted, so access always first index (zero-th actually)
    tabPane.addPage(new goog.ui.TabPane.TabPage(contentItems[0], ulItems[i].innerText));
  }

  // fix height manually
  var newContent = goog.dom.getElementByClass('goog-tabpane-cont', newPaneDiv);
  newContent.style.height = content.style.height;
}

// MultiDisplayPane
//////////////////////////////////////////////////

kettos.live.MultiDisplayPane = function(div) {
  var operator = div.getAttribute('data-operator');
  var layers = kettos.functions.getFirstLevelElements('layer', div);
  var limits = kettos.functions.getFirstLevelElements('limit', div);

  function setAllDisabled() {
    for (var i = 0; i < layers.length; i++) {
      goog.dom.classes.add(layers[i], 'invisible');
    }
  }

  kettos.live.net.listenForValues(div, function(value) {
    var enabledLayerIndex = 0;
    setAllDisabled();
    for (var i = 0; i < limits.length; i++) {
      var limit = limits[i].getAttribute('data-limit');
      var visible = kettos.common.Operators[operator].func(value, limit);
      if (visible) {
        enabledLayerIndex = limits[i].getAttribute('data-layer-index');
        break;
      }
    }
    for (var i = 0; i < layers.length; i++) {
      if (layers[i].getAttribute('data-layer-index') == enabledLayerIndex) {
        goog.dom.classes.remove(layers[i], 'invisible');
        break;
      }
    }
  });
}

// DisablingPane
//////////////////////////////////////////////////

kettos.live.DisablingPane = function(div) {
  var operator = div.getAttribute('data-operator');
  var limit = div.getAttribute('data-limit');
  var limit1 = div.getAttribute('data-limit1');
  var hideDisabled = div.getAttribute('data-hide-disabled') === 'on';
  var innerElements = goog.dom.getElementsByTagNameAndClass(null, null, div);

  kettos.live.net.listenForValues(div, function(value) {
    var disabled = kettos.common.EnhancedOperators[operator].func(value, limit, limit1);
    if (hideDisabled) {
      goog.dom.classes.enable(div.parentNode, 'hidden', disabled);
    } else {
      for (var i = 0; i < innerElements.length; i++) {
        innerElements[i].disabled = disabled;
      }
      goog.dom.classes.enable(div, 'paneDisabled', disabled);
    }
  });
}

// HyperlinkArea
//////////////////////////////////////////////////

kettos.live.HyperlinkArea = function(div) {
  var href = div.getAttribute('data-href');
  var modal = div.getAttribute('data-modal') === 'on';
  div.removeAttribute('data-href');
  if (modal) {
    //kettos.live.addModalDialogListener_ uses a 'data-ref' attribute
    //'data-href' attribute needs to be used for backward compatibility reasons
    div.setAttribute('data-ref', href);
    kettos.live.addModalDialogListener_(div, div);
  } else if (href) {
    kettos.live.addReference_(div, href);
  }
}

kettos.live.DelayPane = function(div) {
  var normalDiv = kettos.functions.getFirstLevelElements('threshold', div)[0];
  var delayDiv = kettos.functions.getFirstLevelElements('delay', div)[0];
  var threshold = parseInt(div.getAttribute('data-threshold'));

  function switchVisibility(div1, div2) {
    goog.dom.classes.add(div1, 'invisible');
    goog.dom.classes.remove(div2, 'invisible');
  }

  switchVisibility(delayDiv, normalDiv);

  if (kettos.live.net.delayThreshold == undefined) {
    kettos.live.net.delayThreshold = threshold;
  } else if (kettos.live.net.delayThreshold != threshold) {
    new kettos.dialog.Alert('Only one delay threshold value for the \'Connection Delay Pane widget\' is supported. ' +
          'The delay threshold value is set to ' + kettos.live.net.delayThreshold + 'ms.');
  }

  window.addEventListener(kettos.constants.DelayedRequestStartEvent, function() {
    switchVisibility(normalDiv, delayDiv);
  });

  window.addEventListener(kettos.constants.DelayedRequestEndEvent, function() {
    if (kettos.live.net.delayedRequestCount == 0) {
      switchVisibility(delayDiv, normalDiv);
    }
  });
}

//////////////////////////////////////////////////
// FUEL AIR COMMISSIONING
//////////////////////////////////////////////////

kettos.live.FaHidden = {curves: {}, presets: {}};

// FaModule
//////////////////////////////////////////////////

kettos.live.FaModuleSelector = function(div, widget) {
  // inheritance
  kettos.live.FaModule = null;
  if (div.getAttribute('data-mi') == 'on') {
    kettos.live.FaModule = kettos.live.functions.getRefModule(div);
  }
  // inheritance is OFF, or didn't yield anything useful
  if (kettos.live.FaModule == null) {
    kettos.live.FaModule = div.getAttribute('data-m');
  }
  goog.dom.removeNode(widget);
}

// ** FaGraph **
//////////////////////////////////////////////////

// FaGraph
//////////////////////////////////////////////////

kettos.live.FaGraph = function(div) {
  kettos.live.net.addTimerListener(function() {
    var hidePresets = div.getAttribute('data-hide-presets') == 'on';
    var hideNumbers = div.getAttribute('data-hide-numbers') == 'on';
    var hideDashes = div.getAttribute('data-hide-dashes') == 'on';
    var smallDots = div.getAttribute('data-small-dots') == 'on';
    var data = kettos.live.getFA_(div);
    if (data) {
      kettos.common.FA.Graph.draw(div, data, kettos.live.FaHidden, hidePresets, hideNumbers, hideDashes, smallDots);
    }
  });
}

// ** FaTable **
//////////////////////////////////////////////////

// kettos.live.FaTableMakeClickable_ = function(div) {
//   goog.events.listen(div, 'click', kettos.live.net.getFuncOnChange({
//     el: div,
//     getValue: function(e) {
//       if (e.target.getAttribute('data-meta') === null) {
//         return null;
//       } // else
//       return '' + (20 + parseInt(e.target.getAttribute('data-meta')));
//     },
//     module: kettos.live.FaModule,
//     register: 'r104'
//   }));
// }

// FaTableHeader
//////////////////////////////////////////////////

kettos.live.FaTableHeader = function(div) {
  div.innerHTML = '';
  kettos.common.Scrollbar.fixPaddingRight(div);
  kettos.live.net.addTimerListener(function() {
    var data = kettos.live.getFA_(div);
    if (data) {
      kettos.common.FA.Table.fillHeader(div, data);
    }
  });

  // kettos.live.FaTableMakeClickable_(div);
}

// FaTableContent
//////////////////////////////////////////////////

kettos.live.FaTableContent = function(div) {
  div.innerHTML = '';
  kettos.live.net.addTimerListener(function() {
    var data = kettos.live.getFA_(div);
    if (data) {
      kettos.common.FA.Table.fillContent(div, data, kettos.live.FaTableUnitActual);
      kettos.common.FA.Table.fillContentGutter(div, data);
    }
  });
}

// FaTableIcons
//////////////////////////////////////////////////

kettos.live.FaTableIcons = function(div) {
  div.innerHTML = '';
  kettos.common.Scrollbar.fixPaddingRight(div);
  kettos.live.net.addTimerListener(function() {
    var data = kettos.live.getFA_(div);
    if (data) {
      kettos.common.FA.Table.prepareIcons(div, data);
      kettos.common.FA.Table.fillIcons(div, data);
    }
  });
}

// FaTableFooter
//////////////////////////////////////////////////

kettos.live.FaTableFooter = function(div) {
  div.innerHTML = '';
  kettos.common.Scrollbar.fixPaddingRight(div);
  kettos.live.net.addTimerListener(function() {
    var data = kettos.live.getFA_(div);
    if (data) {
      kettos.common.FA.Table.fillFooter(div, data, kettos.live.FaTableUnitActual);
    }
  });

  // kettos.live.FaTableMakeClickable_(div);
}

// FaTablePresets
//////////////////////////////////////////////////

kettos.live.FaTablePresets = function(div) {
  div.innerHTML = '';
  kettos.common.Scrollbar.fixPaddingRight(div);
  kettos.live.net.addTimerListener(function() {
    var data = kettos.live.getFA_(div);
    if (data) {
      kettos.common.FA.Table.fillPresets(div, data, kettos.live.FaTableUnitActual, kettos.live.FaHidden);
    }
  });
}


// FaTableUnit
//////////////////////////////////////////////////

kettos.live.FaTableUnit = function(div) {
  var radios = goog.dom.getElementsByTagNameAndClass('input', null, div);
  var labels = goog.dom.getElementsByTagNameAndClass('label', null, div);

  kettos.live.FaTableUnitActual = false;
  radios[0].id = 'FaPercent';
  radios[1].id = 'FaActual';

  for (var i = 0; i < radios.length; i++) {
    labels[i].setAttribute('for', radios[i].id);
    radios[i].setAttribute('name', 'FaUnit');
    radios[i].removeAttribute('disabled');
    goog.events.listen(radios[i], 'change', function(e) {
      kettos.live.FaTableUnitActual = e.target.id.indexOf('FaActual') != -1;
    })
  }
}

// ** FaControls **
//////////////////////////////////////////////////

// FaButton.*
//////////////////////////////////////////////////

// helper class common for all buttons
kettos.live.FaButton_ = function(div, enableFunc, onChange, register) {
  var button = div.firstChild;
  goog.events.listen(button, 'click', kettos.live.net.getFuncOnChange({
    el: div,
    getValue: onChange,
    module: kettos.live.FaModule,
    register: register ? register : 'r104'
  }));
  if (enableFunc) {
    kettos.live.net.addTimerListener(function() {
      var data = kettos.live.getFA_(div);
      if (data) {
        if (enableFunc(data)) {
          button.removeAttribute('disabled');
        } else {
          button.setAttribute('disabled', 'disabled');
        }
      }
    });
  }
}

// simple command which sends fixed value to register 104
kettos.live.FaButtonSimple_ = function(div, command, enableFunc, register) {
  kettos.live.FaButton_(div, enableFunc, function() {
    return command;
  }, register);
}

// button, which sends commands according to radio button distinguishing between movement of throttle and point
kettos.live.FaButtonPointThrottle_ = function(div, commandThrottle, commandPoint, enableFunc) {
  kettos.live.FaButton_(div, enableFunc, function() {
    if (kettos.live.FaThrottlePointState) {
      return commandPoint;
    } // else
    return commandThrottle;
  });
}

kettos.live.FaButtonCreate = function(div) {
  kettos.live.FaButtonSimple_(div, '28', function(data) {
    return data.state.enabled.create;
  });
}
kettos.live.FaButtonDelete = function(div) {
  kettos.live.FaButtonSimple_(div, '27', function(data) {
    return data.state.enabled.delete;
  });
}
kettos.live.FaButtonStop = function(div) {
  kettos.live.FaButtonSimple_(div, '26');                  // always enabled
}
kettos.live.FaButtonUpdate = function(div) {
  kettos.live.FaButtonSimple_(div, '29', function(data) {
    return data.state.enabled.update;
  });
}
kettos.live.FaButtonConfirmPrepurge = function(div) {
  kettos.live.FaButtonSimple_(div, '8', function(data) {
    return data.state.enabled.confirmPrepurge;
  }, 'r102');
}
kettos.live.FaButtonConfirmLightoff = function(div) {
  kettos.live.FaButtonSimple_(div, '9', function(data) {
    return data.state.enabled.confirmLightoff;
  }, 'r102');
}

kettos.live.FaDisableWhenLocked_ = function(data) {
  return !data.throttle.isLocked;
}

kettos.live.FaButtonLeft = function(div) {
  kettos.live.FaButtonPointThrottle_(div, '8', '12', kettos.live.FaDisableWhenLocked_);
}
kettos.live.FaButtonFastLeft = function(div) {
  kettos.live.FaButtonPointThrottle_(div, '7', '11', kettos.live.FaDisableWhenLocked_);
}
kettos.live.FaButtonRight = function(div) {
  kettos.live.FaButtonPointThrottle_(div, '9', '13', kettos.live.FaDisableWhenLocked_);
}
kettos.live.FaButtonFastRight = function(div) {
  kettos.live.FaButtonPointThrottle_(div, '10', '14', kettos.live.FaDisableWhenLocked_);
}

kettos.live.FaDisableUpDown_ = function(data) {
  return data.state.enabled.upDown;
}

kettos.live.FaButtonUp = function(div) {
  kettos.live.FaButtonSimple_(div, '16', kettos.live.FaDisableUpDown_);
}
kettos.live.FaButtonFastUp = function(div) {
  kettos.live.FaButtonSimple_(div, '15', kettos.live.FaDisableUpDown_);
}
kettos.live.FaButtonDown = function(div) {
  kettos.live.FaButtonSimple_(div, '17', kettos.live.FaDisableUpDown_);
}
kettos.live.FaButtonFastDown = function(div) {
  kettos.live.FaButtonSimple_(div, '18', kettos.live.FaDisableUpDown_);
}

// FaPresets
//////////////////////////////////////////////////

kettos.live.FaPresets = function(div) {
  var defineButton = goog.dom.getElementByClass('definePreset', div);
  var goToButton = goog.dom.getElementByClass('goToPreset', div);
  var select = goog.dom.getElementsByTagNameAndClass('select', null, div)[0];

  goog.events.listen(defineButton, 'click', kettos.live.net.getFuncOnChange({
    el: defineButton,
    getValue: function() {
      return select.selectedIndex == 0 ? null : '' + (parseInt(select.options[select.selectedIndex].value) + 2);
    },
    performChange: function() {
      if (select.selectedIndex == 0) {
        new kettos.dialog.Alert('Please select a preset first.', 'Information');
      }
    },
    module: kettos.live.FaModule,
    register: 'r104'
  }));

  goog.events.listen(goToButton, 'click', kettos.live.net.getFuncOnChange({
    el: goToButton,
    getValue: function() {
      var value = parseInt(select.options[select.selectedIndex].value);
      return select.selectedIndex == 0 ? null : '' + (value == 4 ? 7 : value + 2);
    },
    performChange: function() {
      if (select.selectedIndex == 0) {
        new kettos.dialog.Alert('Please select a preset first.', 'Information');
      }
    },
    module: kettos.live.FaModule,
    register: 'r102'
  }));

  goog.events.listen(select, 'change', function(e) {
    if (select.selectedIndex == 0) {
      defineButton.innerHTML = 'Define ...';
      goToButton.innerHTML = 'Go to ...';
    } else {
      defineButton.innerHTML = 'Define ' + select.options[select.selectedIndex].innerHTML;
      goToButton.innerHTML = 'Go to ' + select.options[select.selectedIndex].innerHTML;
    }
  });

  kettos.live.net.addTimerListener(function() {
    var data = kettos.live.getFA_(div);
    if (data) {
      if (data.state.enabled.presets) {
        defineButton.removeAttribute('disabled');
        goToButton.removeAttribute('disabled');
      } else {
        defineButton.setAttribute('disabled', 'disabled');
        goToButton.setAttribute('disabled', 'disabled');
      }
    }
  });
}

// FaThrottlePoint
//////////////////////////////////////////////////

kettos.live.FaThrottlePoint = function(div) {
  var radios = goog.dom.getElementsByTagNameAndClass('input', null, div);
  var labels = goog.dom.getElementsByTagNameAndClass('label', null, div);

  kettos.live.FaThrottlePointState = false;
  radios[0].id = 'FaThrottle';
  radios[1].id = 'FaPoint';

  for (var i = 0; i < radios.length; i++) {
    labels[i].setAttribute('for', radios[i].id);
    radios[i].setAttribute('name', 'FaTP');
    radios[i].removeAttribute('disabled');
    goog.events.listen(radios[i], 'change', function(e) {
      kettos.live.FaThrottlePointState = e.target.id.indexOf('FaPoint') != -1;
    })
  }

  kettos.live.net.addTimerListener(function() {
    var data = kettos.live.getFA_(div);
    if (data) {
      // canPointMove is r120, it can have three values
      // 3 - point can move, enable the controls
      // 2 - point cannot move, but throttle can, disable the controls and park the bullet to the throttle
      // 1 - point cannot move, neither can throttle, disable the control, but don't change the bullet
      //     (this will always happen when moved with the point, so don't annoy the user by changing the bullet)
      if (data.state.canPointMove == 3) {
        radios[0].removeAttribute('disabled');
        radios[1].removeAttribute('disabled');
      } else {
        radios[0].setAttribute('disabled', 'disabled');
        radios[1].setAttribute('disabled', 'disabled');
        if (data.state.canPointMove == 2) {
          radios[0].checked = true;
          kettos.live.FaThrottlePointState = false;
        }
      }
    }
  });
}

// Fa Movement Step Control
//////////////////////////////////////////////////

kettos.live.FaMovementStepControl_ = function(div, register, key) {
  var select = goog.dom.getElementsByTagNameAndClass('select', null, div)[0];
  select.innerHTML = '';

  kettos.live.net.getEnum(null, function(json) {
    for (var i = 0; i < json.length; i++) {
      select.appendChild(goog.dom.createDom('option', {'value': json[i].k}, json[i].v));
    }
  }, null, kettos.live.FaModule + 'r' + register);

  kettos.live.net.addTimerListener(function() {
    var data = kettos.live.getFA_(select);
    if (data && document.activeElement != select) {
      select.value = data.state.config[key];
    }
  });

  goog.events.listen(select, 'change', kettos.live.net.getFuncOnChange({
    el: div,
    input: select,
    module: kettos.live.FaModule,
    register: 'r' + register
  }));
}

kettos.live.FaLargeLR = function(div) { kettos.live.FaMovementStepControl_(div, 106, 'largeLR'); }
kettos.live.FaSmallLR = function(div) { kettos.live.FaMovementStepControl_(div, 107, 'smallLR'); }
kettos.live.FaLargeUD = function(div) { kettos.live.FaMovementStepControl_(div, 108, 'largeUD'); }
kettos.live.FaSmallUD = function(div) { kettos.live.FaMovementStepControl_(div, 109, 'smallUD'); }

// FaSelectCurve
//////////////////////////////////////////////////

kettos.live.FaSelectCurve = function(div) {
  // we will rely on the fact, that we will have all rows prepared from the editor
  // hence, we can attach listeners to all controls and then just hide/show it instead of adding and removing
  var inputs = goog.dom.getElementsByTagNameAndClass('input', null, div);
  for (var i = 0; i < inputs.length; i++) {
    var input = inputs[i];
    input.removeAttribute('disabled');
    if (input.getAttribute('type') == 'radio') {
      goog.events.listen(input, 'change', function(e) {
        kettos.live.fireCurveSelectionEvent_(div, e.target.value);
      });
    } else {
      input.checked = !kettos.live.FaHidden.curves[input.value];
      goog.events.listen(input, 'change', function(e) {
        kettos.live.FaHidden.curves[e.target.value] = !e.target.checked;
      });
    }
  }

  div.parentNode.addEventListener(kettos.constants.SelectCurveEvent, function(e) {
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      if (input.getAttribute('type') == 'radio' && input.value == e.data) {
        input.checked = true;
        break;
      }
    }
  });

  kettos.live.net.addTimerListener(function() {
    var data = kettos.live.getFA_(div);
    if (data) {
      kettos.common.FA.CurveSelection.fill(div, data);
    }
  });
}

// FaSelectPresets
//////////////////////////////////////////////////

kettos.live.FaSelectPresets = function(div) {
  var checkboxes = goog.dom.getElementsByTagNameAndClass('input', null, div);
  var labels = goog.dom.getElementsByTagNameAndClass('label', null, div);

  for (var i = 0; i < checkboxes.length; i++) {
    var checkbox = checkboxes[i];
    checkbox.removeAttribute('disabled');
    // the information about 'checked' is lost via load/save or preview (if a checkbox is checked, it doesn't change anything in HTML)
    // it's required to recreate the 'checked' statuses of the checkboxes from the internal 'data-...' attributes
    checkbox.checked = div.getAttribute('data-' + kettos.common.FA.PRESETS[i].s) == 'on';
    kettos.live.FaHidden.presets[checkbox.value] = !checkbox.checked;
    goog.events.listen(checkbox, 'change', function(e) {
      kettos.live.FaHidden.presets[e.target.value] = !e.target.checked;
    });
    if (i < labels.length) {
      var id = div.id + '_' + i;
      checkbox.id = id;
      labels[i].setAttribute('for', id);
    }
  }
}

// FaTrimActuatorHeader
//////////////////////////////////////////////////

kettos.live.FaTrimActuatorHeader = function(div) {
  // static
}

// FaTrimActuatorContent
//////////////////////////////////////////////////

kettos.live.FaTrimActuatorContent = function(div) {
  kettos.live.net.addTimerListener(function() {
    var data = kettos.live.getFA_(div);
    if (data) {
      kettos.common.FA.Table.fillTrimActContent(div, data);
      kettos.common.FA.Table.fillContentGutter(div, data);
    }
  });
}

// FaTrimPointHeader
//////////////////////////////////////////////////

kettos.live.FaTrimPointHeader = function(div) {
  kettos.live.net.addTimerListener(function() {
    var data = kettos.live.getFA_(div);
    if (data) {
      kettos.common.FA.Table.fillTrimPointHeader(div, data);
    }
  });
}

// FaTrimPointContent
//////////////////////////////////////////////////

kettos.live.FaTrimPointContent = function(div) {
  kettos.live.net.addTimerListener(function() {
    var data = kettos.live.getFA_(div);
    if (data) {
      kettos.common.FA.Table.fillTrimPointContent(div, data);
    }
  });
}

// FaButton.*
//////////////////////////////////////////////////

//FaButtonMatrix
//////////////////////////////////////////////////
kettos.live.FaButtonMatrix = function(div) {
  var table = kettos.common.FA.getChild_(div, 'table', 0);
  var selectedColumn;
  var faData;
  var FA_CHECK_STATE_TIMER =  new goog.Timer(3000);
  FA_CHECK_STATE_TIMER.start();

  goog.events.listen(FA_CHECK_STATE_TIMER, goog.Timer.TICK, function() {
    console.log('tick');
    faData = kettos.live.getFA_(div);
    if (!faData) {
      return;
    }
    var index = null;
    var firstButtonRow = kettos.common.FA.getChild_(table, 'tr', 1);
    for (var i = 0; i < firstButtonRow.childNodes.length; i++) {
      if (firstButtonRow.childNodes[i].style.backgroundColor) {
        index = i;
        break;
      }
    }
    if (faData && faData.content.selectedCurve != index) {
      if (faData.content.selectedCurve == null) {
        index = -1;
      } else {
        index = faData.content.selectedCurve;
      }
      selectedColumn = index;
    }
  });

  div.parentNode.addEventListener(kettos.constants.SelectCurveEvent, function(e) {
    setColumnColor(selectedColumn, '');
    var firstButtonRow = kettos.common.FA.getChild_(table, 'tr', 1);
    if (e.data == '-1') {
      selectedColumn = undefined;
      return;
    }
    for (var i = 0; i < firstButtonRow.childNodes.length; i++) {
      var button = firstButtonRow.childNodes[i].firstChild;
      if (button && button.getAttribute('data-index') == e.data) {
        setColumnColor(i, button.getAttribute('data-color'));
        selectedColumn = i;
        break;
      }
    }
  });

  var setColumnColor = function(index, color) {
    if (index == undefined || index < 0) {
      return;
    }
    for (var k = 1; k < 5; k++) {
      var row = kettos.common.FA.getChild_(table, 'tr', k);
      var cell = kettos.common.FA.getChild_(row, 'td', index);
      if (cell && cell.firstChild) {
        cell.style.backgroundColor = color != undefined ? color : cell.firstChild.getAttribute('data-color');
      }
    }
  }

  var sendSelectRequest = function(columnIndex, curveIndex) {
      // Stop and then start the FA_CHECK_STATE_TIMER to reset the interval.
      FA_CHECK_STATE_TIMER.stop();
      FA_CHECK_STATE_TIMER.start();
      kettos.live.fireCurveSelectionEvent_(div, curveIndex);
  }

  var setHeaderClickListener = function(cell, index) {
    goog.events.listen(cell, 'click', function(e) {
      sendSelectRequest(-1, -1);
    });
  };

  var setButtonClickListener = function(button, index, color) {
    goog.events.listen(button, 'click', function(e) {
      if (selectedColumn == undefined || selectedColumn != index || (faData && faData.content.selectedCurve != index)) {
        sendSelectRequest(index, parseInt(button.getAttribute('data-index')));
      } else {
        kettos.live.net.getFuncOnChange({
          el: div,
          getValue: function() {
            return button.getAttribute('data-value');
          },
          module: kettos.live.FaModule,
          register: 'r104'
        })();
      }
    });
  };

  var header = kettos.common.FA.getChild_(table, 'tr', 0);
  for (var j = 0; j < header.children.length; j++) {
    var cell = kettos.common.FA.getChild_(header, 'td', j);
    setHeaderClickListener(cell, j);
  }

  for (var i = 1; i <= 4; i++) {
    var row = kettos.common.FA.getChild_(table, 'tr', i);
    for (var j = 0; j < row.children.length; j++) {
      var cell = kettos.common.FA.getChild_(row, 'td', j);
      setButtonClickListener(cell.firstChild, j);
    }
  }

  var firstDataReceived = false;
  kettos.live.net.addTimerListener(function() {
    var data = kettos.live.getFA_(div);
    if (data) {
      kettos.common.FA.Matrix.fillMatrix(div, data);
      if (!firstDataReceived) {
        firstDataReceived = true;
        selectedColumn = undefined;
      } else {
        setColumnColor(selectedColumn);
      }


      var buttons = goog.dom.getElementsByTagNameAndClass('button', null, div);
      for (var i = 0; i < buttons.length; i++) {
        //force to never disable
        buttons[i].removeAttribute('disabled');
      }
    }
  });
}

kettos.live.fireCurveSelectionEvent_ = function(div, curveIndex) {

  var callback = function () {
    var event = new Event(kettos.constants.SelectCurveEvent);
    event.data = curveIndex;
    var widgets = goog.dom.getElementsByClass('widget');
    for (var i = 0; i < widgets.length; i++) {
      widgets[i].dispatchEvent(event);
    }
  }

  kettos.live.net.getFuncOnChange({
    el: div,
    getValue: function () {
      return '' + (20 + parseInt(curveIndex)); // 19 is none (value -1), 20 is 0 etc, 21 is 1 etc.
    },
    module: kettos.live.FaModule,
    register: 'r104',
    performChange: callback
  })();
}

// trim command helper function with trim disabling/enabling
kettos.live.FaButtonTrim_ = function(div, command, register) {
  kettos.live.FaButtonSimple_(div, command, function(data) {
    return data.state.enabled.trim;
  }, register);
}

kettos.live.FaTrimSetSpWiresheet = function(div) { kettos.live.FaButtonTrim_(div, '40'); }
kettos.live.FaTrimSetSpManual = function(div) { kettos.live.FaButtonTrim_(div, '41'); }
kettos.live.FaTrimSetMin = function(div) { kettos.live.FaButtonTrim_(div, '34'); }
kettos.live.FaTrimSetMax = function(div) { kettos.live.FaButtonTrim_(div, '33'); }
kettos.live.FaTrimSetMeasured = function(div) { kettos.live.FaButtonTrim_(div, '35'); }
kettos.live.FaTrimMoveToCurve = function(div) { kettos.live.FaButtonTrim_(div, '32'); }
kettos.live.FaTrimLeft = function(div) { kettos.live.FaButtonTrim_(div, '30'); }
kettos.live.FaTrimRight = function(div) { kettos.live.FaButtonTrim_(div, '31'); }
kettos.live.FaTrimFastUp = function(div) { kettos.live.FaButtonTrim_(div, '36'); }
kettos.live.FaTrimUp = function(div) { kettos.live.FaButtonTrim_(div, '37'); }
kettos.live.FaTrimDown = function(div) { kettos.live.FaButtonTrim_(div, '38'); }
kettos.live.FaTrimFastDown = function(div) { kettos.live.FaButtonTrim_(div, '39'); }


//////////////////////////////////////////////////
// MEDIA
//////////////////////////////////////////////////

// Rectangle
//////////////////////////////////////////////////

kettos.live.Rectangle = function(div) {
}

// Line
//////////////////////////////////////////////////

kettos.live.Line = function(div) {
}

// Image
//////////////////////////////////////////////////

kettos.live.Image = function(div) {
  var href = div.getAttribute('data-href');
  if (href) {
    div.removeAttribute('data-href');
    kettos.live.addReference_(div, href);
  }
  var image = div.firstChild;
  image.src = kettos.common.makeImage_(div.getAttribute('data-src'), kettos.live.getCurrentProject_(), '', kettos.live.local);
}

// Conditional Color
//////////////////////////////////////////////////

kettos.live.CondColor = function(div) {
  var colorDiv = div.firstChild;
  var operator = div.getAttribute('data-operator');
  var spans = goog.dom.getElementsByClass('limit', div);

  kettos.live.net.listenForValues(div, function(value) {
    for (var i = 0; i < spans.length; i++) {
      var limit = parseFloat(spans[i].getAttribute('data-limit'));
      value = parseFloat(value);
      if (kettos.common.Operators[operator].func(value, limit)) {
        colorDiv.style.backgroundColor = spans[i].getAttribute('data-color');
        return;
      }
    }
    // otherwise
    colorDiv.style.backgroundColor = goog.dom.getElementByClass('otherwise', div).getAttribute('data-color');
  });
}

// Audio
//////////////////////////////////////////////////

kettos.live.Audio = function(div) {
  var audio = div.firstChild;
  audio.src = kettos.common.makeData_(div.getAttribute('data-src'), kettos.live.getCurrentProject_(), '', kettos.live.local);
}

// Video
//////////////////////////////////////////////////

kettos.live.Video = function(div) {
  var video = div.firstChild;
  video.src = kettos.common.makeData_(div.getAttribute('data-src'), kettos.live.getCurrentProject_(), '', kettos.live.local);
}


//////////////////////////////////////////////////
// SPECIAL
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// SPECIAL > AUTHENTICATION
//////////////////////////////////////////////////

// Login
//////////////////////////////////////////////////

kettos.live.Login = function(div) {
  var buttons = goog.dom.getElementsByTagNameAndClass('button', null, div);
  var requestRinButton = buttons[0];
  var loginButton = buttons[1];
  var userSelect = goog.dom.getElementsByTagNameAndClass('select', null, div)[0];
  var inputs = goog.dom.getElementsByTagNameAndClass('input', null, div);
  var passwordInput = inputs[0];
  var rinInput = inputs[1];
  goog.events.listen(requestRinButton, 'click', kettos.live.auth.requestRin());
  goog.events.listen(loginButton, 'click', kettos.live.auth.login(userSelect, passwordInput, rinInput));
}

// Change Password
//////////////////////////////////////////////////

kettos.live.ChangePwd = function(div) {
  var button = goog.dom.getElementsByTagNameAndClass('button', null, div)[0];
  var inputs = goog.dom.getElementsByTagNameAndClass('input', null, div);
  var oldPassword = inputs[0];
  var newPassword = inputs[1];
  var repeatedPassword = inputs[2];
  var userSelect = goog.dom.getElementsByTagNameAndClass('select', null, div)[0];
  goog.events.listen(button, 'click', kettos.live.auth.changePassword(oldPassword, newPassword, repeatedPassword, userSelect));
}

// LogPane
//////////////////////////////////////////////////

kettos.live.LogPane = function(div) {
  var layers = kettos.functions.getFirstLevelElements('layer', div);
  kettos.live.auth.register(function(user) {
    for (var i = 0; i < layers.length; i++) {
      goog.dom.classes.enable(layers[i], 'invisible', layers[i].getAttribute('data-check').indexOf(user.code) == -1);
    }
  });
}

// Logged As
//////////////////////////////////////////////////

kettos.live.LoggedAs = function(div) {
  var html = div.innerHTML;
  if (html.indexOf('{user}') != -1) {
    div.innerHTML = html.replace('{user}', '<user></user>');
    var userDom = goog.dom.getElementsByTagNameAndClass('user', null, div)[0];
    kettos.live.auth.register(function(user) {
      userDom.innerHTML = kettos.common.sanitize(user.text);
    });
  }
  kettos.live.treatLinks_(div);
}

// Logout
//////////////////////////////////////////////////

kettos.live.Logout = function(div) {
  var button = div.firstChild;
  goog.events.listen(button, 'click', kettos.live.auth.logout());
}

//////////////////////////////////////////////////
// end of --- SPECIAL > AUTHENTICATION
//////////////////////////////////////////////////

// Module Control
//////////////////////////////////////////////////

kettos.live.Module = function(div, widget) {
  // this is a priority widget, in order to avoid running it twice, check if it was not run already
  if (!div.getAttribute('data-done')) {
    div.setAttribute('data-done', '1');
    if (kettos.live.functions.getAttributeFromUrl('module')) {
      var el = widget;

      do {
        el = el.parentNode;
        if (el.tagName.toUpperCase() == 'BODY') {
          goog.dom.removeNode(widget);
          return;
        }
      } while (el.getAttribute('data-mi') != 'off');
    }

    var parent = widget.parentNode;
    var filter = div.getAttribute('data-filter');
    var select = div.firstChild;
    var dotIndex = filter.indexOf('.');
    var moduleFilter = filter.substring(0, dotIndex);
    var versionFilter = filter.substring(dotIndex + 1);
    versionFilter = versionFilter == '*' ? 0 : parseInt(versionFilter, 10);

    kettos.live.net.getModules(moduleFilter == '*' ? null : moduleFilter, function(json) {
      var innerHTML = '';
      for (var i = 0; i < json.length; i++) {
        var code = json[i].c;
        var versionPart = parseInt(code.substring(code.indexOf('.') + 1), 10);
        if (versionPart >= versionFilter) {
          innerHTML += '<option value="'+kettos.common.sanitize(json[i].id)+'">'+kettos.common.sanitize(json[i].id + ': ' + json[i].n)+'</option>';
        }
      }
      if (innerHTML == '') {
        new kettos.dialog.Alert('No available module matches the filter specified in the Module widget: ' + filter);
      } else {
        select.innerHTML = innerHTML;
        parent.setAttribute('data-md', json[0].id);
        kettos.live.functions.whenDynamicChanged(div.id);               // might be needed, some widgets might've been already loaded (depending on network delay)
      }
    });

    goog.events.listen(select, 'change', function() {
      parent.setAttribute('data-md', select.options[select.selectedIndex].value);
      kettos.live.functions.whenDynamicChanged(div.id);
    });
    parent.setAttribute('data-md', 'none');
  }
}

// Register Control
//////////////////////////////////////////////////

kettos.live.Register = function(div, widget) {
  // this is a priority widget, in order to avoid running it twice, check if it was not run already
  if (!div.getAttribute('data-done')) {
    div.setAttribute('data-done', '1');

    if (kettos.live.functions.getAttributeFromUrl('register')) {
      var el = widget;

      do {
        el = el.parentNode;
        if (el.tagName.toUpperCase() == 'BODY') {
          goog.dom.removeNode(widget);
          return;
        }
      } while (el.getAttribute('data-ri') != 'off');
    }

    var parent = widget.parentNode;
    var select = div.firstChild;
    var spans = goog.dom.getElementsByTagNameAndClass('span', null, div);

    var innerHTML = '';

    for (var i = 0; i < spans.length; i++) {
      innerHTML += '<option value="' + kettos.common.sanitize(spans[i].getAttribute('data-base')) + '">' + kettos.common.sanitize(spans[i].getAttribute('data-name')) + '</option>';
    }
    select.innerHTML = innerHTML;

    goog.events.listen(select, 'change', function() {
      parent.setAttribute('data-rd', select.options[select.selectedIndex].value);
      kettos.live.functions.whenDynamicChanged(div.id);
    });
    if (spans.length > 0) {
      parent.setAttribute('data-rd', spans[0].getAttribute('data-base'));
    } else {
      parent.setAttribute('data-rd', 'none');
    }
    // kettos.live.functions.whenDynamicChanged(div.id);                // not needed, no widgets are loaded yet
  }
}

// Page Select
//////////////////////////////////////////////////

kettos.live.PageSelect = function(div, widget) {
  var currentPage = kettos.live.functions.getAttributeFromUrl('page');
  var parent = widget.parentNode;
  var select = div.firstChild;
  var spans = goog.dom.getElementsByTagNameAndClass('span', null, div);
  var innerHTML = '';
  var currentPageSelected = false;

  for (var i = 0; i < spans.length; i++) {
    var value = spans[i].getAttribute('data-page');
    value = kettos.common.sanitize(value)
    if (value == undefined || value.trim().length == 0) {
      continue;
    }
    innerHTML += '<option value="' + value + '"'
    if ((currentPage == value.split("&")[0])) {
      innerHTML += ' selected="selected">';
      currentPageSelected = true;
    } else {
      innerHTML += '>';
    }

    innerHTML += kettos.common.sanitize(spans[i].getAttribute('data-page-label')) || '- No label -' + '</option>';
  }
  if (!currentPageSelected) {
    innerHTML = '<option value="">Select page</option>' + innerHTML;
  }
  select.innerHTML = innerHTML;

  goog.events.listen(select, 'change', function() {
    var href = select.options[select.selectedIndex].value;
    if (href.length > 0) {
      kettos.live.addReference_(div, href);
    }
  });
}


// Resolution Redirect
//////////////////////////////////////////////////

kettos.live.Resolution = function(div, widget) {
  var width = div.getAttribute('data-width');
  var height = div.getAttribute('data-height');
  var target = div.getAttribute('data-target');

  // http://stackoverflow.com/questions/3437786/how-to-get-web-page-size-browser-window-size-screen-size-in-a-cross-browser-wa
  var w = window,
      d = document,
      e = d.documentElement,
      g = d.getElementsByTagName('body')[0],
      x = w.innerWidth || e.clientWidth || g.clientWidth,
      y = w.innerHeight|| e.clientHeight|| g.clientHeight;

  if (x < width || y < height) {
    kettos.live.addReference_(div, target);
    div.click();
  } else {
    goog.dom.removeNode(widget);
  }
}


//////////////////////////////////////////////////
// ICON
//////////////////////////////////////////////////

// Icon
//////////////////////////////////////////////////

kettos.live.Icon = function(div) {
}
