const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'embed-queue.db'));

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tablolar:');
console.table(tables);

for (const t of tables) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${t.name})`).all();
    console.log(`\n[${t.name}] kolonlar:`, cols.map(c => c.name).join(', '));
    const counts = db.prepare(`SELECT * FROM ${t.name} LIMIT 1`).all();
    console.log(`[${t.name}] örnek:`, counts);
    // status kolonu varsa say
    if (cols.some(c => c.name === 'status')) {
      const stats = db.prepare(`SELECT status, COUNT(*) as c FROM ${t.name} GROUP BY status`).all();
      console.log(`[${t.name}] status dağılımı:`);
      console.table(stats);
    }
  } catch(e) {
    console.log(`[${t.name}] hata:`, e.message);
  }
}

db.close();
