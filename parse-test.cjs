const fs = require('fs');

const text = fs.readFileSync('memory/snapshots/snap2.txt', 'utf8');
const lines = text.split('\n');

const results = [];
let current = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Yeni article başlıyor
  const articleMatch = line.match(/article "([^"]+)" \[ref=e\d+\]/);
  if (articleMatch) {
    if (current) results.push(current);
    current = { name: articleMatch[1], rating: null, reviewCount: 0, lat: null, lng: null, address: null, sponsored: false };
    continue;
  }

  if (!current) continue;

  // Sponsorlu
  if (line.includes('heading "Sponsorlu"')) {
    current.sponsored = true;
  }

  // Rating: img "4,5 yıldızlı 476 Yorum" veya bozuk encoding ile
  // Sayıları bul: text: 4,5 ve text: (476)
  const ratingLineMatch = line.match(/text: ([0-9],[0-9])/);
  if (ratingLineMatch && !current.rating) {
    current.rating = parseFloat(ratingLineMatch[1].replace(',', '.'));
  }

  // Yorum sayısı: text: (476) veya (2.331)
  const reviewLineMatch = line.match(/text: \(([0-9.,]+)\)/);
  if (reviewLineMatch) {
    current.reviewCount = parseInt(reviewLineMatch[1].replace(/\./g, '').replace(',', ''));
  }

  // Koordinat: 3d40.984266!4d29.022648
  const coordMatch = line.match(/3d([0-9.]+)!4d([0-9.]+)/);
  if (coordMatch) {
    current.lat = parseFloat(coordMatch[1]);
    current.lng = parseFloat(coordMatch[2]);
  }
}

if (current) results.push(current);

// Sponsorluları filtrele
const organic = results.filter(b => !b.sponsored);

console.log(`Toplam: ${results.length} article, ${organic.length} organik\n`);
organic.forEach((b, i) => {
  console.log(`  ${i+1}. "${b.name}"`);
  console.log(`     ⭐ ${b.rating} (${b.reviewCount} yorum) | 📍 ${b.lat}, ${b.lng}`);
});
