const fs = require('fs').promises;

const RETRYABLE = new Set(['EPERM', 'EACCES', 'EBUSY']);

class FileAdapter {
  /**
   * @param filePath         path to the JSON file
   * @param options.pretty   indent the JSON (easier to read, slower and bigger; default false)
   * @param options.atomic   write via temp file + rename so a crash can't corrupt the file
   *                         (default true; false is faster per save, mainly on Windows)
   */
  constructor(filePath, { pretty = false, atomic = true } = {}) {
    this.filePath = filePath;
    this.pretty = pretty;
    this.atomic = atomic;
  }

  async load() {
    try {
      const fileData = await fs.readFile(this.filePath, 'utf8');
      return fileData.trim() ? JSON.parse(fileData) : {};
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this.save({});
        return {};
      }
      throw error;
    }
  }

  // Writes to a temp file then renames it over the real one, so a crash
  // mid-write never leaves a half-written database behind.
  async save(data) {
    const fileData = this.pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    if (!this.atomic) return fs.writeFile(this.filePath, fileData);
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, fileData);
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(tmpPath, this.filePath);
        return;
      } catch (error) {
        // On Windows the target can be briefly locked (antivirus, indexer)
        if (!RETRYABLE.has(error.code) || attempt >= 5) throw error;
        await new Promise(r => setTimeout(r, 10 * 2 ** attempt));
      }
    }
  }
}

module.exports = FileAdapter;
