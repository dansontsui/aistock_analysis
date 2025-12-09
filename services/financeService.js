import YahooFinance from 'yahoo-finance2';
import { SMA } from 'technicalindicators';

// Create instance with options
const yahooFinance = new YahooFinance({
    suppressNotices: ['yahooSurvey', 'deprecated']
});

/**
 * Fetch historical data and calculate technical indicators
 * @param {string} code - Stock code (e.g., "2330")
 * @returns {Promise<object>} Technical analysis result
 */
export async function analyzeStockTechnicals(code) {
    try {
        const symbol = `${code}.TW`;

        // 1. Fetch Historical Data (Last 150 days to ensure enough for MA60)
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 200); // 200 days buffer

        const queryOptions = {
            period1: start.toISOString().split('T')[0],
            interval: '1d'
        };

        const historical = await yahooFinance.historical(symbol, queryOptions);

        if (!historical || historical.length < 60) {
            console.warn(`[FinanceService] Not enough data for ${symbol}`);
            return { status: 'UNKNOWN', reason: '資料不足無法分析' };
        }

        // Sort by date ascending just in case
        // historical.sort((a, b) => new Date(a.date) - new Date(b.date));

        const closes = historical.map(d => d.close);
        const highs = historical.map(d => d.high);
        const lastClose = closes[closes.length - 1];
        const prevClose = closes[closes.length - 2];
        const prev2Close = closes[closes.length - 3];

        // 2. Calculate Indicators
        const ma5 = SMA.calculate({ period: 5, values: closes });
        const ma10 = SMA.calculate({ period: 10, values: closes });
        const ma20 = SMA.calculate({ period: 20, values: closes });
        const ma60 = SMA.calculate({ period: 60, values: closes });

        // Get latest values (arrays might be shorter than closes due to period)
        const currentMA5 = ma5[ma5.length - 1];
        const currentMA10 = ma10[ma10.length - 1];
        const currentMA20 = ma20[ma20.length - 1];
        const currentMA60 = ma60[ma60.length - 1];

        // Get previous values for trend detection
        // const prevMA5 = ma5[ma5.length - 2];
        // const prevMA10 = ma10[ma10.length - 2];

        // 3. Logic Implementation
        const analysis = {
            code,
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
        // Condition: Price < MA20 AND (MA5 < MA10 OR Close < MA20 for 2 days)
        const isBelowMA20 = lastClose < currentMA20;
        const isMomentumWeak = (currentMA5 < currentMA10) || (prevClose < currentMA20 && lastClose < currentMA20);

        if (isBelowMA20 && isMomentumWeak) {
            analysis.signals.push('TREND_REVERSAL');
            analysis.action = 'SELL';
            analysis.technicalReason += '跌破月線且動能轉弱(MA5<MA10或連兩日收黑)，趨勢反轉出場。';
        }

        // --- B. Exit Strategy 2: Trailing Stop (停利) ---
        // Condition 1: High Bias Reversal -> (Price - MA20)/MA20 > 15% sometime recently, now Price < MA10
        // Check if max bias in last 20 days was > 15%
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

        // Condition 2: Drawdown > 10% from Recent High (e.g., 60 days)
        const recentHigh = Math.max(...highs.slice(-60));
        const drawdown = (recentHigh - lastClose) / recentHigh;
        const isHighDrawdown = drawdown > 0.10;

        if (isHighBiasReversal) {
            analysis.signals.push('HIGH_BIAS_REVERSAL');
            analysis.action = 'SELL';
            analysis.technicalReason += '乖離過大後跌破 10 日線，獲利了結。';
        } else if (isHighDrawdown) {
            analysis.signals.push('high_drawdown'); // corrected casing
            analysis.action = 'SELL';
            analysis.technicalReason += `從近期高點(${recentHigh})回檔超過 10%，執行停利保護。`;
        }

        // --- C. Buy Strategy Criteria (for Candidates) ---
        // Price > MA20 > MA60 (Strong Uptrend)
        // Note: This flag is for entering new stocks, not necessarily for selling existing ones (unless they violate hold rules)
        const isStrongUptrend = (lastClose > currentMA20) && (currentMA20 > currentMA60);
        if (isStrongUptrend) {
            analysis.signals.push('STRONG_UPTREND');
            // If not already sell, we can reaffirm HOLD or BUY
            if (analysis.action !== 'SELL') {
                analysis.action = 'BUY_OR_HOLD';
                analysis.technicalReason = '股價位於月線之上且均線多頭排列，技術面強勢。';
            }
        } else if (lastClose < currentMA60) {
            // Weak trend filter for buying
            analysis.signals.push('WEAK_TREND');
            if (analysis.action !== 'SELL') {
                // Just a warning, doesn't force sell unless MA20 rule hit
                analysis.technicalReason += '股價低於季線，長線偏弱。';
            }
        }

        return analysis;

    } catch (error) {
        console.error(`[FinanceService] Error analyzing ${code}:`, error.message);
        return { code, error: error.message, action: 'NEUTRAL', technicalReason: '技術分析數據取得失敗' };
    }
}
