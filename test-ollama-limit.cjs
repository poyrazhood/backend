// Ollama token limitini test et
async function test(charCount) {
  const text = 'a'.repeat(charCount);
  const res = await fetch('http://localhost:11434/api/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'mxbai-embed-large', input: [text] }),
  });
  console.log(`${charCount} karakter → HTTP ${res.status}`);
}

(async () => {
  for (const n of [500, 1000, 1500, 2000, 3000, 5000, 8000]) {
    await test(n);
  }
})();
