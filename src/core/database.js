const IndexManager = require('../indexing/indexManager');
const Collection = require('./collection');
const logger = require('../utils/logger');
const { compileQuery, compileSort, compileSelect, isPlainObject, isOperatorObject, isPrimitive } = require('../utils/query');
const { applyUpdate } = require('../utils/update');

class Database {
  /**
   * @param adapter  storage adapter with async load() and save(data)
   * @param options.autosave   write to the adapter after every change (default true)
   * @param options.autoIndex  index a field the first time it is queried by equality (default true)
   */
  constructor(adapter, { autosave = true, autoIndex = true } = {}) {
    this.adapter = adapter;
    this.autosave = autosave;
    this.data = {};
    this.indexManager = new IndexManager({ autoIndex });
    this._pending = null; // a write that has been scheduled but not started yet
    this._inflight = null; // the write currently running
  }

  async load() {
    try {
      await this.flush();
      const data = await this.adapter.load();
      this.data = data && typeof data === 'object' ? data : {};
      this.indexManager.initialize(this.data);
    } catch (error) {
      logger.error(`Error loading database: ${error.message}`);
      throw error;
    }
  }

  // Rebuilds indexes (so docs you edited directly are picked up) and writes to the adapter.
  async save() {
    this.reindex();
    return this._write();
  }

  // Waits for any pending writes to finish.
  async flush() {
    await (this._pending || this._inflight);
  }

  // Rebuilds all indexes from the current data.
  reindex() {
    this.indexManager.initialize(this.data);
  }

  collection(name) {
    return new Collection(this, name);
  }

  collections() {
    return Object.keys(this.data);
  }

  async drop(collection) {
    if (!this.data[collection]) return false;
    delete this.data[collection];
    this.indexManager.drop(collection);
    await this._changed();
    return true;
  }

  // ---- indexes ----

  createIndex(collection, field, { unique = false } = {}) {
    this.indexManager.create(collection, field, this.data[collection] || [], { unique });
  }

  dropIndex(collection, field) {
    return this.indexManager.drop(collection, field);
  }

  getIndexes(collection) {
    return this.indexManager.list(collection);
  }

  // ---- writes ----

  // Inserts one doc or an array of docs. Returns what was inserted.
  async insert(collection, items) {
    const many = Array.isArray(items);
    const docs = many ? items : [items];
    for (const doc of docs) {
      if (!isPlainObject(doc)) throw new TypeError(`Cannot insert non-object into ${collection}`);
    }
    const added = [];
    try {
      for (const doc of docs) {
        this.indexManager.check(collection, doc);
        this.indexManager.add(collection, doc);
        added.push(doc);
      }
    } catch (error) {
      // All-or-nothing: undo the docs already indexed from this batch
      this.indexManager.remove(collection, added);
      throw error;
    }
    const arr = this._docs(collection, true);
    for (const doc of docs) arr.push(doc);
    await this._changed();
    return items;
  }

  async insertMany(collection, items) {
    return this.insert(collection, items);
  }

  // Updates every matching doc. Returns the number of docs updated.
  // options.upsert: insert a new doc when nothing matches.
  async update(collection, query, changes, { upsert = false } = {}) {
    const matches = this._match(collection, query);
    if (matches.length === 0) {
      if (!upsert) return 0;
      await this.insert(collection, this._upsertDoc(query, changes));
      return 1;
    }
    this._apply(collection, matches, changes);
    await this._changed();
    return matches.length;
  }

  // Updates the first matching doc. Returns it, or null if nothing matched.
  async updateOne(collection, query, changes, { upsert = false } = {}) {
    const [doc] = this._match(collection, query, { limit: 1 });
    if (!doc) {
      if (!upsert) return null;
      return this.insert(collection, this._upsertDoc(query, changes));
    }
    this._apply(collection, [doc], changes);
    await this._changed();
    return doc;
  }

  // Removes every matching doc. Returns the number removed.
  async remove(collection, query) {
    const arr = this._docs(collection);
    if (!arr) return 0;
    const matches = this._match(collection, query);
    if (matches.length === 0) return 0;
    this.indexManager.remove(collection, matches);
    if (matches.length === 1) {
      arr.splice(arr.indexOf(matches[0]), 1);
    } else {
      const gone = new Set(matches);
      let w = 0;
      for (let r = 0; r < arr.length; r++) if (!gone.has(arr[r])) arr[w++] = arr[r];
      arr.length = w;
    }
    await this._changed();
    return matches.length;
  }

  // ---- reads ----

