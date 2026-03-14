// review-debug.cjs olarak kaydet
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: false, args: ['--lang=tr-TR'] });
  const p = await (await b.newContext({ locale: 'tr-TR' })).newPage();
  await p.goto('https://www.google.com/maps/place/Alada%C4%9F+teras+cafe/@37.5446125,35.3961684,17z/data=!4m8!3m7!1s0x15291b7ceeeb3325:0xb17e9521ce179efa!8m2!3d37.5446125!4d35.3961684!9m1!1b1!16s%2Fg%2F11pqj07f7h?entry=ttu');
  await p.waitForTimeout(4000);
  const yorumBtn = p.locator('button.hh2c6[aria-label*="yorumlar"]').first();
  if (await yorumBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await yorumBtn.dispatchEvent('click');
    await p.waitForTimeout(2000);
  }
  for (let i = 0; i < 5; i++) {
    await p.evaluate(() => { const f = document.querySelector('[role="feed"]'); if (f) f.scrollTop = f.scrollHeight; });
    await p.waitForTimeout(800);
  }
  const result = await p.evaluate(() => {
    return Array.from(document.querySelectorAll('[data-review-id], .jftiEf')).map(card => {
      const name = card.querySelector('.d4r55')?.textContent?.trim() || '?';
      const allLabels = Array.from(card.querySelectorAll('[aria-label]')).map(el => el.getAttribute('aria-label')).filter(Boolean);
      return { name, allLabels };
    });
  });
  result.forEach(r => console.log(r.name, '→', r.allLabels));
  await b.close();
})();