const Database = require('better-sqlite3');
const db = new Database('./memory/review-queue.db', { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tablolar:', tables.map(t => t.name));
for (const t of tables) {
  try {
    const c = db.prepare(`SELECT status, COUNT(*) as c FROM ${t.name} GROUP BY status`).all();
    console.log(`\n${t.name}:`, c);
  } catch {}
}
db.close();
