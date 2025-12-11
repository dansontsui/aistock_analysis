const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

async function testFetch() {
    const symbol = '2330.TW';
    const end = new Date();
    end.setDate(end.getDate() + 1); // Tomorrow

    const start = new Date();
    start.setDate(start.getDate() - 200);

    const queryOptions = {
        period1: start.toISOString().split('T')[0],
        period2: end.toISOString().split('T')[0],
        interval: '1d'
    };

    console.log(`Fetching ${symbol} with options:`, queryOptions);

    try {
        const historical = await yahooFinance.historical(symbol, queryOptions);
        console.log(`Success! Fetched ${historical.length} records.`);
        const last = historical[historical.length - 1];
        console.log('Last record:', last);
    } catch (e) {
        console.error('Fetch Failed:', e.message);
        if (e.result) console.error('Partial result:', e.result);
    }
}

testFetch();
