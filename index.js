/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ([
/* 0 */,
/* 1 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "ContentScript": () => (/* reexport safe */ _contentscript_ContentScript__WEBPACK_IMPORTED_MODULE_0__["default"])
/* harmony export */ });
/* harmony import */ var _contentscript_ContentScript__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(2);



/***/ }),
/* 2 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "PILOT_TYPE": () => (/* binding */ PILOT_TYPE),
/* harmony export */   "WORKER_TYPE": () => (/* binding */ WORKER_TYPE),
/* harmony export */   "default": () => (/* binding */ ContentScript)
/* harmony export */ });
/* harmony import */ var lodash_get__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(3);
/* harmony import */ var lodash_get__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(lodash_get__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var p_wait_for__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(55);
/* harmony import */ var p_wait_for__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(p_wait_for__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _cozy_minilog__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(58);
/* harmony import */ var _cozy_minilog__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(_cozy_minilog__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var _bridge_LauncherBridge__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(70);
/* harmony import */ var _utils__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(74);
/* harmony import */ var ky_umd__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(75);
/* harmony import */ var ky_umd__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(ky_umd__WEBPACK_IMPORTED_MODULE_5__);
// @ts-check








const log = _cozy_minilog__WEBPACK_IMPORTED_MODULE_2___default()('ContentScript class')

const s = 1000
const m = 60 * s

const DEFAULT_LOGIN_TIMEOUT = 5 * m
const DEFAULT_WAIT_FOR_ELEMENT_TIMEOUT = 30 * s

const PILOT_TYPE = 'pilot'
const WORKER_TYPE = 'worker'

sendContentScriptReadyEvent()

class ContentScript {
  /**
   * Init the bridge communication with the launcher.
   * It also exposes the methods which will be callable by the launcher
   *
   * @param {object} options : options object
   * @param {Array<string>} [options.additionalExposedMethodsNames] : list of additional method of the
   * content script to expose expose. To make it callable via the worker
   */
  async init(options = {}) {
    this.bridge = new _bridge_LauncherBridge__WEBPACK_IMPORTED_MODULE_3__["default"]({ localWindow: window })
    const exposedMethodsNames = [
      'setContentScriptType',
      'ensureAuthenticated',
      'checkAuthenticated',
      'waitForAuthenticated',
      'waitForElementNoReload',
      'getUserDataFromWebsite',
      'fetch',
      'click',
      'fillText',
      'storeFromWorker',
      'clickAndWait',
      'getCookiesByDomain',
      'getCookieByDomainAndName'
    ]

    if (options.additionalExposedMethodsNames) {
      exposedMethodsNames.push.apply(
        exposedMethodsNames,
        options.additionalExposedMethodsNames
      )
    }

    const exposedMethods = {}
    // TODO error handling
    // should catch and call onError on the launcher to let it handle the job update
    for (const method of exposedMethodsNames) {
      exposedMethods[method] = this[method].bind(this)
    }
    this.store = {}
    await this.bridge.init({ exposedMethods })
    window.onbeforeunload = () =>
      this.log(
        'window.beforeunload detected with previous url : ' + document.location
      )

    this.bridge.emit('workerReady')
  }

  /**
   * Set the ContentScript type. This is usefull to know which webview is the pilot or the worker
   *
   * @param {string} contentScriptType - ("pilot" | "worker")
   */
  async setContentScriptType(contentScriptType) {
    this.contentScriptType = contentScriptType
    log.info(`I am the ${contentScriptType}`)
  }

  /**
   * Check if the user is authenticated or not. This method is made to be overloaded by the child class
   *
   * @returns {Promise.<boolean>} : true if authenticated or false in other case
   */
  async checkAuthenticated() {
    return false
  }

  /**
   * This method is made to run in the worker and will resolve as true when
   * the user is authenticated
   *
   * @returns {Promise.<true>} : if authenticated
   * @throws {Error}: TimeoutError from p-wait-for package if timeout expired
   */
  async waitForAuthenticated() {
    this.onlyIn(WORKER_TYPE, 'waitForAuthenticated')
    await p_wait_for__WEBPACK_IMPORTED_MODULE_1___default()(this.checkAuthenticated.bind(this), {
      interval: 1000,
      timeout: DEFAULT_LOGIN_TIMEOUT
    })
    return true
  }

  /**
   * Run a specified method in the worker webview
   *
   * @param {string} method : name of the method to run
   */
  async runInWorker(method, ...args) {
    this.onlyIn(PILOT_TYPE, 'runInWorker')
    if (!this.bridge) {
      throw new Error(
        'No bridge is defined, you should call ContentScript.init before using this method'
      )
    }
    return this.bridge.call('runInWorker', method, ...args)
  }

  /**
   * Wait for a method to resolve as true on worker
   *
   * @param {object} options        - options object
   * @param {string} options.method - name of the method to run
   * @param {number} [options.timeout] - number of miliseconds before the function sends a timeout error. Default Infinity
   * @param {Array} options.args - array of args to pass to the method
   * @returns {Promise<boolean>} - true
   * @throws {Error} - if timeout expired
   */
  async runInWorkerUntilTrue({ method, timeout = Infinity, args = [] }) {
    this.onlyIn(PILOT_TYPE, 'runInWorkerUntilTrue')
    log.debug('runInWorkerUntilTrue', method)
    let result = false
    const start = Date.now()
    const isTimeout = () => Date.now() - start >= timeout
    while (!result) {
      if (isTimeout()) {
        throw new Error('Timeout error')
      }
      log.debug('runInWorker call', method)
      result = await this.runInWorker(method, ...args)
      log.debug('runInWorker result', result)
    }
    return result
  }

  /**
   * Wait for a dom element to be present on the page, even if there are page redirects or page
   * reloads
   *
   * @param {string} selector - css selector we are waiting for
   */
  async waitForElementInWorker(selector) {
    this.onlyIn(PILOT_TYPE, 'waitForElementInWorker')
    await this.runInWorkerUntilTrue({
      method: 'waitForElementNoReload',
      args: [selector]
    })
  }

  /**
   * Wait for a dom element to be present on the page. This won't resolve if the page reloads
   *
   * @param {string} selector - css selector we are waiting for
   * @returns {Promise.<true>} - Returns true when ready
   */
  async waitForElementNoReload(selector) {
    this.onlyIn(WORKER_TYPE, 'waitForElementNoReload')
    log.debug('waitForElementNoReload', selector)
    await p_wait_for__WEBPACK_IMPORTED_MODULE_1___default()(() => Boolean(document.querySelector(selector)), {
      timeout: DEFAULT_WAIT_FOR_ELEMENT_TIMEOUT
    })
    return true
  }

  async click(selector) {
    this.onlyIn(WORKER_TYPE, 'click')
    const elem = document.querySelector(selector)
    if (!elem) {
      throw new Error(
        `click: No DOM element is matched with the ${selector} selector`
      )
    }
    elem.click()
  }

  async clickAndWait(elementToClick, elementToWait) {
    this.onlyIn(PILOT_TYPE, 'clickAndWait')
    log.debug('clicking ' + elementToClick)
    await this.runInWorker('click', elementToClick)
    log.debug('waiting for ' + elementToWait)
    await this.waitForElementInWorker(elementToWait)
    log.debug('done waiting ' + elementToWait)
  }

  async fillText(selector, text) {
    this.onlyIn(WORKER_TYPE, 'fillText')
    const elem = document.querySelector(selector)
    if (!elem) {
      throw new Error(
        `fillText: No DOM element is matched with the ${selector} selector`
      )
    }
    elem.focus()
    elem.value = text
    elem.dispatchEvent(new Event('input', { bubbles: true }))
    elem.dispatchEvent(new Event('change', { bubbles: true }))
  }

  /**
   * Bridge to the saveFiles method from the launcher.
   * - it prefilters files according to the context comming from the launcher
   * - download files when not filtered out
   * - converts blob files to base64 uri to be serializable
   *
   * @param {Array} entries : list of file entries to save
   * @param {object} options : saveFiles options
   */
  async saveFiles(entries, options) {
    this.onlyIn(PILOT_TYPE, 'saveFiles')
    log.debug(entries, 'saveFiles input entries')
    const context = options.context
    log.debug(context, 'saveFiles input context')

    const filteredEntries = this.filterOutExistingFiles(entries, options)
    for (const entry of filteredEntries) {
      if (entry.fileurl) {
        entry.blob = await ky_umd__WEBPACK_IMPORTED_MODULE_5___default().get(entry.fileurl, entry.requestOptions).blob()
        delete entry.fileurl
      }
      if (entry.blob) {
        // TODO paralelize
        entry.dataUri = await (0,_utils__WEBPACK_IMPORTED_MODULE_4__.blobToBase64)(entry.blob)
        delete entry.blob
      }
    }
    if (!this.bridge) {
      throw new Error(
        'No bridge is defined, you should call ContentScript.init before using this method'
      )
    }
    return await this.bridge.call('saveFiles', entries, options)
  }

  /**
   * Bridge to the saveBills method from the launcher.
   * - it first saves the files
   * - then saves bills linked to corresponding files
   *
   * @param {Array} entries : list of file entries to save
   * @param {object} options : saveFiles options
   */
  async saveBills(entries, options) {
    this.onlyIn(PILOT_TYPE, 'saveBills')
    const files = await this.saveFiles(entries, options)
    if (!this.bridge) {
      throw new Error(
        'No bridge is defined, you should call ContentScript.init before using this method'
      )
    }
    return await this.bridge.call('saveBills', files, options)
  }

  /**
   * Bridge to the getCredentials method from the launcher.
   */
  async getCredentials() {
    this.onlyIn(PILOT_TYPE, 'getCredentials')
    if (!this.bridge) {
      throw new Error(
        'No bridge is defined, you should call ContentScript.init before using this method'
      )
    }
    return await this.bridge.call('getCredentials')
  }

  /**
   * Bridge to the saveCredentials method from the launcher.
   *
   * @param {object} credentials : object with credentials specific to the current connector
   */
  async saveCredentials(credentials) {
    this.onlyIn(PILOT_TYPE, 'saveCredentials')
    if (!this.bridge) {
      throw new Error(
        'No bridge is defined, you should call ContentScript.init before using this method'
      )
    }
    return await this.bridge.call('saveCredentials', credentials)
  }

  /**
   * Bridge to the saveIdentity method from the launcher.
   *
   * @param {object} identity : io.cozy.contacts object
   */
  async saveIdentity(identity) {
    this.onlyIn(PILOT_TYPE, 'saveIdentity')
    if (!this.bridge) {
      throw new Error(
        'No bridge is defined, you should call ContentScript.init before using this method'
      )
    }
    return await this.bridge.call('saveIdentity', identity)
  }

  /**
   * Bridge to the getCookiesByDomain method from the RNlauncher.
   *
   * @param {string} domain : domain name
   */
  async getCookiesByDomain(domain) {
    if (!this.bridge) {
      throw new Error(
        'No bridge is defined, you should call ContentScript.init before using this method'
      )
    }
    return await this.bridge.call('getCookiesByDomain', domain)
  }

  /**
   * Bridge to the getCookieFromKeychainByName method from the RNlauncher.
   *
   * @param {string} cookieName : cookie name
   */
  async getCookieFromKeychainByName(cookieName) {
    if (!this.bridge) {
      throw new Error(
        'No bridge is defined, you should call ContentScript.init before using this method'
      )
    }
    return await this.bridge.call('getCookieFromKeychainByName', cookieName)
  }

  /**
   * Bridge to the saveCookieToKeychain method from the RNlauncher.
   *
   * @param {string} cookieValue : cookie value
   */
  async saveCookieToKeychain(cookieValue) {
    this.onlyIn(PILOT_TYPE, 'saveCookieToKeychain')
    if (!this.bridge) {
      throw new Error(
        'No bridge is defined, you should call ContentScript.init before using this method'
      )
    }
    return await this.bridge.call('saveCookieToKeychain', cookieValue)
  }

  async getCookieByDomainAndName(cookieDomain, cookieName) {
    this.onlyIn(WORKER_TYPE, 'getCookieByDomainAndName')
    if (!this.bridge) {
      throw new Error(
        'No bridge is defined, you should call ContentScript.init before using this method'
      )
    }
    const expectedCookie = await this.bridge.call(
      'getCookieByDomainAndName',
      cookieDomain,
      cookieName
    )
    return expectedCookie
  }

  /**
   * Do not download files which already exist
   *
   * @param {Array} files : array of file objects
   * @param {object} options : options object
   * @param {Array.<string>} options.fileIdAttributes : list of attributes defining the unicity of the file
   * @param {object} options.context : current launcher context
   * @returns {Array} : filtered array of file objects
   */
  filterOutExistingFiles(files, options) {
    if (options.fileIdAttributes) {
      const contextFilesIndex = this.createContextFilesIndex(
        options.context,
        options.fileIdAttributes
      )
      return files.filter(
        file =>
          contextFilesIndex[
            this.calculateFileKey(file, options.fileIdAttributes)
          ] === undefined
      )
    } else {
      return files
    }
  }

  /**
   * Creates an index of files, indexed by uniq id defined by fileIdAttributes
   *
   * @param {object} context : current context object
   * @param {Array.<string>} fileIdAttributes : list of attributes defining the unicity of a file
   * @returns {object} : context file index
   */
  createContextFilesIndex(context, fileIdAttributes) {
    log.debug('getContextFilesIndex', context, fileIdAttributes)
    let index = {}
    for (const entry of context) {
      index[entry.metadata.fileIdAttributes] = entry
    }
    return index
  }

  /**
   * Calculates the key defining the uniqueness of a given file
   *
   * @param {object} file : file object
   * @param {Array.<string>} fileIdAttributes : list of attributes defining the unicity of a file
   * @returns {string} : file key
   */
  calculateFileKey(file, fileIdAttributes) {
    return fileIdAttributes
      .sort()
      .map(key => lodash_get__WEBPACK_IMPORTED_MODULE_0___default()(file, key))
      .join('####')
  }

  /**
   * Send log message to the launcher
   *
   * @param {string} message : the log message
   * @todo Use cozy-logger to add logging level and other features
   */
  log(message) {
    this.bridge?.emit('log', message)
  }

  /**
   * @typedef SetWorkerStateOptions
   * @property {string} [url]      : url displayed by the worker webview for the login
   * @property {boolean} [visible] : will the worker be visible or not
   */

  /**
   * This is a proxy to the "setWorkerState" command in the launcher
   *
   * @param {SetWorkerStateOptions} options : worker state options
   */
  async setWorkerState(options = {}) {
    this.onlyIn(PILOT_TYPE, 'setWorkerState')
    if (!this.bridge) {
      throw new Error(
        'No bridge is defined, you should call ContentScript.init before using this method'
      )
    }
    await this.bridge.call('setWorkerState', options)
  }

  /**
   * Set the current url of the worker
   *
   * @param {string} url : the url
   */
  async goto(url) {
    this.onlyIn(PILOT_TYPE, 'goto')
    await this.setWorkerState({ url })
  }

  /**
   * Make sur that the connector is authenticated to the website.
   * If not, show the login webview to the user to let her/him authenticated.
   * Resolve the promise when authenticated
   *
   * @throws LOGIN_FAILED
   * @returns {Promise.<boolean>} : true if the user is authenticated
   */
  async ensureAuthenticated() {
    return true
  }

  /**
   * Returns whatever unique information on the authenticated user which will be usefull
   * to identify fetched data : destination folder name, fetched data metadata
   *
   * @returns {Promise.<object>}  : user data object
   */
  async getUserDataFromWebsite() {}

  /**
   * In worker context, send the given data to the pilot to be stored in its own store
   *
   * @param {object} obj : any object with data to store
   */
  async sendToPilot(obj) {
    this.onlyIn(WORKER_TYPE, 'sendToPilot')
    if (!this.bridge) {
      throw new Error(
        'No bridge is defined, you should call ContentScript.init before using this method'
      )
    }
    return this.bridge.call('sendToPilot', obj)
  }

  /**
   * Store data sent from worker with sendToPilot method
   *
   * @param {object} obj : any object with data to store
   */
  async storeFromWorker(obj) {
    // @ts-ignore Aucune surcharge ne correspond à cet appel.
    Object.assign(this.store, obj)
  }

  onlyIn(csType, method) {
    if (this.contentScriptType !== csType) {
      throw new Error(`Use ${method} only from the ${csType}`)
    }
  }

  /**
   * Main function, fetches all connector data and save it to the cozy
   *
   * @param {object} options : options object
   * @param {object} options.context : all the data already fetched by the connector in a previous execution. Will be usefull to optimize
   * connector execution by not fetching data we already have.
   * @returns {Promise.<object>} : Connector execution result. TBD
   */
  // eslint-disable-next-line no-unused-vars
  async fetch(options) {}
}

function sendContentScriptReadyEvent() {
  // @ts-ignore La propriété 'ReactNativeWebView' n'existe pas sur le type 'Window & typeof globalThis'.
  if (window.ReactNativeWebView?.postMessage) {
    // @ts-ignore La propriété 'ReactNativeWebView' n'existe pas sur le type 'Window & typeof globalThis'.
    window.ReactNativeWebView?.postMessage(
      JSON.stringify({ message: 'NEW_WORKER_INITIALIZING' })
    )
  } else {
    log.error('No window.ReactNativeWebView.postMessage available')
  }
}


/***/ }),
/* 3 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var baseGet = __webpack_require__(4);

/**
 * Gets the value at `path` of `object`. If the resolved value is
 * `undefined`, the `defaultValue` is returned in its place.
 *
 * @static
 * @memberOf _
 * @since 3.7.0
 * @category Object
 * @param {Object} object The object to query.
 * @param {Array|string} path The path of the property to get.
 * @param {*} [defaultValue] The value returned for `undefined` resolved values.
 * @returns {*} Returns the resolved value.
 * @example
 *
 * var object = { 'a': [{ 'b': { 'c': 3 } }] };
 *
 * _.get(object, 'a[0].b.c');
 * // => 3
 *
 * _.get(object, ['a', '0', 'b', 'c']);
 * // => 3
 *
 * _.get(object, 'a.b.c', 'default');
 * // => 'default'
 */
function get(object, path, defaultValue) {
  var result = object == null ? undefined : baseGet(object, path);
  return result === undefined ? defaultValue : result;
}

module.exports = get;


/***/ }),
/* 4 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var castPath = __webpack_require__(5),
    toKey = __webpack_require__(54);

/**
 * The base implementation of `_.get` without support for default values.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Array|string} path The path of the property to get.
 * @returns {*} Returns the resolved value.
 */
