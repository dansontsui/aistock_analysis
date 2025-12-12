import React, { useEffect, useState } from 'react';
import { getPerformanceStats } from '../services/apiService';

interface Stats {
    count: number;
    wins: number;
    winRate: number;
    avgRoi: number;
    totalRoi: number;
}

interface PerformanceData {
    month1: Stats;
    month3: Stats;
    month6: Stats;
    year1: Stats;
    allTime: Stats;
    currentHoldings?: Stats;
}

const StatCard: React.FC<{ label: string; stats: Stats; highlight?: boolean }> = ({ label, stats, highlight }) => {
    const isPositive = stats.avgRoi >= 0;
    return (
        <div className={`p-4 rounded-xl border ${highlight ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'} shadow-sm`}>
            <div className="text-sm text-slate-500 font-medium mb-1">{label}</div>
            <div className="flex items-end gap-2">
                <span className={`text-2xl font-bold ${isPositive ? 'text-red-500' : 'text-emerald-500'}`}>
                    {stats.avgRoi.toFixed(1)}%
                </span>
                <span className="text-xs text-slate-400 mb-1">
                    (Avg ROI)
                </span>
            </div>
            <div className="mt-3 flex justify-between text-xs text-slate-500 border-t border-slate-100 pt-2">
                <div>
                    勝率: <span className="font-bold text-slate-700">{stats.winRate.toFixed(0)}%</span>
                </div>
                <div>
                    交易: {stats.count} 筆
                </div>
            </div>
            <div className="mt-1 text-xs text-slate-400">
                累積: {stats.totalRoi.toFixed(1)}%
            </div>
        </div>
    );
};

const PerformanceDashboard: React.FC<{ refreshTrigger: number }> = ({ refreshTrigger }) => {
    const [data, setData] = useState<PerformanceData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        getPerformanceStats()
            .then(setData)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [refreshTrigger]);

    if (loading) return <div className="text-center py-4 text-slate-400">載入績效數據中...</div>;
    if (!data) return null;

    return (
        <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                📊 績效儀表板 (AI Trader Performance)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="近 30 天" stats={data.month1} />
                <StatCard label="近 3 個月" stats={data.month3} highlight={true} />
                <StatCard label="近半年" stats={data.month6} />
                {data.currentHoldings && (
                    <StatCard label="目前持倉 (未實現)" stats={data.currentHoldings} highlight={true} />
                )}
            </div>
        </div>
    );
};

export default PerformanceDashboard;
