import { SMA, RSI } from 'technicalindicators';

const BASE_URL = 'https://api.fugle.tw/marketdata/v1.0/stock';

// Helper: Sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Rate Limited Fetcher
// Simple implementation: Just sleep 1.2s before every request to be safe (Limit 60/min = 1/s)
const callFugle = async (endpoint) => {
    // Lazy load env var to avoid ESM hoisting issues (server.js loads env later)
    const FUGLE_API_KEY = process.env.FUGLE_API_KEY;

    if (!FUGLE_API_KEY) throw new Error("FUGLE_API_KEY missing");

    // Global rate limiter (naive) - ensure we don't hit 429
    await sleep(1100);

    const url = `${BASE_URL}${endpoint}`;
    try {
        const response = await fetch(url, {
            headers: { 'X-API-KEY': FUGLE_API_KEY }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Fugle API Error ${response.status}: ${errText} `);
        }
        return await response.json();
    } catch (error) {
        console.error(`[Fugle] Request failed: ${url} `, error.message);
        throw error;
    }
};

// Helper: Strip Suffix (2330.TW -> 2330)
const cleanSymbol = (code) => {
    return String(code).replace('.TW', '').replace('.TWO', '').trim();
};

/**
 * Fetch historical data and calculate technical indicators
 * Uses Fugle Historical Candles API
 */
export async function analyzeStockTechnicals(code) {
    const symbol = cleanSymbol(code);

    try {
        // Calculate dates: 200 days approx
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 300); // Fetch enough for MA60

        const from = start.toISOString().split('T')[0];
        const to = end.toISOString().split('T')[0];

        const data = await callFugle(`/historical/candles/${symbol}?from=${from}&to=${to}&fields=open,high,low,close,volume`);

        // Fugle returns { symbol, type, data: [ { date, open, high, low, close, volume }, ... ] }
        if (!data || !data.data || data.data.length < 60) {
            return {
                code,
                action: 'NEUTRAL',
                technicalReason: '鞈?銝雲?⊥???',
                signals: [],
                price: 0,
                rsi: 50
            };
        }

        const historical = data.data.reverse(); // Fugle usually returns Descending (Newest first)? No, docs say Ascending usually? 
        // Let's check docs or assume standard API. 
        // Fugle Candles usually returns array. Let's sort by date ASC just in case.
        historical.sort((a, b) => new Date(a.date) - new Date(b.date));

        const closes = historical.map(d => d.close);
        const lastClose = closes[closes.length - 1];
        const prevClose = closes[closes.length - 2];

        // Calculate Indicators
        const ma5 = SMA.calculate({ period: 5, values: closes });
        const ma20 = SMA.calculate({ period: 20, values: closes });
        const ma60 = SMA.calculate({ period: 60, values: closes });

        const rsiValues = RSI.calculate({ values: closes, period: 14 });
        const currentRSI = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50;

        const currentMA5 = ma5[ma5.length - 1];
        const currentMA20 = ma20[ma20.length - 1];
        const currentMA60 = ma60[ma60.length - 1];

        const analysis = {
            code,
            symbol: symbol,
            price: lastClose,
            change: lastClose - prevClose,
            ma5: currentMA5,
            ma20: currentMA20,
            ma60: currentMA60,
            rsi: currentRSI,
            signals: [],
            action: 'NEUTRAL',
            technicalReason: ''
        };

        // --- RSI Logic ---
        if (currentRSI > 55) {
            analysis.signals.push('RSI_BULLISH');
            analysis.action = 'BUY';
            analysis.technicalReason += `RSI?(${currentRSI.toFixed(1)} > 55) ?撘瑕?; `;
        } else if (currentRSI < 45) {
            analysis.signals.push('RSI_BEARISH');
            analysis.action = 'SELL';
            analysis.technicalReason += `RSI頧摹(${currentRSI.toFixed(1)} < 45) ?銝雲; `;
        } else {
            analysis.technicalReason += `RSI?斗(${currentRSI.toFixed(1)}); `;
        }

        // MA Logic
        if (lastClose > currentMA20) {
            analysis.signals.push('MA20_BULLISH');
            if (analysis.action === 'NEUTRAL') analysis.action = 'HOLD';
        } else {
            analysis.signals.push('MA20_BEARISH');
            if (analysis.action === 'HOLD') analysis.action = 'SELL';
        }

        if (analysis.action === 'BUY') analysis.technicalReason = `?撘瑕] ${analysis.technicalReason} `;
        if (analysis.action === 'SELL') analysis.technicalReason = `?撘勗] ${analysis.technicalReason} `;

        return analysis;

    } catch (err) {
        console.error(`[FinanceService] Error analyzing ${code}: `, err.message);
        return {
            code,
            error: err.message,
            action: 'NEUTRAL',
            technicalReason: 'API ????航炊',
            signals: []
        };
    }
}

/**
 * Get real-time price from Fugle Intraday Quote
 */
export async function getStockPrice(code) {
    const symbol = cleanSymbol(code);
    try {
        const data = await callFugle(`/intraday/quote/${symbol}`);

        // Fugle Intraday Quote returns the quote object directly (flat)
        // structure: { lastPrice: 1480, closePrice: 1480, lastTrade: { price: 1480 }, ... }
        const price = data.lastPrice || data.closePrice || data.lastTrade?.price;
        return Number(price) || 0;

    } catch (e) {
        console.warn(`[FinanceService] Price fetch failed for ${code}: ${e.message} `);
        return 0;
    }
}

/**
 * Layer 2.5: The Tech Filter
 * Filters a list of stock codes based on Volume and Trend, using Fugle.
 */
export async function filterCandidates(candidates) {
    console.log(`[FinanceService] Tech Filter running on ${candidates.length} stocks using Fugle...`);
    const validStocks = [];

    // Deduplicate
    const uniqueMap = new Map();
    candidates.forEach(c => {
        const code = (typeof c === 'string') ? c : c.code;
        if (!uniqueMap.has(code)) uniqueMap.set(code, typeof c === 'string' ? { code } : c);
    });
    const uniqueItems = Array.from(uniqueMap.values());

    // Process sequentially with delay to respect Rate Limit (60/min)
    for (const item of uniqueItems) {
        const code = String(item.code).trim();
        console.log(`[Filter] Checking ${code}...`);

        try {
            // Re-use analyzeStockTechnicals to get OHLCV and RSI
            // It already has the 1.1s sleep built-in
            const ta = await analyzeStockTechnicals(code);

            // Access local scope historical if possible? 
            // analyzeStockTechnicals calls callFugle which has delay.
            // But we also need Volume. analyzeStockTechnicals returns RSI and Close, but maybe not Volume?
            // Actually it calculates RSI/MA from historical.
            // Let's check validStocks push logic.

            if (ta.error || ta.price === 0) continue;

            // We need Volume. analyzeStockTechnicals internal 'historical' has volume, but it returns 'analysis' object.
            // To properly filter volume, we should probably fetch data directly here or modify analyzeStockTechnicals to return volume.
            // BUT, to keep it simple and efficient (1 call per stock), let's assume if it passed 'analyzeStockTechnicals' successfully,
            // we can trust it or just skip volume check? 
            // NO, Volume > 1000 is a requirement.

            // Let's modify analyzeStockTechnicals slightly or just fetch again? 
            // Fetching again is bad (2x requests).
            // Let's trust Price > MA20 which is done in analyzeStockTechnicals logic (MA20_BULLISH signal).
            // But Volume? 

            // FOR NOW: Let's assume high volume if it's an AI pick, or we accept we lose volume filter strictly?
            // BETTER:  We can fetch candles here directly.

            const symbol = cleanSymbol(code);
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - 40);
            const from = start.toISOString().split('T')[0];
            const to = end.toISOString().split('T')[0];

            // This call sleeps 1s
            const raw = await callFugle(`/historical/candles/${symbol}?from=${from}&to=${to}&fields=open,high,low,close,volume`);

            if (!raw || !raw.data || raw.data.length < 20) continue;
            const hist = raw.data; // Fugle is usually newest?? No, verify.
            // Docs: "The order of data in array is ascending by date." (Oldest first)

            const lastData = hist[hist.length - 1];
            const close = lastData.close;
            const volume = lastData.volume || 0; // Fugle volume is usually in 'shares' or 'lots'? 
            // Fugle API Volume is "Turnover (shares)" or "Volume (shares)"?
            // Docs: volume (?漱???桐?嚗)
            // Requirement: > 1000 "lots" (撘? => > 1,000,000 shares

            if (volume < 1000 * 1000) {
                // console.log(`[Filter] ${ code } Volume too low: ${ Math.round(volume / 1000) } lots`);
                continue;
            }

            const closes = hist.map(d => d.close);
            const sum20 = closes.slice(-20).reduce((a, b) => a + b, 0);
            const ma20 = sum20 / 20;

            if (close < ma20) continue;

            const rsiVal = RSI.calculate({ values: closes, period: 14 });
            const currentRSI = rsiVal.length > 0 ? rsiVal[rsiVal.length - 1] : 50;

            validStocks.push({
                ...item,
                code: code,
                name: item.name || "", // Fugle doesn't return name in candles. We rely on AI's name for now.
                price: Number(close.toFixed(2)),
                volume: Math.round(volume / 1000),
                tech_note: `Price(${close.toFixed(2)}) > MA20(${ma20.toFixed(2)}) | RSI=${currentRSI.toFixed(1)} `
            });

        } catch (e) {
            console.warn(`[Filter] API Error for ${code}: ${e.message} `);
        }
    }

    console.log(`[FinanceService] Filter result: ${validStocks.length} passed.`);
    return validStocks;
}
