import YahooFinance from 'yahoo-finance2';
import { SMA } from 'technicalindicators';

// Create instance with options
const yahooFinance = new YahooFinance({
    suppressNotices: ['yahooSurvey', 'deprecated', 'ripHistorical']
});

/**
 * Fetch historical data and calculate technical indicators
 * Supports both .TW (TSE) and .TWO (OTC) suffixes automatically.
 * @param {string} code - Stock code (e.g., "2330", "8358")
 * @returns {Promise<object>} Technical analysis result
 */
export async function analyzeStockTechnicals(code) {
    // Suffixes to try: .TW (Listed), .TWO (OTC)
    const suffixes = ['.TW', '.TWO'];
    let historical = null;
    let successfulSymbol = "";
    let lastError = null;

    // 1. Fetch Historical Data (Try suffixes)
    for (const suffix of suffixes) {
        const symbol = `${code}${suffix}`;
        try {
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - 200); // 200 days buffer

            const queryOptions = {
                period1: start.toISOString().split('T')[0],
                period2: end.toISOString().split('T')[0],
                interval: '1d'
            };

            // Retry logic for connection glitches per symbol
            let retries = 3;
            while (retries > 0) {
                try {
                    historical = await yahooFinance.historical(symbol, queryOptions);
                    if (historical && historical.length > 0) {
                        successfulSymbol = symbol;
                        break; // Inner retry break
                    }
                } catch (err) {
                    if (err.message.includes('No data found') || err.message.includes('delisted') || err.message.includes('Not Found')) {
                        throw err; // Break to outer loop to try next suffix
                    }
                    retries--;
                    if (retries === 0) throw err;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            if (successfulSymbol) break; // Found data, stop trying suffixes

        } catch (err) {
            // console.warn(`[FinanceService] info: ${symbol} not found or failed.`);
            lastError = err;
        }
    }

    if (!successfulSymbol || !historical || historical.length < 60) {
        console.warn(`[FinanceService] Failed to fetch data for ${code} (tried .TW, .TWO). Reason: ${lastError?.message || 'Data insufficient'}`);
        return {
            code,
            status: 'UNKNOWN',
            reason: lastError?.message || '資料不足無法分析',
            signals: [],
            action: 'NEUTRAL',
            technicalReason: '無法取得股價資料'
        };
    }

    try {
        // ... Logic continues with 'historical' ...
        // Sort by date ascending just in case
        // historical.sort((a, b) => new Date(a.date) - new Date(b.date));

        const closes = historical.map(d => d.close);
        const highs = historical.map(d => d.high);
        const lastClose = closes[closes.length - 1];
        const prevClose = closes[closes.length - 2];

        // 2. Calculate Indicators
        const ma5 = SMA.calculate({ period: 5, values: closes });
        const ma10 = SMA.calculate({ period: 10, values: closes });
        const ma20 = SMA.calculate({ period: 20, values: closes });
        const ma60 = SMA.calculate({ period: 60, values: closes });

        // Get latest values
        const currentMA5 = ma5[ma5.length - 1];
        const currentMA10 = ma10[ma10.length - 1];
        const currentMA20 = ma20[ma20.length - 1];
        const currentMA60 = ma60[ma60.length - 1];

        // 3. Logic Implementation
        const analysis = {
            code,
            symbol: successfulSymbol, // useful for debug
            price: lastClose,
            ma5: currentMA5,
            ma10: currentMA10,
            ma20: currentMA20,
            ma60: currentMA60,
            signals: [],
            action: 'HOLD', // Default
            technicalReason: ''
        };

        // --- A. Exit Strategy 1: Trend Reversal (防守) ---
        const isBelowMA20 = lastClose < currentMA20;
        const isMomentumWeak = (currentMA5 < currentMA10) || (prevClose < currentMA20 && lastClose < currentMA20);

        if (isBelowMA20 && isMomentumWeak) {
            analysis.signals.push('TREND_REVERSAL');
            analysis.action = 'SELL';
            analysis.technicalReason += '跌破月線且動能轉弱(MA5<MA10或連兩日收黑)，趨勢反轉出場。';
        }

        // --- B. Exit Strategy 2: Trailing Stop (停利) ---
        const recentCloses = closes.slice(-20);
        const recentMA20s = ma20.slice(-20);
        let maxBias = 0;
        for (let i = 0; i < recentCloses.length; i++) {
            if (recentMA20s[i]) {
                const bias = (recentCloses[i] - recentMA20s[i]) / recentMA20s[i];
                if (bias > maxBias) maxBias = bias;
            }
        }
        const isHighBiasReversal = (maxBias > 0.15) && (lastClose < currentMA10);

        const recentHigh = Math.max(...highs.slice(-60));
        const drawdown = (recentHigh - lastClose) / recentHigh;
        const isHighDrawdown = drawdown > 0.10;

        if (isHighBiasReversal) {
            analysis.signals.push('HIGH_BIAS_REVERSAL');
            analysis.action = 'SELL';
            analysis.technicalReason += '乖離過大後跌破 10 日線，獲利了結。';
        } else if (isHighDrawdown) {
            analysis.signals.push('high_drawdown');
            analysis.action = 'SELL';
            analysis.technicalReason += `從近期高點(${recentHigh})回檔超過 10%，執行停利保護。`;
        }

        // --- C. Buy Strategy Criteria ---
        const isStrongUptrend = (lastClose > currentMA20) && (currentMA20 > currentMA60);
        if (isStrongUptrend) {
            analysis.signals.push('STRONG_UPTREND');
            if (analysis.action !== 'SELL') {
                analysis.action = 'BUY_OR_HOLD';
                analysis.technicalReason = '股價位於月線之上且均線多頭排列，技術面強勢。';
            }
        } else if (lastClose < currentMA60) {
            analysis.signals.push('WEAK_TREND');
            if (analysis.action !== 'SELL') {
                analysis.technicalReason += '股價低於季線，長線偏弱。';
            }
        }

        return analysis;

    } catch (error) {
        console.error(`[FinanceService] Error analyzing ${code}:`, error.message);
        return {
            code,
            error: error.message,
            action: 'NEUTRAL',
            technicalReason: '技術分析運算錯誤',
            signals: []
        };
    }
}

/**
 * Get real-time/delayed price from Yahoo Finance
 * Supports both .TW and .TWO suffixes.
 * @param {string} code 
 * @returns {Promise<number>} price (or 0 if failed)
 */
export async function getStockPrice(code) {
    const suffixes = ['.TW', '.TWO'];

    for (const suffix of suffixes) {
        const symbol = `${code}${suffix}`;
        try {
            const quote = await yahooFinance.quote(symbol);
            if (quote && quote.regularMarketPrice) {
                return quote.regularMarketPrice;
            }
        } catch (e) {
            // Ignore error and try next suffix, unless it's a network error maybe?
            // console.warn(`[FinanceService] Price fetch failed for ${symbol}: ${e.message}`);
        }
    }

    // If we reach here, both failed
    console.warn(`[FinanceService] Failed to get price for ${code} (checked .TW, .TWO)`);
    return 0;
}

/**
 * Layer 2.5: The Tech Filter
 * Filters a list of stock codes based on Volume, Trend (MA), and RSI.
 * @param {string[]} stockCodes - List of stock codes (e.g., ["2330", "2603"])
 * @returns {Promise<object[]>} List of valid stocks with technical details
 */
export async function filterCandidates(candidates) {
    console.log(`[FinanceService] Tech Filter running on ${candidates.length} stocks...`);
    const validStocks = [];

    // Deduplicate by code
    const uniqueMap = new Map();
    candidates.forEach(c => {
        const code = (typeof c === 'string') ? c : c.code;
        if (!uniqueMap.has(code)) uniqueMap.set(code, typeof c === 'string' ? { code } : c);
    });
    const uniqueItems = Array.from(uniqueMap.values());

    for (const item of uniqueItems) {
        const code = item.code;
        try {
            const suffixes = ['.TW', '.TWO'];
            let historical = null;
            let successfulSymbol = "";
            let stockName = item.name || "";

            for (const suffix of suffixes) {
                try {
                    const symbol = `${code}${suffix}`;
                    const end = new Date();
                    const start = new Date();
                    start.setDate(start.getDate() - 40);

                    const queryOptions = { period1: start.toISOString().split('T')[0], period2: end.toISOString().split('T')[0], interval: '1d' };
                    historical = await yahooFinance.historical(symbol, queryOptions);

                    if (historical && historical.length > 20) {
                        successfulSymbol = symbol;

                        // Try to get name if missing
                        if (!stockName) {
                            try {
                                const q = await yahooFinance.quote(symbol);
                                if (q) stockName = q.shortName || q.longName || "";
                            } catch (e) { }
                        }
                        break;
                    }
                } catch (e) { /* continue */ }
            }

            if (!historical || historical.length < 20) continue;

            const lastData = historical[historical.length - 1];
            const close = lastData.close;
            const volume = lastData.volume || 0;

            // 1. Volume Filter: Yesterday Volume > 1000 lots
            if (volume < 1000 * 1000) continue;

            // 2. Trend Filter: Price > MA20
            const closes = historical.map(d => d.close);
            const sum20 = closes.slice(-20).reduce((a, b) => a + b, 0);
            const ma20 = sum20 / 20;

            if (close < ma20) continue;

            validStocks.push({
                ...item, // Keep existing metadata (theme, reason)
                code: code,
                name: stockName,
                price: close,
                volume: Math.round(volume / 1000),
                tech_note: `Price(${close}) > MA20(${ma20.toFixed(2)})`
            });

        } catch (error) {
            console.warn(`[Filter] Error checking ${code}: ${error.message}`);
        }
    }

    console.log(`[FinanceService] Filter result: ${validStocks.length} passed out of ${uniqueItems.length}`);
    return validStocks;
}
