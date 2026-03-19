/**
 * pipeline-status.cjs
 * Lokal pipeline'lardan VPS DB'ye state yazar.
 * 
 * Lokaldeki .env'den DATABASE_URL okunur (VPS DB'ye bağlanır).
 * 
 * Kullanım:
 *   const ps = require('./pipeline-status.cjs')
 *   const run = await ps.startRun({ pipeline: 'reviewEmbed', message: 'Başladı' })
 *   await ps.updateRun({ runId: run.id, pipeline: 'reviewEmbed', processed: 100 })
 *   await ps.finishRun({ runId: run.id, pipeline: 'reviewEmbed', processed: 100 })
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function ensureState(pipeline) {
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO "PipelineState" ("pipeline", "status", "updatedAt")
      VALUES ($1, 'IDLE', NOW())
      ON CONFLICT ("pipeline") DO NOTHING
    `, pipeline);
  } catch (e) { console.warn(`[PS] ensureState hata: ${e.message}`); }
}

async function startRun({ pipeline, pid = null, logFile = null, message = null }) {
  await ensureState(pipeline);
  try {
    const runs = await prisma.$queryRawUnsafe(`
      INSERT INTO "PipelineRun" ("id", "pipeline", "status", "pid", "logFile", "message", "startedAt")
      VALUES (gen_random_uuid()::text, $1, 'RUNNING', $2, $3, $4, NOW())
      RETURNING "id"
    `, pipeline, pid, logFile, message);
    const runId = runs[0]?.id;

    await prisma.$executeRawUnsafe(`
      UPDATE "PipelineState" SET
        "status" = 'RUNNING', "currentRunId" = $2, "lastStartedAt" = NOW(),
        "message" = $3, "lastProcessed" = 0, "lastErrors" = 0,
        "speedPerSec" = NULL, "updatedAt" = NOW()
      WHERE "pipeline" = $1
    `, pipeline, runId, message);

    console.log(`[PS] ${pipeline} başladı — RunID: ${runId}`);
    return { id: runId };
  } catch (e) {
    console.warn(`[PS] startRun hata: ${e.message}`);
    return { id: null };
  }
}

async function updateRun({ runId, pipeline, processed = 0, errors = 0, remaining = null, speedPerSec = null, message = null }) {
  if (!runId) return;
  try {
    await prisma.$executeRawUnsafe(`
      UPDATE "PipelineRun" SET
        "processed" = $2, "errors" = $3, "remaining" = $4, "speedPerSec" = $5, "message" = $6
      WHERE "id" = $1
    `, runId, processed, errors, remaining, speedPerSec, message);

    await prisma.$executeRawUnsafe(`
      UPDATE "PipelineState" SET
        "lastProcessed" = $2, "lastErrors" = $3, "remaining" = $4,
        "speedPerSec" = $5, "message" = $6, "updatedAt" = NOW()
      WHERE "pipeline" = $1
    `, pipeline, processed, errors, remaining, speedPerSec, message);
  } catch (e) { console.warn(`[PS] updateRun hata (devam): ${e.message}`); }
}

async function finishRun({ runId, pipeline, status = 'SUCCESS', processed = 0, errors = 0, remaining = null, speedPerSec = null, message = null }) {
  try {
    if (runId && runId !== 'manual-stop') {
      await prisma.$executeRawUnsafe(`
        UPDATE "PipelineRun" SET
          "status" = $2, "finishedAt" = NOW(), "processed" = $3,
          "errors" = $4, "remaining" = $5, "speedPerSec" = $6, "message" = $7
        WHERE "id" = $1
      `, runId, status, processed, errors, remaining, speedPerSec, message);
    }

    const prev = await prisma.$queryRawUnsafe(`SELECT "totalProcessed" FROM "PipelineState" WHERE "pipeline" = $1`, pipeline);
    const total = (prev[0]?.totalProcessed || 0) + processed;

    await prisma.$executeRawUnsafe(`
      UPDATE "PipelineState" SET
        "status" = $2, "currentRunId" = NULL, "lastFinishedAt" = NOW(),
        "lastSuccessAt" = CASE WHEN $2 = 'SUCCESS' THEN NOW() ELSE "lastSuccessAt" END,
        "lastErrorAt"   = CASE WHEN $2 = 'FAILED'  THEN NOW() ELSE "lastErrorAt" END,
        "totalProcessed" = $3, "lastProcessed" = $4, "lastErrors" = $5,
        "remaining" = $6, "speedPerSec" = $7, "message" = $8, "updatedAt" = NOW()
      WHERE "pipeline" = $1
    `, pipeline, status, total, processed, errors, remaining, speedPerSec, message);

    console.log(`[PS] ${pipeline} ${status} — İşlenen: ${processed}`);
  } catch (e) { console.warn(`[PS] finishRun hata: ${e.message}`); }
}

async function failRun(args) {
  return finishRun({ ...args, status: 'FAILED' });
}

async function disconnect() {
  try { await prisma.$disconnect(); } catch {}
}

module.exports = { startRun, updateRun, finishRun, failRun, disconnect, ensureState };
