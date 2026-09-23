const { makeGetter, isPrimitive, isOperatorObject } = require('../utils/query');

// Equality indexes: field -> Map<value, bucket>.
// A bucket is the doc itself when only one doc has that value (the common case
// for ids and emails, and much cheaper than a Set per doc), or a Set of docs.
// Only primitive values are indexed; array fields index each primitive element.
const EMPTY = [];

class FieldIndex {
  constructor(field, unique = false) {
    this.field = field;
    this.unique = unique;
    this.get = makeGetter(field);
    this.map = new Map();
  }

  // Indexable values of a doc for this field
  keys(doc) {
    const v = this.get(doc);
    if (isPrimitive(v)) return [v];
    if (Array.isArray(v)) return v.filter(isPrimitive);
    return [];
  }

  // Throws if adding doc would break a unique constraint
  check(doc) {
    if (!this.unique) return;
    for (const k of this.keys(doc)) {
      const b = this.map.get(k);
      if (b !== undefined && b !== doc && !(b instanceof Set && b.size === 1 && b.has(doc))) {
        throw new Error(`Duplicate value ${JSON.stringify(k)} for unique index "${this.field}"`);
      }
    }
  }

  add(doc) {
    for (const k of this.keys(doc)) {
      const b = this.map.get(k);
      if (b === undefined) this.map.set(k, doc);
      else if (b instanceof Set) b.add(doc);
      else if (b !== doc) this.map.set(k, new Set([b, doc]));
    }
  }

  remove(doc) {
    for (const k of this.keys(doc)) {
      const b = this.map.get(k);
      if (b === doc) this.map.delete(k);
      else if (b instanceof Set) {
        b.delete(doc);
        if (b.size === 0) this.map.delete(k);
      }
    }
  }

  size(key) {
    const b = this.map.get(key);
    return b === undefined ? 0 : b instanceof Set ? b.size : 1;
  }

  // Docs with this value, as an iterable (no copy)
  bucket(key) {
    const b = this.map.get(key);
    return b === undefined ? EMPTY : b instanceof Set ? b : [b];
  }

  collect(key, out) {
    const b = this.map.get(key);
    if (b === undefined) return;
    if (b instanceof Set) for (const d of b) out.add(d);
    else out.add(b);
  }
}

class IndexManager {
  constructor({ autoIndex = true } = {}) {
    // When true, a field gets an index the first time it is queried by equality.
    this.autoIndex = autoIndex;
    this.indexes = new Map(); // collection -> Map<field, FieldIndex>
  }

  _fields(collection) {
    let fields = this.indexes.get(collection);
    if (!fields) {
      fields = new Map();
      this.indexes.set(collection, fields);
    }
    return fields;
  }

  // Rebuild all indexes from scratch (after load, or after docs were mutated directly)
  initialize(data) {
    for (const [collection, fields] of this.indexes) {
      const docs = data[collection] || [];
      for (const idx of fields.values()) {
        idx.map.clear();
        for (const doc of docs) idx.add(doc);
      }
    }
  }

  create(collection, field, docs, { unique = false } = {}) {
    const fields = this._fields(collection);
    const existing = fields.get(field);
    if (existing && existing.unique === unique) return existing;
    const idx = new FieldIndex(field, unique);
    for (const doc of docs) {
      idx.check(doc);
      idx.add(doc);
    }
    fields.set(field, idx);
    return idx;
  }

  drop(collection, field) {
    const fields = this.indexes.get(collection);
    if (!fields) return false;
    if (field === undefined) return this.indexes.delete(collection);
    return fields.delete(field);
  }

  list(collection) {
    const fields = this.indexes.get(collection);
    return fields ? [...fields.values()].map(i => ({ field: i.field, unique: i.unique })) : [];
  }

  hasUnique(collection) {
    const fields = this.indexes.get(collection);
    if (!fields) return false;
    for (const idx of fields.values()) if (idx.unique) return true;
    return false;
  }

  check(collection, doc) {
    const fields = this.indexes.get(collection);
    if (fields) for (const idx of fields.values()) idx.check(doc);
  }

  add(collection, doc) {
    const fields = this.indexes.get(collection);
    if (fields) for (const idx of fields.values()) idx.add(doc);
  }

  remove(collection, docs) {
    const fields = this.indexes.get(collection);
    if (!fields) return;
    for (const doc of docs) for (const idx of fields.values()) idx.remove(doc);
  }

  // Returns an iterable of candidate docs that may match the query (the caller must
  // still check each one), or null if no index helps and a full scan is needed.
  // Picks the equality condition with the fewest matching docs.
  candidates(collection, query, docs) {
    if (!query || typeof query !== 'object') return null;
    let best = null;
    let bestSize = Infinity;
    for (const field of Object.keys(query)) {
      if (field[0] === '$') continue;
      const values = equalityValues(query[field]);
      if (!values) continue;
      let idx = this.indexes.get(collection)?.get(field);
      if (!idx) {
        if (!this.autoIndex || !docs) continue;
        idx = this.create(collection, field, docs);
      }
      let size = 0;
      for (const v of values) size += idx.size(v);
      if (size < bestSize) {
        best = { idx, values };
        bestSize = size;
        if (size === 0) break;
      }
    }
    if (!best) return null;
    if (best.values.length === 1) return best.idx.bucket(best.values[0]);
    const out = new Set();
    for (const v of best.values) best.idx.collect(v, out);
    return out;
  }
}

// Values an equality condition can be looked up by, or null if not index-friendly
function equalityValues(cond) {
  if (isPrimitive(cond)) return [cond];
  if (!isOperatorObject(cond)) return null;
  if ('$eq' in cond && isPrimitive(cond.$eq)) return [cond.$eq];
  if ('$in' in cond && Array.isArray(cond.$in) && cond.$in.every(isPrimitive)) return cond.$in;
  return null;
}

module.exports = IndexManager;
