const FileAdapter = require('../../src/adapters/fileAdapter');
const fs = require('fs').promises;
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    rename: jest.fn(),
  },
}));

describe('FileAdapter', () => {
  let adapter;

  beforeEach(() => {
    jest.resetAllMocks();
    adapter = new FileAdapter('db.json');
  });

  test('should load data from file', async () => {
    fs.readFile.mockResolvedValue(JSON.stringify({ users: [] }));
    const data = await adapter.load();
    expect(data).toEqual({ users: [] });
  });

  test('should treat an empty file as an empty database', async () => {
    fs.readFile.mockResolvedValue('  \n');
    expect(await adapter.load()).toEqual({});
  });

  test('should create the file when it does not exist', async () => {
    fs.readFile.mockRejectedValue(Object.assign(new Error('nope'), { code: 'ENOENT' }));
    expect(await adapter.load()).toEqual({});
    expect(fs.rename).toHaveBeenCalledWith('db.json.tmp', 'db.json');
  });

  test('should save compact JSON atomically via a temp file', async () => {
    const data = { users: [{ id: 1, name: 'Alice' }] };
    await adapter.save(data);
    expect(fs.writeFile).toHaveBeenCalledWith('db.json.tmp', JSON.stringify(data));
    expect(fs.rename).toHaveBeenCalledWith('db.json.tmp', 'db.json');
  });

  test('should pretty-print when asked', async () => {
    const data = { users: [] };
    await new FileAdapter('db.json', { pretty: true }).save(data);
    expect(fs.writeFile).toHaveBeenCalledWith('db.json.tmp', JSON.stringify(data, null, 2));
  });

  test('should write directly when atomic is off', async () => {
    await new FileAdapter('db.json', { atomic: false }).save({});
    expect(fs.writeFile).toHaveBeenCalledWith('db.json', '{}');
    expect(fs.rename).not.toHaveBeenCalled();
  });

  test('should retry rename when the file is briefly locked', async () => {
    fs.rename
      .mockRejectedValueOnce(Object.assign(new Error('locked'), { code: 'EPERM' }))
      .mockResolvedValueOnce();
    await adapter.save({});
    expect(fs.rename).toHaveBeenCalledTimes(2);
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
