// Usage: node bench/bench.js [path-to-src/core]
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Database, MemoryAdapter, FileAdapter } = require(path.resolve(process.argv[2] || path.join(__dirname, '../src/core')));

const time = async (label, fn) => {
  const t = process.hrtime.bigint();
  const extra = await fn();
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  console.log(`${label.padEnd(44)} ${ms.toFixed(1).padStart(9)} ms${extra ? '  ' + extra : ''}`);
};
const user = i => ({ id: i, name: `user${i}`, age: 18 + (i % 50), city: ['NY', 'LA', 'SF', 'TX'][i % 4] });

(async () => {
  const mem = new Database(new MemoryAdapter());
  await mem.load();
  await time('memory: 20k inserts (awaited one by one)', async () => {
    for (let i = 0; i < 20000; i++) await mem.insert('users', user(i));
  });
  await time('memory: 20k find by id', () => {
    for (let i = 0; i < 20000; i++) mem.find('users', { id: i });
  });
  await time('memory: 2k find {age, city} (multi-key)', () => {
    let n = 0;
    for (let i = 0; i < 2000; i++) n = mem.find('users', { age: 20, city: 'SF' }).length;
    return `-> ${n} rows`;
  });
  await time('memory: 200 find {name} miss (full scan)', () => {
    for (let i = 0; i < 200; i++) mem.find('users', { name: 'nobody' });
  });
  await time('memory: remove 1k by id', async () => {
    for (let i = 0; i < 1000; i++) await mem.remove('users', { id: i });
  });

  const file = path.join(os.tmpdir(), `snapdb-bench-${process.pid}.json`);
  const fdb = new Database(new FileAdapter(file, process.env.ATOMIC === '0' ? { atomic: false } : undefined));
  await fdb.load();
  await time('file: 2k inserts (awaited one by one)', async () => {
    for (let i = 0; i < 2000; i++) await fdb.insert('users', user(i));
  });
  await time('file: 2k inserts (fired concurrently)', async () => {
    await Promise.all(Array.from({ length: 2000 }, (_, i) => fdb.insert('users', user(2000 + i))));
  });
  const onDisk = JSON.parse(fs.readFileSync(file, 'utf8')).users.length;
  console.log(`file: rows on disk after concurrent inserts: ${onDisk} (expected 4000)`);
  fs.rmSync(file, { force: true });
})();
