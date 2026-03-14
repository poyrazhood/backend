import scrapling
import asyncio

async def scrape_hotels():
    response = await scrapling.run({
        'url': 'https://www.google.com/maps/search/oteller+Konya',
        'method': 'get',
        'options': {
            'maxResults': 10,
        }
    })

    print('Top 10 hotels in Konya:', response)

if __name__ == "__main__":
    asyncio.run(scrape_hotels())