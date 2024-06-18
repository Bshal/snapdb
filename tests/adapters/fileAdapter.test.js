const FileAdapter = require('../../src/adapters/fileAdapter');
const fs = require('fs').promises;
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
  },
}));

describe('FileAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new FileAdapter('db.json');
  });

  test('should load data from file', async () => {
    fs.readFile.mockResolvedValue(JSON.stringify({ users: [] }));
    const data = await adapter.load();
    expect(data).toEqual({ users: [] });
  });

  test('should save data to file', async () => {
    const data = { users: [{ id: 1, name: 'Alice' }] };
    await adapter.save(data);
    expect(fs.writeFile).toHaveBeenCalledWith('db.json', JSON.stringify(data, null, 2));
  });

  test('should log error if reading file fails', async () => {
    fs.readFile.mockRejectedValue(new Error('Read error'));
    await expect(adapter.load()).rejects.toThrow('Read error');
  });

  test('should log error if writing file fails', async () => {
    fs.writeFile.mockRejectedValue(new Error('Write error'));
    await expect(adapter.save({})).rejects.toThrow('Write error');
  });
});
