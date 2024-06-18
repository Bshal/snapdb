const MemoryAdapter = require('../../src/adapters/memoryAdapter');

describe('MemoryAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
  });

  test('should load data from memory', async () => {
    const data = await adapter.load();
    expect(data).toEqual({});
  });

  test('should save data to memory', async () => {
    const data = { users: [{ id: 1, name: 'Alice' }] };
    await adapter.save(data);
    const savedData = await adapter.load();
    expect(savedData).toEqual(data);
  });
});
