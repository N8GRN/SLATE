goog.provide('kettos.live.net');

goog.require('kettos.live.functions');
goog.require('kettos.live.cookie');

goog.require('goog.net.XhrIo');
goog.require('goog.net.EventType');
goog.require('goog.events');

kettos.live.net.HANDLER_FACTORIES_ = {
  'GET_STRINGS': function() {return new kettos.live.net.GetStrings()},
  'GET_VALUES': function() {return new kettos.live.net.GetValues()},
  'GET_ATTR': function() {return new kettos.live.net.GetAttr()},
}


// init handlers
kettos.live.net.initListening = function() {
  kettos.live.net.timer_ = new goog.Timer(kettos.live.local ? 2000 : 500);
  kettos.live.net.timer_.start();

  kettos.live.net.delayedRequestCount = 0;
  kettos.live.net.delayThreshold = undefined;

  // shortcut is not there, it needs to be separate and initialized when it emerges
  // (each shortcut has its own request and thus also handler)

  kettos.live.net.HANDLERS_ = {};
  for (var item in kettos.live.net.HANDLER_FACTORIES_) {
    if (kettos.live.net.HANDLER_FACTORIES_.hasOwnProperty(item)) {
      kettos.live.net.HANDLERS_[item] = kettos.live.net.HANDLER_FACTORIES_[item]();
      kettos.live.net.HANDLERS_[item].start();
    }
  }
}

// public handler methods
kettos.live.net.listenForValues = function(element, callback) {
  kettos.live.net.HANDLERS_.GET_VALUES.register(element, callback);
}

kettos.live.net.listenForAttr = function(element, v, l, u, U, d, callback) {
  kettos.live.net.HANDLERS_.GET_ATTR.register(element, v, l, u, U, d, callback);
}

kettos.live.net.listenForStrings = function(element, callback) {
  kettos.live.net.HANDLERS_.GET_STRINGS.register(element, callback);
}

kettos.live.net.listenForShortcut = function(callback) {
  var handler = new kettos.live.net.GetShortcut(callback);
  handler.start();
}

kettos.live.net.getEnum = function(element, callback, key, fixedMR) {
  var handler = new kettos.live.net.GetEnum(element, callback, key, fixedMR);
  handler.start();
}

kettos.live.net.getModules = function(filter, callback) {
  var handler = new kettos.live.net.GetModules(filter, callback);
  handler.sendRequest();
}

// custom messages and one-time requests
kettos.live.net.sendRequest = function(action, json, callback) {
  var request = new goog.net.XhrIo();
  goog.events.listen(request, goog.net.EventType.COMPLETE, function(e) {
    callback(e.target.getResponseJson());
  });
  kettos.live.net.sendWithAbort_(request, action, json);
}

// other public methods
kettos.live.net.addTimerListener = function(func) {
  goog.events.listen(kettos.live.net.timer_, goog.Timer.TICK, function() {
    try {
      func();
    } catch (e) {
      console.log(e);
    }
  });
}

// getValue should return null, if the message should NOT be sent
kettos.live.net.getFuncOnChange = function(attr) {
  var el = attr.el;
  var input = attr.input || el.firstChild;
  var getValue = attr.getValue;
  var performChange = attr.performChange;
  var module = attr.module;
  var register = attr.register;

  var id = kettos.live.functions.getId(el, function(prevId, newId) {
    el.setAttribute('data-mr', newId);
  }, module, register);
  el.setAttribute('data-mr', id);

  var request = new goog.net.XhrIo();
  goog.events.listen(request, goog.net.EventType.SUCCESS, function(e) {
    var response = e.target.getResponseJson();
    // expecting just one setValue, so no need to loop through whole array
    var error = !!response.s || response.r.length != 1 || !!response.r[0].s;
    if (error) {
      // clear focus, so it updates to its value
      input.blur();
      new kettos.dialog.Alert(response.em || response.r[0].em || 'The operation failed. The value has not been sent. No additional information available.');
    }
  });
  goog.events.listen(request, goog.net.EventType.ERROR, function(e) {
    console.error('Error when sending value', e);
  });
  goog.events.listen(request, goog.net.EventType.ABORT, function(e) {
    console.log('Sending value aborted', e);
  });
  return function(e) {
    if (performChange) {
      performChange();
    }
    var value = getValue ? getValue(e) : input.value;
    if (value != null) {
      var json = [{'id': el.getAttribute('data-mr'), 'v': value }];
      kettos.live.net.sendWithAbort_(request, 'sv', json);
    }
  }
}

