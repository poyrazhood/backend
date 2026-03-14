const { spawnSync } = require('child_process');
const fs = require('fs');

const r = spawnSync('openclaw', ['browser', '--browser-profile', 'openclaw', 'snapshot'], {
  shell: true, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
});

const snap = r.stdout;
fs.writeFileSync('snap-florida.txt', snap);

// article satırlarını göster
const lines = snap.split('\n');
lines.forEach((l, i) => {
  if (l.includes('article ') || l.includes('Sponsorlu')) {
    console.log(i + ':', l);
  }
});
