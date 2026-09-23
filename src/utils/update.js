// Applies an update to a document in place.
// changes can be:
//   - a function: called with the doc; mutate it, or return an object to merge in
//   - an operator object: { $set, $unset, $inc, $push, $pull, $addToSet, $min, $max }
//   - a plain object: shallow-merged into the doc (same as $set)

const { UNSAFE_KEYS, isOperatorObject, isPlainObject, matchesValue, compileField, deepEqual } = require('./query');

const hasOwn = Object.prototype.hasOwnProperty;

function splitPath(path) {
  const parts = path.split('.');
  for (const p of parts) {
    if (UNSAFE_KEYS.has(p)) throw new Error(`Unsafe field name in update: ${path}`);
  }
  return parts;
}

// Returns [parentObject, lastKey], creating intermediate objects when create is true.
function resolve(doc, path, create) {
  const parts = splitPath(path);
  let obj = doc;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (obj[k] == null || typeof obj[k] !== 'object') {
      if (!create) return [null, null];
      obj[k] = {};
    }
    obj = obj[k];
  }
  return [obj, parts[parts.length - 1]];
}

function assertKeysSafe(obj) {
  for (const k of Object.keys(obj)) {
    if (UNSAFE_KEYS.has(k)) throw new Error(`Unsafe field name in update: ${k}`);
  }
}

const OPS = {
  $set(doc, path, value) {
    const [obj, key] = resolve(doc, path, true);
    obj[key] = value;
  },
  $unset(doc, path) {
    const [obj, key] = resolve(doc, path, false);
    if (obj) delete obj[key];
  },
  $inc(doc, path, by) {
    if (typeof by !== 'number') throw new TypeError(`$inc on ${path} needs a number`);
    const [obj, key] = resolve(doc, path, true);
    const cur = hasOwn.call(obj, key) ? obj[key] : 0;
    if (typeof cur !== 'number') throw new TypeError(`$inc on non-numeric field ${path}`);
    obj[key] = cur + by;
  },
  $min(doc, path, value) {
    const [obj, key] = resolve(doc, path, true);
    if (!hasOwn.call(obj, key) || value < obj[key]) obj[key] = value;
  },
  $max(doc, path, value) {
    const [obj, key] = resolve(doc, path, true);
    if (!hasOwn.call(obj, key) || value > obj[key]) obj[key] = value;
  },
  $push(doc, path, value) {
    const [obj, key] = resolve(doc, path, true);
    const arr = arrayAt(obj, key, path);
    if (isPlainObject(value) && hasOwn.call(value, '$each')) arr.push(...value.$each);
    else arr.push(value);
  },
  $addToSet(doc, path, value) {
    const [obj, key] = resolve(doc, path, true);
    const arr = arrayAt(obj, key, path);
    const items = isPlainObject(value) && hasOwn.call(value, '$each') ? value.$each : [value];
    for (const item of items) if (!arr.some(el => deepEqual(el, item))) arr.push(item);
  },
  $pull(doc, path, cond) {
    const [obj, key] = resolve(doc, path, false);
    if (!obj || !Array.isArray(obj[key])) return;
    const test = isOperatorObject(cond) || typeof cond === 'function'
      ? compileField(cond)
      : el => matchesValue(el, cond);
    obj[key] = obj[key].filter(el => !test(el));
  },
};

function arrayAt(obj, key, path) {
  if (!hasOwn.call(obj, key)) obj[key] = [];
  if (!Array.isArray(obj[key])) throw new TypeError(`Field ${path} is not an array`);
  return obj[key];
}

function applyUpdate(doc, changes) {
  if (typeof changes === 'function') {
    const out = changes(doc);
    if (out && typeof out === 'object' && out !== doc) {
      assertKeysSafe(out);
      Object.assign(doc, out);
    }
    return;
  }
  if (!isPlainObject(changes)) throw new TypeError('Update must be an object or a function');
  if (!isOperatorObject(changes)) {
    assertKeysSafe(changes);
    Object.assign(doc, changes);
    return;
  }
  for (const op of Object.keys(changes)) {
    const fn = OPS[op];
    if (!fn) throw new Error(`Unknown update operator: ${op}`);
    const fields = changes[op];
    for (const path of Object.keys(fields)) fn(doc, path, fields[path]);
  }
}

module.exports = { applyUpdate };
