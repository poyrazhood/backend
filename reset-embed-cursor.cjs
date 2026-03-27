const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'embed-queue.db'));
const before = db.prepare('SELECT * FROM progress').all();
console.log('Mevcut cursorlar:', before);
db.prepare('DELETE FROM progress').run();
console.log('Cursor sıfırlandı');
db.close();
