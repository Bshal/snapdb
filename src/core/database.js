const _ = require('lodash');
const IndexManager = require('../indexing/indexManager');
const logger = require('../utils/logger');

class Database {
  constructor(adapter) {
    this.adapter = adapter;
    this.data = {};
    this.indexManager = new IndexManager();
  }

  async load() {
    try {
      this.data = await this.adapter.load();
      this.indexManager.initialize(this.data);
    } catch (error) {
      logger.error(`Error loading database: ${error.message}`);
      throw error;
    }
  }

  async save() {
    try {
      await this.adapter.save(this.data);
    } catch (error) {
      logger.error(`Error saving database: ${error.message}`);
      throw error;
    }
  }

  async insert(collection, item) {
    try {
      if (!this.data[collection]) {
        this.data[collection] = [];
      }
      this.data[collection].push(item);
      this.indexManager.add(collection, item);
      await this.save();
    } catch (error) {
      logger.error(`Error inserting item into ${collection}: ${error.message}`);
      throw error;
    }
  }

  find(collection, query) {
    try {
      const indexedResults = this.indexManager.query(collection, query);
      return indexedResults.length > 0 ? indexedResults : _.filter(this.data[collection], query);
    } catch (error) {
      logger.error(`Error querying ${collection} with ${JSON.stringify(query)}: ${error.message}`);
      throw error;
    }
  }

  async remove(collection, query) {
    try {
      if (!this.data[collection]) return;
      const itemsToRemove = _.filter(this.data[collection], query);
      _.remove(this.data[collection], query);
      this.indexManager.remove(collection, itemsToRemove);
      await this.save();
    } catch (error) {
      logger.error(`Error removing items from ${collection} with ${JSON.stringify(query)}: ${error.message}`);
      throw error;
    }
  }
}

module.exports = Database;
