'use strict';

var dbm;
var type;
var seed;
var fs = require('fs');
var path = require('path');
var Promise;

exports.setup = function(options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

exports.up = function(db) {
  var filePath = path.join(__dirname, 'sqls', '20260425000000-initial-schema-up.sql');
  return new Promise(function(resolve, reject) {
    fs.readFile(filePath, { encoding: 'utf-8' }, function(err, data) {
      if (err) return reject(err);
      resolve(data);
    });
  }).then(function(data) {
    return db.runSql(data);
  }).then(function() {
    return db.runSql(
      'CREATE TABLE IF NOT EXISTS loan_transitions (' +
      'id SERIAL PRIMARY KEY, ' +
      'loan_id INTEGER NOT NULL, ' +
      'from_status VARCHAR(32) NOT NULL, ' +
      'to_status VARCHAR(32) NOT NULL, ' +
      'transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ' +
      'triggered_by VARCHAR(32) NOT NULL CHECK (triggered_by IN (\'job\', \'api\', \'liquidation\'))' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_loan_transitions_loan_id ON loan_transitions (loan_id, transitioned_at);'
    );
  });
};

exports.down = function(db) {
  var filePath = path.join(__dirname, 'sqls', '20260425000000-initial-schema-down.sql');
  return new Promise(function(resolve, reject) {
    fs.readFile(filePath, { encoding: 'utf-8' }, function(err, data) {
      if (err) return reject(err);
      resolve(data);
    });
  }).then(function(data) {
    return db.runSql('DROP TABLE IF EXISTS loan_transitions;').then(function() {
      return db.runSql(data);
    });
  });
};

exports._meta = {
  version: 1
};
