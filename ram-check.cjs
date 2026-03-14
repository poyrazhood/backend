'use strict';
const { execSync } = require('child_process');

function fmt(bytes) {
  if (bytes > 1024*1024*1024) return (bytes/1024/1024/1024).toFixed(2) + ' GB';
  if (bytes > 1024*1024) return (bytes/1024/1024).toFixed(0) + ' MB';
  return (bytes/1024).toFixed(0) + ' KB';
}

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║           RAM & PROCESS ANALİZİ                     ║');
console.log('╚══════════════════════════════════════════════════════╝\n');

// Sistem toplam RAM
const total  = require('os').totalmem();
const free   = require('os').freemem();
const used   = total - free;
const usedPct = (used/total*100).toFixed(1);

console.log('=== SİSTEM RAM ===');
console.log(`  Toplam  : ${fmt(total)}`);
console.log(`  Kullanılan: ${fmt(used)} (%${usedPct})`);
console.log(`  Boş    : ${fmt(free)}`);
console.log(`  ${'█'.repeat(Math.round(usedPct/2.5))}${'░'.repeat(40-Math.round(usedPct/2.5))} %${usedPct}`);

// Node.js process kendi belleği
const mem = process.memoryUsage();
console.log('\n=== BU SCRIPT (ram-check.cjs) ===');
console.log(`  RSS (toplam)    : ${fmt(mem.rss)}`);
console.log(`  Heap Used       : ${fmt(mem.heapUsed)}`);
console.log(`  Heap Total      : ${fmt(mem.heapTotal)}`);
console.log(`  External        : ${fmt(mem.external)}`);

// Windows'ta çalışan node prosesleri
console.log('\n=== ÇALIŞAN NODE PROSESLERİ ===');
try {
  const out = execSync('wmic process where "name=\'node.exe\'" get ProcessId,WorkingSetSize,CommandLine /format:csv', { encoding: 'utf8' });
  const lines = out.trim().split('\n').filter(l => l.includes('node') && !l.includes('Caption'));
  
  let totalNodeRam = 0;
  const procs = [];
  
  for (const line of lines) {
    const parts = line.split(',');
    if (parts.length < 4) continue;
    const pid  = parts[parts.length-2]?.trim();
    const ws   = parseInt(parts[parts.length-1]?.trim()) || 0;
    const cmd  = parts.slice(1, parts.length-2).join(' ').trim();
    totalNodeRam += ws;
    procs.push({ pid, ws, cmd });
  }
  
  procs.sort((a,b) => b.ws - a.ws);
  for (const pr of procs) {
    const label = pr.cmd.length > 50 ? pr.cmd.substring(pr.cmd.lastIndexOf('\\')+1, pr.cmd.lastIndexOf('\\')+40) : pr.cmd;
    console.log(`  PID ${pr.pid.padEnd(8)} ${fmt(pr.ws).padStart(8)}  ${label.substring(0,60)}`);
  }
  console.log(`\n  Toplam Node RAM : ${fmt(totalNodeRam)}`);
  console.log(`  Node proses sayısı: ${procs.length}`);
} catch(e) {
  console.log('  (wmic erişim hatası:', e.message + ')');
}

// Chromium/Playwright prosesleri
console.log('\n=== TARAYICI (Chromium) PROSESLERİ ===');
try {
  const out = execSync('wmic process where "name=\'chrome.exe\' or name=\'chromium.exe\'" get ProcessId,WorkingSetSize /format:csv', { encoding: 'utf8' });
  const lines = out.trim().split('\n').filter(l => l.match(/\d{4,}/));
  let totalChromeRam = 0;
  let count = 0;
  for (const line of lines) {
    const parts = line.split(',');
    const ws = parseInt(parts[parts.length-1]?.trim()) || 0;
    totalChromeRam += ws;
    count++;
  }
  console.log(`  Chromium proses sayısı : ${count}`);
  console.log(`  Toplam Chromium RAM    : ${fmt(totalChromeRam)}`);
  console.log(`  Ortalama/proses        : ${count > 0 ? fmt(totalChromeRam/count) : '-'}`);
} catch(e) {
  console.log('  (chromium bulunamadı veya hata:', e.message + ')');
}

console.log('\n=== TAVSİYE ===');
const freeGB = free / 1024 / 1024 / 1024;
const usedPctNum = parseFloat(usedPct);
if (usedPctNum > 90) {
  console.log('  🔴 KRİTİK: RAM %90+ dolu!');
  console.log('  → Worker sayısını düşür (10→6 veya 10→5)');
  console.log('  → --max-old-space-size=2048 ekle');
} else if (usedPctNum > 75) {
  console.log('  🟡 UYARI: RAM %75+ dolu');
  console.log('  → 20 worker riskli, 10-12 worker ideal');
} else {
  console.log('  🟢 RAM durumu normal');
  console.log(`  → ${Math.floor(freeGB / 0.25)} worker daha açılabilir (tarayıcı başına ~250MB)`);
}

console.log('');
