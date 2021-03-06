'use strict';

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _ = require('lodash');
var chalk = require('chalk');
var uuid = require('uuid');
var mochaUtils = require('mocha/lib/utils');
var stringify = require('json-stringify-safe');
var diff = require('diff');
var stripAnsi = require('strip-ansi');

/**
 * Return a classname based on percentage
 *
 * @param {String} msg - message to log
 * @param {String} level - log level [log, info, warn, error]
 * @param {Object} config - configuration object
 */
function log(msg, level, config) {
  // Don't log messages in quiet mode
  if (config && config.quiet) return;
  var logMethod = console[level] || console.log;
  var out = msg;
  if ((typeof msg === 'undefined' ? 'undefined' : (0, _typeof3.default)(msg)) === 'object') {
    out = stringify(msg, null, 2);
  }
  logMethod('[' + chalk.gray('mochawesome') + '] ' + out + '\n');
}

/**
 * Return a classname based on percentage
 *
 * @param {Integer} pct - percentage
 *
 * @return {String} classname
 */
function getPercentClass(pct) {
  if (pct <= 50) {
    return 'danger';
  } else if (pct > 50 && pct < 80) {
    return 'warning';
  } else {
    return 'success';
  }
}

/**
 * Remove all properties from an object except
 * those that are in the propsToKeep array.
 *
 * @param {Object} obj - object to remove props from
 * @param {Array} propsToKeep - properties to keep
 */
function removeAllPropsFromObjExcept(obj, propsToKeep) {
  _.forOwn(obj, function (val, prop) {
    if (propsToKeep.indexOf(prop) === -1) {
      delete obj[prop];
    }
  });
}

/**
 * Strip the function definition from `str`,
 * and re-indent for pre whitespace.
 *
 * @param {String} str - code in
 *
 * @return {String} cleaned code string
 */
