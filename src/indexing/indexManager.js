class IndexManager {
  constructor() {
    this.indexes = {};
  }

  initialize(data) {
    for (const collection in data) {
      this.indexes[collection] = {};
      for (const item of data[collection]) {
        this.add(collection, item);
      }
    }
  }

  add(collection, item) {
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
        const indexArray = this.indexes[collection][key][value];
        if (indexArray) {
          this.indexes[collection][key][value] = indexArray.filter(i => i !== item);
        }
      }
    }
  }

  query(collection, query) {
    const queryKeys = Object.keys(query);
    if (queryKeys.length === 1) {
      const key = queryKeys[0];
      const value = query[key];
      return this.indexes[collection][key] && this.indexes[collection][key][value]
        ? this.indexes[collection][key][value]
        : null;
    }
    return null;
  }
}

module.exports = IndexManager;
