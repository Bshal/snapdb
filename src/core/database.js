const _ = require('lodash');
const IndexManager = require('../indexing/indexManager');

class Database {
  constructor(adapter) {
    this.adapter = adapter;
    this.data = {};
    this.indexManager = new IndexManager();
  }

  async load() {
    this.data = await this.adapter.load();
    this.indexManager.initialize(this.data);
  }

  async save() {
    await this.adapter.save(this.data);
  }

  async insert(collection, item) {
    if (!this.data[collection]) {
      this.data[collection] = [];
    }
    this.data[collection].push(item);
    this.indexManager.add(collection, item);
    await this.save();
  }

  find(collection, query) {
    return this.indexManager.query(collection, query) || _.filter(this.data[collection], query);
  }

  async remove(collection, query) {
    if (!this.data[collection]) return;
    const itemsToRemove = _.filter(this.data[collection], query);
    _.remove(this.data[collection], query);
    this.indexManager.remove(collection, itemsToRemove);
    await this.save();
  }
}

module.exports = Database;
