
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
        console.error("[FinanceService] Error:", error);
        return null;
    }
};
