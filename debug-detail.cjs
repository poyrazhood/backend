/**
 * debug-detail.cjs — İşletme detay sayfası snapshot'ını yazar
 * Kullanım: node debug-detail.cjs <businessId>
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
  if (!id) { console.error('Kullanım: node debug-detail.cjs <businessId>'); process.exit(1); }

  const biz = await prisma.business.findUnique({ where: { id } });
  if (!biz) { console.error('İşletme bulunamadı'); process.exit(1); }

  console.log(`📍 ${biz.name}`);

  const searchParts = [biz.name, biz.district, biz.city].filter(Boolean).join(' ').normalize('NFC');
  ocNavigate(`https://www.google.com/maps/search/${encodeURIComponent(searchParts)}`);
  await sleep(3000);

  let snapshot = ocSnapshot();

  // Arama listesindeyse tıkla
  if (snapshot.includes('için sonuçlar"')) {
    const bizName = biz.name.toLowerCase().normalize('NFC');
    const bizWords = bizName.split(/\s+/).filter(w => w.length > 2);
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
    const matched =
      articleMatches.find(a => a.title.toLowerCase().normalize('NFC') === bizName) ||
      articleMatches.find(a => bizWords.every(w => a.title.toLowerCase().normalize('NFC').includes(w))) ||
      articleMatches.find(a => bizWords.some(w => a.title.toLowerCase().normalize('NFC').includes(w)));

    if (!matched) {
      console.log('Bulunamadı. Bulunanlar:', articleMatches.map(a => a.title).join(', '));
      process.exit(1);
    }
    console.log(`🔗 "${matched.title}" seçildi`);
    ocClick(matched.linkRef);
    await sleep(3000);
    snapshot = ocSnapshot();
  }

  // Snapshot'ı kaydet
  fs.writeFileSync('debug-detail-page.txt', snapshot, 'utf8');
  console.log('✅ debug-detail-page.txt kaydedildi');
  console.log(`Snapshot uzunluğu: ${snapshot.length} karakter`);

  // Telefon içeren satırları bul
  console.log('\n=== TELEFON içeren satırlar ===');
  const lines = snapshot.split('\n');
  lines.forEach((line, i) => {
    if (line.match(/\+90|0[25][0-9]{2}|tel:|phone|telefon/i) ||
        line.match(/0\s*\(?\d{3}\)?\s*\d{3}/)) {
      console.log(`  [${i}] ${line.trim()}`);
    }
  });

  // Website içeren satırları bul
  console.log('\n=== WEBSİTE içeren satırlar ===');
  lines.forEach((line, i) => {
    if (line.match(/https?:\/\/(?!maps\.google|google\.com|goo\.gl|accounts\.google)/i)) {
      console.log(`  [${i}] ${line.trim()}`);
    }
  });

  // Link satırlarını listele
  console.log('\n=== Tüm LINK satırları ===');
  lines.forEach((line, i) => {
    if (line.includes('- link "') && !line.includes('google.com') && !line.includes('accounts.google')) {
      console.log(`  [${i}] ${line.trim()}`);
    }
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
