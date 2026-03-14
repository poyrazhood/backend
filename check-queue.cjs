const Database = require('better-sqlite3');
const db = new Database('./memory/scraper-queue.db');

const stats = db.prepare(`
  SELECT status, COUNT(*) as c FROM jobs GROUP BY status
`).all();

const total = stats.reduce((s, r) => s + r.c, 0);
console.log('\n📊 SCRAPER QUEUE DURUMU');
console.log('═'.repeat(35));
stats.forEach(s => {
  const pct = ((s.c / total) * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(pct / 3)).padEnd(33, '░');
  console.log(`  ${s.status.padEnd(10)}: ${String(s.c).padStart(6)}  (${pct}%)`);
});
console.log('─'.repeat(35));
console.log(`  ${'TOPLAM'.padEnd(10)}: ${String(total).padStart(6)}`);

const recentDone = db.prepare(`
  SELECT COUNT(*) as c FROM jobs 
  WHERE status='done' AND done_at > datetime('now', '-10 minutes')
`).get().c;

console.log(`\n⚡ Son 10 dk'da tamamlanan: ${recentDone} job`);
console.log(`   Tahmini hız: ~${(recentDone / 10).toFixed(1)} job/dk`);

const pending = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status='pending'").get().c;
const rate = recentDone / 10;
if (rate > 0) {
  const remaining = Math.ceil(pending / rate);
  console.log(`   Kalan süre: ~${remaining} dk (~${(remaining/60).toFixed(1)} saat)`);
}

console.log('\n🏙️  İL BAZINDA BEKLEYEN (top 10)');
console.log('─'.repeat(35));
db.prepare(`
  SELECT il_slug, COUNT(*) as c FROM jobs 
  WHERE status='pending' GROUP BY il_slug ORDER BY c DESC LIMIT 10
`).all().forEach(r => console.log(`  ${r.il_slug.padEnd(20)}: ${r.c}`));

db.close();