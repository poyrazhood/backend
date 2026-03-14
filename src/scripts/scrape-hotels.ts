import { scrapling } from 'scrapling';

async function scrapeHotels() {
  const results = await scrapling.run({
    url: 'https://www.google.com/maps/search/oteller+Konya',
    method: 'get',
    options: {
      maxResults: 10,
    }
  });

  console.log('Top 10 hotels in Konya:', results);
}

scrapeHotels().catch(e => {
  console.error(e);
  process.exit(1);
});