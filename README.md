# SnapDB

> SnapDB is a high-performance, easy-to-use JSON database for Node.js. Featuring asynchronous operations and advanced indexing, it ensures fast and efficient data management.

## Installation

To install the package, use npm:

```bash
npm install @bshal/snapdb
```

## Usage Examples
### Loading and Inserting Data (using FileAdapter)
```javascript
const { Database, FileAdapter } = require('@bshal/snapdb');

(async () => {
  const adapter = new FileAdapter('db.json');
  const db = new Database(adapter);
  
  // Load the database
  await db.load();
  
  // Insert items into the "users" collection
  await db.insert('users', { id: 1, name: 'Alice' });
  await db.insert('users', { id: 2, name: 'Bob' });

  // Find all users
  const allUsers = db.find('users', {});
  console.log(allUsers); // [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
})();
```

### Using MemoryAdapter
```javascript
const { Database, MemoryAdapter } = require('@bshal/snapdb');

(async () => {
  const adapter = new MemoryAdapter();
  const db = new Database(adapter);

  // Load the database
  await db.load();

  // Insert items into the "users" collection
  await db.insert('users', { id: 1, name: 'Charlie' });
  await db.insert('users', { id: 2, name: 'David' });

  // Find all users
  const allUsers = db.find('users', {});
  console.log(allUsers); // [{ id: 1, name: 'Charlie' }, { id: 2, name: 'David' }]
})();
```

### Querying Data
```javascript
const { Database, FileAdapter } = require('@bshal/snapdb');

(async () => {
  const adapter = new FileAdapter('db.json');
  const db = new Database(adapter);

  await db.load();
  await db.insert('users', { id: 1, name: 'Alice', age: 28, city: 'New York' });
  await db.insert('users', { id: 2, name: 'Bob', age: 30, city: 'Los Angeles' });
  await db.insert('users', { id: 3, name: 'Charlie', age: 28, city: 'New York' });

  // Find users by age and city
  const usersByAgeAndCity = db.find('users', { age: 28, city: 'New York' });
  console.log(usersByAgeAndCity); // [{ id: 1, name: 'Alice', age: 28, city: 'New York' }, { id: 3, name: 'Charlie', age: 28, city: 'New York' }]
})();

```

### Updating Data
```javascript
const { Database, FileAdapter } = require('@bshal/snapdb');

(async () => {
  const adapter = new FileAdapter('db.json');
  const db = new Database(adapter);

  await db.load();
  await db.insert('users', { id: 1, name: 'Grace' });

  // Find and update user
  const user = db.find('users', { id: 1 })[0];
  user.name = 'Grace Hopper';
  await db.save();

  const updatedUser = db.find('users', { id: 1 });
  console.log(updatedUser); // [{ id: 1, name: 'Grace Hopper' }]
})();
```

#### Removing Data
```javascript
const { Database, FileAdapter } = require('@bshal/snapdb');

(async () => {
  const adapter = new FileAdapter('db.json');
  const db = new Database(adapter);

  await db.load();
  await db.insert('users', { id: 1, name: 'Hank' });
  await db.insert('users', { id: 2, name: 'Ivy' });

  // Remove a user
  await db.remove('users', { name: 'Hank' });
  const remainingUsers = db.find('users', {});
  console.log(remainingUsers); // [{ id: 2, name: 'Ivy' }]
})();
```

#### Complete CRUD Operations
```javascript
const { Database, FileAdapter } = require('@bshal/snapdb');

(async () => {
  const adapter = new FileAdapter('db.json');
  const db = new Database(adapter);

  // Load the database
  await db.load();

  // Create
  await db.insert('users', { id: 1, name: 'Alice' });
  await db.insert('users', { id: 2, name: 'Bob' });

  // Read
  const users = db.find('users', {});
  console.log('All users:', users); // [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]

  // Update
  const userToUpdate = db.find('users', { id: 1 })[0];
  userToUpdate.name = 'Alice Updated';
  await db.save();
  const updatedUsers = db.find('users', {});
  console.log('Updated users:', updatedUsers); // [{ id: 1, name: 'Alice Updated' }, { id: 2, name: 'Bob' }]

  // Delete
  await db.remove('users', { id: 2 });
  const finalUsers = db.find('users', {});
  console.log('Final users:', finalUsers); // [{ id: 1, name: 'Alice Updated' }]
})();
```

## API Reference

### Database

- **`load()`**: Loads the database data.
- **`save()`**: Saves the current state of the database.
- **`insert(collection, item)`**: Adds a new item to a collection.
- **`find(collection, query)`**: Finds items in a collection that match the query.
- **`remove(collection, query)`**: Removes items from a collection that match the query.

### Adapters

#### FileAdapter

- **`load()`**: Reads data from a file.
- **`save(data)`**: Writes data to a file.

#### MemoryAdapter

- **`load()`**: Loads data from memory.
- **`save(data)`**: Saves data to memory.


## Contributing
Contributions are welcome! Please open an issue or submit a pull request on GitHub.