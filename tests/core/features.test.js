const fs = require('fs');
const os = require('os');
const path = require('path');
const { Database, MemoryAdapter, FileAdapter, Collection } = require('../../src/core');

const people = () => [
  { id: 1, name: 'Alice', age: 28, city: 'New York', tags: ['admin', 'dev'], address: { zip: '10001' } },
  { id: 2, name: 'Bob', age: 30, city: 'Los Angeles', tags: ['dev'], address: { zip: '90001' } },
  { id: 3, name: 'Charlie', age: 28, city: 'New York', tags: [], address: { zip: '10002' } },
  { id: 4, name: 'Dana', age: 35, city: 'Boston' },
];

async function makeDb(options) {
  const db = new Database(new MemoryAdapter(), options);
  await db.load();
  await db.insert('users', people());
  return db;
}

const names = docs => docs.map(d => d.name);

describe('regressions from 1.0', () => {
  test('multi-field queries check every field', async () => {
    const db = await makeDb();
    expect(names(db.find('users', { age: 28, city: 'New York' }))).toEqual(['Alice', 'Charlie']);
    expect(names(db.find('users', { age: 28, city: 'Los Angeles' }))).toEqual([]);
  });

  test('numbers do not match strings', async () => {
    const db = await makeDb();
    await db.insert('users', { id: '1', name: 'StringId' });
    expect(names(db.find('users', { id: 1 }))).toEqual(['Alice']);
    expect(names(db.find('users', { id: '1' }))).toEqual(['StringId']);
  });

  test('values like "constructor" work', async () => {
    const db = await makeDb();
    await expect(db.insert('users', { id: 9, name: 'constructor' })).resolves.toBeDefined();
    expect(db.find('users', { name: 'constructor' })).toHaveLength(1);
  });

  test('clearing a returned array does not corrupt the index', async () => {
    const db = await makeDb();
    const res = db.find('users', { age: 28 });
    res.length = 0;
    expect(db.find('users', { age: 28 })).toHaveLength(2);
  });

  test('docs without an id can be removed', async () => {
    const db = await makeDb();
    await db.insert('notes', [{ text: 'a' }, { text: 'b' }]);
    expect(await db.remove('notes', { text: 'a' })).toBe(1);
    expect(db.find('notes', { text: 'b' })).toHaveLength(1);
    expect(db.find('notes', { text: 'a' })).toHaveLength(0);
  });

  test('editing a doc directly then calling save() keeps queries right', async () => {
    const db = await makeDb();
    db.find('users', { name: 'Alice' }); // builds a name index
    const alice = db.findOne('users', { id: 1 });
    alice.name = 'Alice Updated';
    await db.save();
    expect(names(db.find('users', { name: 'Alice Updated' }))).toEqual(['Alice Updated']);
    expect(db.find('users', { name: 'Alice' })).toEqual([]);
  });
});

