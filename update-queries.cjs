const D = require('better-sqlite3');
const db = new D('memory/scraper-queue.db');

const jobs = db.prepare("SELECT id, il, ilce, query FROM jobs WHERE status='pending'").all();
const upd = db.prepare('UPDATE jobs SET query=? WHERE id=?');

const run = db.transaction(() => {
  let n = 0;
  for (const j of jobs) {
    if (!j.query.startsWith(j.il + ' ')) {
      upd.run(j.il + ' ' + j.query, j.id);
      n++;
    }
  }
  console.log('Güncellenen:', n);
});

run();
db.close();
