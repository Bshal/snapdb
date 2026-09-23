const Database = require('./database');
const Collection = require('./collection');
const FileAdapter = require('../adapters/fileAdapter');
const MemoryAdapter = require('../adapters/memoryAdapter');

module.exports = {
  Database,
  Collection,
  FileAdapter,
  MemoryAdapter
};
