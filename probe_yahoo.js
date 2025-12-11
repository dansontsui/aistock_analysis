const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

async function probe() {
    const symbol = '1519.TW';
    console.log(`Checking ${symbol}...`);
    try {
        const quote = await yahooFinance.quote(symbol);
        console.log('--- QUOTE ---');
        console.log('Regular Market Price:', quote.regularMarketPrice);
        console.log('Regular Market Time:', quote.regularMarketTime);
        console.log('Post Market Price:', quote.postMarketPrice);
        console.log('Post Market Time:', quote.postMarketTime);
        console.log('Bid:', quote.bid);
        console.log('Ask:', quote.ask);

        // Check historical
        const queryOptions = { period1: '2024-12-01', period2: '2025-12-30' };
        const historical = await yahooFinance.historical(symbol, queryOptions);
        const last = historical[historical.length - 1];
        console.log('--- HISTORICAL ---');
        console.log('Last Hist Date:', last.date);
        console.log('Last Hist Close:', last.close);
        console.log('Last Hist High:', last.high);

    } catch (e) {
        console.error(e);
    }
}

probe();
