const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

p.$queryRawUnsafe(`
  SELECT 
    COUNT(*) as toplam,
    COUNT("phoneNumber") as telefon,
    COUNT(website) as website,
    COUNT(CASE WHEN attributes->>'coverPhoto' IS NOT NULL THEN 1 END) as kapak,
    COUNT(CASE WHEN jsonb_array_length(COALESCE((attributes->'photos')::jsonb,'[]'::jsonb))>0 THEN 1 END) as galeri,
    COUNT(CASE WHEN attributes->'about' IS NOT NULL THEN 1 END) as hakkinda
  FROM "Business"
  WHERE "updatedAt" > NOW() - INTERVAL '2 hours'
`).then(r => {
  const t = Number(r[0].toplam);
  const pct = (n) => (Number(n) / t * 100).toFixed(1) + '%';
  const fmt = (n) => Number(n).toLocaleString('tr-TR');
  const est = (n) => Math.round(Number(n) / t * 432360).toLocaleString('tr-TR');

  console.log(`\nSon 2 saatte guncellenen: ${fmt(t)} isletme\n`);
  console.log('                     Hit Rate    432k Tahmini');
  console.log('  ' + '-'.repeat(42));
  console.log(`  Telefon        ${pct(r[0].telefon).padStart(8)}    ~${est(r[0].telefon)}`);
  console.log(`  Website        ${pct(r[0].website).padStart(8)}    ~${est(r[0].website)}`);
  console.log(`  Kapak foto     ${pct(r[0].kapak).padStart(8)}    ~${est(r[0].kapak)}`);
  console.log(`  Galeri foto    ${pct(r[0].galeri).padStart(8)}    ~${est(r[0].galeri)}`);
  console.log(`  Hakkinda       ${pct(r[0].hakkinda).padStart(8)}    ~${est(r[0].hakkinda)}`);
}).finally(() => p.$disconnect());
