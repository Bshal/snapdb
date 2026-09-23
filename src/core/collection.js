// A handle bound to one collection, so you can write users.find({...})
// instead of db.find('users', {...}).
class Collection {
  constructor(db, name) {
    this.db = db;
    this.name = name;
  }

  insert(items) { return this.db.insert(this.name, items); }
  insertMany(items) { return this.db.insert(this.name, items); }
  find(query, options) { return this.db.find(this.name, query, options); }
  findOne(query, options) { return this.db.findOne(this.name, query, options); }
  count(query) { return this.db.count(this.name, query); }
  update(query, changes, options) { return this.db.update(this.name, query, changes, options); }
  updateOne(query, changes, options) { return this.db.updateOne(this.name, query, changes, options); }
  remove(query) { return this.db.remove(this.name, query); }
  drop() { return this.db.drop(this.name); }
  createIndex(field, options) { return this.db.createIndex(this.name, field, options); }
  dropIndex(field) { return this.db.dropIndex(this.name, field); }
  getIndexes() { return this.db.getIndexes(this.name); }
}

module.exports = Collection;
