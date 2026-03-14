async function test(text) {
  const res = await fetch('http://localhost:11434/api/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'mxbai-embed-large', input: [text] }),
  });
  if (res.ok) {
    const data = await res.json();
    return { ok: true, tokens: data.total_duration ? data.prompt_eval_count : '?' };
  }
  return { ok: false };
}

// Gerçek Türkçe yorum metni ile test
const sample = 'Çok güzel bir mekan, hizmet kalitesi gerçekten mükemmel. Personel çok ilgili ve güleryüzlü. Kesinlikle tavsiye ederim. ';

(async () => {
  for (const repeat of [5, 10, 15, 20, 25, 30]) {
    const text = sample.repeat(repeat);
    const result = await test(text);
    console.log(`${text.length} karakter (${repeat}x) → ${result.ok ? 'OK tokens:'+result.tokens : 'FAIL'}`);
  }
})();