describe('query operators', () => {
  let db;
  beforeAll(async () => { db = await makeDb(); });

  test.each([
    [{ age: { $gt: 28 } }, ['Bob', 'Dana']],
    [{ age: { $gte: 30, $lt: 35 } }, ['Bob']],
    [{ age: { $lte: 28 } }, ['Alice', 'Charlie']],
    [{ age: { $ne: 28 } }, ['Bob', 'Dana']],
    [{ age: { $eq: 30 } }, ['Bob']],
    [{ city: { $in: ['Boston', 'Los Angeles'] } }, ['Bob', 'Dana']],
    [{ city: { $nin: ['New York'] } }, ['Bob', 'Dana']],
    [{ tags: { $exists: false } }, ['Dana']],
    [{ name: { $regex: '^[ab]', $options: 'i' } }, ['Alice', 'Bob']],
    [{ name: /li/ }, ['Alice', 'Charlie']],
    [{ age: { $not: { $gt: 28 } } }, ['Alice', 'Charlie']],
    [{ tags: 'dev' }, ['Alice', 'Bob']],
    [{ tags: { $size: 0 } }, ['Charlie']],
    [{ tags: ['dev'] }, ['Bob']],
    [{ 'address.zip': '10002' }, ['Charlie']],
    [{ address: { zip: '90001' } }, ['Bob']],
    [{ $or: [{ age: 35 }, { name: 'Alice' }] }, ['Alice', 'Dana']],
    [{ $and: [{ age: 28 }, { name: { $ne: 'Alice' } }] }, ['Charlie']],
    [{ $nor: [{ age: 28 }, { age: 30 }] }, ['Dana']],
    [{ age: v => v % 2 === 1 }, ['Dana']],
  ])('%j', (query, expected) => {
    expect(names(db.find('users', query)).sort()).toEqual(expected);
  });

  test('function query', () => {
    expect(names(db.find('users', u => u.age > 29))).toEqual(['Bob', 'Dana']);
  });

  test('$elemMatch on arrays of objects', async () => {
    const d = new Database(new MemoryAdapter());
    await d.load();
    await d.insert('orders', [
      { id: 1, items: [{ sku: 'a', qty: 1 }, { sku: 'b', qty: 5 }] },
      { id: 2, items: [{ sku: 'a', qty: 3 }] },
    ]);
    expect(d.find('orders', { items: { $elemMatch: { sku: 'a', qty: { $gt: 2 } } } }).map(o => o.id)).toEqual([2]);
    expect(d.find('orders', { 'items.sku': 'b' }).map(o => o.id)).toEqual([1]);
  });

  test('unknown operators throw', () => {
    expect(() => db.find('users', { age: { $bogus: 1 } })).toThrow(/Unknown query operator/);
  });

  test('missing collection returns empty results', () => {
    expect(db.find('nope', {})).toEqual([]);
    expect(db.count('nope')).toBe(0);
    expect(db.findOne('nope', {})).toBeNull();
  });
});

describe('find options', () => {
  let db;
  beforeAll(async () => { db = await makeDb(); });

  test('sort, skip, limit', () => {
    expect(names(db.find('users', {}, { sort: { age: -1, name: 1 } }))).toEqual(['Dana', 'Bob', 'Alice', 'Charlie']);
    expect(names(db.find('users', {}, { sort: { age: 1, name: -1 }, skip: 1, limit: 2 }))).toEqual(['Alice', 'Bob']);
    expect(names(db.find('users', {}, { limit: 2 }))).toEqual(['Alice', 'Bob']);
    expect(names(db.find('users', {}, { skip: 3 }))).toEqual(['Dana']);
  });

  test('select includes or excludes fields', () => {
    expect(db.find('users', { id: 1 }, { select: ['id', 'name'] })).toEqual([{ id: 1, name: 'Alice' }]);
    const [bob] = db.find('users', { id: 2 }, { select: { tags: 0, address: 0 } });
    expect(bob).toEqual({ id: 2, name: 'Bob', age: 30, city: 'Los Angeles' });
  });

  test('findOne and count', () => {
    expect(db.findOne('users', { city: 'New York' }, { sort: { name: -1 } }).name).toBe('Charlie');
    expect(db.count('users')).toBe(4);
    expect(db.count('users', { age: 28 })).toBe(2);
  });
});

