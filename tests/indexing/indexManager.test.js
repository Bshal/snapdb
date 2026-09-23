const IndexManager = require('../../src/indexing/indexManager');

describe('IndexManager', () => {
  let im;
  let docs;
  const lookup = (query) => [...(im.candidates('users', query, docs) || [])];

  beforeEach(() => {
    im = new IndexManager();
    docs = [
      { id: 1, name: 'Alice', age: 30, tags: ['a', 'b'] },
      { id: 2, name: 'Bob', age: 25, tags: ['b'] },
    ];
    im.create('users', 'name', docs);
    im.create('users', 'age', docs);
  });

  test('should add and query index', () => {
    expect(lookup({ name: 'Alice' })).toEqual([docs[0]]);
    expect(lookup({ age: 25 })).toEqual([docs[1]]);
  });

  test('should return empty array if no items match query', () => {
    expect(lookup({ name: 'Charlie' })).toEqual([]);
  });

  test('should remove from index', () => {
    im.remove('users', [docs[0]]);
    expect(lookup({ name: 'Alice' })).toEqual([]);
  });

  test('should handle removal of non-existent items gracefully', () => {
    im.remove('users', [{ id: 3, name: 'Charlie', age: 40 }]);
    expect(lookup({ name: 'Alice' })).toEqual([docs[0]]);
  });

  test('keeps numbers and strings apart', () => {
    const d = { id: 3, name: '30', age: '30' };
    im.add('users', d);
    expect(lookup({ age: 30 })).toEqual([docs[0]]);
    expect(lookup({ age: '30' })).toEqual([d]);
  });

  test('handles values that collide with Object.prototype', () => {
    const d = { id: 3, name: 'constructor' };
    expect(() => im.add('users', d)).not.toThrow();
    expect(lookup({ name: 'constructor' })).toEqual([d]);
    expect(lookup({ name: 'toString' })).toEqual([]);
  });

  test('indexes each element of array fields', () => {
    im.create('users', 'tags', docs);
    expect(lookup({ tags: 'b' })).toEqual(docs);
    expect(lookup({ tags: 'a' })).toEqual([docs[0]]);
  });

  test('uses the smallest bucket among equality fields', () => {
    for (let i = 0; i < 50; i++) {
      const d = { id: 10 + i, name: 'X', age: 99 };
      docs.push(d);
      im.add('users', d);
    }
    const y = { id: 100, name: 'Y', age: 99 };
    docs.push(y);
    im.add('users', y);
    expect(lookup({ name: 'Y', age: 99 })).toEqual([y]);
  });

  test('supports $in lookups', () => {
    expect(lookup({ age: { $in: [25, 30] } })).toHaveLength(2);
  });

  test('builds an index lazily on first query when autoIndex is on', () => {
    expect(im.list('users').map(i => i.field)).not.toContain('id');
    expect(lookup({ id: 2 })).toEqual([docs[1]]);
    expect(im.list('users').map(i => i.field)).toContain('id');
  });

  test('returns null (full scan) when autoIndex is off and no index exists', () => {
    const off = new IndexManager({ autoIndex: false });
    expect(off.candidates('users', { id: 1 }, docs)).toBeNull();
  });

  test('returns null for queries no index can serve', () => {
    expect(im.candidates('users', { age: { $gt: 1 } }, docs)).toBeNull();
    expect(im.candidates('users', { $or: [{ age: 1 }] }, docs)).toBeNull();
  });

  test('unique index rejects duplicates, including on create', () => {
    im.create('users', 'id', docs, { unique: true });
    expect(() => im.check('users', { id: 1 })).toThrow(/Duplicate/);
    expect(() => im.check('users', docs[0])).not.toThrow(); // a doc never conflicts with itself
    expect(() => im.create('users', 'tags', docs, { unique: true })).toThrow(/Duplicate/);
  });

  test('initialize rebuilds from data after direct edits', () => {
    docs[0].name = 'Alicia';
    im.initialize({ users: docs });
    expect(lookup({ name: 'Alicia' })).toEqual([docs[0]]);
    expect(lookup({ name: 'Alice' })).toEqual([]);
  });
});
