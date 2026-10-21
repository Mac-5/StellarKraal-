'use strict';
const path = require('path');
const fs = require('fs');
exports.up = function (db) {
  return db.runSql(fs.readFileSync(path.join(__dirname, 'sqls', '20261016000000-add-refresh-tokens-up.sql'), 'utf8'));
};
exports.down = function (db) {
  return db.runSql(fs.readFileSync(path.join(__dirname, 'sqls', '20261016000000-add-refresh-tokens-down.sql'), 'utf8'));
};