describe('update', () => {
  test('plain object merges into every match', async () => {
    const db = await makeDb();
    expect(await db.update('users', { age: 28 }, { city: 'Boston' })).toBe(2);
    expect(db.count('users', { city: 'Boston' })).toBe(3);
  });

  test('operators', async () => {
    const db = await makeDb();
    await db.updateOne('users', { id: 1 }, {
      $set: { 'address.city': 'NYC', active: true },
      $unset: { city: 1 },
      $inc: { age: 2, visits: 1 },
      $push: { tags: 'ops' },
      $addToSet: { roles: { $each: ['a', 'a', 'b'] } },
      $max: { score: 10 },
    });
    await db.updateOne('users', { id: 1 }, { $pull: { tags: 'dev' }, $min: { score: 3 } });
    expect(db.findOne('users', { id: 1 })).toEqual({
      id: 1, name: 'Alice', age: 30, tags: ['admin', 'ops'], address: { zip: '10001', city: 'NYC' },
      active: true, visits: 1, roles: ['a', 'b'], score: 3,
    });
  });

  test('function updates', async () => {
    const db = await makeDb();
    await db.update('users', { city: 'New York' }, u => { u.age += 1; });
    await db.updateOne('users', { id: 4 }, () => ({ city: 'Denver' }));
    expect(names(db.find('users', { age: 29 }))).toEqual(['Alice', 'Charlie']);
    expect(db.findOne('users', { id: 4 }).city).toBe('Denver');
  });

  test('keeps indexes in sync', async () => {
    const db = await makeDb();
    db.find('users', { city: 'Boston' }); // build city index
    await db.updateOne('users', { id: 4 }, { $set: { city: 'Miami' } });
    expect(db.find('users', { city: 'Boston' })).toEqual([]);
    expect(names(db.find('users', { city: 'Miami' }))).toEqual(['Dana']);
  });

  test('updateOne returns the doc or null', async () => {
    const db = await makeDb();
    expect((await db.updateOne('users', { id: 2 }, { age: 31 })).age).toBe(31);
    expect(await db.updateOne('users', { id: 99 }, { age: 1 })).toBeNull();
    expect(await db.update('users', { id: 99 }, { age: 1 })).toBe(0);
  });

  test('upsert inserts when nothing matches', async () => {
    const db = await makeDb();
    const doc = await db.updateOne('users', { id: 5, name: 'Eve' }, { $set: { age: 22 } }, { upsert: true });
    expect(doc).toEqual({ id: 5, name: 'Eve', age: 22 });
    expect(await db.update('users', { id: 6 }, { $inc: { n: 1 } }, { upsert: true })).toBe(1);
    expect(db.findOne('users', { id: 6 })).toEqual({ id: 6, n: 1 });
  });

  test('refuses prototype-polluting field names', async () => {
    const db = await makeDb();
    await expect(db.updateOne('users', { id: 1 }, { $set: { '__proto__.polluted': 1 } })).rejects.toThrow(/Unsafe/);
    await expect(db.updateOne('users', { id: 1 }, JSON.parse('{"__proto__": {"polluted": 1}}'))).rejects.toThrow(/Unsafe/);
    expect({}.polluted).toBeUndefined();
  });
});

describe('insert and remove', () => {
  test('insert accepts arrays and returns what was inserted', async () => {
    const db = new Database(new MemoryAdapter());
    await db.load();
    const one = await db.insert('users', { id: 1 });
    const many = await db.insertMany('users', [{ id: 2 }, { id: 3 }]);
    expect(one).toEqual({ id: 1 });
    expect(many).toHaveLength(2);
    expect(db.count('users')).toBe(3);
  });

  test('rejects non-objects', async () => {
    const db = await makeDb();
    await expect(db.insert('users', 'nope')).rejects.toThrow(TypeError);
    await expect(db.insert('users', [{ id: 9 }, null])).rejects.toThrow(TypeError);
    expect(db.count('users')).toBe(4);
  });

  test('remove returns how many were removed', async () => {
    const db = await makeDb();
    expect(await db.remove('users', { age: 28 })).toBe(2);
    expect(await db.remove('users', { age: 28 })).toBe(0);
    expect(names(db.find('users', {}))).toEqual(['Bob', 'Dana']);
    expect(await db.remove('missing', {})).toBe(0);
  });

  test('drop and collections', async () => {
    const db = await makeDb();
    await db.insert('posts', { id: 1 });
    expect(db.collections()).toEqual(['users', 'posts']);
    expect(await db.drop('posts')).toBe(true);
    expect(await db.drop('posts')).toBe(false);
    expect(db.collections()).toEqual(['users']);
  });
});