function baseGet(object, path) {
  path = castPath(path, object);

  var index = 0,
      length = path.length;

  while (object != null && index < length) {
    object = object[toKey(path[index++])];
  }
  return (index && index == length) ? object : undefined;
}

module.exports = baseGet;


/***/ }),
/* 5 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var isArray = __webpack_require__(6),
    isKey = __webpack_require__(7),
    stringToPath = __webpack_require__(16),
    toString = __webpack_require__(51);

/**
 * Casts `value` to a path array if it's not one.
 *
 * @private
 * @param {*} value The value to inspect.
 * @param {Object} [object] The object to query keys on.
 * @returns {Array} Returns the cast property path array.
 */
function castPath(value, object) {
  if (isArray(value)) {
    return value;
  }
  return isKey(value, object) ? [value] : stringToPath(toString(value));
}

module.exports = castPath;


/***/ }),
/* 6 */
/***/ ((module) => {

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(document.body.children);
 * // => false
 *
 * _.isArray('abc');
 * // => false
 *
 * _.isArray(_.noop);
 * // => false
 */
var isArray = Array.isArray;

module.exports = isArray;


/***/ }),
/* 7 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var isArray = __webpack_require__(6),
    isSymbol = __webpack_require__(8);

/** Used to match property names within property paths. */
var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,
    reIsPlainProp = /^\w*$/;

/**
 * Checks if `value` is a property name and not a property path.
 *
 * @private
 * @param {*} value The value to check.
 * @param {Object} [object] The object to query keys on.
 * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
 */
function isKey(value, object) {
  if (isArray(value)) {
    return false;
  }
  var type = typeof value;
  if (type == 'number' || type == 'symbol' || type == 'boolean' ||
      value == null || isSymbol(value)) {
    return true;
  }
  return reIsPlainProp.test(value) || !reIsDeepProp.test(value) ||
    (object != null && value in Object(object));
}

module.exports = isKey;


/***/ }),
/* 8 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var baseGetTag = __webpack_require__(9),
    isObjectLike = __webpack_require__(15);

/** `Object#toString` result references. */
var symbolTag = '[object Symbol]';

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && baseGetTag(value) == symbolTag);
}

module.exports = isSymbol;


/***/ }),
/* 9 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var Symbol = __webpack_require__(10),
    getRawTag = __webpack_require__(13),
    objectToString = __webpack_require__(14);

/** `Object#toString` result references. */
var nullTag = '[object Null]',
    undefinedTag = '[object Undefined]';

/** Built-in value references. */
var symToStringTag = Symbol ? Symbol.toStringTag : undefined;

/**
 * The base implementation of `getTag` without fallbacks for buggy environments.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the `toStringTag`.
 */
function baseGetTag(value) {
  if (value == null) {
    return value === undefined ? undefinedTag : nullTag;
  }
  return (symToStringTag && symToStringTag in Object(value))
    ? getRawTag(value)
    : objectToString(value);
}

module.exports = baseGetTag;


/***/ }),
/* 10 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var root = __webpack_require__(11);

/** Built-in value references. */
var Symbol = root.Symbol;

module.exports = Symbol;


/***/ }),
/* 11 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var freeGlobal = __webpack_require__(12);

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

module.exports = root;


/***/ }),
/* 12 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof __webpack_require__.g == 'object' && __webpack_require__.g && __webpack_require__.g.Object === Object && __webpack_require__.g;

module.exports = freeGlobal;


/***/ }),
/* 13 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var Symbol = __webpack_require__(10);

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var nativeObjectToString = objectProto.toString;

/** Built-in value references. */
var symToStringTag = Symbol ? Symbol.toStringTag : undefined;

/**
 * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the raw `toStringTag`.
 */
function getRawTag(value) {
  var isOwn = hasOwnProperty.call(value, symToStringTag),
      tag = value[symToStringTag];

  try {
    value[symToStringTag] = undefined;
    var unmasked = true;
  } catch (e) {}

  var result = nativeObjectToString.call(value);
  if (unmasked) {
    if (isOwn) {
      value[symToStringTag] = tag;
    } else {
      delete value[symToStringTag];
    }
  }
  return result;
}

module.exports = getRawTag;


/***/ }),
/* 14 */
/***/ ((module) => {

/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var nativeObjectToString = objectProto.toString;

/**
 * Converts `value` to a string using `Object.prototype.toString`.
 *
 * @private
 * @param {*} value The value to convert.
 * @returns {string} Returns the converted string.
 */
function objectToString(value) {
  return nativeObjectToString.call(value);
}

module.exports = objectToString;


/***/ }),
/* 15 */
/***/ ((module) => {

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return value != null && typeof value == 'object';
}

module.exports = isObjectLike;


/***/ }),
/* 16 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var memoizeCapped = __webpack_require__(17);

/** Used to match property names within property paths. */
var rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;

/** Used to match backslashes in property paths. */
var reEscapeChar = /\\(\\)?/g;

/**
 * Converts `string` to a property path array.
 *
 * @private
 * @param {string} string The string to convert.
 * @returns {Array} Returns the property path array.
 */
var stringToPath = memoizeCapped(function(string) {
  var result = [];
  if (string.charCodeAt(0) === 46 /* . */) {
    result.push('');
  }
  string.replace(rePropName, function(match, number, quote, subString) {
    result.push(quote ? subString.replace(reEscapeChar, '$1') : (number || match));
  });
  return result;
});

module.exports = stringToPath;


/***/ }),
/* 17 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var memoize = __webpack_require__(18);

/** Used as the maximum memoize cache size. */
var MAX_MEMOIZE_SIZE = 500;

/**
 * A specialized version of `_.memoize` which clears the memoized function's
 * cache when it exceeds `MAX_MEMOIZE_SIZE`.
 *
 * @private
 * @param {Function} func The function to have its output memoized.
 * @returns {Function} Returns the new memoized function.
 */
function memoizeCapped(func) {
  var result = memoize(func, function(key) {
    if (cache.size === MAX_MEMOIZE_SIZE) {
      cache.clear();
    }
    return key;
  });

  var cache = result.cache;
  return result;
}

module.exports = memoizeCapped;


/***/ }),
/* 18 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var MapCache = __webpack_require__(19);

/** Error message constants. */
var FUNC_ERROR_TEXT = 'Expected a function';

