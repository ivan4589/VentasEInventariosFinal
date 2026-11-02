'use strict';

// ExcelJS's archiver-utils and rimraf use only these legacy entrypoints.
// Pattern parsing and traversal are delegated to the maintained glob library.
const modern = require('glob');

function legacyGlob(pattern, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = undefined;
  }
  const matches = Promise.resolve().then(() => modern.glob(pattern, options || {}));
  if (typeof callback === 'function') {
    matches.then(result => callback(null, result), error => callback(error));
  }
  return matches;
}

legacyGlob.glob = legacyGlob;
legacyGlob.sync = (pattern, options) => modern.globSync(pattern, options || {});
legacyGlob.hasMagic = (pattern, options) => modern.hasMagic(pattern, {
  magicalBraces: true,
  ...options,
});

module.exports = legacyGlob;
