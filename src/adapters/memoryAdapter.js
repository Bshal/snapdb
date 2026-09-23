class MemoryAdapter {
  constructor(initialData = {}) {
    this.data = initialData;
  }

  async load() {
    return this.data;
  }

  async save(data) {
    this.data = data;
  }
}

module.exports = MemoryAdapter;