/**
 * Creates a function that memoizes the result of `func`. If `resolver` is
 * provided, it determines the cache key for storing the result based on the
 * arguments provided to the memoized function. By default, the first argument
 * provided to the memoized function is used as the map cache key. The `func`
 * is invoked with the `this` binding of the memoized function.
 *
 * **Note:** The cache is exposed as the `cache` property on the memoized
 * function. Its creation may be customized by replacing the `_.memoize.Cache`
 * constructor with one whose instances implement the
 * [`Map`](http://ecma-international.org/ecma-262/7.0/#sec-properties-of-the-map-prototype-object)
 * method interface of `clear`, `delete`, `get`, `has`, and `set`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Function
 * @param {Function} func The function to have its output memoized.
 * @param {Function} [resolver] The function to resolve the cache key.
 * @returns {Function} Returns the new memoized function.
 * @example
 *
 * var object = { 'a': 1, 'b': 2 };
 * var other = { 'c': 3, 'd': 4 };
 *
 * var values = _.memoize(_.values);
 * values(object);
 * // => [1, 2]
 *
 * values(other);
 * // => [3, 4]
 *
 * object.a = 2;
 * values(object);
 * // => [1, 2]
 *
 * // Modify the result cache.
 * values.cache.set(object, ['a', 'b']);
 * values(object);
 * // => ['a', 'b']
 *
 * // Replace `_.memoize.Cache`.
 * _.memoize.Cache = WeakMap;
 */
function memoize(func, resolver) {
  if (typeof func != 'function' || (resolver != null && typeof resolver != 'function')) {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  var memoized = function() {
    var args = arguments,
        key = resolver ? resolver.apply(this, args) : args[0],
        cache = memoized.cache;

    if (cache.has(key)) {
      return cache.get(key);
    }
    var result = func.apply(this, args);
    memoized.cache = cache.set(key, result) || cache;
    return result;
  };
  memoized.cache = new (memoize.Cache || MapCache);
  return memoized;
}

// Expose `MapCache`.
memoize.Cache = MapCache;

module.exports = memoize;


/***/ }),
/* 19 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var mapCacheClear = __webpack_require__(20),
    mapCacheDelete = __webpack_require__(45),
    mapCacheGet = __webpack_require__(48),
    mapCacheHas = __webpack_require__(49),
    mapCacheSet = __webpack_require__(50);

/**
 * Creates a map cache object to store key-value pairs.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function MapCache(entries) {
  var index = -1,
      length = entries == null ? 0 : entries.length;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

// Add methods to `MapCache`.
MapCache.prototype.clear = mapCacheClear;
MapCache.prototype['delete'] = mapCacheDelete;
MapCache.prototype.get = mapCacheGet;
MapCache.prototype.has = mapCacheHas;
MapCache.prototype.set = mapCacheSet;

module.exports = MapCache;


/***/ }),
/* 20 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var Hash = __webpack_require__(21),
    ListCache = __webpack_require__(36),
    Map = __webpack_require__(44);

/**
 * Removes all key-value entries from the map.
 *
 * @private
 * @name clear
 * @memberOf MapCache
 */
function mapCacheClear() {
  this.size = 0;
  this.__data__ = {
    'hash': new Hash,
    'map': new (Map || ListCache),
    'string': new Hash
  };
}

module.exports = mapCacheClear;


/***/ }),
/* 21 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var hashClear = __webpack_require__(22),
    hashDelete = __webpack_require__(32),
    hashGet = __webpack_require__(33),
    hashHas = __webpack_require__(34),
    hashSet = __webpack_require__(35);

/**
 * Creates a hash object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function Hash(entries) {
  var index = -1,
      length = entries == null ? 0 : entries.length;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

// Add methods to `Hash`.
Hash.prototype.clear = hashClear;
Hash.prototype['delete'] = hashDelete;
Hash.prototype.get = hashGet;
Hash.prototype.has = hashHas;
Hash.prototype.set = hashSet;

module.exports = Hash;


/***/ }),
/* 22 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var nativeCreate = __webpack_require__(23);

/**
 * Removes all key-value entries from the hash.
 *
 * @private
 * @name clear
 * @memberOf Hash
 */
function hashClear() {
  this.__data__ = nativeCreate ? nativeCreate(null) : {};
  this.size = 0;
}

module.exports = hashClear;


/***/ }),
/* 23 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var getNative = __webpack_require__(24);

/* Built-in method references that are verified to be native. */
var nativeCreate = getNative(Object, 'create');

module.exports = nativeCreate;


/***/ }),
/* 24 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var baseIsNative = __webpack_require__(25),
    getValue = __webpack_require__(31);

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = getValue(object, key);
  return baseIsNative(value) ? value : undefined;
}

module.exports = getNative;


/***/ }),
/* 25 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var isFunction = __webpack_require__(26),
    isMasked = __webpack_require__(28),
    isObject = __webpack_require__(27),
    toSource = __webpack_require__(30);

/**
 * Used to match `RegExp`
 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
 */
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

/** Used to detect host constructors (Safari). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/** Used for built-in method references. */
var funcProto = Function.prototype,
    objectProto = Object.prototype;

/** Used to resolve the decompiled source of functions. */
var funcToString = funcProto.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  funcToString.call(hasOwnProperty).replace(reRegExpChar, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/**
 * The base implementation of `_.isNative` without bad shim checks.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function,
 *  else `false`.
 */
function baseIsNative(value) {
  if (!isObject(value) || isMasked(value)) {
    return false;
  }
  var pattern = isFunction(value) ? reIsNative : reIsHostCtor;
  return pattern.test(toSource(value));
}

module.exports = baseIsNative;


/***/ }),
/* 26 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var baseGetTag = __webpack_require__(9),
    isObject = __webpack_require__(27);

/** `Object#toString` result references. */
var asyncTag = '[object AsyncFunction]',
    funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]',
    proxyTag = '[object Proxy]';

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  if (!isObject(value)) {
    return false;
  }
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 9 which returns 'object' for typed arrays and other constructors.
  var tag = baseGetTag(value);
  return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
}

module.exports = isFunction;


/***/ }),
/* 27 */
/***/ ((module) => {

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return value != null && (type == 'object' || type == 'function');
}

module.exports = isObject;


/***/ }),
/* 28 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var coreJsData = __webpack_require__(29);

/** Used to detect methods masquerading as native. */
var maskSrcKey = (function() {
  var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || '');
  return uid ? ('Symbol(src)_1.' + uid) : '';
}());

/**
 * Checks if `func` has its source masked.
 *
 * @private
 * @param {Function} func The function to check.
 * @returns {boolean} Returns `true` if `func` is masked, else `false`.
 */
function isMasked(func) {
  return !!maskSrcKey && (maskSrcKey in func);
}

module.exports = isMasked;


/***/ }),
/* 29 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var root = __webpack_require__(11);

/** Used to detect overreaching core-js shims. */
var coreJsData = root['__core-js_shared__'];

module.exports = coreJsData;


/***/ }),
/* 30 */
/***/ ((module) => {

/** Used for built-in method references. */
var funcProto = Function.prototype;

/** Used to resolve the decompiled source of functions. */
var funcToString = funcProto.toString;

/**
 * Converts `func` to its source code.
 *
 * @private
 * @param {Function} func The function to convert.
 * @returns {string} Returns the source code.
 */
function toSource(func) {
  if (func != null) {
    try {
      return funcToString.call(func);
    } catch (e) {}
    try {
      return (func + '');
    } catch (e) {}
  }
  return '';
}

module.exports = toSource;


/***/ }),
/* 31 */
/***/ ((module) => {

/**
 * Gets the value at `key` of `object`.
 *
 * @private
 * @param {Object} [object] The object to query.
 * @param {string} key The key of the property to get.
 * @returns {*} Returns the property value.
 */
function getValue(object, key) {
  return object == null ? undefined : object[key];
}

module.exports = getValue;


/***/ }),
/* 32 */
/***/ ((module) => {

/**
 * Removes `key` and its value from the hash.
 *
 * @private
 * @name delete
 * @memberOf Hash
 * @param {Object} hash The hash to modify.
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function hashDelete(key) {
  var result = this.has(key) && delete this.__data__[key];
  this.size -= result ? 1 : 0;
  return result;
}

module.exports = hashDelete;


/***/ }),
/* 33 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var nativeCreate = __webpack_require__(23);

/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED = '__lodash_hash_undefined__';

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Gets the hash value for `key`.
 *
 * @private
 * @name get
 * @memberOf Hash
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function hashGet(key) {
  var data = this.__data__;
  if (nativeCreate) {
    var result = data[key];
    return result === HASH_UNDEFINED ? undefined : result;
  }
  return hasOwnProperty.call(data, key) ? data[key] : undefined;
}

module.exports = hashGet;


/***/ }),
/* 34 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var nativeCreate = __webpack_require__(23);

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Checks if a hash value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf Hash
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function hashHas(key) {
  var data = this.__data__;
  return nativeCreate ? (data[key] !== undefined) : hasOwnProperty.call(data, key);
}

module.exports = hashHas;


/***/ }),
/* 35 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var nativeCreate = __webpack_require__(23);

/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED = '__lodash_hash_undefined__';

/**
 * Sets the hash `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf Hash
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the hash instance.
 */
function hashSet(key, value) {
  var data = this.__data__;
  this.size += this.has(key) ? 0 : 1;
  data[key] = (nativeCreate && value === undefined) ? HASH_UNDEFINED : value;
  return this;
}

module.exports = hashSet;


/***/ }),
/* 36 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var listCacheClear = __webpack_require__(37),
    listCacheDelete = __webpack_require__(38),
    listCacheGet = __webpack_require__(41),
    listCacheHas = __webpack_require__(42),
    listCacheSet = __webpack_require__(43);

/**
 * Creates an list cache object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function ListCache(entries) {
  var index = -1,
      length = entries == null ? 0 : entries.length;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

// Add methods to `ListCache`.
ListCache.prototype.clear = listCacheClear;
ListCache.prototype['delete'] = listCacheDelete;
ListCache.prototype.get = listCacheGet;
ListCache.prototype.has = listCacheHas;
ListCache.prototype.set = listCacheSet;

module.exports = ListCache;


/***/ }),
/* 37 */
/***/ ((module) => {

/**
 * Removes all key-value entries from the list cache.
 *
 * @private
 * @name clear
 * @memberOf ListCache
 */
function listCacheClear() {
  this.__data__ = [];
  this.size = 0;
}

module.exports = listCacheClear;


/***/ }),
/* 38 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var assocIndexOf = __webpack_require__(39);

/** Used for built-in method references. */
var arrayProto = Array.prototype;

/** Built-in value references. */
var splice = arrayProto.splice;

/**
 * Removes `key` and its value from the list cache.
 *
 * @private
 * @name delete
 * @memberOf ListCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function listCacheDelete(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    return false;
  }
  var lastIndex = data.length - 1;
  if (index == lastIndex) {
    data.pop();
  } else {
    splice.call(data, index, 1);
  }
  --this.size;
  return true;
}

module.exports = listCacheDelete;


/***/ }),
/* 39 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var eq = __webpack_require__(40);

/**
 * Gets the index at which the `key` is found in `array` of key-value pairs.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {*} key The key to search for.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function assocIndexOf(array, key) {
  var length = array.length;
  while (length--) {
    if (eq(array[length][0], key)) {
      return length;
    }
  }
  return -1;
}

module.exports = assocIndexOf;


/***/ }),
/* 40 */
/***/ ((module) => {

/**
 * Performs a
 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * comparison between two values to determine if they are equivalent.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 * @example
 *
 * var object = { 'a': 1 };
 * var other = { 'a': 1 };
 *
 * _.eq(object, object);
 * // => true
 *
 * _.eq(object, other);
 * // => false
 *
 * _.eq('a', 'a');
 * // => true
 *
 * _.eq('a', Object('a'));
 * // => false
 *
 * _.eq(NaN, NaN);
 * // => true
 */
function eq(value, other) {
  return value === other || (value !== value && other !== other);
}

module.exports = eq;


/***/ }),
/* 41 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var assocIndexOf = __webpack_require__(39);

/**
 * Gets the list cache value for `key`.
 *
 * @private
 * @name get
 * @memberOf ListCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function listCacheGet(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  return index < 0 ? undefined : data[index][1];
}

module.exports = listCacheGet;


/***/ }),
/* 42 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var assocIndexOf = __webpack_require__(39);

/**
 * Checks if a list cache value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf ListCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function listCacheHas(key) {
  return assocIndexOf(this.__data__, key) > -1;
}

module.exports = listCacheHas;


/***/ }),
/* 43 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var assocIndexOf = __webpack_require__(39);

/**
 * Sets the list cache `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf ListCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the list cache instance.
 */
function listCacheSet(key, value) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    ++this.size;
    data.push([key, value]);
  } else {
    data[index][1] = value;
  }
  return this;
}

module.exports = listCacheSet;


/***/ }),
/* 44 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var getNative = __webpack_require__(24),
    root = __webpack_require__(11);

/* Built-in method references that are verified to be native. */
var Map = getNative(root, 'Map');

