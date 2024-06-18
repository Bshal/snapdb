const IndexManager = require('../../src/indexing/indexManager');

describe('IndexManager', () => {
  let indexManager;

  beforeEach(() => {
    indexManager = new IndexManager();
    const data = {
      users: [
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 },
      ],
    };
    indexManager.initialize(data);
  });

  test('should add and query index', () => {
    const usersByName = indexManager.query('users', { name: 'Alice' });
    expect(usersByName).toEqual([{ id: 1, name: 'Alice', age: 30 }]);

    const usersByAge = indexManager.query('users', { age: 25 });
    expect(usersByAge).toEqual([{ id: 2, name: 'Bob', age: 25 }]);
  });

  test('should return empty array if no items match query', () => {
    const usersByName = indexManager.query('users', { name: 'Charlie' });
    expect(usersByName).toEqual([]);
  });

  test('should remove from index', () => {
    indexManager.remove('users', [{ id: 1, name: 'Alice', age: 30 }]);
    const usersByName = indexManager.query('users', { name: 'Alice' });
    expect(usersByName).toEqual([]);
  });

  test('should handle removal of non-existent items gracefully', () => {
    indexManager.remove('users', [{ id: 3, name: 'Charlie', age: 40 }]);
    const usersByName = indexManager.query('users', { name: 'Alice' });
    expect(usersByName).toEqual([{ id: 1, name: 'Alice', age: 30 }]);
  });
});
