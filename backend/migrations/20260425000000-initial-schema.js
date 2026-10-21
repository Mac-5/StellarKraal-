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

function readSql(fileName) {
  var filePath = path.join(__dirname, 'sqls', fileName);
  return new Promise(function(resolve, reject) {
    fs.readFile(filePath, { encoding: 'utf-8' }, function(err, data) {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

// Split a SQL script into individual statements so each can be executed
// through the driver. This keeps the migration portable across SQLite and
// PostgreSQL, which do not both accept multi-statement runSql payloads.
function splitStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map(function(statement) {
      return statement.trim();
    })
    .filter(function(statement) {
      return statement.length > 0 && statement.indexOf('--') !== 0;
    });
}

function runScript(db, fileName) {
  return readSql(fileName).then(function(sql) {
    var statements = splitStatements(sql);
    return statements.reduce(function(chain, statement) {
      return chain.then(function() {
        return db.runSql(statement);
      });
    }, Promise.resolve());
  });
}

exports.up = function(db) {
  return runScript(db, '20260425000000-initial-schema-up.sql');
};

exports.down = function(db) {
  return runScript(db, '20260425000000-initial-schema-down.sql');
};

exports._meta = {
  version: 1
};
