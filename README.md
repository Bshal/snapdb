# SnapDB

> A fast, zero-dependency JSON database for Node.js. MongoDB-style queries, automatic indexing, atomic file writes, and batched saves.

## Installation

```bash
npm install @bshal/snapdb
```

Requires Node.js 18+. TypeScript types are included.

## Quick start

```javascript
const { Database, FileAdapter } = require('@bshal/snapdb');

(async () => {
  const db = new Database(new FileAdapter('db.json'));
  await db.load();

  const users = db.collection('users');

  await users.insert([
    { id: 1, name: 'Alice', age: 28, city: 'New York', tags: ['admin'] },
    { id: 2, name: 'Bob', age: 30, city: 'Los Angeles', tags: [] },
    { id: 3, name: 'Charlie', age: 28, city: 'New York', tags: ['dev'] },
  ]);

  users.find({ age: 28, city: 'New York' });                 // Alice, Charlie
  users.find({ age: { $gte: 29 } });                          // Bob
  users.find({}, { sort: { age: -1 }, limit: 2, select: ['name'] });
  users.findOne({ id: 1 });                                   // Alice
  users.count({ tags: 'admin' });                             // 1

  await users.updateOne({ id: 1 }, { $inc: { age: 1 }, $push: { tags: 'ops' } });
  await users.update({ city: 'New York' }, { $set: { country: 'US' } }); // -> 2
  await users.remove({ id: 2 });                              // -> 1
})();
```

Every method also works directly on the database with the collection name first, e.g. `db.find('users', { id: 1 })`, so code written for SnapDB 1.0 keeps working.

## Queries

A query is an object (or a function `doc => boolean`). Plain values match by equality; every field in the query must match.

| Operator | Example |
| --- | --- |
| equality | `{ city: 'New York' }`, `{ 'address.zip': '10001' }` |
| `$eq` `$ne` | `{ age: { $ne: 30 } }` |
| `$gt` `$gte` `$lt` `$lte` | `{ age: { $gte: 18, $lt: 65 } }` |
| `$in` `$nin` | `{ city: { $in: ['NY', 'LA'] } }` |
| `$exists` | `{ email: { $exists: true } }` |
| `$regex` / RegExp | `{ name: /^al/i }`, `{ name: { $regex: '^al', $options: 'i' } }` |
| `$not` | `{ age: { $not: { $gt: 30 } } }` |
| `$size` | `{ tags: { $size: 0 } }` |
| `$elemMatch` | `{ items: { $elemMatch: { sku: 'a', qty: { $gt: 2 } } } }` |
| `$and` `$or` `$nor` | `{ $or: [{ age: 28 }, { city: 'LA' }] }` |
| function | `{ age: v => v % 2 === 0 }` or `doc => doc.age > 21` |

Matching rules:
- Numbers and strings are different: `{ id: 1 }` does not match `{ id: '1' }`.
- If the field holds an array, a plain value matches when the array contains it: `{ tags: 'dev' }`.
- An array value must match exactly: `{ tags: ['a', 'b'] }`.
- An object value matches partially: `{ address: { zip: '10001' } }` ignores other address fields.
- Dot paths reach into nested objects and arrays of objects: `{ 'items.sku': 'a' }`.

### Find options

```javascript
db.find('users', query, {
  sort: { age: -1, name: 1 },  // or a comparator (a, b) => number
  skip: 20,
  limit: 10,
  select: ['id', 'name'],      // or { password: 0 } to leave fields out
});
```

## Updates

`update` changes every match and resolves to the number updated. `updateOne` changes the first match and resolves to the doc (or `null`).

```javascript
await users.updateOne({ id: 1 }, {
  $set: { 'address.city': 'NYC' },
  $unset: { oldField: 1 },
  $inc: { visits: 1 },
  $min: { lowScore: 3 },
  $max: { highScore: 10 },
  $push: { tags: 'new' },                    // or { $each: ['a', 'b'] }
  $addToSet: { roles: 'editor' },            // push only if missing
  $pull: { tags: 'old' },                    // or a condition: { scores: { $lt: 5 } }
});

await users.update({ age: 28 }, { city: 'Boston' });        // plain object = merge
await users.update({ age: 28 }, u => { u.age += 1; });      // function: edit in place
await users.updateOne({ email: 'a@b.c' }, { $set: { name: 'A' } }, { upsert: true }); // insert if missing
```

