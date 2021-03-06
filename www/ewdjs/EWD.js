var EWD = {
  version: {
    build: 19,
    date: '29 September 2014'
  }, 
  trace: false,
  initialised: false,
  show: function(id) {
    if (document.getElementById(id) !== null) {
      document.getElementById(id).style.display = '';
    }
  },
  hide: function(id) {
    if (document.getElementById(id) !== null) {
      document.getElementById(id).style.display = 'none';
    }
  },
  insertAfter: function(html, targetId) {
    var tag = document.createElement('div');
    tag.innerHTML = html;
  },
  getFragment: function(file, targetId, onFragment) {
    var messageObj = {
      type: "EWD.getFragment", 
      params:  {
        file: file,
        targetId: targetId
      }
    };
    if (onFragment) messageObj.done = onFragment; 
    EWD.sockets.sendMessage(messageObj); 
  },
  require: function(options) {
    if (typeof require !== 'function') {
      console.log('ERROR: unable to invoke EWD.require as the dependency require.js has not been loaded');
      return;
    }
    // set require config if defined
    if (typeof options.requireConfig === 'object') {
      require.config(options.requireConfig);
    }
    // check if custom namespace is defined
    if (typeof options.nameSpace === 'undefined') {
      options.nameSpace = options.serviceName;
    }
    //console.log('namespace set to: ' + options.nameSpace)

    require([options.serviceName], function(module) {
      function invokeOnServiceReady(options) {
        if (typeof EWD.application.onServiceReady[options.serviceName] === 'function' 
        &&  typeof options.done === 'undefined') {
          EWD.application.onServiceReady[options.serviceName]();
        }
        else if (typeof options.done === 'function'){
          options.done(module);
        }
      };

      function invokeServiceInit(options, module) {
        if (typeof module.init === 'function') {
          //console.log('invoking init with namespace: ' + options.nameSpace);
          module.init(options.nameSpace);
        }
      }

      var method;
      // extend onMessage
      if (typeof module.onMessage === 'object') {
        for (method in module.onMessage) {
          EWD.application.onMessage[options.nameSpace+'-'+method] = module.onMessage[method];
        }
      }
      // extend onFragment
      if (typeof module.onFragment === 'object') {
        for (method in module.onFragment) {
          EWD.application.onFragment[method] = module.onFragment[method];
        }
      }

      // set correct fragmentName
      var fragmentName = false;
      if (typeof options.fragmentName === 'string' && options.fragmentName.length > 0) {
        fragmentName = options.fragmentName;
      }
      else if (typeof module.fragmentName === 'string' && module.fragmentName.length > 0) {
        fragmentName = module.fragmentName;
      }
      // fetch fragment if fragmentName is supplied
      if (fragmentName) {
        // clone onFragment to overwrite & extend it with
        if (typeof EWD.application.onFragment[fragmentName] === 'function') {
          var _onFragment = EWD.application.onFragment[fragmentName];
        }
        EWD.getFragment(fragmentName, options.targetSelector, function(messageObj) {
          _onFragment(messageObj);
          invokeServiceInit(options, module);
          invokeOnServiceReady(options);
          // restore original onFragment handler 
          // prevents EWD.application.onFragment[fragmentName] from being continually extended by this
          EWD.application.onFragment[fragmentName] = _onFragment;
        });
      }
      // no fragment to fetch, just run the init and service callbacks
      else {
        invokeServiceInit(options,module);
        invokeOnServiceReady(options);
      }
      // reset baseUrl for services if they were overridden
      if (typeof options.requireConfig === 'object') {
        require.config({
          baseUrl: EWD.application.getServicePath()
        });
      }
    });
  },
  json2XML: function(document, tagName, xml) {
    if (!xml) xml = '';
    var intRegex = /^\d+$/;
    var numericTagName = intRegex.test(+tagName);
    //console.log('tagName: ' + tagName);
    if (tagName && !numericTagName) xml = xml + '<' + tagName;
    var hasAttributes = false;
    var hasChildren = false;
    var property;
    var value;
    var text = '';

    for (property in document) {
      if (property.substring(0,1) === '#') {
        hasAttributes = true;
      }
      else if (property === '.text') {
        text = document[property];
      }
      //else if (!intRegex.test(property)) {
      else {
        hasChildren = true;
      }
    }

    if (hasAttributes) {
      for (property in document) {
        if (property.substring(0,1) === '#') {
          xml = xml + ' ' + property.substring(1) + '="' + document[property] + '"';
        }
      }
    }
    if (tagName && !numericTagName && hasChildren) xml = xml + '>';

    if (hasChildren) {
      for (property in document) {
        if (property.substring(0,1) !== '#') {
          if (typeof document[property] === 'object') {
            xml = this.json2XML(document[property], property, xml);
          }
          else {
            value = document[property];
            if (value !== '') {
              xml = xml + '<' + property + '>' + value + '</' + property + '>';
            }
            else {
              xml = xml + '<' + property + ' />';
            } 
          }
        }
      }
      if (tagName && !numericTagName) xml = xml + '</' + tagName + '>';
      return xml;
    }

    if (text !== '' && tagName) {
      xml = xml + '>' + text + '</' + tagName + '>';
      return xml;
    }

    xml = xml + ' />';
    return xml;

  },
  sockets: {
    log: false,
    handlerFunction: {},
    keepAlive: function(mins) {
      EWD.sockets.timeout = mins;
      setTimeout(function() {
        EWD.sockets.sendMessage({type: "keepAlive", message:  "1"});
        EWD.sockets.keepAlive(EWD.sockets.timeout);
      },EWD.sockets.timeout*60000);
    },

    submitForm: function(params) {
      var framework = EWD.application.framework || 'extjs';
      var payload = params.fields;
      if (framework === 'extjs') {
        payload = Ext.getCmp(params.id).getValues();
      }
      if (framework === 'bootstrap') {
          if (params.popover) {
            EWD.application.popover = params.popover;
            if (!EWD.application.popovers) EWD.application.popovers = {};
            if (!EWD.application.popovers[params.popover.buttonId]) {
              $('#' + params.popover.buttonId).popover({
                title: params.alertTitle || 'Error',
                content: 'Testing',
                placement: 'top',
                container: '#' + params.popover.container,
                trigger: 'manual'
              });
              $('#' + params.popover.buttonId).on('shown.bs.popover', function() {
                var time = params.popover.time || 4000;
                setTimeout(function() {
                  $('#' + params.popover.buttonId).popover('hide');
                },time);
              });
              EWD.application.popovers[params.popover.buttonId] = true;
            }
          }
          if (params.toastr) {
            if (params.toastr.target) {
              toastr.options.target = '#' + params.toastr.target;
            }
            else {
              toastr.options.target = 'body';
            }
          }
      }
      if (params.alertTitle) payload.alertTitle = params.alertTitle;
      //payload.js_framework = framework;
      var msgObj = {
        type: params.messageType, 
        params: payload
      };
      if (params.done) msgObj.done = params.done;
      EWD.sockets.sendMessage(msgObj);
    }
  },
  utils: {
    addOptions: function(options, selectTagId) {
      // EWD.utils.addOptions([{value: 'John', text: 'John Smith'}], 'doctor');
      if (options instanceof Array) {
        var selectTag = document.getElementById(selectTagId);
        for (var i = 0; i < options.length; i++) {
          EWD.utils.addOption(selectTag, options[i].value, options[i].text);
        }
      }
    },
    addOption: function(selectTag, value, text) {
      var optionTag = document.createElement('option');
      optionTag.setAttribute('value', value);
      optionTag.text = text;
      try {
        // for IE earlier than version 8
        selectTag.add(optionTag, selectTag.options[null]);
      }
      catch (err) {
        selectTag.add(optionTag,null);
      }
    }
  },
  start: function() {
    if (EWD.application && EWD.application.chromecast) {
      EWD.application.parentOrigin = 'https://ec2.mgateway.com:8080';
      window.addEventListener('message', function(e) {
        var message = e.data;
        //if (EWD.sockets.log) console.log("*** message received from Receiver parent: " + JSON.stringify(message) + ': origin = ' + e.origin);
        if (e.origin === EWD.application.parentOrigin) {
          var type = message.message.type;
          if (typeof EWD.chromecast.onMessage !== 'undefined' && EWD.chromecast.onMessage[type]) {
            EWD.chromecast.onMessage[type](message);
          }
        }
      });
      EWD.chromecast.sendMessage = function(message) {
        window.parent.postMessage(message, EWD.application.parentOrigin);
      }
    }

    var socket = io.connect();
    socket.on('disconnect', function() {
      if (EWD.sockets.log) console.log('socket.io disconnected');
    });

    socket.on('message', function(obj){
      if (EWD.sockets.log) {
        if (obj.type !== 'EWD.registered') {
          console.log("onMessage: " + JSON.stringify(obj));
        }
        else {
          console.log('Registered successfully');
        }
      }
      if (EWD.application) {
        if (socket && obj.type === 'EWD.connected') {
          var json = {
            type: 'EWD.register', 
            application: EWD.application,
          };
          socket.json.send(JSON.stringify(json));
          return;
        }
      }
      else {
        console.log('Unable to register application: EWD.application has not been defined');
        return;
      }
      if (obj.type === 'EWD.registered') {
        //changed
        // handle service path
        // if require
        // user require config obj.servicepath
        // SJT Addition for setting up require.js service path 

        if (typeof require === 'function') {
          // add tailing / to path if necessary
          if (obj.servicePath.slice(-1) !== '/') obj.servicePath += '/';
          require.config({
            baseUrl:obj.servicePath
          });
          // expose method to retrieve servicePath
          EWD.application.getServicePath = function() {
            return obj.servicePath;
          };
        }

        EWD.sockets.sendMessage = (function() {
          var applicationName = EWD.application.name;
          delete EWD.application.name;
          var io = socket;
          var token = obj.token;
          var augment = function(params) {
            params.token = token;
            return params;
          };
          return function(params) {
            if (typeof params.type === 'undefined') {
              if (EWD.sockets.log) console.log('Message not sent: type not defined');
            }
            else {
              params = augment(params);
              if (typeof console !== 'undefined') {
                if (EWD.sockets.log) console.log("sendMessage: " + JSON.stringify(params));
              }
              if (params.done) {
                if (params.type === 'EWD.getFragment') {
                  if (!EWD.application.onFragment) EWD.application.onFragment = {};
                  EWD.application.onFragment[params.params.file] = params.done; 
                }
                else {
                  if (!EWD.application.onMessage) EWD.application.onMessage = {};
                  EWD.application.onMessage[params.type] = params.done;
                }
                delete params.done;
              }
              if (params.ajax &&typeof $ !== 'undefined') {
                delete params.ajax;
                $.ajax({
                  url: '/ajax',
                  type: 'post',
                  data: JSON.stringify(params),
                  dataType: 'json',
                  timeout: 10000
                })
                .done(function (data ) {
                  if (EWD.sockets.log) console.log("onMessage: " + JSON.stringify(data));
                  // invoke the message handler function for returned type
                  if (EWD.application && EWD.application.onMessage && EWD.application.onMessage[data.type]) {
                    EWD.application.onMessage[data.type](data);
                    data = null;
                  }
                });
              }
              else {
                io.json.send(JSON.stringify(params)); 
              }
            }
          };
        })();
        obj = null;
        socket = null;
        EWD.initialised = true;
        if (EWD.onSocketsReady) EWD.onSocketsReady();
        return;
      }
      if (obj.message) {
        var payloadType = obj.message.payloadType;
        if (payloadType === 'innerHTMLReplace') {
          var replacements = obj.message.replacements;
          var replacement;
          var prefix;
          for (var i = 0; i < replacements.length; i++) {
            replacement = replacements[i];
            prefix = replacement.prefix || '';
            for (var idName in replacement.ids) {
              document.getElementById(prefix + idName).innerHTML = replacement.ids[idName];
            }
          }
        }
        if (payloadType === 'bootstrap') {
          var action = obj.message.action;
          if (action === 'replaceTables') {
            var tables = obj.message.tables;
            var tableNo;
            var table;
            var i;
            var html;
            var tableTag;
            var columns;
            var colNo;
            var row;
            for (tableNo = 0; tableNo < tables.length; tableNo++) {
              table = tables[tableNo];
              tableTag = document.getElementById(table.id);
              html = '<thead><tr>';
              columns = EWD.bootstrap.table[table.id].columns;
              for (i = 0; i < columns.length; i++) {
                if (columns[i].heading !== '') html = html + '<th>' + columns[i].heading + '</th>'; 
              }
              html = html + '</tr></thead>';
              html = html + '<tbody>';
              for (i = 0; i < table.content.length; i++) {
                row = table.content[i];
                html = html + '<tr>';
                for (colNo = 0; colNo < columns.length; colNo++) {
                  html = html + '<td>' + row[columns[colNo].id] + '</td>';
                }
                html = html + '</tr>';
              }
              html = html + '</tbody>';
              tableTag.innerHTML = html;
            } 
            if (typeof EWD.application.onReplacedTables === "function") { // invoke onReplaceTables() after tables are built
              EWD.application.onReplacedTables();
            }
          }
        }
      }
      if (obj.type.indexOf('EWD.form.') !== -1) {
        if (obj.error) {
          var alertTitle = 'Form Error';
          if (obj.alertTitle) alertTitle = obj.alertTitle;
          if (EWD.application.framework === 'extjs') {
            Ext.Msg.alert(alertTitle, obj.error);
          }
          else if (EWD.application.framework === 'bootstrap') {
            if (typeof toastr !== 'undefined') {
              toastr.clear();
              toastr.error(obj.error);
            }
            else {
              if (EWD.sockets.log) console.log("error = " + obj.error);
              $('#' + EWD.application.popover.buttonId).popover('show');
              $('#' + EWD.application.popover.container).find('div.popover-content').html(obj.error);
            }
          }
          else {
            alert(obj.error);
          }
          return;
        }
        else {
          if (EWD.application.framework === 'bootstrap') {
            $('#loginBtn').popover('hide');
          }
        }
      }
      if (obj.type.indexOf('EWD.error') !== -1) {
        if (obj.error) {
          if (EWD.trace) console.log(obj.error);
        }
        return;
      }
      // SJT New additions for jQuery selector support for fragment target
      if (obj.type === 'EWD.getFragment') {
        if (obj.message.targetId) {
          // check jQuery is loaded, targetId is valid jQuery selector and selector matches 1+ elements 
          if (window.jQuery && $(obj.message.targetId) instanceof jQuery && $(obj.message.targetId).length > 0) { // handle a jquery object
            // inject fragment to each matched element
            $(obj.message.targetId).each(function(ix,element) {
              $(element).html(obj.message.content);
            });
            // invoke onFragment handler
            if (EWD.application.onFragment) {
              if (EWD.application.onFragment[obj.message.file]) EWD.application.onFragment[obj.message.file](obj);
            }
          }
          // otherwise use jQuery-less fragment target handling
          else if (document.getElementById(obj.message.targetId)){ // handle as string id
          document.getElementById(obj.message.targetId).innerHTML = obj.message.content;
          if (EWD.application.onFragment) {
            if (EWD.application.onFragment[obj.message.file]) EWD.application.onFragment[obj.message.file](obj);
          }
        } 
        } 
        return;
      }
      if (obj.type.indexOf('EWD.inject') !== -1) {
        if (obj.js) {
          if (EWD.trace) console.log(obj.js);
          try {
            eval(obj.js);
            if (obj.fn) eval(obj.fn);
          }
          catch(error) {
            if (EWD.trace) {
              console.log('EWD.inject failed:');
              console.log(error);
            }
          }
        }
        return;
      }
      if (typeof EWD.token !== 'undefined' && typeof EWD.sockets.handlerFunction[obj.type] !== 'undefined') {
        EWD.sockets.handlerFunction[obj.type](obj);
        obj = null;
        return;
      }
      if (EWD.application && EWD.application.onMessage && EWD.application.onMessage[obj.type]) {
        EWD.application.onMessage[obj.type](obj);
        obj = null;
        return;
      }
      if (EWD.onSocketMessage) {
        EWD.onSocketMessage(obj);
        obj = null;
        return;
      }
    });
    io = null;
  }
};

if (typeof $ !== 'undefined') {
  $(document).ready( function() {
    EWD.start();
  });
}
