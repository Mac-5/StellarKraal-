'use strict';
const path = require('path');
const fs = require('fs');
exports.up = function (db) {
  return db.runSql(fs.readFileSync(path.join(__dirname, 'sqls', '20261016000001-add-loan-repayment-submissions-up.sql'), 'utf8'));
};
exports.down = function (db) {
  return db.runSql(fs.readFileSync(path.join(__dirname, 'sqls', '20261016000001-add-loan-repayment-submissions-down.sql'), 'utf8'));
};
