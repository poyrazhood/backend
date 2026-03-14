const D=require('better-sqlite3');
const db=new D('memory/scraper-queue.db');
db.exec(`
  DROP INDEX IF EXISTS idx_unique;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_unique ON jobs(il_slug, ilce_slug, query);
`);
console.log('✅ Index güncellendi');
db.close();
