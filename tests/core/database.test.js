const Database = require('../../src/core/database');
const MemoryAdapter = require('../../src/adapters/memoryAdapter');

describe('Database', () => {
  let db;

  beforeEach(async () => {
    const adapter = new MemoryAdapter();
    db = new Database(adapter);
    await db.load();
  });

  describe('load', () => {
    test('should load data from adapter', async () => {
      const adapter = new MemoryAdapter();
      adapter.load = jest.fn().mockResolvedValue({ users: [] });
      db = new Database(adapter);
      await db.load();
      expect(adapter.load).toHaveBeenCalled();
      expect(db.data).toEqual({ users: [] });
    });

    test('should log error if loading fails', async () => {
      const adapter = new MemoryAdapter();
      const error = new Error('Load error');
      adapter.load = jest.fn().mockRejectedValue(error);
      db = new Database(adapter);
      await expect(db.load()).rejects.toThrow('Load error');
    });
  });

  describe('save', () => {
    test('should save data to adapter', async () => {
      const adapter = new MemoryAdapter();
      adapter.save = jest.fn().mockResolvedValue();
      db = new Database(adapter);
      await db.save();
      expect(adapter.save).toHaveBeenCalledWith(db.data);
    });

    test('should log error if saving fails', async () => {
      const adapter = new MemoryAdapter();
      const error = new Error('Save error');
      adapter.save = jest.fn().mockRejectedValue(error);
      db = new Database(adapter);
      await expect(db.save()).rejects.toThrow('Save error');
    });
  });

  describe('insert', () => {
    test('should insert item into collection', async () => {
      await db.insert('users', { id: 1, name: 'Alice' });
      expect(db.data.users).toEqual([{ id: 1, name: 'Alice' }]);
    });

    test('should create collection if it does not exist', async () => {
      await db.insert('products', { id: 1, name: 'Laptop' });
      expect(db.data.products).toEqual([{ id: 1, name: 'Laptop' }]);
    });

    test('should log error if insertion fails', async () => {
      db.save = jest.fn().mockRejectedValue(new Error('Save error'));
      await expect(db.insert('users', { id: 1, name: 'Alice' })).rejects.toThrow('Save error');
    });
  });

  describe('find', () => {
    beforeEach(async () => {
      await db.insert('users', { id: 1, name: 'Alice' });
      await db.insert('users', { id: 2, name: 'Bob' });
    });

    test('should find items matching query', () => {
      const results = db.find('users', { name: 'Alice' });
      expect(results).toEqual([{ id: 1, name: 'Alice' }]);
    });

    test('should return empty array if no items match query', () => {
      const results = db.find('users', { name: 'Charlie' });
      expect(results).toEqual([]);
    });

    test('should log error if query fails', () => {
      db.indexManager.query = jest.fn().mockImplementation(() => { throw new Error('Query error'); });
      expect(() => db.find('users', { name: 'Alice' })).toThrow('Query error');
    });
  });

  describe('remove', () => {
    beforeEach(async () => {
      await db.insert('users', { id: 1, name: 'Alice' });
      await db.insert('users', { id: 2, name: 'Bob' });
    });

    test('should remove items matching query', async () => {
      await db.remove('users', { name: 'Alice' });
      expect(db.data.users).toEqual([{ id: 2, name: 'Bob' }]);
    });

    test('should do nothing if no items match query', async () => {
      await db.remove('users', { name: 'Charlie' });
      expect(db.data.users).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
    });

    test('should log error if removal fails', async () => {
      db.save = jest.fn().mockRejectedValue(new Error('Save error'));
      await expect(db.remove('users', { name: 'Alice' })).rejects.toThrow('Save error');
    });
  });
});
