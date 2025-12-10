import React, { useState } from 'react';
import { DailyReport, PortfolioItem } from '../types';
import StockCard from './StockCard';
import { updateReportPrices, updateStockPricesAPI, updateEntryPriceAPI, clearHistoryAPI } from '../services/apiService';

interface HistoryTableProps {
  reports: DailyReport[];
  onRefresh: () => void;
}

const HistoryTable: React.FC<HistoryTableProps> = ({ reports, onRefresh }) => {
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Consider the first report (newest) as the Active Portfolio
  const latestReport = reports.length > 0 ? reports[0] : null;

  const handleUpdatePrices = async (report: DailyReport) => {
    if (!report.id || !report.finalists) return;
    setUpdatingId(report.id);
    try {
      const updatedFinalists = await updateStockPricesAPI(report.finalists);
      await updateReportPrices(report.id, updatedFinalists);
      onRefresh();
    } catch (error) {
      console.error('Failed to update prices', error);
    } finally {
      setUpdatingId(null);
    }
  };

  if (!latestReport) {
    return <div className="text-center py-10 text-slate-400">目前無投資組合</div>;
  }

  // Only render the latest report
  const report = latestReport;

  return (
    <div className="space-y-8">
      <div key={report.id || report.timestamp} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {/* ... (Header content unchanged) ... */}
              <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full font-bold">
                CURRENT PORTFOLIO
              </span>
              <h3 className="text-lg font-bold text-slate-800">目前持倉 ({report.date})</h3>
            </div>
            <p className="text-sm text-slate-500 line-clamp-2 max-w-2xl">{report.newsSummary}</p>
          </div>
          <button
            onClick={() => handleUpdatePrices(report)}
            disabled={!!updatingId}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2
              ${updatingId === report.id
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
              }`}
          >
            {/* ... (Button content unchanged) ... */}
            {updatingId === report.id ? '更新中...' : '更新股價/報酬率'}
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {report.finalists?.map((stock, idx) => (
              <StockCard
                key={idx}
                stock={stock}
                type="finalist"
                onUpdatePrice={async (code, price) => {
                  if (!report.id) return;
                  try {
                    // Update frontend optimistcally or wait for refresh
                    // For now, simpler to just API call then refresh
                    await updateEntryPriceAPI(report.id, code, price);
                    // Refresh parent
                    onRefresh();
                  } catch (e) {
                    alert('更新失敗');
                    console.error(e);
                  }
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Sold Stocks Section */}
      {
        report.sold && report.sold.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                📉 已賣出/剔除 (Sold)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-medium">
                  <tr>
                    <th className="px-6 py-3">代號</th>
                    <th className="px-6 py-3">名稱</th>
                    <th className="px-6 py-3">進場價</th>
                    <th className="px-6 py-3">出場價</th>
                    <th className="px-6 py-3">報酬率</th>
                    <th className="px-6 py-3">賣出理由</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.sold.map((s, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-bold text-slate-700">{s.code}</td>
                      <td className="px-6 py-4 text-slate-600">{s.name}</td>
                      <td className="px-6 py-4 text-slate-500">{s.entryPrice}</td>
                      <td className="px-6 py-4 text-slate-500">{s.exitPrice}</td>
                      <td className={`px-6 py-4 font-bold ${s.roi >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        {s.roi ? s.roi.toFixed(2) : 0}%
                      </td>
                      <td className="px-6 py-4 text-slate-600 max-w-xs whitespace-pre-wrap">
                        {s.reason || 'AI 綜合判斷賣出/換股操作'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }

      {/* Optional: Show simpler log of past analysis dates if needed, or hide completely as per user request */}
      {
        reports.length > 1 && (
          <div className="text-center">
            <p className="text-xs text-slate-400">已隱藏 {reports.length - 1} 筆歷史紀錄</p>
          </div>
        )
      }

      {
        reports.length > 0 && (
          <div className="flex justify-center mt-8 pt-8 border-t border-slate-200">
            <button
              onClick={async () => {
                const pwd = prompt("請輸入密碼以清除所有歷史紀錄：");
                if (pwd) {
                  try {
                    await clearHistoryAPI(pwd);
                    alert("清除成功");
                    onRefresh();
                  } catch (e: any) {
                    alert(e.message || "清除失敗");
                  }
                }
              }}
              className="text-xs text-red-400 hover:text-red-600 font-mono hover:underline"
            >
              [危險操作] 清除歷史紀錄
            </button>
          </div>
        )
      }
    </div >
  );
};

export default HistoryTable;