You can also edit a doc you got back from `find` and then call `db.save()`. `save()` rebuilds the indexes, so later queries see your edits.

## Indexes

You don't have to create indexes by hand. The first time you query a field by equality (`{ email: 'x' }`, `$eq` or `$in`), SnapDB builds an index for it and keeps it up to date from then on. Fields you never query cost nothing. When a query has several equality fields, SnapDB uses the one with the fewest matches.

```javascript
users.createIndex('email', { unique: true }); // duplicate emails now throw on insert/update
users.getIndexes();                           // [{ field: 'email', unique: true }]
users.dropIndex('email');
```

Unique constraints are all-or-nothing: if one doc in an `insert([...])` batch conflicts, none are inserted, and a conflicting update leaves the doc unchanged.

Pass `{ autoIndex: false }` to `new Database()` to index only the fields you list with `createIndex`.

## Saving

By default every change is written to the adapter, and the returned promise resolves once the write is done. Changes made at the same time share one write, so `Promise.all` over 2,000 inserts costs about two disk writes, not 2,000.

```javascript
const db = new Database(adapter, { autosave: false }); // write only when you call db.save()
await db.flush();                                      // wait for pending writes
```

### FileAdapter

```javascript
new FileAdapter('db.json', {
  pretty: false, // indent the JSON; easier to read, but slower and bigger
  atomic: true,  // write to db.json.tmp, then rename; a crash never leaves a broken file
});
```

With `atomic: false`, each save is faster (about 2× on Windows), but a crash mid-save can corrupt the file.

### MemoryAdapter

```javascript
new MemoryAdapter();                       // empty
new MemoryAdapter({ users: [{ id: 1 }] }); // start with data
```

### Custom adapters

Any object with `async load()` (returns `{ collection: docs[] }`) and `async save(data)` works.

## API reference

| Method | Returns |
| --- | --- |
| `load()` | `Promise<void>` |
| `save()` | `Promise<void>`. Rebuilds indexes, then writes |
| `flush()` | `Promise<void>`. Waits for pending writes |
| `collection(name)` | `Collection`, with every method below minus the name argument |
| `collections()` | `string[]` |
| `drop(col)` | `Promise<boolean>` |
| `insert(col, doc \| docs[])` / `insertMany` | `Promise<doc \| docs[]>` |
| `find(col, query?, options?)` | `doc[]` |
| `findOne(col, query?, options?)` | `doc \| null` |
| `count(col, query?)` | `number` |
| `update(col, query, changes, { upsert }?)` | `Promise<number>` |
| `updateOne(col, query, changes, { upsert }?)` | `Promise<doc \| null>` |
| `remove(col, query)` | `Promise<number>` |
| `createIndex(col, field, { unique }?)` / `dropIndex(col, field)` / `getIndexes(col)` | |
| `reindex()` | rebuilds indexes from the current data |

Returned docs are the stored objects, not copies, so reads are fast. If you change one directly, call `db.save()` afterwards.

## Performance

`npm run bench` (Node 24, Windows 11). 20k docs in memory; the file tests insert 2k docs each.

| Operation | 1.0 | Now |
| --- | ---: | ---: |
| 20k inserts, memory | 49 ms | 31 ms |
| 200 lookups on a missing value | 52 ms | 3.7 ms |
| remove 1k docs by id | 750 ms | 23 ms |
| 2k concurrent inserts, file | 2,040 ms | 5.4 ms |
| 2k awaited inserts, file (`atomic: false`) | 2,560 ms | ~2,000 ms |
| 2k awaited inserts, file (atomic, default) | 2,560 ms | ~4,400 ms |

Lookups by id take about 1 µs. SnapDB 1.0 was faster there, but only because it skipped checking its index hits, and that gap is why it returned wrong results for queries on more than one field.

Each save rewrites the whole file, so for big imports, insert an array or run the inserts concurrently rather than awaiting them one at a time.

## Changes from 1.0

- **Fixed:** queries on more than one field only checked the first field (`{ age: 28, city: 'NY' }` returned every 28-year-old).
- **Fixed:** `{ id: 1 }` matched `{ id: '1' }`.
- **Fixed:** inserting a value such as `'constructor'` or `'toString'` crashed.
- **Fixed:** a crash in the middle of a save could leave a half-written, unreadable file.
- `remove` now resolves to the number removed. `insert` resolves to what was inserted.
- The file is saved as compact JSON by default (use `{ pretty: true }` for the old format). Both formats load.
- lodash is no longer a dependency.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.
