import {extend, extendPrototype, omit, clone} from './util';
import {types} from './property-types';
import Events from './Events';

export default function NativeObject(cid) {
  this.cid = tabris._proxies.register(this, cid);
}

extend(NativeObject.prototype, Events, {

  set: function(arg1, arg2) {
    if (typeof arg1 === 'string') {
      setExistingProperty.call(this, arg1, arg2);
    } else {
      this._reorderProperties(Object.keys(arg1)).forEach(function(name) {
        setExistingProperty.call(this, name, arg1[name]);
      }, this);
    }
    return this;
  },

  get: function(name) {
    return this[name];
  },

  _getProperty: function(name) {
    if (this._isDisposed) {
      console.warn('Cannot get property "' + name + '" on disposed object');
      return;
    }
    let getter = this._getPropertyGetter(name) || this._getStoredProperty;
    let value = getter.call(this, name);
    return this._decodeProperty(this._getTypeDef(name), value);
  },

  _setProperty: function(name, value) {
    if (this._isDisposed) {
      console.warn('Cannot set property "' + name + '" on disposed object');
      return;
    }
    let typeDef = this._getTypeDef(name);
    let encodedValue;
    try {
      encodedValue = this._encodeProperty(typeDef, value);
    } catch (ex) {
      console.warn(this.toString() + ': Ignored unsupported value for property "' + name + '": ' + ex.message);
      return;
    }
    let setter = this._getPropertySetter(name) || this._storeProperty;
    setter.call(this, name, encodedValue);
  },

  _storeProperty: function(name, encodedValue) {
    let oldEncodedValue = this._getStoredProperty(name);
    if (encodedValue === oldEncodedValue) {
      return;
    }
    if (encodedValue === undefined && this._props) {
      delete this._props[name];
    } else {
      if (!this._props) {
        this._props = {};
      }
      this._props[name] = encodedValue;
    }
    this._triggerChangeEvent(name, encodedValue);
  },

  _getStoredProperty: function(name) {
    let result = this._props ? this._props[name] : undefined;
    if (result === undefined) {
      result = this._getDefaultPropertyValue(name);
    }
    return result;
  },

  _getTypeDef: function(name) {
    let prop = this.constructor._properties[name];
    return prop ? prop.type : null;
  },

  _getDefaultPropertyValue: function(name) {
    let prop = this.constructor._properties[name];
    return prop ? valueOf(prop.default) : undefined;
  },

  _encodeProperty: function(typeDef, value) {
    return (typeDef && typeDef.encode) ? typeDef.encode(value) : value;
  },

  _decodeProperty: function(typeDef, value) {
    return (typeDef && typeDef.decode) ? typeDef.decode(value) : value;
  },

  _getPropertyGetter: function(name) {
    let prop = this.constructor._properties[name];
    return prop ? prop.get : undefined;
  },

  _getPropertySetter: function(name) {
    let prop = this.constructor._properties[name];
    return prop ? prop.set : undefined;
  },

  _triggerChangeEvent: function(propertyName, newEncodedValue) {
    let typeDef = this._getTypeDef(propertyName);
    let decodedValue = this._decodeProperty(typeDef, newEncodedValue);
    this.trigger('change:' + propertyName, this, decodedValue);
  },

  _create: function(properties) {
    let type = this.constructor._type || this.type;
    tabris._nativeBridge.create(this.cid, type);
    if (this.constructor._initProperties) {
      for (let name in this.constructor._initProperties) {
        this._nativeSet(name, this.constructor._initProperties[name]);
      }
    }
    this._reorderProperties(Object.keys(properties)).forEach(function(name) {
      setExistingProperty.call(this, name, properties[name]);
    }, this);
    return this;
  },

  _reorderProperties: function(properties) {
    return properties;
  },

  dispose: function() {
    this._dispose();
  },

  _dispose: function(skipNative) {
    if (!this._isDisposed && !this._inDispose) {
      this._inDispose = true;
      this.trigger('dispose', this, {});
      this._release();
      if (!skipNative) {
        tabris._nativeBridge.destroy(this.cid);
      }
      tabris._proxies.remove(this.cid);
      delete this._props;
      this._isDisposed = true;
    }
  },

  _release: function() {
  },

  isDisposed: function() {
    return !!this._isDisposed;
  },

  _listen: function(event, state) {
    let config = this._getEventConfig(event);
    if (!config || this._isListeningToAlias(event, config)) {
      return;
    }
    if (config.listen) {
      config.listen.call(this, state, config.alias === event);
    } else {
      this._nativeListen(config.name, state);
    }
  },

  _isListeningToAlias: function(event, config) {
    if (!config.alias) {
      return false;
    }
    let other = event === config.originalName ?  config.alias : config.originalName;
    return this._isListening(other);
  },

  _nativeListen: function(event, state) {
    this._checkDisposed();
    tabris._nativeBridge.listen(this.cid, event, state);
  },

  _trigger: function(event, params) {
    let name = this.constructor._trigger[event];
    let trigger = name && this.constructor._events[name].trigger;
    if (trigger instanceof Function) {
      return trigger.call(this, params, name);
    } else if (name) {
      this.trigger(name, params);
    } else {
      this.trigger(event, params);
    }
  },

  _checkDisposed: function() {
    if (this._isDisposed) {
      throw new Error('Object is disposed');
    }
  },

  _getEventConfig: function(type) {
    return this.constructor._events[type];
  },

  _nativeSet: function(name, value) {
    this._checkDisposed();
    tabris._nativeBridge.set(this.cid, name, value);
  },

  _nativeGet: function(name) {
    this._checkDisposed();
    return tabris._nativeBridge.get(this.cid, name);
  },

  _nativeCall: function(method, parameters) {
    this._checkDisposed();
    return tabris._nativeBridge.call(this.cid, method, parameters);
  },

  toString: function() {
    return this.type;
  }

});