function cleanCode(str) {
  str = str.replace(/\r\n?|[\n\u2028\u2029]/g, '\n').replace(/^\uFEFF/, '').replace(/^function\s*\(.*\)\s*{|\(.*\)\s*=>\s*{?/, '').replace(/\s*\}$/, '');

  var spaces = str.match(/^\n?( *)/)[1].length;
  var tabs = str.match(/^\n?(\t*)/)[1].length;
  /* istanbul ignore next */
  var re = new RegExp('^\n?' + (tabs ? '\t' : ' ') + '{' + (tabs || spaces) + '}', 'gm');

  str = str.replace(re, '');
  str = str.replace(/^\s+|\s+$/g, '');
  return str;
}

/**
 * Create a unified diff between two strings
 *
 * @param {Error}  err          Error object
 * @param {string} err.actual   Actual result returned
 * @param {string} err.expected Result expected
 *
 * @return {string} diff
 */
function createUnifiedDiff(_ref) {
  var actual = _ref.actual,
      expected = _ref.expected;

  return diff.createPatch('string', actual, expected).split('\n').splice(4).map(function (line) {
    if (line.match(/@@/)) {
      return null;
    }
    if (line.match(/\\ No newline/)) {
      return null;
    }
    return line.replace(/^(-|\+)/, '$1 ');
  }).filter(function (line) {
    return typeof line !== 'undefined' && line !== null;
  }).join('\n');
}

/**
 * Create an inline diff between two strings
 *
 * @param {Error}  err          Error object
 * @param {string} err.actual   Actual result returned
 * @param {string} err.expected Result expected
 *
 * @return {array} diff string objects
 */
function createInlineDiff(_ref2) {
  var actual = _ref2.actual,
      expected = _ref2.expected;

  return diff.diffWordsWithSpace(actual, expected);
}

/**
 * Return a normalized error object
 *
 * @param {Error} err Error object
 *
 * @return {Object} normalized error
 */
function normalizeErr(err, config) {
  var name = err.name,
      message = err.message,
      actual = err.actual,
      expected = err.expected,
      stack = err.stack,
      showDiff = err.showDiff;

  var errMessage = void 0;
  var errDiff = void 0;

  /**
   * Check that a / b have the same type.
   */
  function sameType(a, b) {
    var objToString = Object.prototype.toString;
    return objToString.call(a) === objToString.call(b);
  }

  // Format actual/expected for creating diff
  if (showDiff !== false && sameType(actual, expected) && expected !== undefined) {
    /* istanbul ignore if */
    if (!(_.isString(actual) && _.isString(expected))) {
      err.actual = mochaUtils.stringify(actual);
      err.expected = mochaUtils.stringify(expected);
    }
    errDiff = config.useInlineDiffs ? createInlineDiff(err) : createUnifiedDiff(err);
  }

  // Assertion libraries do not output consitent error objects so in order to
  // get a consistent message object we need to create it ourselves
  if (name && message) {
    errMessage = name + ': ' + stripAnsi(message);
  } else if (stack) {
    errMessage = stack.replace(/\n.*/g, '');
  }

  return {
    message: errMessage,
    estack: stack && stripAnsi(stack),
    diff: errDiff
  };
}

/**
 * Return a plain-object representation of `test`
 * free of cyclic properties etc.
 *
 * @param {Object} test
 *
 * @return {Object} cleaned test
 */
function cleanTest(test, config) {
  /* istanbul ignore next: test.fn exists prior to mocha 2.4.0 */
  var code = test.fn ? test.fn.toString() : test.body;

  var cleaned = {
    title: test.title,
    fullTitle: _.isFunction(test.fullTitle) ? test.fullTitle() : /* istanbul ignore next */test.title,
    timedOut: test.timedOut,
    duration: test.duration || 0,
    state: test.state,
    speed: test.speed,
    pass: test.state === 'passed',
    fail: test.state === 'failed',
    pending: test.pending,
    context: stringify(test.context, null, 2),
    code: code && cleanCode(code),
    err: test.err && normalizeErr(test.err, config) || {},
    isRoot: test.parent && test.parent.root,
    uuid: test.uuid || /* istanbul ignore next: default */uuid.v4(),
    parentUUID: test.parent && test.parent.uuid,
    isHook: test.type === 'hook'
  };

  cleaned.skipped = !cleaned.pass && !cleaned.fail && !cleaned.pending && !cleaned.isHook;

  return cleaned;
}

/**
 * Mutates the suite object to add properties needed to render
 * the template and remove unused properties.
 *
 * @param {Object} suite
 * @param {Object} totalTestsRegistered
 * @param {Integer} totalTestsRegistered.total
 */
function cleanSuite(suite, totalTestsRegistered, config) {
  suite.uuid = uuid.v4();
  var beforeHooks = _.map([].concat(suite._beforeAll, suite._beforeEach), function (test) {
    return cleanTest(test, config);
  });
  var afterHooks = _.map([].concat(suite._afterAll, suite._afterEach), function (test) {
    return cleanTest(test, config);
  });
  var cleanTests = _.map(suite.tests, function (test) {
    return cleanTest(test, config);
  });
  var passingTests = _.filter(cleanTests, { state: 'passed' });
  var failingTests = _.filter(cleanTests, { state: 'failed' });
  var pendingTests = _.filter(cleanTests, { pending: true });
  var skippedTests = _.filter(cleanTests, { skipped: true });
  var duration = 0;

  _.each(cleanTests, function (test) {
    duration += test.duration;
  });

  totalTestsRegistered.total += suite.tests.length;

  suite.beforeHooks = beforeHooks;
  suite.afterHooks = afterHooks;
  suite.tests = cleanTests;
  suite.fullFile = suite.file || '';
  suite.file = suite.file ? suite.file.replace(process.cwd(), '') : '';
  suite.passes = passingTests;
  suite.failures = failingTests;
  suite.pending = pendingTests;
  suite.skipped = skippedTests;
  suite.hasBeforeHooks = suite.beforeHooks.length > 0;
  suite.hasAfterHooks = suite.afterHooks.length > 0;
  suite.hasTests = suite.tests.length > 0;
  suite.hasSuites = suite.suites.length > 0;
  suite.totalTests = suite.tests.length;
  suite.totalPasses = passingTests.length;
  suite.totalFailures = failingTests.length;
  suite.totalPending = pendingTests.length;
  suite.totalSkipped = skippedTests.length;
  suite.hasPasses = passingTests.length > 0;
  suite.hasFailures = failingTests.length > 0;
  suite.hasPending = pendingTests.length > 0;
  suite.hasSkipped = suite.skipped.length > 0;
  suite.duration = duration;
  suite.rootEmpty = suite.root && suite.totalTests === 0;

  removeAllPropsFromObjExcept(suite, ['title', 'fullFile', 'file', 'beforeHooks', 'afterHooks', 'tests', 'suites', 'passes', 'failures', 'pending', 'skipped', 'hasBeforeHooks', 'hasAfterHooks', 'hasTests', 'hasSuites', 'totalTests', 'totalPasses', 'totalFailures', 'totalPending', 'totalSkipped', 'hasPasses', 'hasFailures', 'hasPending', 'hasSkipped', 'root', 'uuid', 'duration', 'rootEmpty', '_timeout']);
}

/**
 * Do a breadth-first search to find
 * and format all nested 'suite' objects.
 *
 * @param {Object} suite
 * @param {Object} totalTestsRegistered
 * @param {Integer} totalTestsRegistered.total
 */
function traverseSuites(suite, totalTestsRegistered, config) {
  var queue = [];
  var next = suite;
  while (next) {
    if (next.root) {
      cleanSuite(next, totalTestsRegistered, config);
    }
    if (next.suites.length) {
      _.each(next.suites, function (nextSuite, i) {
        cleanSuite(nextSuite, totalTestsRegistered, config);
        queue.push(nextSuite);
      });
    }
    next = queue.shift();
  }
}

module.exports = {
  log: log,
  getPercentClass: getPercentClass,
  removeAllPropsFromObjExcept: removeAllPropsFromObjExcept,
  cleanCode: cleanCode,
  cleanTest: cleanTest,
  cleanSuite: cleanSuite,
  traverseSuites: traverseSuites
};