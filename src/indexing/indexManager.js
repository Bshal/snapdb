class IndexManager {
  constructor() {
    this.indexes = {};
  }

  initialize(data) {
    for (const collection in data) {
      if (!this.indexes[collection]) {
        this.indexes[collection] = {};
      }
      for (const item of data[collection]) {
        this.add(collection, item);
      }
    }
  }

  add(collection, item) {
    if (!this.indexes[collection]) {
      this.indexes[collection] = {};
    }
    for (const key in item) {
      if (!this.indexes[collection][key]) {
        this.indexes[collection][key] = {};
      }
      const value = item[key];
      if (!this.indexes[collection][key][value]) {
        this.indexes[collection][key][value] = [];
      }
      this.indexes[collection][key][value].push(item);
    }
  }

  remove(collection, items) {
    for (const item of items) {
      for (const key in item) {
        const value = item[key];
        if (this.indexes[collection][key] && this.indexes[collection][key][value]) {
          this.indexes[collection][key][value] = this.indexes[collection][key][value].filter(i => i.id !== item.id);
        }
      }
    }
  }

  query(collection, query) {
    const keys = Object.keys(query);
    if (keys.length === 0) return [];
    const key = keys[0];
    const value = query[key];
    return this.indexes[collection] && this.indexes[collection][key] && this.indexes[collection][key][value]
      ? this.indexes[collection][key][value]
      : [];
  }
}

module.exports = IndexManager;