module.exports = Map;


/***/ }),
/* 45 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var getMapData = __webpack_require__(46);

/**
 * Removes `key` and its value from the map.
 *
 * @private
 * @name delete
 * @memberOf MapCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function mapCacheDelete(key) {
  var result = getMapData(this, key)['delete'](key);
  this.size -= result ? 1 : 0;
  return result;
}

module.exports = mapCacheDelete;


/***/ }),
/* 46 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var isKeyable = __webpack_require__(47);

/**
 * Gets the data for `map`.
 *
 * @private
 * @param {Object} map The map to query.
 * @param {string} key The reference key.
 * @returns {*} Returns the map data.
 */
function getMapData(map, key) {
  var data = map.__data__;
  return isKeyable(key)
    ? data[typeof key == 'string' ? 'string' : 'hash']
    : data.map;
}

module.exports = getMapData;


/***/ }),
/* 47 */
/***/ ((module) => {

/**
 * Checks if `value` is suitable for use as unique object key.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
 */
function isKeyable(value) {
  var type = typeof value;
  return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
    ? (value !== '__proto__')
    : (value === null);
}

module.exports = isKeyable;


/***/ }),
/* 48 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var getMapData = __webpack_require__(46);

/**
 * Gets the map value for `key`.
 *
 * @private
 * @name get
 * @memberOf MapCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function mapCacheGet(key) {
  return getMapData(this, key).get(key);
}

module.exports = mapCacheGet;


/***/ }),
/* 49 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var getMapData = __webpack_require__(46);

/**
 * Checks if a map value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf MapCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function mapCacheHas(key) {
  return getMapData(this, key).has(key);
}

module.exports = mapCacheHas;


/***/ }),
/* 50 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var getMapData = __webpack_require__(46);

/**
 * Sets the map `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf MapCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the map cache instance.
 */
function mapCacheSet(key, value) {
  var data = getMapData(this, key),
      size = data.size;

  data.set(key, value);
  this.size += data.size == size ? 0 : 1;
  return this;
}

module.exports = mapCacheSet;


/***/ }),
/* 51 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var baseToString = __webpack_require__(52);

/**
 * Converts `value` to a string. An empty string is returned for `null`
 * and `undefined` values. The sign of `-0` is preserved.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to convert.
 * @returns {string} Returns the converted string.
 * @example
 *
 * _.toString(null);
 * // => ''
 *
 * _.toString(-0);
 * // => '-0'
 *
 * _.toString([1, 2, 3]);
 * // => '1,2,3'
 */
function toString(value) {
  return value == null ? '' : baseToString(value);
}

module.exports = toString;


/***/ }),
/* 52 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var Symbol = __webpack_require__(10),
    arrayMap = __webpack_require__(53),
    isArray = __webpack_require__(6),
    isSymbol = __webpack_require__(8);

/** Used as references for various `Number` constants. */
var INFINITY = 1 / 0;

/** Used to convert symbols to primitives and strings. */
var symbolProto = Symbol ? Symbol.prototype : undefined,
    symbolToString = symbolProto ? symbolProto.toString : undefined;

/**
 * The base implementation of `_.toString` which doesn't convert nullish
 * values to empty strings.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 */
function baseToString(value) {
  // Exit early for strings to avoid a performance hit in some environments.
  if (typeof value == 'string') {
    return value;
  }
  if (isArray(value)) {
    // Recursively convert values (susceptible to call stack limits).
    return arrayMap(value, baseToString) + '';
  }
  if (isSymbol(value)) {
    return symbolToString ? symbolToString.call(value) : '';
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
}

module.exports = baseToString;


/***/ }),
/* 53 */
/***/ ((module) => {

/**
 * A specialized version of `_.map` for arrays without support for iteratee
 * shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the new mapped array.
 */
function arrayMap(array, iteratee) {
  var index = -1,
      length = array == null ? 0 : array.length,
      result = Array(length);

  while (++index < length) {
    result[index] = iteratee(array[index], index, array);
  }
  return result;
}

module.exports = arrayMap;


/***/ }),
/* 54 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var isSymbol = __webpack_require__(8);

/** Used as references for various `Number` constants. */
var INFINITY = 1 / 0;

/**
 * Converts `value` to a string key if it's not a string or symbol.
 *
 * @private
 * @param {*} value The value to inspect.
 * @returns {string|symbol} Returns the key.
 */
function toKey(value) {
  if (typeof value == 'string' || isSymbol(value)) {
    return value;
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
}

module.exports = toKey;


/***/ }),
/* 55 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";

const pTimeout = __webpack_require__(56);

const pWaitFor = async (condition, options) => {
	options = {
		interval: 20,
		timeout: Infinity,
		leadingCheck: true,
		...options
	};

	let retryTimeout;

	const promise = new Promise((resolve, reject) => {
		const check = async () => {
			try {
				const value = await condition();

				if (typeof value !== 'boolean') {
					throw new TypeError('Expected condition to return a boolean');
				}

				if (value === true) {
					resolve();
				} else {
					retryTimeout = setTimeout(check, options.interval);
				}
			} catch (error) {
				reject(error);
			}
		};

		if (options.leadingCheck) {
			check();
		} else {
			retryTimeout = setTimeout(check, options.interval);
		}
	});

	if (options.timeout !== Infinity) {
		try {
			return await pTimeout(promise, options.timeout);
		} catch (error) {
			if (retryTimeout) {
				clearTimeout(retryTimeout);
			}

			throw error;
		}
	}

	return promise;
};

module.exports = pWaitFor;
// TODO: Remove this for the next major release
module.exports["default"] = pWaitFor;


/***/ }),
/* 56 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


const pFinally = __webpack_require__(57);

class TimeoutError extends Error {
	constructor(message) {
		super(message);
		this.name = 'TimeoutError';
	}
}

const pTimeout = (promise, milliseconds, fallback) => new Promise((resolve, reject) => {
	if (typeof milliseconds !== 'number' || milliseconds < 0) {
		throw new TypeError('Expected `milliseconds` to be a positive number');
	}

	if (milliseconds === Infinity) {
		resolve(promise);
		return;
	}

	const timer = setTimeout(() => {
		if (typeof fallback === 'function') {
			try {
				resolve(fallback());
			} catch (error) {
				reject(error);
			}

			return;
		}

		const message = typeof fallback === 'string' ? fallback : `Promise timed out after ${milliseconds} milliseconds`;
		const timeoutError = fallback instanceof Error ? fallback : new TimeoutError(message);

		if (typeof promise.cancel === 'function') {
			promise.cancel();
		}

		reject(timeoutError);
	}, milliseconds);

	// TODO: Use native `finally` keyword when targeting Node.js 10
	pFinally(
		// eslint-disable-next-line promise/prefer-await-to-then
		promise.then(resolve, reject),
		() => {
			clearTimeout(timer);
		}
	);
});

module.exports = pTimeout;
// TODO: Remove this for the next major release
module.exports["default"] = pTimeout;

module.exports.TimeoutError = TimeoutError;


/***/ }),
/* 57 */
/***/ ((module) => {

"use strict";

module.exports = (promise, onFinally) => {
	onFinally = onFinally || (() => {});

	return promise.then(
		val => new Promise(resolve => {
			resolve(onFinally());
		}).then(() => val),
		err => new Promise(resolve => {
			resolve(onFinally());
		}).then(() => {
			throw err;
		})
	);
};


/***/ }),
/* 58 */
/***/ ((module, exports, __webpack_require__) => {

var Minilog = __webpack_require__(59);

var oldEnable = Minilog.enable,
    oldDisable = Minilog.disable,
    isChrome = (typeof navigator != 'undefined' && /chrome/i.test(navigator.userAgent)),
    console = __webpack_require__(63);

// Use a more capable logging backend if on Chrome
Minilog.defaultBackend = (isChrome ? console.minilog : console);

// apply enable inputs from localStorage and from the URL
if(typeof window != 'undefined') {
  try {
    Minilog.enable(JSON.parse(window.localStorage['minilogSettings']));
  } catch(e) {}
  if(window.location && window.location.search) {
    var match = RegExp('[?&]minilog=([^&]*)').exec(window.location.search);
    match && Minilog.enable(decodeURIComponent(match[1]));
  }
}

// Make enable also add to localStorage
Minilog.enable = function() {
  oldEnable.call(Minilog, true);
  try { window.localStorage['minilogSettings'] = JSON.stringify(true); } catch(e) {}
  return this;
};

Minilog.disable = function() {
  oldDisable.call(Minilog);
  try { delete window.localStorage.minilogSettings; } catch(e) {}
  return this;
};

exports = module.exports = Minilog;

exports.backends = {
  array: __webpack_require__(67),
  browser: Minilog.defaultBackend,
  localStorage: __webpack_require__(68),
  jQuery: __webpack_require__(69)
};


/***/ }),
/* 59 */
/***/ ((module, exports, __webpack_require__) => {

var Transform = __webpack_require__(60),
    Filter = __webpack_require__(62);

var log = new Transform(),
    slice = Array.prototype.slice;

exports = module.exports = function create(name) {
  var o   = function() { log.write(name, undefined, slice.call(arguments)); return o; };
  o.debug = function() { log.write(name, 'debug', slice.call(arguments)); return o; };
  o.info  = function() { log.write(name, 'info',  slice.call(arguments)); return o; };
  o.warn  = function() { log.write(name, 'warn',  slice.call(arguments)); return o; };
  o.error = function() { log.write(name, 'error', slice.call(arguments)); return o; };
  o.group = function() { log.write(name, 'group', slice.call(arguments)); return o; };
  o.groupEnd = function() { log.write(name, 'groupEnd', slice.call(arguments)); return o; };
  o.log   = o.debug; // for interface compliance with Node and browser consoles
  o.suggest = exports.suggest;
  o.format = log.format;
  return o;
};

// filled in separately
exports.defaultBackend = exports.defaultFormatter = null;

exports.pipe = function(dest) {
  return log.pipe(dest);
};

exports.end = exports.unpipe = exports.disable = function(from) {
  return log.unpipe(from);
};

exports.Transform = Transform;
exports.Filter = Filter;
// this is the default filter that's applied when .enable() is called normally
// you can bypass it completely and set up your own pipes
exports.suggest = new Filter();

exports.enable = function() {
  if(exports.defaultFormatter) {
    return log.pipe(exports.suggest) // filter
              .pipe(exports.defaultFormatter) // formatter
              .pipe(exports.defaultBackend); // backend
  }
  return log.pipe(exports.suggest) // filter
            .pipe(exports.defaultBackend); // formatter
};



/***/ }),
/* 60 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var microee = __webpack_require__(61);

// Implements a subset of Node's stream.Transform - in a cross-platform manner.
function Transform() {}

microee.mixin(Transform);

// The write() signature is different from Node's
// --> makes it much easier to work with objects in logs.
// One of the lessons from v1 was that it's better to target
// a good browser rather than the lowest common denominator
// internally.
// If you want to use external streams, pipe() to ./stringify.js first.
Transform.prototype.write = function(name, level, args) {
  this.emit('item', name, level, args);
};

Transform.prototype.end = function() {
  this.emit('end');
  this.removeAllListeners();
};

Transform.prototype.pipe = function(dest) {
  var s = this;
  // prevent double piping
  s.emit('unpipe', dest);
  // tell the dest that it's being piped to
  dest.emit('pipe', s);

  function onItem() {
    dest.write.apply(dest, Array.prototype.slice.call(arguments));
  }
  function onEnd() { !dest._isStdio && dest.end(); }

  s.on('item', onItem);
  s.on('end', onEnd);

  s.when('unpipe', function(from) {
    var match = (from === dest) || typeof from == 'undefined';
    if(match) {
      s.removeListener('item', onItem);
      s.removeListener('end', onEnd);
      dest.emit('unpipe');
    }
    return match;
  });

  return dest;
};

Transform.prototype.unpipe = function(from) {
  this.emit('unpipe', from);
  return this;
};

Transform.prototype.format = function(dest) {
  throw new Error([
    'Warning: .format() is deprecated in Minilog v2! Use .pipe() instead. For example:',
    'var Minilog = require(\'minilog\');',
    'Minilog',
    '  .pipe(Minilog.backends.console.formatClean)',
    '  .pipe(Minilog.backends.console);'].join('\n'));
};

Transform.mixin = function(dest) {
  var o = Transform.prototype, k;
  for (k in o) {
    o.hasOwnProperty(k) && (dest.prototype[k] = o[k]);
  }
};

module.exports = Transform;


/***/ }),
/* 61 */
/***/ ((module) => {

function M() { this._events = {}; }
M.prototype = {
  on: function(ev, cb) {
    this._events || (this._events = {});
    var e = this._events;
    (e[ev] || (e[ev] = [])).push(cb);
    return this;
  },
  removeListener: function(ev, cb) {
    var e = this._events[ev] || [], i;
    for(i = e.length-1; i >= 0 && e[i]; i--){
      if(e[i] === cb || e[i].cb === cb) { e.splice(i, 1); }
    }
  },
  removeAllListeners: function(ev) {
    if(!ev) { this._events = {}; }
    else { this._events[ev] && (this._events[ev] = []); }
  },
  listeners: function(ev) {
    return (this._events ? this._events[ev] || [] : []);
  },
  emit: function(ev) {
    this._events || (this._events = {});
    var args = Array.prototype.slice.call(arguments, 1), i, e = this._events[ev] || [];
    for(i = e.length-1; i >= 0 && e[i]; i--){
      e[i].apply(this, args);
    }
    return this;
  },
  when: function(ev, cb) {
    return this.once(ev, cb, true);
  },
  once: function(ev, cb, when) {
    if(!cb) return this;
    function c() {
      if(!when) this.removeListener(ev, c);
      if(cb.apply(this, arguments) && when) this.removeListener(ev, c);
    }
    c.cb = cb;
    this.on(ev, c);
    return this;
  }
};
M.mixin = function(dest) {
  var o = M.prototype, k;
  for (k in o) {
    o.hasOwnProperty(k) && (dest.prototype[k] = o[k]);
  }
};
module.exports = M;


/***/ }),
/* 62 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

// default filter
var Transform = __webpack_require__(60);

var levelMap = { debug: 1, info: 2, warn: 3, error: 4 };

function Filter() {
  this.enabled = true;
  this.defaultResult = true;
  this.clear();
}

Transform.mixin(Filter);

// allow all matching, with level >= given level
Filter.prototype.allow = function(name, level) {
  this._white.push({ n: name, l: levelMap[level] });
  return this;
};

// deny all matching, with level <= given level
Filter.prototype.deny = function(name, level) {
  this._black.push({ n: name, l: levelMap[level] });
  return this;
};

Filter.prototype.clear = function() {
  this._white = [];
  this._black = [];
  return this;
};

function test(rule, name) {
  // use .test for RegExps
  return (rule.n.test ? rule.n.test(name) : rule.n == name);
};

Filter.prototype.test = function(name, level) {
  var i, len = Math.max(this._white.length, this._black.length);
  for(i = 0; i < len; i++) {
    if(this._white[i] && test(this._white[i], name) && levelMap[level] >= this._white[i].l) {
      return true;
    }
    if(this._black[i] && test(this._black[i], name) && levelMap[level] <= this._black[i].l) {
      return false;
    }
  }
  return this.defaultResult;
};

Filter.prototype.write = function(name, level, args) {
  if(!this.enabled || this.test(name, level)) {
    return this.emit('item', name, level, args);
  }
};

module.exports = Filter;


/***/ }),
/* 63 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var Transform = __webpack_require__(60);

var newlines = /\n+$/,
    logger = new Transform();

logger.write = function(name, level, args) {
  var i = args.length-1;
  if (typeof console === 'undefined' || !console.log) {
    return;
  }
  if(console.log.apply) {
    return console.log.apply(console, [name, level].concat(args));
  } else if(JSON && JSON.stringify) {
    // console.log.apply is undefined in IE8 and IE9
    // for IE8/9: make console.log at least a bit less awful
    if(args[i] && typeof args[i] == 'string') {
      args[i] = args[i].replace(newlines, '');
    }
    try {
      for(i = 0; i < args.length; i++) {
        args[i] = JSON.stringify(args[i]);
      }
    } catch(e) {}
    console.log(args.join(' '));
  }
};

logger.formatters = ['color', 'minilog'];
logger.color = __webpack_require__(64);
logger.minilog = __webpack_require__(66);

module.exports = logger;


/***/ }),
/* 64 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var Transform = __webpack_require__(60),
    color = __webpack_require__(65);

var colors = { debug: ['cyan'], info: ['purple' ], warn: [ 'yellow', true ], error: [ 'red', true ] },
    logger = new Transform();

logger.write = function(name, level, args) {
  var fn = console.log;
  if(console[level] && console[level].apply) {
    fn = console[level];
    fn.apply(console, [ '%c'+name+' %c'+level, color('gray'), color.apply(color, colors[level])].concat(args));
  }
};

// NOP, because piping the formatted logs can only cause trouble.
logger.pipe = function() { };

module.exports = logger;


/***/ }),
/* 65 */
/***/ ((module) => {

var hex = {
  black: '#000',
  red: '#c23621',
  green: '#25bc26',
  yellow: '#bbbb00',
  blue:  '#492ee1',
  magenta: '#d338d3',
  cyan: '#33bbc8',
  gray: '#808080',
  purple: '#708'
};
function color(fg, isInverse) {
  if(isInverse) {
    return 'color: #fff; background: '+hex[fg]+';';
  } else {
    return 'color: '+hex[fg]+';';
  }
}

module.exports = color;


/***/ }),
/* 66 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var Transform = __webpack_require__(60),
    color = __webpack_require__(65),
    colors = { debug: ['gray'], info: ['purple' ], warn: [ 'yellow', true ], error: [ 'red', true ] },
    logger = new Transform();

logger.write = function(name, level, args) {
  var fn = console.log;
  if(level != 'debug' && console[level]) {
    fn = console[level];
  }

  var subset = [], i = 0;
  if(level != 'info') {
    for(; i < args.length; i++) {
      if(typeof args[i] != 'string') break;
    }
    fn.apply(console, [ '%c'+name +' '+ args.slice(0, i).join(' '), color.apply(color, colors[level]) ].concat(args.slice(i)));
  } else {
    fn.apply(console, [ '%c'+name, color.apply(color, colors[level]) ].concat(args));
  }
};

// NOP, because piping the formatted logs can only cause trouble.
logger.pipe = function() { };

module.exports = logger;


/***/ }),
/* 67 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var Transform = __webpack_require__(60),
    cache = [ ];

var logger = new Transform();

logger.write = function(name, level, args) {
  cache.push([ name, level, args ]);
};

// utility functions
logger.get = function() { return cache; };
logger.empty = function() { cache = []; };

module.exports = logger;


/***/ }),
/* 68 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var Transform = __webpack_require__(60),
    cache = false;

var logger = new Transform();

logger.write = function(name, level, args) {
  if(typeof window == 'undefined' || typeof JSON == 'undefined' || !JSON.stringify || !JSON.parse) return;
  try {
    if(!cache) { cache = (window.localStorage.minilog ? JSON.parse(window.localStorage.minilog) : []); }
    cache.push([ new Date().toString(), name, level, args ]);
    window.localStorage.minilog = JSON.stringify(cache);
  } catch(e) {}
};

module.exports = logger;

/***/ }),
/* 69 */
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var Transform = __webpack_require__(60);