  /**
   * @param query   object query (supports $eq $ne $gt $gte $lt $lte $in $nin $exists
   *                $regex $not $size $elemMatch $and $or $nor, dot paths) or a function
   * @param options { sort, skip, limit, select }
   */
  find(collection, query = {}, options = {}) {
    try {
      const { sort, skip = 0, limit = Infinity, select } = options;
      let results;
      if (sort) {
        results = this._match(collection, query).sort(compileSort(sort));
        if (skip || limit !== Infinity) results = results.slice(skip, skip + limit);
      } else {
        results = this._match(collection, query, { skip, limit });
      }
      return select ? results.map(compileSelect(select)) : results;
    } catch (error) {
      logger.error(`Error querying ${collection} with ${safeStringify(query)}: ${error.message}`);
      throw error;
    }
  }

  findOne(collection, query = {}, options = {}) {
    return this.find(collection, query, { ...options, limit: 1 })[0] ?? null;
  }

  count(collection, query = {}) {
    const arr = this._docs(collection);
    if (!arr) return 0;
    if (isPlainObject(query) && Object.keys(query).length === 0) return arr.length;
    return this._match(collection, query).length;
  }

  // ---- internals ----

  _docs(collection, create = false) {
    let arr = this.data[collection];
    if (!arr && create) arr = this.data[collection] = [];
    return arr;
  }

  // Returns matching docs in a new array. Uses an index when the query has an
  // equality condition on a field, otherwise scans the collection.
  _match(collection, query, { skip = 0, limit = Infinity } = {}) {
    const arr = this._docs(collection);
    if (!arr || limit <= 0) return [];
    const test = compileQuery(query);
    const candidates = typeof query === 'function' ? null : this.indexManager.candidates(collection, query, arr);
    const out = [];
    if (skip === 0 && limit === Infinity) {
      // Separate loops so each stays monomorphic (array vs Set) and fast
      if (candidates === null) {
        for (let i = 0; i < arr.length; i++) if (test(arr[i])) out.push(arr[i]);
      } else {
        for (const doc of candidates) if (test(doc)) out.push(doc);
      }
      return out;
    }
    let skipped = 0;
    for (const doc of candidates || arr) {
      if (!test(doc)) continue;
      if (skipped < skip) {
        skipped++;
        continue;
      }
      out.push(doc);
      if (out.length >= limit) break;
    }
    return out;
  }

  // Applies changes to docs, keeping indexes in sync. On a unique-index
  // conflict the offending doc is rolled back and the error is thrown.
  _apply(collection, docs, changes) {
    const unique = this.indexManager.hasUnique(collection);
    for (const doc of docs) {
      const backup = unique ? structuredClone(doc) : null;
      this.indexManager.remove(collection, [doc]);
      try {
        applyUpdate(doc, changes);
        this.indexManager.check(collection, doc);
      } catch (error) {
        if (backup) restore(doc, backup);
        this.indexManager.add(collection, doc);
        throw error;
      }
      this.indexManager.add(collection, doc);
    }
  }

  // Builds the doc to insert for an upsert: the query's equality fields plus the changes
  _upsertDoc(query, changes) {
    const doc = {};
    if (isPlainObject(query)) {
      for (const k of Object.keys(query)) {
        if (k[0] === '$' || k.includes('.')) continue;
        const v = query[k];
        if (isPrimitive(v)) doc[k] = v;
        else if (isOperatorObject(v) && isPrimitive(v.$eq)) doc[k] = v.$eq;
      }
    }
    applyUpdate(doc, changes);
    return doc;
  }

  async _changed() {
    if (this.autosave) await this._write();
  }

  // Coalesces writes: every change made before a write starts shares that one
  // write, so a burst of N concurrent inserts costs ~2 disk writes, not N.
  _write() {
    if (this._pending) return this._pending;
    const previous = this._inflight || Promise.resolve();
    const run = previous
      .catch(() => {})
      .then(() => {
        this._pending = null;
        this._inflight = run;
        return this.adapter.save(this.data);
      })
      .catch(error => {
        logger.error(`Error saving database: ${error.message}`);
        throw error;
      })
      .finally(() => {
        if (this._inflight === run) this._inflight = null;
      });
    this._pending = run;
    return run;
  }
}

function restore(doc, backup) {
  for (const k of Object.keys(doc)) delete doc[k];
  Object.assign(doc, backup);
}

function safeStringify(v) {
  try {
    return typeof v === 'function' ? '[function]' : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

module.exports = Database;