kettos.live.net.sendWithAbort_ = function(request, action, json) {
  kettos.live.net.send_(request, action, json, true);
}

kettos.live.net.send_ = function(request, action, json, abort) {
  if (kettos.live.net.IP === undefined) {
    kettos.live.net.IP = kettos.live.functions.getAttributeFromUrl('ip');
    if (kettos.live.net.IP) {
      kettos.live.net.IP = 'https://' + kettos.live.net.IP + '/slate/designer/';
    } else {
      kettos.live.net.IP = '';
    }
  }

  if (request.isActive()) {
    if (abort) {
      request.abort();
    } else {
      return;
    }
  }

  var language = kettos.live.cookie.getItem('language') || 'en';
  var jsonStr = JSON.stringify(json);
  jsonStr = encodeURIComponent(jsonStr); // KTS-1665 Web editor pages do not handle '+' and '%' characters correctly
  jsonStr = jsonStr.replace(/'/g, "''"); // Base refuses single quote and needs to be doubled due to SQL injection

  request.send(kettos.live.net.IP + 'data', 'POST', 'a=' + action + '&l=' + language + '&j=' + jsonStr);

  if (kettos.live.net.delayThreshold) {
    request.time = new Date().getTime();
    request.delayTimeout = setTimeout(function () {
      kettos.live.net.delayedRequestCount++;
      var event = new Event(kettos.constants.DelayedRequestStartEvent);
      window.dispatchEvent(event);
    }, kettos.live.net.delayThreshold);
  }
}


///////////////////
// listener classes
///////////////////

// Base class
///////////////////

kettos.live.net.Listener = function() {
  this.request = new goog.net.XhrIo();
  goog.events.listen(this.request, goog.net.EventType.COMPLETE, this.processResponseFunc());
}

// wrapper to store `this` (otherwise this is a Timer object)
kettos.live.net.Listener.prototype.sendRequestFunc = function() {
  var $this = this;
  return function() {
    $this.sendRequest();
  }
}

// must be overriden
kettos.live.net.Listener.prototype.sendRequest = function() {
  throw new Error('Method not implemented.');
}

// wrapper to store `this` (otherwise this is a Timer object) and retrieve JSON from the response
kettos.live.net.Listener.prototype.processResponseFunc = function() {
  var $this = this;
  return function(e) {

    //check the request time and process possible delayed request
    if (kettos.live.net.delayThreshold) {
      var requestTime = new Date().getTime() - e.target.time;
      if (requestTime > kettos.live.net.delayThreshold && kettos.live.net.delayedRequestCount > 0) {
        kettos.live.net.delayedRequestCount--;
        var event = new Event(kettos.constants.DelayedRequestEndEvent);
        window.dispatchEvent(event);
      }
      clearTimeout(e.target.delayTimeout);
    }

    if (!e.target.isSuccess()) {
      return;
    }
    var json = e.target.getResponseJson();
    if (json.s == 1) {
      new kettos.dialog.Alert(json.em ? json.em : 'An unexpected error occurred. No additional information is available.');
    } else if (json.s == 2) {
      kettos.live.auth.timeOut();
    } else {
      $this.processResponse(json);
    }
  }
}

// must be overriden
kettos.live.net.Listener.prototype.processResponse = function(json) {
  throw new Error('Method not implemented.');
}

kettos.live.net.Listener.prototype.start = function() {
  goog.events.listen(kettos.live.net.timer_, goog.Timer.TICK, this.sendRequestFunc());
}

kettos.live.net.Listener.prototype.hasVisibleWidgetForId = function(id) {
  if (!this.listeners[id] || this.listeners[id].length == 0) {
    return false;
  }
  for(var i in this.listeners[id]){
    var div = document.getElementById(this.listeners[id][i].wid);
    if (!div || !kettos.live.functions.isVisible(div)) {
      continue;
    } else {
      return true;
    }
  }
  return false;
}

// Class for getting the values
//////////////////////////////////

kettos.live.net.GetValues = function() {
  goog.base(this);
  this.listeners = {};        // {id: [{wid: 'w1', c: callback}, {wid: 'w2', callback: c}, ...]}
}
goog.inherits(kettos.live.net.GetValues, kettos.live.net.Listener);

// method for registering an element
// callback can be either input element (default callback will be then generated), or a custom callback
// it can be also undefined, then a callback is generated from element.firstChild, which is expected to be the input element
kettos.live.net.GetValues.prototype.register = function(element, callback) {
  if (!callback) {
    callback = element.firstChild;
  }
  if (typeof callback == 'object') {
    callback = this.getDefaultCallback_(callback);
  }

  var $this = this;
  var id = kettos.live.functions.getId(element, function(prevId, newId) {
    for (var i = 0; i < $this.listeners[prevId].length; i++) {
      if ($this.listeners[prevId][i].wid == element.id) {
        $this.listeners[prevId].splice(i, 1);
        break;
      }
    }
    $this.addItem_(newId, element.id, callback);
  });

  this.addItem_(id, element.id, callback);
}

// private method with the default and most common callback,
// which is a function, that is called after obtaining a value from the server
kettos.live.net.GetValues.prototype.getDefaultCallback_ = function(input) {
  return function(value) {
    if (document.activeElement != input || input.getAttribute('readonly') != null) {
      input.value = value;
    }
  }
}

kettos.live.net.GetValues.prototype.sendRequest = function() {
  var json = [];
  // static listeners - just add all IDs
  for (var id in this.listeners) {
    if (this.listeners.hasOwnProperty(id)) {
      if (this.listeners[id].length > 0 && this.hasVisibleWidgetForId(id)) {
        json.push({'id': id});
      }
    }
  }

  if (json.length > 0) {
    kettos.live.net.send_(this.request, 'gv', json);
  }
}

kettos.live.net.GetValues.prototype.processResponse = function(json) {
  var data = json['r'];
  for (var i = 0; i < data.length; i++) {
    var id = data[i].id;
    if (this.listeners[id] && this.listeners[id].length) {
      for (var j = 0; j < this.listeners[id].length; j++) {
        try {
          this.listeners[id][j].c(data[i].v);
        } catch (e) {
          console.log(e);
        }
      }
    } else {
      console.log('Got response for unknown id: ' + id);
    }
  }
}

kettos.live.net.GetValues.prototype.addItem_ = function(id, wid, callback) {
  if (!this.listeners[id]) {
    this.listeners[id] = [];
  }
  this.listeners[id].push({wid: wid, c: callback});
}

// Class for getting the attributes (values, labels, units, descriptions)
///////////////////////////////////////////////////////////////////////////

kettos.live.net.GetAttr = function() {
  goog.base(this);
  this.listeners = {};
  //  id: {
  //    list: [{wid: 'w1', c: callback1, v: v, l: l, u: u, d: d}, {wid: 'w2', c: callback2, ...}],
  //    v: v, l: l, u: u, d: d}, ...
}
goog.inherits(kettos.live.net.GetAttr, kettos.live.net.Listener);

// method for registering an element
kettos.live.net.GetAttr.prototype.register = function(element, v, l, u, U, d, callback) {
  if (!(v || l || u || U || d)) {
    return;
  }
  var $this = this;
  var id = kettos.live.functions.getId(element, function(prevId, newId) {
    for (var i = 0; i < $this.listeners[prevId].list.length; i++) {
      if ($this.listeners[prevId].list[i].wid == element.id) {
        $this.listeners[prevId].list.splice(i, 1);
        $this.recalculate_(prevId);
        break;
      }
    }
    $this.addItem_(newId, element.id, v, l, u, U, d, callback);
  });

  this.addItem_(id, element.id, v, l, u, U, d, callback);
}

kettos.live.net.GetAttr.prototype.sendRequest = function() {
  var json = {'d': []};

  // and now create the request JSON
  for (var id in this.listeners) {
    if (this.listeners.hasOwnProperty(id)) {
      if (this.listeners[id].list.length > 0) {
        json.d.push({'id': id, 'attr': this.makeAttrString_(this.listeners[id])});
      }
    }
  }

  var lang = kettos.live.functions.getAttributeFromUrl('lang');
  if (lang) {
    json['l'] = lang;
  }

  if (json.d.length > 0) {
    kettos.live.net.send_(this.request, 'ga', json);
  }
}

kettos.live.net.GetAttr.prototype.makeAttrString_ = function(container) {
  return (container.v ? 'v' : '') + (container.l ? 'l' : '') + (container.u ? 'u' : '') + (container.U ? 'U' : '') + (container.d ? 'd' : '');
}

kettos.live.net.GetAttr.prototype.processResponse = function(json) {
  if (json['s']) {
    // error
    console.log('Error in getting attr request: ' + json['s']);
  } else {
    var data = json['r'];
    for (var i = 0; i < data.length; i++) {
      var id = data[i]['id'];

      if (this.listeners[id].list.length > 0) {
        for (var j = 0; j < this.listeners[id].list.length; j++) {
          try {
            this.listeners[id].list[j].c(data[i]);
          } catch (e) {
            console.error(e);
          }
        }
      }
    }
  }
}

kettos.live.net.GetAttr.prototype.addItem_ = function(id, wid, v, l, u, U, d, callback) {
  if (!this.listeners[id]) {
    this.listeners[id] = {list: [], v: false, l: false, u: false, U: false, d: false};
  }
  this.listeners[id].list.push({wid: wid, c: callback, v: v, l: l, u: u, U: U, d: d});
  this.recalculate_(id);
}

kettos.live.net.GetAttr.prototype.recalculate_ = function(id) {
  var entry = this.listeners[id];
  entry.v = false;
  entry.l = false;
  entry.u = false;
  entry.U = false;
  entry.d = false;
  for (var i = 0; i < entry.list.length; i++) {
    entry.v = entry.v || entry.list[i].v;
    entry.l = entry.l || entry.list[i].l;
    entry.u = entry.u || entry.list[i].u;
    entry.U = entry.U || entry.list[i].U;
    entry.d = entry.d || entry.list[i].d;
  }
}

// Class for getting register strings
/////////////////////////////////////////////

kettos.live.net.GetStrings = function() {
  goog.base(this);
  this.listeners = {};
}
goog.inherits(kettos.live.net.GetStrings, kettos.live.net.Listener);

kettos.live.net.GetStrings.prototype.start = function() {
  var $this = this;
  //one-time request after page initialization end
  window.addEventListener(kettos.constants.InitializationEndEvent, function() {
    $this.sendRequest();
  });
  //listen when requested to reload
  window.addEventListener(kettos.constants.StringRequestEvent, function() {
    $this.sendRequest();
  });
}

// method for registering an element
kettos.live.net.GetStrings.prototype.register = function(element, callback) {
  var $this = this;
  var index = kettos.live.getLanguageStringType_(element);
  var id = kettos.live.functions.getId(element, function(prevId, newId) {
    for (var i = 0; i < $this.listeners[prevId].list.length; i++) {
      if ($this.listeners[prevId].list[i].wid == element.id) {
        $this.listeners[prevId].list.splice(i, 1);
        break;
      }
    }
    $this.addItem_(newId, element.id, index, callback);
  });

  this.addItem_(id, element.id, index, callback);
}

kettos.live.net.GetStrings.prototype.addItem_ = function(id, wid, index, callback) {
  if (!this.listeners[id]) {
    this.listeners[id] = {list: []};
  }
  this.listeners[id].list.push({wid: wid, index: index, c: callback});
}

kettos.live.net.GetStrings.prototype.sendRequest = function() {
  var json = {};
  // and now create the request JSON
  for (var id in this.listeners) {
    if (this.listeners.hasOwnProperty(id)) {
      if (this.listeners[id].list.length > 0 && id != "0") {
        var request = new goog.net.XhrIo();
        goog.events.listen(request, goog.net.EventType.COMPLETE, this.processResponseFunc());
        var il = [];
        for (var i in this.listeners[id].list) {
          if (il.indexOf(this.listeners[id].list[i].index) == -1) {
            il.push(this.listeners[id].list[i].index);
          }
        }
        kettos.live.net.send_(request, 'gs', {'id': id, 'il': il});
      }
    }
  }
}

kettos.live.net.GetStrings.prototype.processResponse = function(json) {
  var id = json.id;
  if (this.listeners[id] && this.listeners[id].list.length) {
    for (var i = 0; i < this.listeners[id].list.length; i++) {
      try {
        this.listeners[id].list[i].c(json);
      } catch (e) {
        console.log(e);
      }
    }
  } else {
    console.log('Got response for unknown id: ' + id);
  }
}

// Class for getting one particular shortcut
/////////////////////////////////////////////

kettos.live.net.GetShortcut = function(callback) {
  goog.base(this);
  this.callback = callback;
}
goog.inherits(kettos.live.net.GetShortcut, kettos.live.net.Listener);

kettos.live.net.GetShortcut.prototype.sendRequest = function() {
  kettos.live.net.send_(this.request, 'sc', kettos.live.getFaShortcutRequest());
}

kettos.live.net.GetShortcut.prototype.processResponse = function(json) {
  this.callback(json);
}

// Class for getting the enum values (key-value pairs)
///////////////////////////////////////////////////////////////////////////

kettos.live.net.GetEnum = function(element, callback, key, fixedMR) {
  goog.base(this);
  this.element = element;
  this.callback = callback;
  this.key = key;
  this.fixedMR = fixedMR;
}
goog.inherits(kettos.live.net.GetEnum, kettos.live.net.Listener);

kettos.live.net.GetEnum.prototype.sendRequest = function() {
  var json = {'id': this.id};
  if (this.key) {
    json['k'] = parseFloat(this.key);
  }

  var lang = kettos.live.functions.getAttributeFromUrl('lang');
  if (lang) {
    json['l'] = lang;
  }

  kettos.live.net.sendWithAbort_(this.request, 'ge', json);
}

kettos.live.net.GetEnum.prototype.processResponse = function(json) {
  this.callback(json.l);
}

// this works differently, does not listen to TICKs of a timer, but only reacts to changes of an eventual Module/Register widget
kettos.live.net.GetEnum.prototype.start = function() {
  if (this.fixedMR) {
    this.id = this.fixedMR;
  } else {
    var $this = this;

    var id = kettos.live.functions.getId(this.element, function(prevId, newId) {
      $this.id = newId;
      $this.sendRequest();
    });

    this.id = id;
  }

  this.sendRequest();
}

// Class for getting the available modules
///////////////////////////////////////////////////////////////////////////

kettos.live.net.GetModules = function(filter, callback) {
  goog.base(this);
  this.filter = filter;
  this.callback = callback;
}
goog.inherits(kettos.live.net.GetModules, kettos.live.net.Listener);

kettos.live.net.GetModules.prototype.sendRequest = function() {
  var json = {};
  if (this.filter) {
    json.f = this.filter;
  }

  kettos.live.net.sendWithAbort_(this.request, 'gm', json);
}

kettos.live.net.GetModules.prototype.processResponse = function(json) {
  this.callback(json.r);
}

kettos.live.net.GetModules.prototype.start = function() {
  // this is not intended to be run periodically via trigger,
  // instead it should start manually
}