class MemoryAdapter {
  constructor() {
    this.data = {};
  }

  async load() {
    return this.data;
  }

  async save(data) {
    this.data = data;
  }
}

module.exports = MemoryAdapter;
