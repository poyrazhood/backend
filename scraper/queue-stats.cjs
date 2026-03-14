const Database = require('better-sqlite3');
const path = require('path');

const QUEUE_DB = path.join(__dirname, '..', 'memory', 'scraper-queue.db');
const qdb = new Database(QUEUE_DB);

const total     = qdb.prepare("SELECT COUNT(*) as c FROM jobs").get().c;
const pending   = qdb.prepare("SELECT COUNT(*) as c FROM jobs WHERE status='pending'").get().c;
const running   = qdb.prepare("SELECT COUNT(*) as c FROM jobs WHERE status='running'").get().c;
const done      = qdb.prepare("SELECT COUNT(*) as c FROM jobs WHERE status='done'").get().c;
const failed    = qdb.prepare("SELECT COUNT(*) as c FROM jobs WHERE status='failed'").get().c;
const maxId     = qdb.prepare("SELECT MAX(id) as m FROM jobs").get().m;
const minPending = qdb.prepare("SELECT MIN(id) as m FROM jobs WHERE status='pending'").get().m;

console.log(`\n📊 QUEUE DURUMU`);
console.log(`   Toplam job     : ${total}`);
console.log(`   Pending        : ${pending}`);
console.log(`   Running        : ${running}`);
console.log(`   Done           : ${done}`);
console.log(`   Failed         : ${failed}`);
console.log(`   Max ID         : ${maxId}`);
console.log(`   İlk pending ID : ${minPending}`);

// Son eklenen 5 job
const last5 = qdb.prepare("SELECT id, il, ilce, query, status FROM jobs ORDER BY id DESC LIMIT 5").all();
console.log(`\n🆕 Son eklenen 5 job:`);
last5.forEach(j => console.log(`   [#${j.id}] ${j.query} — ${j.status}`));

qdb.close();
