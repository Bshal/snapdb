const fs = require('fs').promises;

class FileAdapter {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async load() {
    try {
      const fileData = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(fileData);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this.save({});
        return {};
      } else {
        throw error;
      }
    }
  }

  async save(data) {
    const fileData = JSON.stringify(data, null, 2);
    await fs.writeFile(this.filePath, fileData);
  }
}

module.exports = FileAdapter;
