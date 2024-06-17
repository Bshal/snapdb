const Database = require('./database');
const FileAdapter = require('../adapters/fileAdapter');
const MemoryAdapter = require('../adapters/memoryAdapter');

module.exports = {
  Database,
  FileAdapter,
  MemoryAdapter
};
