const { spawnSync } = require('child_process');
const fs = require('fs');

const r = spawnSync('openclaw', ['browser', '--browser-profile', 'openclaw', 'snapshot'], {
  shell: true, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
});

fs.writeFileSync('snap-debug.txt', r.stdout);

const lines = r.stdout.split('\n').filter(l =>
  l.includes('tab ') || l.includes('feed ') || l.includes('article ') ||
  l.includes('main ') || l.includes('sonuçlar') || l.includes('heading')
);
console.log(lines.slice(0, 20).join('\n'));
