const fs = require('fs');
const t = fs.readFileSync('snap2.txt', 'utf8');
const idx = t.indexOf('article "Coffee Manifesto"');
console.log(t.slice(idx, idx + 400));
