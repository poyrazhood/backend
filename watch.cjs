/**
 * watch.cjs — Canlı Embedding & Enrichment Dashboard
 * Kullanım: node watch.cjs
 * Çıkmak için Ctrl+C
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const fs   = require('fs');
const path = require('path');

const p        = new PrismaClient();
const INTERVAL = 15; // saniye

const C = {
  reset  : '\x1b[0m',
  bold   : '\x1b[1m',
  dim    : '\x1b[2m',
  green  : '\x1b[32m',
  cyan   : '\x1b[36m',
  yellow : '\x1b[33m',
  red    : '\x1b[31m',
  gray   : '\x1b[90m',
  blue   : '\x1b[34m',
  magenta: '\x1b[35m',
};

const fmt  = n  => Number(n).toLocaleString('tr-TR');
const pct  = (n, t) => t > 0 ? (n / t * 100).toFixed(1) : '0.0';
const pad  = (s, w) => String(s).padStart(w);

function pb(done, total, w = 40) {
  const r = total > 0 ? Math.min(done / total, 1) : 0;
  const f = Math.round(r * w);
  const color = r >= 1 ? C.green : r > 0.5 ? C.cyan : C.yellow;
  return color + '█'.repeat(f) + C.gray + '░'.repeat(w - f) + C.reset;
}

function isLocked(lockFile) {
  const p = path.join(__dirname, lockFile);
  if (!fs.existsSync(p)) return false;
  try {
    const pid = parseInt(fs.readFileSync(p, 'utf8').trim());
    process.kill(pid, 0);
    return true;
  } catch { return false; }
}

async function fetchData() {
  const [
    revEmbed, revTotal,
    bizEmbed, bizTotal,
    enrichDone, enrichTarget, qaCount,
    revLastHour, bizLastHour, enrichLastHour,
  ] = await Promise.all([
    p.reviewEmbedding.count(),
    p.externalReview.count({ where: { content: { not: null } } }),
    p.businessEmbedding.count().catch(() => 0),
    p.business.count({ where: { isActive: true, isDeleted: false } }),
    p.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "Business" WHERE attributes->'ai' IS NOT NULL AND "isActive"=true AND "isDeleted"=false`).then(r => Number(r[0].c)),
    p.business.count({ where: { isActive: true, isDeleted: false, totalReviews: { gte: 25 } } }),
    p.businessQA.count().catch(() => 0),
    p.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "ReviewEmbedding" WHERE "createdAt" > NOW() - INTERVAL '1 hour'`).then(r => Number(r[0]?.c || 0)).catch(() => 0),
    p.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "BusinessEmbedding" WHERE "createdAt" > NOW() - INTERVAL '1 hour'`).then(r => Number(r[0]?.c || 0)).catch(() => 0),
    p.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "Business" WHERE attributes->'ai' IS NOT NULL AND "updatedAt" > NOW() - INTERVAL '1 hour'`).then(r => Number(r[0]?.c || 0)).catch(() => 0),
  ]);

  return { revEmbed, revTotal, bizEmbed, bizTotal, enrichDone, enrichTarget, qaCount, revLastHour, bizLastHour, enrichLastHour };
}

function eta(remaining, perHour) {
  if (perHour <= 0) return '—';
  const hours = remaining / perHour;
  if (hours < 1) return `~${Math.round(hours * 60)} dk`;
  if (hours < 24) return `~${hours.toFixed(1)} saat`;
  return `~${(hours / 24).toFixed(1)} gün`;
}

function render(d) {
  const now   = new Date().toLocaleString('tr-TR');
  const lines = [];

  lines.push('');
  lines.push(C.bold + C.cyan + '  ╔═══════════════════════════════════════════════════════╗' + C.reset);
  lines.push(C.bold + C.cyan + '  ║       TECRUBELERIM — PIPELINE DURUMU                  ║' + C.reset);
  lines.push(C.bold + C.cyan + `  ║       ${now.padEnd(48)}║` + C.reset);
  lines.push(C.bold + C.cyan + '  ╚═══════════════════════════════════════════════════════╝' + C.reset);

  // ── Review Embedding ────────────────────────────────────────────
  const revRunning = isLocked('embed-pipeline.lock');
  const revPct     = pct(d.revEmbed, d.revTotal);
  const revLeft    = d.revTotal - d.revEmbed;

  lines.push('');
  lines.push(C.bold + `  🔵 Review Embedding  ` + (revRunning ? C.green + '● ÇALIŞIYOR' : C.red + '○ DURDU') + C.reset);
  lines.push(`  ${pb(d.revEmbed, d.revTotal)}  ${C.bold}${revPct}%${C.reset}`);
  lines.push(
    C.gray + `  ${fmt(d.revEmbed)} / ${fmt(d.revTotal)}` + C.reset +
    C.dim  + `  |  Kalan: ${fmt(revLeft)}` + C.reset +
    C.yellow + `  |  Hız: ${fmt(d.revLastHour)}/sa` + C.reset +
    C.cyan + `  |  ETA: ${eta(revLeft, d.revLastHour)}` + C.reset
  );

  // ── Business Embedding ──────────────────────────────────────────
  const bizRunning = isLocked('biz-embed-pipeline.lock');
  const bizPct     = pct(d.bizEmbed, d.bizTotal);
  const bizLeft    = d.bizTotal - d.bizEmbed;

  lines.push('');
  lines.push(C.bold + `  🟣 Business Embedding  ` + (bizRunning ? C.green + '● ÇALIŞIYOR' : C.red + '○ DURDU') + C.reset);
  lines.push(`  ${pb(d.bizEmbed, d.bizTotal)}  ${C.bold}${bizPct}%${C.reset}`);
  lines.push(
    C.gray + `  ${fmt(d.bizEmbed)} / ${fmt(d.bizTotal)}` + C.reset +
    C.dim  + `  |  Kalan: ${fmt(bizLeft)}` + C.reset +
    C.yellow + `  |  Hız: ${fmt(d.bizLastHour)}/sa` + C.reset +
    C.cyan + `  |  ETA: ${eta(bizLeft, d.bizLastHour)}` + C.reset
  );

  // ── AI Enrichment ────────────────────────────────────────────────
  const enrichRunning = isLocked('enrich-pipeline.lock');
  const enrichPct     = pct(d.enrichDone, d.enrichTarget);
  const enrichLeft    = d.enrichTarget - d.enrichDone;

  lines.push('');
  lines.push(C.bold + `  🟡 AI Enrichment (25+ yorum)  ` + (enrichRunning ? C.green + '● ÇALIŞIYOR' : C.red + '○ DURDU') + C.reset);
  lines.push(`  ${pb(d.enrichDone, d.enrichTarget)}  ${C.bold}${enrichPct}%${C.reset}`);
  lines.push(
    C.gray + `  ${fmt(d.enrichDone)} / ${fmt(d.enrichTarget)}` + C.reset +
    C.dim  + `  |  Kalan: ${fmt(enrichLeft)}` + C.reset +
    C.yellow + `  |  Hız: ${fmt(d.enrichLastHour)}/sa` + C.reset +
    C.cyan + `  |  ETA: ${eta(enrichLeft, d.enrichLastHour)}` + C.reset
  );
  lines.push(C.gray + `  Q&A kayıt: ${fmt(d.qaCount)}` + C.reset);

  lines.push('');
  lines.push(C.gray + `  ↻ ${INTERVAL} saniyede yenileniyor  |  Çıkmak için Ctrl+C` + C.reset);
  lines.push('');

  return lines.join('\n');
}

async function tick() {
  try {
    const d = await fetchData();
    process.stdout.write('\x1Bc');
    process.stdout.write(render(d));
  } catch (e) {
    process.stdout.write('\x1Bc');
    console.error('Hata:', e.message);
  }
}

tick();
setInterval(tick, INTERVAL * 1000);
