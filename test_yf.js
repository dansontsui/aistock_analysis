import YahooFinance from 'yahoo-finance2';

async function test() {
    try {
        const yf = new YahooFinance();

        const symbol = '2330.TW';
        console.log(`[1] Fetching Quote for ${symbol}...`);
        const quote = await yf.quote(symbol);
        console.log(`[Success] Results for ${quote.symbol} (${quote.longName}):`);
        console.log(` - Price: ${quote.regularMarketPrice}`);
        console.log(` - Previous Close: ${quote.regularMarketPreviousClose}`);
        console.log(` - Open: ${quote.regularMarketOpen}`);
        console.log(` - Volume: ${quote.regularMarketVolume}`);

    } catch (e) {
        console.error('Test Failed:', e);
    }
}

test();
