const { spawnSync } = require('child_process');
const fs = require('fs');

const r = spawnSync('openclaw', ['browser', '--browser-profile', 'openclaw', 'snapshot'], {
  shell: true, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
});

const snap = r.stdout;
fs.writeFileSync('snap-florida.txt', snap);

console.log('--- için sonuçlar var mı:', snap.includes('için sonuçlar"'));
console.log('--- Toplam satır:', snap.split('\n').length);
console.log('\n--- Article satırları:');
snap.split('\n').forEach((l, i) => {
  if (l.includes('article ')) console.log(i + ':', JSON.stringify(l));
});

console.log('\n--- Regex testi:');
const nameFirst = 'Florida';
const articleScanRe = new RegExp('- article "([^"]+)" \\[ref=e\\d+\\]:([\\s\\S]{0,500}?)(?=\\n\\s+- article |\\n\\s+- region |\\n\\s{8}[^\\s]|$)', 'g');
let am;
let count = 0;
while ((am = articleScanRe.exec(snap)) !== null) {
  count++;
  console.log('Buldu:', am[1], '| Sponsorlu:', am[2].includes('Sponsorlu'));
  const linkRef = am[2].match(/- link "[^"]*" \[ref=(e\d+)\]/)?.[1];
  console.log('  linkRef:', linkRef);
}
console.log('Toplam eşleşme:', count);
