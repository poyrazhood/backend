/**
 * debug-about.cjs — Hakkında sekmesi snapshot'ını dosyaya yazar
 * Kullanım: node scraper/debug-about.cjs <businessId>
 */
const { spawnSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

function ocSnapshot() {
  const r = spawnSync('openclaw', ['browser', '--browser-profile', 'openclaw', 'snapshot'],
    { encoding: 'utf8', shell: true, maxBuffer: 10 * 1024 * 1024 });
  return r.stdout || '';
}
function ocClick(ref) {
  spawnSync('openclaw', ['browser', '--browser-profile', 'openclaw', 'click', ref],
    { encoding: 'utf8', shell: true });
}
function ocNavigate(url) {
  spawnSync('openclaw', ['browser', '--browser-profile', 'openclaw', 'navigate', url],
    { encoding: 'utf8', shell: true });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const id = process.argv[2];
  if (!id) { console.error('Kullanım: node scraper/debug-about.cjs <businessId>'); process.exit(1); }

  const biz = await prisma.business.findUnique({ where: { id } });
  if (!biz) { console.error('İşletme bulunamadı:', id); process.exit(1); }

  console.log(`📍 ${biz.name} (${biz.city})`);
  const searchQuery = encodeURIComponent((biz.name + ' ' + biz.city).normalize('NFC'));
  ocNavigate(`https://www.google.com/maps/search/${searchQuery}`);
  await sleep(3000);

  let snapshot = ocSnapshot();

  // Arama listesindeyse tıkla
  if (snapshot.includes('için sonuçlar"')) {
    const nameFirst = biz.name.split(' ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const snapLines = snapshot.split('\n');
    const articleMatches = [];
    for (let li = 0; li < snapLines.length; li++) {
      const articleM = snapLines[li].match(/- article "([^"]+)" \[ref=e\d+\]:/);
      if (!articleM) continue;
      const block15 = snapLines.slice(li, li + 15).join('\n');
      if (block15.includes('Sponsorlu')) continue;
      const linkRef = block15.match(/- link "[^"]*" \[ref=(e\d+)\]/)?.[1];
      if (linkRef) articleMatches.push({ title: articleM[1], linkRef });
    }
    const matched = articleMatches.find(a => a.title.toLowerCase().includes(nameFirst.toLowerCase())) || articleMatches[0];
    if (!matched) { console.log('Bulunamadı'); process.exit(1); }
    console.log(`🔗 "${matched.title}" seçildi`);
    ocClick(matched.linkRef);
    await sleep(3000);
    snapshot = ocSnapshot();
  }

  // Snapshot'ı kaydet (detay sayfası)
  fs.writeFileSync('debug-detail.txt', snapshot, 'utf8');
  console.log('✅ debug-detail.txt kaydedildi');

  // Hakkında sekmesine tıkla
  const aboutTab = snapshot.match(/tab "Hakkında[^"]*" \[ref=(e\d+)\]/) ||
                   snapshot.match(/tab "[^"]*hakkında[^"]*" \[ref=(e\d+)\]/i);

  if (!aboutTab) {
    console.log('⚠️  Hakkında sekmesi bulunamadı!');
    // Tüm tab'ları listele
    const tabs = [...snapshot.matchAll(/tab "([^"]+)" \[ref=(e\d+)\]/g)];
    console.log('Mevcut sekmeler:');
    tabs.forEach(t => console.log(' -', t[1], `[${t[2]}]`));
    process.exit(1);
  }

  console.log(`🏷️  Hakkında sekmesi bulundu: [${aboutTab[1]}]`);
  ocClick(aboutTab[1]);
  await sleep(3000);
  const aboutSnapshot = ocSnapshot();

  fs.writeFileSync('debug-about.txt', aboutSnapshot, 'utf8');
  console.log('✅ debug-about.txt kaydedildi');
  console.log(`\nSnapshot uzunluğu: ${aboutSnapshot.length} karakter`);

  // Heading'leri listele
  const headings = [...aboutSnapshot.matchAll(/- heading "([^"]+)"/g)];
  console.log(`\nBulunan heading'ler (${headings.length}):`);
  headings.forEach(h => console.log(' -', h[1]));
}

main().catch(console.error).finally(() => prisma.$disconnect());
