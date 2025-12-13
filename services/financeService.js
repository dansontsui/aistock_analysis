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
        // Suppress 404 logs (Resource Not Found = Invalid Stock Code)
        if (error.message.includes('404')) {
            // console.warn(`[Fugle] Symbol not found (404): ${endpoint}`);
            // Throwing is fine, caller handles it. just don't console.error big noise.
        } else {
            console.error(`[Fugle] Request failed: ${url} `, error.message);
        }
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
                technicalReason: '資料不足無法分析',
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
        const lastVolume = data.data[data.data.length - 1].volume || 0;

        const analysis = {
            code,
            symbol: symbol,
            price: lastClose,
            change: lastClose - prevClose,
            volume: lastVolume,
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
            analysis.technicalReason += `RSI強勢(${currentRSI.toFixed(1)} > 55) 動能強勁; `;
        } else if (currentRSI < 45) {
            analysis.signals.push('RSI_BEARISH');
            analysis.action = 'SELL';
            analysis.technicalReason += `RSI轉弱(${currentRSI.toFixed(1)} < 45) 動能不足; `;
        } else {
            analysis.technicalReason += `RSI中性(${currentRSI.toFixed(1)}); `;
        }

        // MA Logic
        if (lastClose > currentMA20) {
            analysis.signals.push('MA20_BULLISH');
            if (analysis.action === 'NEUTRAL') analysis.action = 'HOLD';
        } else {
            analysis.signals.push('MA20_BEARISH');
            if (analysis.action === 'HOLD') analysis.action = 'SELL';
        }

        if (analysis.action === 'BUY') analysis.technicalReason = `[強勢買進] ${analysis.technicalReason} `;
        if (analysis.action === 'SELL') analysis.technicalReason = `[弱勢賣出] ${analysis.technicalReason} `;

        return analysis;

    } catch (err) {
        // If it's a 404, it's just an invalid code, no need to scream error.
        if (!err.message.includes('404')) {
            console.error(`[FinanceService] Error analyzing ${code}: `, err.message);
        }
        return {
            code,
            error: err.message,
            action: 'NEUTRAL',
            technicalReason: '查無資料/代號錯誤',
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
            // Re-use analyzeStockTechnicals to get OHLCV and RSI (Consistent Formula!)
            const ta = await analyzeStockTechnicals(code);

            if (ta.error || ta.price === 0) continue;

            const close = ta.price;
            const ma20 = ta.ma20;
            const currentRSI = ta.rsi;
            const volume = ta.volume || 0;

            // Filter 1: Volume > 1000 lots
            if (volume < 1000 * 1000) {
                // console.log(`[Filter] ${ code } Volume too low: ${ Math.round(volume / 1000) } lots`);
                continue;
            }

            // Filter 2: Price > MA20 (Uptrend)
            if (close < ma20) continue;

            // Strict Filter: RSI MUST be > 55
            // [TEMPORARY] User requested to disable hard filter to test AI Prompt
            /* 
            if (currentRSI < 55) {
                continue;
            }
            */

            validStocks.push({
                ...item,
                code: code,
                name: item.name || "",
                price: Number(close.toFixed(2)),
                volume: Math.round(volume / 1000),
                tech_note: `Price > MA20 | Strong RSI=${currentRSI.toFixed(1)}`
            });

        } catch (e) {
            console.warn(`[Filter] API Error for ${code}: ${e.message} `);
        }
    }

    console.log(`[FinanceService] Filter result: ${validStocks.length} passed.`);
    return validStocks;
}

/**
 * Calculate Performance Statistics from Daily Reports
 * @param {import('better-sqlite3').Database} db 
 * @returns {Object|null} stats
 */
export const calculatePerformanceStats = (db) => {
    try {
        const rows = db.prepare('SELECT data, timestamp FROM daily_reports ORDER BY timestamp ASC').all();
        const allTrades = [];

        rows.forEach(row => {
            try {
                const d = JSON.parse(row.data);
                if (d.sold && Array.isArray(d.sold)) {
                    d.sold.forEach(trade => {
                        allTrades.push({
                            ...trade,
                            exitDate: trade.soldDate || new Date(row.timestamp).toISOString().split('T')[0],
                            timestamp: row.timestamp
                        });
                    });
                }
            } catch (e) { /* skip bad rows */ }
        });

        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        const calculateStats = (days) => {
            const cutoff = now - (days * oneDay);
            const periodTrades = allTrades.filter(t => t.timestamp >= cutoff);
            const count = periodTrades.length;
            const wins = periodTrades.filter(t => t.roi > 0).length;
            const winRate = count > 0 ? (wins / count) * 100 : 0;
            const avgRoi = count > 0 ? periodTrades.reduce((sum, t) => sum + (t.roi || 0), 0) / count : 0;
            const totalRoi = periodTrades.reduce((sum, t) => sum + (t.roi || 0), 0);

            return { count, wins, winRate, avgRoi, totalRoi };
        };

        const stats = {
            month1: calculateStats(30),
            month3: calculateStats(90),
            month6: calculateStats(180),
            year1: calculateStats(365),
            allTime: calculateStats(9999),
            currentHoldings: { count: 0, wins: 0, winRate: 0, avgRoi: 0, totalRoi: 0 } // Default
        };

        // Calculate current holdings stats
        try {
            const latestReport = db.prepare('SELECT data FROM daily_reports ORDER BY timestamp DESC LIMIT 1').get();
            if (latestReport) {
                const d = JSON.parse(latestReport.data);
                if (d.finalists && Array.isArray(d.finalists)) {
                    const currentH = d.finalists;
                    const count = currentH.length;
                    const wins = currentH.filter(s => (s.roi || 0) > 0).length;
                    const winRate = count > 0 ? (wins / count) * 100 : 0;
                    const avgRoi = count > 0 ? currentH.reduce((sum, s) => sum + (s.roi || 0), 0) / count : 0;
                    const totalRoi = currentH.reduce((sum, s) => sum + (s.roi || 0), 0);
                    stats.currentHoldings = { count, wins, winRate, avgRoi, totalRoi };
                }
            }
        } catch (e) {
            console.warn("[FinanceService] Failed to calc current holdings:", e);
        }

        return stats;
    } catch (error) {
        console.warn("[FinanceService] Error calc stats (returning empty):", error.message);
        // Return empty stats structure so UI doesn't crash/hide
        return {
            month1: { count: 0, wins: 0, winRate: 0, avgRoi: 0, totalRoi: 0 },
            month3: { count: 0, wins: 0, winRate: 0, avgRoi: 0, totalRoi: 0 },
            month6: { count: 0, wins: 0, winRate: 0, avgRoi: 0, totalRoi: 0 },
            year1: { count: 0, wins: 0, winRate: 0, avgRoi: 0, totalRoi: 0 },
            allTime: { count: 0, wins: 0, winRate: 0, avgRoi: 0, totalRoi: 0 },
            currentHoldings: { count: 0, wins: 0, winRate: 0, avgRoi: 0, totalRoi: 0 }
        };
    }
};