describe('unique indexes', () => {
  test('block duplicate inserts, all-or-nothing', async () => {
    const db = await makeDb();
    db.createIndex('users', 'id', { unique: true });
    await expect(db.insert('users', { id: 1, name: 'Dup' })).rejects.toThrow(/Duplicate/);
    await expect(db.insert('users', [{ id: 7 }, { id: 7 }])).rejects.toThrow(/Duplicate/);
    expect(db.count('users')).toBe(4);
    expect(db.find('users', { id: 7 })).toEqual([]);
  });

  test('block duplicate updates and roll the doc back', async () => {
    const db = await makeDb();
    db.createIndex('users', 'id', { unique: true });
    await expect(db.updateOne('users', { id: 2 }, { $set: { id: 1, name: 'Changed' } })).rejects.toThrow(/Duplicate/);
    expect(db.findOne('users', { id: 2 }).name).toBe('Bob');
  });

  test('getIndexes and dropIndex', async () => {
    const db = await makeDb();
    db.createIndex('users', 'id', { unique: true });
    expect(db.getIndexes('users')).toEqual([{ field: 'id', unique: true }]);
    expect(db.dropIndex('users', 'id')).toBe(true);
    await db.insert('users', { id: 1 });
    expect(db.count('users', { id: 1 })).toBe(2);
  });
});

describe('collection handle', () => {
  test('binds every method to one collection', async () => {
    const db = await makeDb();
    const users = db.collection('users');
    expect(users).toBeInstanceOf(Collection);
    await users.insert({ id: 5, name: 'Eve', age: 40 });
    await users.updateOne({ id: 5 }, { $inc: { age: 1 } });
    expect(users.findOne({ id: 5 }).age).toBe(41);
    expect(users.count({ age: { $gt: 30 } })).toBe(2);
    expect(await users.remove({ id: 5 })).toBe(1);
  });
});

describe('writes', () => {
  test('concurrent changes share disk writes', async () => {
    const adapter = new MemoryAdapter();
    const db = new Database(adapter);
    await db.load();
    const save = jest.spyOn(adapter, 'save');
    await Promise.all(Array.from({ length: 100 }, (_, i) => db.insert('users', { id: i })));
    expect(save.mock.calls.length).toBeLessThanOrEqual(2);
    expect(db.count('users')).toBe(100);
  });

  test('every awaited change is covered by a completed write', async () => {
    let saved = null;
    const adapter = {
      load: async () => ({}),
      save: async data => {
        const snapshot = JSON.stringify(data);
        await new Promise(r => setTimeout(r, 5));
        saved = snapshot;
      },
    };
    const db = new Database(adapter);
    await db.load();
    const first = db.insert('users', { id: 1 });
    await Promise.resolve();
    const second = db.insert('users', { id: 2 });
    await second;
    expect(JSON.parse(saved).users).toHaveLength(2);
    await first;
  });

  test('autosave: false writes only on save()', async () => {
    const adapter = new MemoryAdapter();
    const db = new Database(adapter, { autosave: false });
    await db.load();
    const save = jest.spyOn(adapter, 'save');
    await db.insert('users', [{ id: 1 }, { id: 2 }]);
    await db.update('users', {}, { x: 1 });
    expect(save).not.toHaveBeenCalled();
    await db.save();
    expect(save).toHaveBeenCalledTimes(1);
  });

  test('a failed write rejects and later writes still work', async () => {
    const adapter = new MemoryAdapter();
    const db = new Database(adapter);
    await db.load();
    jest.spyOn(adapter, 'save').mockRejectedValueOnce(new Error('disk full'));
    await expect(db.insert('users', { id: 1 })).rejects.toThrow('disk full');
    await expect(db.insert('users', { id: 2 })).resolves.toBeDefined();
    expect((await adapter.load()).users).toHaveLength(2);
  });

  test('FileAdapter round-trip on a real file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapdb-test-'));
    const file = path.join(dir, 'db.json');
    try {
      const db = new Database(new FileAdapter(file));
      await db.load();
      await Promise.all(people().map(p => db.insert('users', p)));
      await db.updateOne('users', { id: 1 }, { $set: { age: 29 } });
      await db.flush();

      const again = new Database(new FileAdapter(file));
      await again.load();
      expect(again.count('users')).toBe(4);
      expect(again.findOne('users', { id: 1 }).age).toBe(29);
      expect(fs.existsSync(`${file}.tmp`)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