var cid = new Date().valueOf().toString(36);

function AjaxLogger(options) {
  this.url = options.url || '';
  this.cache = [];
  this.timer = null;
  this.interval = options.interval || 30*1000;
  this.enabled = true;
  this.jQuery = window.jQuery;
  this.extras = {};
}

Transform.mixin(AjaxLogger);

AjaxLogger.prototype.write = function(name, level, args) {
  if(!this.timer) { this.init(); }
  this.cache.push([name, level].concat(args));
};

AjaxLogger.prototype.init = function() {
  if(!this.enabled || !this.jQuery) return;
  var self = this;
  this.timer = setTimeout(function() {
    var i, logs = [], ajaxData, url = self.url;
    if(self.cache.length == 0) return self.init();
    // Test each log line and only log the ones that are valid (e.g. don't have circular references).
    // Slight performance hit but benefit is we log all valid lines.
    for(i = 0; i < self.cache.length; i++) {
      try {
        JSON.stringify(self.cache[i]);
        logs.push(self.cache[i]);
      } catch(e) { }
    }
    if(self.jQuery.isEmptyObject(self.extras)) {
        ajaxData = JSON.stringify({ logs: logs });
        url = self.url + '?client_id=' + cid;
    } else {
        ajaxData = JSON.stringify(self.jQuery.extend({logs: logs}, self.extras));
    }

    self.jQuery.ajax(url, {
      type: 'POST',
      cache: false,
      processData: false,
      data: ajaxData,
      contentType: 'application/json',
      timeout: 10000
    }).success(function(data, status, jqxhr) {
      if(data.interval) {
        self.interval = Math.max(1000, data.interval);
      }
    }).error(function() {
      self.interval = 30000;
    }).always(function() {
      self.init();
    });
    self.cache = [];
  }, this.interval);
};

AjaxLogger.prototype.end = function() {};

// wait until jQuery is defined. Useful if you don't control the load order.
AjaxLogger.jQueryWait = function(onDone) {
  if(typeof window !== 'undefined' && (window.jQuery || window.$)) {
    return onDone(window.jQuery || window.$);
  } else if (typeof window !== 'undefined') {
    setTimeout(function() { AjaxLogger.jQueryWait(onDone); }, 200);
  }
};

module.exports = AjaxLogger;


/***/ }),
/* 70 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ LauncherBridge)
/* harmony export */ });
/* harmony import */ var post_me__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(73);
/* harmony import */ var _ContentScriptMessenger__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(71);
/* harmony import */ var _bridgeInterfaces__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(72);




/**
 * Bridge to the Launcher object via post-me
 */
class LauncherBridge extends _bridgeInterfaces__WEBPACK_IMPORTED_MODULE_1__.Bridge {
  /**
   * Init the window which will be used to communicate with the launcher
   *
   * @param {object} options             : option object
   * @param {object} options.localWindow : The window used to communicate with the launcher
   */
  constructor({ localWindow }) {
    super()
    this.localWindow = localWindow
  }

  async init({ exposedMethods = {} } = {}) {
    const messenger = new _ContentScriptMessenger__WEBPACK_IMPORTED_MODULE_0__["default"]({
      localWindow: this.localWindow
    })
    this.connection = await (0,post_me__WEBPACK_IMPORTED_MODULE_2__.ChildHandshake)(messenger, exposedMethods)
    this.localHandle = this.connection.localHandle()
    this.remoteHandle = this.connection.remoteHandle()
  }
}


/***/ }),
/* 71 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ ReactNativeWebviewMessenger)
/* harmony export */ });
/* harmony import */ var _bridgeInterfaces__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(72);
// @ts-check


/**
 * post-me messenger implementation for a content script implanted in a react native webview
 */
class ReactNativeWebviewMessenger extends _bridgeInterfaces__WEBPACK_IMPORTED_MODULE_0__.MessengerInterface {
  /**
   * Init the window which will be used to post messages and listen to messages
   *
   * @param  {object} options             : options object
   * @param  {object} options.localWindow : The window object
   */
  constructor({ localWindow }) {
    super()
    this.localWindow = localWindow
  }
  postMessage(message) {
    this.localWindow.ReactNativeWebView.postMessage(JSON.stringify(message))
  }
  addMessageListener(listener) {
    const outerListener = event => {
      listener(event)
    }

    this.localWindow.addEventListener('message', outerListener)

    const removeMessageListener = () => {
      this.localWindow.removeEventListener('message', outerListener)
    }

    return removeMessageListener
  }
}


/***/ }),
/* 72 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Bridge": () => (/* binding */ Bridge),
/* harmony export */   "MessengerInterface": () => (/* binding */ MessengerInterface)
/* harmony export */ });
/* eslint-disable no-unused-vars */
/**
 * @typedef PostMeConnection
 * @property {Function} localHandle  : get handle to the local end of the connection
 * @property {Function} remoteHandle : get handle to the remote end of the connection
 * @property {Function} close        : stop listening to incoming message from the other side
 */

/**
 * All bridges are supposed to implement this interface
 */
class Bridge {
  /**
   * Initialize the communication between the parent and the child via post-me protocol
   * https://github.com/alesgenova/post-me
   *
   * @param  {object} options                             : Options object
   * @param  {object} options.root                        : The object which will contain the exposed method names
   * @param  {Array.<string>} options.exposedMethodNames  : The list of method names of the root object, which will be exposed via the post-me interface to the content script
   * @param  {Array.<string>} options.listenedEventsNames : The list of method names of the root object, which will be call on given event name via the post-me interface to the content script
   * @param  {object} options.webViewRef                  : Reference to the webview obect containing the content script
   * @returns {Promise.<PostMeConnection>} : the resulting post-me connection
   */
  async init(options) {}