function setExistingProperty(name, value) {
  if (name in this) {
    this[name] = value;
  } else {
    console.warn('Unknown property "' + name + '"');
  }
}

NativeObject.extend = function(members, superType) {
  let Type = function(properties) {
    if (!(this instanceof Type)) {
      throw new Error('Cannot call constructor as a function');
    }
    if (Type._cid) {
      NativeObject.call(this, Type._cid);
    } else {
      if (!global.tabris._nativeBridge) {
        throw new Error('tabris.js not started');
      }
      NativeObject.call(this);
      this._create(properties || {});
    }
  };
  for (let member in staticMembers) {
    Type[member] = members[member] || getDefault(member);
  }
  Type._events = normalizeEvents(Type._events);
  Type._properties = normalizeProperties(Type._properties);
  Type._trigger = buildTriggerMap(Type._events);
  let superProto = omit(members, Object.keys(staticMembers));
  superProto.type = members._name;
  superProto.constructor = Type; // extendPrototype can not provide the original
  Type.prototype = extendPrototype(superType || NativeObject, superProto);
  createProperties(Type.prototype, Type._properties);
  return Type;
};

function normalizeEvents(events) {
  let result = {};
  for (let event in events) {
    let entry = events[event];
    result[event] = typeof entry === 'object' ? entry : {};
    if (!result[event].name) {
      result[event].name = typeof entry === 'string' ? entry : event;
    }
    if (result[event].alias) {
      result[event].originalName = event;
      result[result[event].alias] = result[event];
    }
  }
  return result;
}

function normalizeProperties(properties) {
  let result = {};
  for (let name in properties) {
    result[name] = normalizeProperty(properties[name]);
  }
  return result;
}

function normalizeProperty(property) {
  let shortHand = (typeof property === 'string' || Array.isArray(property));
  let setter = property.access && property.access.set || defaultSetter;
  let getter = property.access && property.access.get || defaultGetter;
  return {
    type: resolveType((shortHand ? property : property.type) || 'any'),
    default: property.default,
    nocache: property.nocache,
    set: setter,
    get: getter
  };
}

function resolveType(type) {
  let typeDef = type;
  if (typeof type === 'string') {
    typeDef = types[type];
  } else if (Array.isArray(type)) {
    typeDef = types[type[0]];
  }
  if (typeof typeDef !== 'object') {
    throw new Error('Can not find property type ' + type);
  }
  if (Array.isArray(type)) {
    typeDef = clone(typeDef);
    let args = type.slice(1);
    if (typeDef.encode) {
      typeDef.encode = wrapCoder(typeDef.encode, args);
    }
    if (typeDef.decode) {
      typeDef.decode = wrapCoder(typeDef.decode, args);
    }
  }
  return typeDef;
}

function wrapCoder(fn, args) {
  return function(value) {
    return fn.apply(global, [value].concat(args));
  };
}

function defaultSetter(name, value, options) {
  this._nativeSet(name, value);
  if (this.constructor._properties[name].nocache) {
    this._triggerChangeEvent(name, value, options);
  } else {
    this._storeProperty(name, value, options);
  }
}

function defaultGetter(name) {
  let result = this._getStoredProperty(name);
  if (result === undefined) {
    // TODO: cache read property, but not for device properties
    result = this._nativeGet(name);
  }
  return result;
}

function buildTriggerMap(events) {
  let result = {};
  for (let event in events) {
    let name = events[event].name;
    result[name] = event;
  }
  return result;
}

function getDefault(member) {
  let value = staticMembers[member];
  return value instanceof Object ? clone(value) : value;
}

function createProperties(target, definitions) {
  for (let property in definitions) {
    createProperty(target, property);
  }
}

function createProperty(target, property) {
  Object.defineProperty(target, property, {
    set: function(value) {
      this._setProperty(property, value);
    },
    get: function() {
      return this._getProperty(property);
    }
  });
}

function valueOf(value) {
  return value instanceof Function ? value() : value;
}

let staticMembers = {
  '_events': {},
  '_initProperties': {},
  '_type': null,
  '_cid': null,
  '_properties': {},
  '_supportsChildren': false
};
