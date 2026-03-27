require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

console.log('DB bağlanıyor...');
const t = Date.now();

p.business.count()
  .then(n => {
    console.log('Toplam kayıt:', n, '— süre:', Date.now() - t, 'ms');
    return p.$disconnect();
  })
  .catch(e => {
    console.error('HATA:', e.message);
    p.$disconnect();
  });