  /**
   * Shortcut to remoteHandle.call method
   *
   * @param  {string} method : The remote method name
   * @param  {Array} args    : Any number of parameters which will be given to the remote method.
   * It is also possible to pass callback functions (which must support serialization). post-me
   * will wait the the remote method end before resolving the promise
   * @returns {Promise.<any>} remote method return value
   */
  async call(method, ...args) {
    return this.remoteHandle.call(method, ...args)
  }

  /**
   * Shortcut to localHandle.emit method. Will emit an event which could be listened by the remote
   * object
   *
   * @param  {string} eventName : Name of the event
   * @param  {Array} args       : Any number of parameters.
   */
  emit(eventName, ...args) {
    this.localHandle.emit(eventName, ...args)
  }

  /**
   * Shortcut to remoteHandle.addEventListener method. Will listen to the given event on the remote
   * object and call the listener function
   *
   * @param  {string} remoteEventName : Name of the remove event
   * @param  {Function} listener      : Listener function
   */
  addEventListener(remoteEventName, listener) {
    this.remoteHandle.addEventListener(remoteEventName, listener)
  }

  /**
   * Shortcut to remoteHandle.removeEventListener method. Will stop listening to the given event
   * on the remote object.
   *
   * @param  {string} remoteEventName : Name of the remote event
   * @param  {Function} listener      : Previously defined listener function
   */
  removeEventListener(remoteEventName, listener) {
    this.remoteHandle.removeEventListener(remoteEventName, listener)
  }
}

/**
 * All messengers are supposed to implement this interface
 *
 * @interface
 */
class MessengerInterface {
  /**
   * Send a message to the other context
   *
   * @param {string} message : The payload of the message
   */
  postMessage(message) {}

  /**
   * Add a listener to messages received by the other context
   *
   * @param {Function} listener : A listener that will receive the MessageEvent
   * @returns {Function} A function that can be invoked to remove the listener
   */
  addMessageListener(listener) {}
}


/***/ }),
/* 73 */
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "BareMessenger": () => (/* binding */ BareMessenger),
/* harmony export */   "ChildHandshake": () => (/* binding */ ChildHandshake),
/* harmony export */   "ConcreteEmitter": () => (/* binding */ ConcreteEmitter),
/* harmony export */   "DebugMessenger": () => (/* binding */ DebugMessenger),
/* harmony export */   "ParentHandshake": () => (/* binding */ ParentHandshake),
/* harmony export */   "PortMessenger": () => (/* binding */ PortMessenger),
/* harmony export */   "WindowMessenger": () => (/* binding */ WindowMessenger),
/* harmony export */   "WorkerMessenger": () => (/* binding */ WorkerMessenger),
/* harmony export */   "debug": () => (/* binding */ debug)
/* harmony export */ });
const MARKER = '@post-me';
function createUniqueIdFn() {
    let __id = 0;
    return function () {
        const id = __id;
        __id += 1;
        return id;
    };
}

/**
 * A concrete implementation of the {@link Emitter} interface
 *
 * @public
 */
class ConcreteEmitter {
    constructor() {
        this._listeners = {};
    }
    /** {@inheritDoc Emitter.addEventListener} */
    addEventListener(eventName, listener) {
        let listeners = this._listeners[eventName];
        if (!listeners) {
            listeners = new Set();
            this._listeners[eventName] = listeners;
        }
        listeners.add(listener);
    }
    /** {@inheritDoc Emitter.removeEventListener} */
    removeEventListener(eventName, listener) {
        let listeners = this._listeners[eventName];
        if (!listeners) {
            return;
        }
        listeners.delete(listener);
    }
    /** {@inheritDoc Emitter.once} */
    once(eventName) {
        return new Promise((resolve) => {
            const listener = (data) => {
                this.removeEventListener(eventName, listener);
                resolve(data);
            };
            this.addEventListener(eventName, listener);
        });
    }
    /** @internal */
    emit(eventName, data) {
        let listeners = this._listeners[eventName];
        if (!listeners) {
            return;
        }
        listeners.forEach((listener) => {
            listener(data);
        });
    }
    /** @internal */
    removeAllListeners() {
        Object.values(this._listeners).forEach((listeners) => {
            if (listeners) {
                listeners.clear();
            }
        });
    }
}

var MessageType;
(function (MessageType) {
    MessageType["HandshakeRequest"] = "handshake-request";
    MessageType["HandshakeResponse"] = "handshake-response";
    MessageType["Call"] = "call";
    MessageType["Response"] = "response";
    MessageType["Error"] = "error";
    MessageType["Event"] = "event";
    MessageType["Callback"] = "callback";
})(MessageType || (MessageType = {}));
// Message Creators
function createHandshakeRequestMessage(sessionId) {
    return {
        type: MARKER,
        action: MessageType.HandshakeRequest,
        sessionId,
    };
}
function createHandshakeResponseMessage(sessionId) {
    return {
        type: MARKER,
        action: MessageType.HandshakeResponse,
        sessionId,
    };
}
function createCallMessage(sessionId, requestId, methodName, args) {
    return {
        type: MARKER,
        action: MessageType.Call,
        sessionId,
        requestId,
        methodName,
        args,
    };
}
function createResponsMessage(sessionId, requestId, result, error) {
    const message = {
        type: MARKER,
        action: MessageType.Response,
        sessionId,
        requestId,
    };
    if (result !== undefined) {
        message.result = result;
    }
    if (error !== undefined) {
        message.error = error;
    }
    return message;
}
function createCallbackMessage(sessionId, requestId, callbackId, args) {
    return {
        type: MARKER,
        action: MessageType.Callback,
        sessionId,
        requestId,
        callbackId,
        args,
    };
}
function createEventMessage(sessionId, eventName, payload) {
    return {
        type: MARKER,
        action: MessageType.Event,
        sessionId,
        eventName,
        payload,
    };
}
// Type Guards
function isMessage(m) {
    return m && m.type === MARKER;
}
function isHandshakeRequestMessage(m) {
    return isMessage(m) && m.action === MessageType.HandshakeRequest;
}
function isHandshakeResponseMessage(m) {
    return isMessage(m) && m.action === MessageType.HandshakeResponse;
}
function isCallMessage(m) {
    return isMessage(m) && m.action === MessageType.Call;
}
function isResponseMessage(m) {
    return isMessage(m) && m.action === MessageType.Response;
}
function isCallbackMessage(m) {
    return isMessage(m) && m.action === MessageType.Callback;
}
function isEventMessage(m) {
    return isMessage(m) && m.action === MessageType.Event;
}

function makeCallbackEvent(requestId) {
    return `callback_${requestId}`;
}
function makeResponseEvent(requestId) {
    return `response_${requestId}`;
}
class Dispatcher extends ConcreteEmitter {
    constructor(messenger, sessionId) {
        super();
        this.uniqueId = createUniqueIdFn();
        this.messenger = messenger;
        this.sessionId = sessionId;
        this.removeMessengerListener = this.messenger.addMessageListener(this.messengerListener.bind(this));
    }
    messengerListener(event) {
        const { data } = event;
        if (!isMessage(data)) {
            return;
        }
        if (this.sessionId !== data.sessionId) {
            return;
        }
        if (isCallMessage(data)) {
            this.emit(MessageType.Call, data);
        }
        else if (isResponseMessage(data)) {
            this.emit(makeResponseEvent(data.requestId), data);
        }
        else if (isEventMessage(data)) {
            this.emit(MessageType.Event, data);
        }
        else if (isCallbackMessage(data)) {
            this.emit(makeCallbackEvent(data.requestId), data);
        }
    }
    callOnRemote(methodName, args, transfer) {
        const requestId = this.uniqueId();
        const callbackEvent = makeCallbackEvent(requestId);
        const responseEvent = makeResponseEvent(requestId);
        const message = createCallMessage(this.sessionId, requestId, methodName, args);
        this.messenger.postMessage(message, transfer);
        return { callbackEvent, responseEvent };
    }
    respondToRemote(requestId, value, error, transfer) {
        if (error instanceof Error) {
            error = {
                name: error.name,
                message: error.message,
            };
        }
        const message = createResponsMessage(this.sessionId, requestId, value, error);
        this.messenger.postMessage(message, transfer);
    }
    callbackToRemote(requestId, callbackId, args) {
        const message = createCallbackMessage(this.sessionId, requestId, callbackId, args);
        this.messenger.postMessage(message);
    }
    emitToRemote(eventName, payload, transfer) {
        const message = createEventMessage(this.sessionId, eventName, payload);
        this.messenger.postMessage(message, transfer);
    }
    close() {
        this.removeMessengerListener();
        this.removeAllListeners();
    }
}
class ParentHandshakeDispatcher extends ConcreteEmitter {
    constructor(messenger, sessionId) {
        super();
        this.messenger = messenger;
        this.sessionId = sessionId;
        this.removeMessengerListener = this.messenger.addMessageListener(this.messengerListener.bind(this));
    }
    messengerListener(event) {
        const { data } = event;
        if (!isMessage(data)) {
            return;
        }
        if (this.sessionId !== data.sessionId) {
            return;
        }
        if (isHandshakeResponseMessage(data)) {
            this.emit(data.sessionId, data);
        }
    }
    initiateHandshake() {
        const message = createHandshakeRequestMessage(this.sessionId);
        this.messenger.postMessage(message);
        return this.sessionId;
    }
    close() {
        this.removeMessengerListener();
        this.removeAllListeners();
    }
}
class ChildHandshakeDispatcher extends ConcreteEmitter {
    constructor(messenger) {
        super();
        this.messenger = messenger;
        this.removeMessengerListener = this.messenger.addMessageListener(this.messengerListener.bind(this));
    }
    messengerListener(event) {
        const { data } = event;
        if (isHandshakeRequestMessage(data)) {
            this.emit(MessageType.HandshakeRequest, data);
        }
    }
    acceptHandshake(sessionId) {
        const message = createHandshakeResponseMessage(sessionId);
        this.messenger.postMessage(message);
    }
    close() {
        this.removeMessengerListener();
        this.removeAllListeners();
    }
}

var ProxyType;
(function (ProxyType) {
    ProxyType["Callback"] = "callback";
})(ProxyType || (ProxyType = {}));
function createCallbackProxy(callbackId) {
    return {
        type: MARKER,
        proxy: ProxyType.Callback,
        callbackId,
    };
}
function isCallbackProxy(p) {
    return p && p.type === MARKER && p.proxy === ProxyType.Callback;
}

class ConcreteRemoteHandle extends ConcreteEmitter {
    constructor(dispatcher) {
        super();
        this._dispatcher = dispatcher;
        this._callTransfer = {};
        this._dispatcher.addEventListener(MessageType.Event, this._handleEvent.bind(this));
    }
    close() {
        this.removeAllListeners();
    }
    setCallTransfer(methodName, transfer) {
        this._callTransfer[methodName] = transfer;
    }
    call(methodName, ...args) {
        return this.customCall(methodName, args);
    }
    customCall(methodName, args, options = {}) {
        return new Promise((resolve, reject) => {
            const sanitizedArgs = [];
            const callbacks = [];
            let callbackId = 0;
            args.forEach((arg) => {
                if (typeof arg === 'function') {
                    callbacks.push(arg);
                    sanitizedArgs.push(createCallbackProxy(callbackId));
                    callbackId += 1;
                }
                else {
                    sanitizedArgs.push(arg);
                }
            });
            const hasCallbacks = callbacks.length > 0;
            let callbackListener = undefined;
            if (hasCallbacks) {
                callbackListener = (data) => {
                    const { callbackId, args } = data;
                    callbacks[callbackId](...args);
                };
            }
            let transfer = options.transfer;
            if (transfer === undefined && this._callTransfer[methodName]) {
                transfer = this._callTransfer[methodName](...sanitizedArgs);
            }
            const { callbackEvent, responseEvent } = this._dispatcher.callOnRemote(methodName, sanitizedArgs, transfer);
            if (hasCallbacks) {
                this._dispatcher.addEventListener(callbackEvent, callbackListener);
            }
            this._dispatcher.once(responseEvent).then((response) => {
                if (callbackListener) {
                    this._dispatcher.removeEventListener(callbackEvent, callbackListener);
                }
                const { result, error } = response;
                if (error !== undefined) {
                    reject(error);
                }
                else {
                    resolve(result);
                }
            });
        });
    }
    _handleEvent(data) {
        const { eventName, payload } = data;
        this.emit(eventName, payload);
    }
}
class ConcreteLocalHandle {
    constructor(dispatcher, localMethods) {
        this._dispatcher = dispatcher;
        this._methods = localMethods;
        this._returnTransfer = {};
        this._emitTransfer = {};
        this._dispatcher.addEventListener(MessageType.Call, this._handleCall.bind(this));
    }
    emit(eventName, payload, options = {}) {
        let transfer = options.transfer;
        if (transfer === undefined && this._emitTransfer[eventName]) {
            transfer = this._emitTransfer[eventName](payload);
        }
        this._dispatcher.emitToRemote(eventName, payload, transfer);
    }
    setMethods(methods) {
        this._methods = methods;
    }
    setMethod(methodName, method) {
        this._methods[methodName] = method;
    }
    setReturnTransfer(methodName, transfer) {
        this._returnTransfer[methodName] = transfer;
    }
    setEmitTransfer(eventName, transfer) {
        this._emitTransfer[eventName] = transfer;
    }
    _handleCall(data) {
        const { requestId, methodName, args } = data;
        const callMethod = new Promise((resolve, reject) => {
            const method = this._methods[methodName];
            if (typeof method !== 'function') {
                reject(new Error(`The method "${methodName}" has not been implemented.`));
                return;
            }
            const desanitizedArgs = args.map((arg) => {
                if (isCallbackProxy(arg)) {
                    const { callbackId } = arg;
                    return (...args) => {
                        this._dispatcher.callbackToRemote(requestId, callbackId, args);
                    };
                }
                else {
                    return arg;
                }
            });
            Promise.resolve(this._methods[methodName](...desanitizedArgs))
                .then(resolve)
                .catch(reject);
        });
        callMethod
            .then((result) => {
            let transfer;
            if (this._returnTransfer[methodName]) {
                transfer = this._returnTransfer[methodName](result);
            }
            this._dispatcher.respondToRemote(requestId, result, undefined, transfer);
        })
            .catch((error) => {
            this._dispatcher.respondToRemote(requestId, undefined, error);
        });
    }
}

