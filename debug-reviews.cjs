/**
 * debug-reviews.cjs — Yorumlar sekmesi snapshot'ını dosyaya yazar
 * Kullanım: node debug-reviews.cjs <businessId>
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
  if (!id) { console.error('Kullanım: node debug-reviews.cjs <businessId>'); process.exit(1); }

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

    if (!matched) { console.log('Bulunamadı. Bulunanlar:', articleMatches.map(a=>a.title).join(', ')); process.exit(1); }
    console.log(`🔗 "${matched.title}" seçildi`);
    ocClick(matched.linkRef);
    await sleep(3000);
    snapshot = ocSnapshot();
  }

  // Yorumlar sekmesine tıkla
  const reviewTabMatch =
    snapshot.match(/tab "[^"]*ile ilgili yorumlar[^"]*" \[ref=(e\d+)\]/) ||
    snapshot.match(/tab "Yorumlar[^"]*" \[ref=(e\d+)\]/);

  if (!reviewTabMatch) { console.log('Yorumlar sekmesi bulunamadı'); process.exit(1); }

  ocClick(reviewTabMatch[1]);
  await sleep(2500);
  snapshot = ocSnapshot();

  fs.writeFileSync('debug-reviews-default.txt', snapshot, 'utf8');
  console.log('✅ debug-reviews-default.txt kaydedildi');

  // Sıralama butonunu bul
  const sortBtnMatch =
    snapshot.match(/button "(?:En alakalı|Sıralama ölçütü|Alaka düzeyi)[^"]*" \[ref=(e\d+)\]/) ||
    snapshot.match(/button "[^"]*sırala[^"]*" \[ref=(e\d+)\]/i);

  if (!sortBtnMatch) {
    console.log('⚠️  Sıralama butonu bulunamadı');
    const btns = [...snapshot.matchAll(/button "([^"]+)" \[ref=e\d+\]/g)];
    console.log('Tüm butonlar:', btns.map(b => b[1]).join(' | '));
    process.exit(1);
  }

  console.log(`🔽 Sıralama butonu bulundu: "${sortBtnMatch[0].match(/button "([^"]+)"/)[1]}"`);
  ocClick(sortBtnMatch[1]);
  await sleep(2000);
  const menuSnap = ocSnapshot();

  fs.writeFileSync('debug-sort-menu.txt', menuSnap, 'utf8');
  console.log('✅ debug-sort-menu.txt kaydedildi');

  // Menü elemanlarını listele
  const menuItems = [...menuSnap.matchAll(/(?:menuitem|option|listitem|radio|generic) "([^"]+)" \[ref=(e\d+)\]/g)];
  console.log(`\nMenü elemanları (${menuItems.length}):`);
  menuItems.slice(0, 15).forEach(m => console.log(` [${m[2]}] "${m[1]}"`));

  // En yeni'ye tıkla
  const newestMatch =
    menuSnap.match(/(?:menuitem|option|listitem|radio|generic) "En yeni[^"]*" \[ref=(e\d+)\]/) ||
    menuSnap.match(/(?:menuitem|option|listitem|radio|generic) "[^"]*en yeni[^"]*" \[ref=(e\d+)\]/i);

  if (!newestMatch) {
    console.log('\n⚠️  En yeni bulunamadı. Tüm içerik debug-sort-menu.txt dosyasında.');
    process.exit(1);
  }

  console.log(`\n✅ "En yeni" bulundu: [${newestMatch[1]}]`);
  ocClick(newestMatch[1]);
  await sleep(3000);
  const newestSnap = ocSnapshot();

  fs.writeFileSync('debug-reviews-newest.txt', newestSnap, 'utf8');
  console.log('✅ debug-reviews-newest.txt kaydedildi');
  console.log(`Snapshot uzunluğu: ${newestSnap.length} karakter`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
