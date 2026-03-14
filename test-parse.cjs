const fs = require('fs');
const text = fs.readFileSync(process.argv[2] || 'memory/snapshots/hodl-test.txt', 'utf8');

// Telefon
const phoneM = text.match(/button "Telefon: ([^"]+)" \[ref=e\d+\]/);
console.log('Telefon:', phoneM ? phoneM[1] : 'BULUNAMADI');

// Adres
const addrM = text.match(/button "Adres: ([^"]+)" \[ref=e\d+\]/);
console.log('Adres:', addrM ? addrM[1] : 'BULUNAMADI');

// Website
const webBtnM = text.match(/button "Web sitesi: ([^"]+)" \[ref=e\d+\]/);
const webLinkM = text.match(/\/url: (https?:\/\/(?!maps\.google|google\.com|goo\.gl|accounts\.google|support\.google)[^\n]{5,})/);
console.log('Website (btn):', webBtnM ? webBtnM[1] : 'BULUNAMADI');
console.log('Website (url):', webLinkM ? webLinkM[1] : 'BULUNAMADI');

// PlaceID
const placeM = text.match(/!1s(0x[0-9a-fA-F]+:[0-9a-fA-Fx]+)/);
console.log('PlaceID:', placeM ? placeM[1] : 'BULUNAMADI');

// Koordinat
const coordM = text.match(/@([0-9]{2}\.[0-9]+),([0-9]{2,3}\.[0-9]+)/);
console.log('Koordinat:', coordM ? `${coordM[1]}, ${coordM[2]}` : 'BULUNAMADI');

// Rating
const ratingM = text.match(/- text: ([0-9],[0-9])\s*$/m);
console.log('Rating:', ratingM ? ratingM[1] : 'BULUNAMADI');

// Review count
const reviewM = text.match(/img "([0-9.]+) yorum"/);
console.log('Yorum sayısı:', reviewM ? reviewM[1] : 'BULUNAMADI');