class ConcreteConnection {
    constructor(dispatcher, localMethods) {
        this._dispatcher = dispatcher;
        this._localHandle = new ConcreteLocalHandle(dispatcher, localMethods);
        this._remoteHandle = new ConcreteRemoteHandle(dispatcher);
    }
    close() {
        this._dispatcher.close();
        this.remoteHandle().close();
    }
    localHandle() {
        return this._localHandle;
    }
    remoteHandle() {
        return this._remoteHandle;
    }
}

const uniqueSessionId = createUniqueIdFn();
const runUntil = (worker, condition, unfulfilled, maxAttempts, attemptInterval) => {
    let attempt = 0;
    const fn = () => {
        if (!condition() && (attempt < maxAttempts || maxAttempts < 1)) {
            worker();
            attempt += 1;
            setTimeout(fn, attemptInterval);
        }
        else if (!condition() && attempt >= maxAttempts && maxAttempts >= 1) {
            unfulfilled();
        }
    };
    fn();
};
/**
 * Initiate the handshake from the Parent side
 *
 * @param messenger - The Messenger used to send and receive messages from the other end
 * @param localMethods - The methods that will be exposed to the other end
 * @param maxAttempts - The maximum number of handshake attempts
 * @param attemptsInterval - The interval between handshake attempts
 * @returns A Promise to an active {@link Connection} to the other end
 *
 * @public
 */
function ParentHandshake(messenger, localMethods = {}, maxAttempts = 5, attemptsInterval = 100) {
    const thisSessionId = uniqueSessionId();
    let connected = false;
    return new Promise((resolve, reject) => {
        const handshakeDispatcher = new ParentHandshakeDispatcher(messenger, thisSessionId);
        handshakeDispatcher.once(thisSessionId).then((response) => {
            connected = true;
            handshakeDispatcher.close();
            const { sessionId } = response;
            const dispatcher = new Dispatcher(messenger, sessionId);
            const connection = new ConcreteConnection(dispatcher, localMethods);
            resolve(connection);
        });
        runUntil(() => handshakeDispatcher.initiateHandshake(), () => connected, () => reject(new Error(`Handshake failed, reached maximum number of attempts`)), maxAttempts, attemptsInterval);
    });
}
/**
 * Initiate the handshake from the Child side
 *
 * @param messenger - The Messenger used to send and receive messages from the other end
 * @param localMethods - The methods that will be exposed to the other end
 * @returns A Promise to an active {@link Connection} to the other end
 *
 * @public
 */
function ChildHandshake(messenger, localMethods = {}) {
    return new Promise((resolve, reject) => {
        const handshakeDispatcher = new ChildHandshakeDispatcher(messenger);
        handshakeDispatcher.once(MessageType.HandshakeRequest).then((response) => {
            const { sessionId } = response;
            handshakeDispatcher.acceptHandshake(sessionId);
            handshakeDispatcher.close();
            const dispatcher = new Dispatcher(messenger, sessionId);
            const connection = new ConcreteConnection(dispatcher, localMethods);
            resolve(connection);
        });
    });
}

const acceptableMessageEvent = (event, remoteWindow, acceptedOrigin) => {
    const { source, origin } = event;
    if (source !== remoteWindow) {
        return false;
    }
    if (origin !== acceptedOrigin && acceptedOrigin !== '*') {
        return false;
    }
    return true;
};
/**
 * A concrete implementation of {@link Messenger} used to communicate with another Window.
 *
 * @public
 *
 */
class WindowMessenger {
    constructor({ localWindow, remoteWindow, remoteOrigin, }) {
        localWindow = localWindow || window;
        this.postMessage = (message, transfer) => {
            remoteWindow.postMessage(message, remoteOrigin, transfer);
        };
        this.addMessageListener = (listener) => {
            const outerListener = (event) => {
                if (acceptableMessageEvent(event, remoteWindow, remoteOrigin)) {
                    listener(event);
                }
            };
            localWindow.addEventListener('message', outerListener);
            const removeListener = () => {
                localWindow.removeEventListener('message', outerListener);
            };
            return removeListener;
        };
    }
}
/** @public */
class BareMessenger {
    constructor(postable) {
        this.postMessage = (message, transfer = []) => {
            postable.postMessage(message, transfer);
        };
        this.addMessageListener = (listener) => {
            const outerListener = (event) => {
                listener(event);
            };
            postable.addEventListener('message', outerListener);
            const removeListener = () => {
                postable.removeEventListener('message', outerListener);
            };
            return removeListener;
        };
    }
}
/**
 * A concrete implementation of {@link Messenger} used to communicate with a Worker.
 *
 * Takes a {@link Postable} representing the `Worker` (when calling from
 * the parent context) or the `self` `DedicatedWorkerGlobalScope` object
 * (when calling from the child context).
 *
 * @public
 *
 */
class WorkerMessenger extends BareMessenger {
    constructor({ worker }) {
        super(worker);
    }
}
/**
 * A concrete implementation of {@link Messenger} used to communicate with a MessagePort.
 *
 * @public
 *
 */
class PortMessenger extends BareMessenger {
    constructor({ port }) {
        port.start();
        super(port);
    }
}
/**
 * Create a logger function with a specific namespace
 *
 * @param namespace - The namespace will be prepended to all the arguments passed to the logger function
 * @param log - The underlying logger (`console.log` by default)
 *
 * @public
 *
 */
function debug(namespace, log) {
    log = log || console.debug || console.log || (() => { });
    return (...data) => {
        log(namespace, ...data);
    };
}
/**
 * Decorate a {@link Messenger} so that it will log any message exchanged
 * @param messenger - The Messenger that will be decorated
 * @param log - The logger function that will receive each message
 * @returns A decorated Messenger
 *
 * @public
 *
 */
function DebugMessenger(messenger, log) {
    log = log || debug('post-me');
    const debugListener = function (event) {
        const { data } = event;
        log('⬅️ received message', data);
    };
    messenger.addMessageListener(debugListener);
    return {
        postMessage: function (message, transfer) {
            log('➡️ sending message', message);
            messenger.postMessage(message, transfer);
        },
        addMessageListener: function (listener) {
            return messenger.addMessageListener(listener);
        },
    };
}




/***/ }),
/* 74 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "blobToBase64": () => (/* binding */ blobToBase64)
/* harmony export */ });
/**
 * Convert a blob object to a base64 uri
 *
 * @param {Blob} blob : blob object
 * @returns {Promise.<string>} : base64 form of the blob
 */
async function blobToBase64(blob) {
  const reader = new window.FileReader()
  await new Promise((resolve, reject) => {
    reader.onload = resolve
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
  return reader.result
}




/***/ }),
/* 75 */
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

(function (global, factory) {
	 true ? module.exports = factory() :
	0;
}(this, (function () { 'use strict';

	/*! MIT License © Sindre Sorhus */

	const globals = {};

	const getGlobal = property => {
		/* istanbul ignore next */
		if (typeof self !== 'undefined' && self && property in self) {
			return self;
		}

		/* istanbul ignore next */
		if (typeof window !== 'undefined' && window && property in window) {
			return window;
		}

		if (typeof __webpack_require__.g !== 'undefined' && __webpack_require__.g && property in __webpack_require__.g) {
			return __webpack_require__.g;
		}

		/* istanbul ignore next */
		if (typeof globalThis !== 'undefined' && globalThis) {
			return globalThis;
		}
	};

	const globalProperties = [
		'Headers',
		'Request',
		'Response',
		'ReadableStream',
		'fetch',
		'AbortController',
		'FormData'
	];

	for (const property of globalProperties) {
		Object.defineProperty(globals, property, {
			get() {
				const globalObject = getGlobal(property);
				const value = globalObject && globalObject[property];
				return typeof value === 'function' ? value.bind(globalObject) : value;
			}
		});
	}

	const isObject = value => value !== null && typeof value === 'object';
	const supportsAbortController = typeof globals.AbortController === 'function';
	const supportsStreams = typeof globals.ReadableStream === 'function';
	const supportsFormData = typeof globals.FormData === 'function';

	const mergeHeaders = (source1, source2) => {
		const result = new globals.Headers(source1 || {});
		const isHeadersInstance = source2 instanceof globals.Headers;
		const source = new globals.Headers(source2 || {});

		for (const [key, value] of source) {
			if ((isHeadersInstance && value === 'undefined') || value === undefined) {
				result.delete(key);
			} else {
				result.set(key, value);
			}
		}

		return result;
	};

	const deepMerge = (...sources) => {
		let returnValue = {};
		let headers = {};

		for (const source of sources) {
			if (Array.isArray(source)) {
				if (!(Array.isArray(returnValue))) {
					returnValue = [];
				}

				returnValue = [...returnValue, ...source];
			} else if (isObject(source)) {
				for (let [key, value] of Object.entries(source)) {
					if (isObject(value) && (key in returnValue)) {
						value = deepMerge(returnValue[key], value);
					}

					returnValue = {...returnValue, [key]: value};
				}

				if (isObject(source.headers)) {
					headers = mergeHeaders(headers, source.headers);
				}
			}

			returnValue.headers = headers;
		}

		return returnValue;
	};

	const requestMethods = [
		'get',
		'post',
		'put',
		'patch',
		'head',
		'delete'
	];

	const responseTypes = {
		json: 'application/json',
		text: 'text/*',
		formData: 'multipart/form-data',
		arrayBuffer: '*/*',
		blob: '*/*'
	};

	const retryMethods = [
		'get',
		'put',
		'head',
		'delete',
		'options',
		'trace'
	];

	const retryStatusCodes = [
		408,
		413,
		429,
		500,
		502,
		503,
		504
	];

	const retryAfterStatusCodes = [
		413,
		429,
		503
	];

	const stop = Symbol('stop');

	class HTTPError extends Error {
		constructor(response) {
			// Set the message to the status text, such as Unauthorized,
			// with some fallbacks. This message should never be undefined.
			super(
				response.statusText ||
				String(
					(response.status === 0 || response.status) ?
						response.status : 'Unknown response error'
				)
			);
			this.name = 'HTTPError';
			this.response = response;
		}
	}

	class TimeoutError extends Error {
		constructor(request) {
			super('Request timed out');
			this.name = 'TimeoutError';
			this.request = request;
		}
	}

	const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

	// `Promise.race()` workaround (#91)
	const timeout = (request, abortController, options) =>
		new Promise((resolve, reject) => {
			const timeoutID = setTimeout(() => {
				if (abortController) {
					abortController.abort();
				}

				reject(new TimeoutError(request));
			}, options.timeout);

			/* eslint-disable promise/prefer-await-to-then */
			options.fetch(request)
				.then(resolve)
				.catch(reject)
				.then(() => {
					clearTimeout(timeoutID);
				});
			/* eslint-enable promise/prefer-await-to-then */
		});

	const normalizeRequestMethod = input => requestMethods.includes(input) ? input.toUpperCase() : input;

	const defaultRetryOptions = {
		limit: 2,
		methods: retryMethods,
		statusCodes: retryStatusCodes,
		afterStatusCodes: retryAfterStatusCodes
	};

	const normalizeRetryOptions = (retry = {}) => {
		if (typeof retry === 'number') {
			return {
				...defaultRetryOptions,
				limit: retry
			};
		}

		if (retry.methods && !Array.isArray(retry.methods)) {
			throw new Error('retry.methods must be an array');
		}

		if (retry.statusCodes && !Array.isArray(retry.statusCodes)) {
			throw new Error('retry.statusCodes must be an array');
		}

		return {
			...defaultRetryOptions,
			...retry,
			afterStatusCodes: retryAfterStatusCodes
		};
	};

	// The maximum value of a 32bit int (see issue #117)
	const maxSafeTimeout = 2147483647;

	class Ky {
		constructor(input, options = {}) {
			this._retryCount = 0;
			this._input = input;
			this._options = {
				// TODO: credentials can be removed when the spec change is implemented in all browsers. Context: https://www.chromestatus.com/feature/4539473312350208
				credentials: this._input.credentials || 'same-origin',
				...options,
				headers: mergeHeaders(this._input.headers, options.headers),
				hooks: deepMerge({
					beforeRequest: [],
					beforeRetry: [],
					afterResponse: []
				}, options.hooks),
				method: normalizeRequestMethod(options.method || this._input.method),
				prefixUrl: String(options.prefixUrl || ''),
				retry: normalizeRetryOptions(options.retry),
				throwHttpErrors: options.throwHttpErrors !== false,
				timeout: typeof options.timeout === 'undefined' ? 10000 : options.timeout,
				fetch: options.fetch || globals.fetch
			};

			if (typeof this._input !== 'string' && !(this._input instanceof URL || this._input instanceof globals.Request)) {
				throw new TypeError('`input` must be a string, URL, or Request');
			}

			if (this._options.prefixUrl && typeof this._input === 'string') {
				if (this._input.startsWith('/')) {
					throw new Error('`input` must not begin with a slash when using `prefixUrl`');
				}

				if (!this._options.prefixUrl.endsWith('/')) {
					this._options.prefixUrl += '/';
				}

				this._input = this._options.prefixUrl + this._input;
			}

			if (supportsAbortController) {
				this.abortController = new globals.AbortController();
				if (this._options.signal) {
					this._options.signal.addEventListener('abort', () => {
						this.abortController.abort();
					});
				}

				this._options.signal = this.abortController.signal;
			}

			this.request = new globals.Request(this._input, this._options);

			if (this._options.searchParams) {
				const searchParams = '?' + new URLSearchParams(this._options.searchParams).toString();
				const url = this.request.url.replace(/(?:\?.*?)?(?=#|$)/, searchParams);

				// To provide correct form boundary, Content-Type header should be deleted each time when new Request instantiated from another one
				if (((supportsFormData && this._options.body instanceof globals.FormData) || this._options.body instanceof URLSearchParams) && !(this._options.headers && this._options.headers['content-type'])) {
					this.request.headers.delete('content-type');
				}

				this.request = new globals.Request(new globals.Request(url, this.request), this._options);
			}

			if (this._options.json !== undefined) {
				this._options.body = JSON.stringify(this._options.json);
				this.request.headers.set('content-type', 'application/json');
				this.request = new globals.Request(this.request, {body: this._options.body});
			}

			const fn = async () => {
				if (this._options.timeout > maxSafeTimeout) {
					throw new RangeError(`The \`timeout\` option cannot be greater than ${maxSafeTimeout}`);
				}

				await delay(1);
				let response = await this._fetch();

				for (const hook of this._options.hooks.afterResponse) {
					// eslint-disable-next-line no-await-in-loop
					const modifiedResponse = await hook(
						this.request,
						this._options,
						this._decorateResponse(response.clone())
					);

					if (modifiedResponse instanceof globals.Response) {
						response = modifiedResponse;
					}
				}

				this._decorateResponse(response);

				if (!response.ok && this._options.throwHttpErrors) {
					throw new HTTPError(response);
				}

				// If `onDownloadProgress` is passed, it uses the stream API internally
				/* istanbul ignore next */
				if (this._options.onDownloadProgress) {
					if (typeof this._options.onDownloadProgress !== 'function') {
						throw new TypeError('The `onDownloadProgress` option must be a function');
					}

					if (!supportsStreams) {
						throw new Error('Streams are not supported in your environment. `ReadableStream` is missing.');
					}

					return this._stream(response.clone(), this._options.onDownloadProgress);
				}

				return response;
			};

			const isRetriableMethod = this._options.retry.methods.includes(this.request.method.toLowerCase());
			const result = isRetriableMethod ? this._retry(fn) : fn();

			for (const [type, mimeType] of Object.entries(responseTypes)) {
				result[type] = async () => {
					this.request.headers.set('accept', this.request.headers.get('accept') || mimeType);

					const response = (await result).clone();

					if (type === 'json') {
						if (response.status === 204) {
							return '';
						}

						if (options.parseJson) {
							return options.parseJson(await response.text());
						}
					}

					return response[type]();
				};
			}

			return result;
		}

		_calculateRetryDelay(error) {
			this._retryCount++;

			if (this._retryCount < this._options.retry.limit && !(error instanceof TimeoutError)) {
				if (error instanceof HTTPError) {
					if (!this._options.retry.statusCodes.includes(error.response.status)) {
						return 0;
					}

					const retryAfter = error.response.headers.get('Retry-After');
					if (retryAfter && this._options.retry.afterStatusCodes.includes(error.response.status)) {
						let after = Number(retryAfter);
						if (Number.isNaN(after)) {
							after = Date.parse(retryAfter) - Date.now();
						} else {
							after *= 1000;
						}

						if (typeof this._options.retry.maxRetryAfter !== 'undefined' && after > this._options.retry.maxRetryAfter) {
							return 0;
						}

						return after;
					}

					if (error.response.status === 413) {
						return 0;
					}
				}

				const BACKOFF_FACTOR = 0.3;
				return BACKOFF_FACTOR * (2 ** (this._retryCount - 1)) * 1000;
			}

			return 0;
		}

		_decorateResponse(response) {
			if (this._options.parseJson) {
				response.json = async () => {
					return this._options.parseJson(await response.text());
				};
			}

			return response;
		}

		async _retry(fn) {
			try {
				return await fn();
			} catch (error) {
				const ms = Math.min(this._calculateRetryDelay(error), maxSafeTimeout);
				if (ms !== 0 && this._retryCount > 0) {
					await delay(ms);

					for (const hook of this._options.hooks.beforeRetry) {
						// eslint-disable-next-line no-await-in-loop
						const hookResult = await hook({
							request: this.request,
							options: this._options,
							error,
							retryCount: this._retryCount
						});

						// If `stop` is returned from the hook, the retry process is stopped
						if (hookResult === stop) {
							return;
						}
					}

					return this._retry(fn);
				}

				if (this._options.throwHttpErrors) {
					throw error;
				}
			}
		}

		async _fetch() {
			for (const hook of this._options.hooks.beforeRequest) {
				// eslint-disable-next-line no-await-in-loop
				const result = await hook(this.request, this._options);

				if (result instanceof Request) {
					this.request = result;
					break;
				}

				if (result instanceof Response) {
					return result;
				}
			}

			if (this._options.timeout === false) {
				return this._options.fetch(this.request.clone());
			}

			return timeout(this.request.clone(), this.abortController, this._options);
		}

		/* istanbul ignore next */
		_stream(response, onDownloadProgress) {
			const totalBytes = Number(response.headers.get('content-length')) || 0;
			let transferredBytes = 0;

			return new globals.Response(
				new globals.ReadableStream({
					start(controller) {
						const reader = response.body.getReader();

						if (onDownloadProgress) {
							onDownloadProgress({percent: 0, transferredBytes: 0, totalBytes}, new Uint8Array());
						}

						async function read() {
							const {done, value} = await reader.read();
							if (done) {
								controller.close();
								return;
							}

							if (onDownloadProgress) {
								transferredBytes += value.byteLength;
								const percent = totalBytes === 0 ? 0 : transferredBytes / totalBytes;
								onDownloadProgress({percent, transferredBytes, totalBytes}, value);
							}

							controller.enqueue(value);
							read();
						}

						read();
					}
				})
			);
		}
	}

	const validateAndMerge = (...sources) => {
		for (const source of sources) {
			if ((!isObject(source) || Array.isArray(source)) && typeof source !== 'undefined') {
				throw new TypeError('The `options` argument must be an object');
			}
		}

		return deepMerge({}, ...sources);
	};

	const createInstance = defaults => {
		const ky = (input, options) => new Ky(input, validateAndMerge(defaults, options));

		for (const method of requestMethods) {
			ky[method] = (input, options) => new Ky(input, validateAndMerge(defaults, options, {method}));
		}

		ky.HTTPError = HTTPError;
		ky.TimeoutError = TimeoutError;
		ky.create = newDefaults => createInstance(validateAndMerge(newDefaults));
		ky.extend = newDefaults => createInstance(validateAndMerge(defaults, newDefaults));
		ky.stop = stop;

		return ky;
	};

	var index = createInstance();

	return index;

})));


/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/global */
/******/ 	(() => {
/******/ 		__webpack_require__.g = (function() {
/******/ 			if (typeof globalThis === 'object') return globalThis;
/******/ 			try {
/******/ 				return this || new Function('return this')();
/******/ 			} catch (e) {
/******/ 				if (typeof window === 'object') return window;
/******/ 			}
/******/ 		})();
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be in strict mode.
(() => {
"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var cozy_ccc_libs_src_contentscript__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1);
/* harmony import */ var _cozy_minilog__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(58);
/* harmony import */ var _cozy_minilog__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_cozy_minilog__WEBPACK_IMPORTED_MODULE_1__);
 // FIXME replace src with dist when 0.3.0 version of cozy-ccc-libs is published

const log = _cozy_minilog__WEBPACK_IMPORTED_MODULE_1___default()('ContentScript')
_cozy_minilog__WEBPACK_IMPORTED_MODULE_1___default().enable()

const baseUrl = 'http://toscrape.com'
const defaultSelector = "a[href='http://quotes.toscrape.com']"
const loginLinkSelector = `[href='/login']`
const logoutLinkSelector = `[href='/logout']`

class TemplateContentScript extends cozy_ccc_libs_src_contentscript__WEBPACK_IMPORTED_MODULE_0__.ContentScript {
  async ensureAuthenticated() {
    await this.goto(baseUrl)
    await this.waitForElementInWorker(defaultSelector)
    await this.runInWorker('click', defaultSelector)
    // wait for both logout or login link to be sure to check authentication when ready
    await Promise.race([
      this.waitForElementInWorker(loginLinkSelector),
      this.waitForElementInWorker(logoutLinkSelector)
    ])
    const authenticated = await this.runInWorker('checkAuthenticated')
    if (!authenticated) {
      this.log('not authenticated')
      await this.showLoginFormAndWaitForAuthentication()
    }
    return true
  }

  async checkAuthenticated() {
    return Boolean(document.querySelector(logoutLinkSelector))
  }

  async showLoginFormAndWaitForAuthentication() {
    log.debug('showLoginFormAndWaitForAuthentication start')
    await this.clickAndWait(loginLinkSelector, '#username')
    await this.setWorkerState({ visible: true })
    await this.runInWorkerUntilTrue({
      method: 'waitForAuthenticated'
    })
    await this.setWorkerState({ visible: false })
  }

  async fetch(context) {
    log.debug(context, 'fetch context')
    const bookLinkSelector = `[href*='books.toscrape.com']`
    await this.goto(baseUrl + '/index.html')
    await this.waitForElementInWorker(bookLinkSelector)
    await this.clickAndWait(bookLinkSelector, '#promotions')
    const bills = await this.runInWorker('parseBills')

    for (const bill of bills) {
      await this.saveFiles([bill], {
        contentType: 'image/jpeg',
        fileIdAttributes: ['filename'],
        context
      })
    }
  }

  async getUserDataFromWebsite() {
    return {
      sourceAccountIdentifier: 'defaultTemplateSourceAccountIdentifier'
    }
  }

  async parseBills() {
    const articles = document.querySelectorAll('article')
    return Array.from(articles).map(article => ({
      amount: normalizePrice(article.querySelector('.price_color')?.innerHTML),
      filename: article.querySelector('h3 a')?.getAttribute('title'),
      fileurl:
        'https://books.toscrape.com/' +
        article.querySelector('img')?.getAttribute('src')
    }))
  }
}

// Convert a price string to a float
function normalizePrice(price) {
  return parseFloat(price.replace('£', '').trim())
}

const connector = new TemplateContentScript()
connector.init({ additionalExposedMethodsNames: ['parseBills'] }).catch(err => {
  log.warn(err)
})

})();

/******/ })()
;