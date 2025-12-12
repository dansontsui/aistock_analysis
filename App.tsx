
import React, { useState, useEffect } from 'react';
import { saveDailyReport, getDailyReports, generateCandidates, selectFinalists } from './services/apiService';
import { StockCandidate, PortfolioItem, AnalysisStatus, DailyReport, WebSource } from './types';
import StockCard from './components/StockCard';
import HistoryTable from './components/HistoryTable';
import EmailSubscription from './components/EmailSubscription';
import SettingsPanel from './components/SettingsPanel';
import PerformanceDashboard from './components/PerformanceDashboard';

const App: React.FC = () => {
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [candidates, setCandidates] = useState<StockCandidate[]>([]);
  const [finalists, setFinalists] = useState<PortfolioItem[]>([]);
  const [newsSummary, setNewsSummary] = useState<string>("");
  const [sources, setSources] = useState<WebSource[]>([]);
  const [history, setHistory] = useState<DailyReport[]>([]);
  const [activeTab, setActiveTab] = useState<'today' | 'history' | 'settings'>('today');
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const data = await getDailyReports();
    setHistory(data);
    setRefreshTrigger(prev => prev + 1); // Also refresh dashboard
  };

  const downloadDb = async () => {
    setIsDownloading(true);

    // 定義可能的路徑
    const urls = ['/api/backup', 'http://localhost:8080/api/backup'];
    let success = false;

    for (const url of urls) {
      try {
        console.log(`Checking connection to ${url}...`);
        // 使用 HEAD 請求快速檢查檔案是否存在/伺服器是否活著
        // 避免下載整個檔案才發現錯誤
        const res = await fetch(url, { method: 'HEAD' });

        if (res.ok) {
          console.log(`Connection successful. Opening download: ${url}`);
          // 直接開啟連結，這是觸發瀏覽器下載最可靠的方法
          window.open(url, '_blank');
          success = true;
          break;
        }
      } catch (e) {
        console.log(`Failed to connect to ${url}`, e);
      }
    }

    if (!success) {
      // 如果自動偵測都失敗，詢問使用者是否強制嘗試
      if (confirm("自動偵測下載路徑失敗。可能伺服器未回應或是跨域限制。\n\n是否嘗試強制開啟備用下載連結 (http://localhost:8080/api/backup)？")) {
        window.open('http://localhost:8080/api/backup', '_blank');
      }
    }

    // 稍微延遲一下再恢復按鈕狀態，讓使用者感覺到操作已完成
    setTimeout(() => setIsDownloading(false), 2000);
  };

  const handleRetrySave = async () => {
    setStatus(AnalysisStatus.SAVING);
    const today = new Date().toISOString().split('T')[0];
    const newReport: Omit<DailyReport, 'id'> = {
      date: today,
      newsSummary: newsSummary,
      candidates: candidates,
      finalists: finalists,
      sources: sources,
      timestamp: Date.now()
    };

    const savedId = await saveDailyReport(newReport);

    if (savedId) {
      setHistory(prev => {
        // Remove temp report if exists
        const filtered = prev.filter(r => !String(r.id).startsWith('temp'));
        return [{ ...newReport, id: savedId }, ...filtered];
      });
      setStatus(AnalysisStatus.COMPLETED);
    } else {
      // Still failed, keep status as completed but let UI show warning again
      setStatus(AnalysisStatus.COMPLETED);
      alert("連線仍失敗，請檢查後端伺服器。");
    }
  };

  const startAnalysis = async () => {
    setStatus(AnalysisStatus.ANALYZING_NEWS);
    setErrorMessage("");
    setCandidates([]);
    setFinalists([]);
    setNewsSummary("");
    setSources([]);

    try {
      // Step 1: News & 10 Candidates
      const step1Result = await generateCandidates();
      setCandidates(step1Result.candidates);
      setNewsSummary(step1Result.newsSummary);
      setSources(step1Result.sources);

      setStatus(AnalysisStatus.FILTERING_FINALISTS);

      // Step 2: Pick Top 3
      const step2Result = await selectFinalists(step1Result.candidates, step1Result.newsSummary);
      setFinalists(step2Result.finalists);
      // We might want to show sold items in UI too, but for now just save them.
      const soldItems = step2Result.sold;

      setStatus(AnalysisStatus.SAVING);

      // Step 3: Save to SQLite (via API)
      const today = new Date().toISOString().split('T')[0];
      const newReport: Omit<DailyReport, 'id'> = {
        date: today,
        newsSummary: step1Result.newsSummary,
        candidates: step1Result.candidates,
        finalists: step2Result.finalists,
        sold: soldItems,
        sources: step1Result.sources,
        timestamp: Date.now()
      };

      const savedId = await saveDailyReport(newReport);

      // Optimistically update history regardless of API success (so user sees result in demo)
      setHistory(prev => [{ ...newReport, id: savedId || `temp-${Date.now()}` }, ...prev]);

      setStatus(AnalysisStatus.COMPLETED);

    } catch (error: any) {
      console.error(error);
      const msg = error.message || "發生未知錯誤。";
      // Show detailed error
      setErrorMessage(`分析失敗: ${msg} (請檢查終端機的伺服器 Log)`);
      setStatus(AnalysisStatus.ERROR);
    }
  };

  // Determine if the latest report is saved or temp
  const isLatestTemp = history.length > 0 && history[0].id && String(history[0].id).startsWith('temp');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
              TW
            </div>
            <div className="flex flex-col">
              <h1 className="text-xl font-bold tracking-tight text-slate-800 leading-none">
                台股 AI 分析師
              </h1>
              <span className="text-xs text-slate-500 font-mono mt-0.5">
                v2.7.3 <span className="text-indigo-600 font-bold bg-indigo-50 px-1 rounded">Latest: 每日郵件績效儀表板美化 (Table Layout)</span>
              </span>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {/* Version History Tooltip / Popover could go here, for now simpler is better */}
            {/* Backup Download Button */}
            <button
              onClick={downloadDb}
              disabled={isDownloading}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors border border-transparent mr-2
                 ${isDownloading
                  ? 'bg-slate-100 text-slate-400 cursor-wait'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 hover:border-slate-200'}`}
              title="下載 SQLite 資料庫備份"
            >
              {isDownloading ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="hidden sm:inline">準備中...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  <span className="hidden sm:inline">下載 DB</span>
                </>
              )}
            </button>

            <button
              onClick={() => setActiveTab('today')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'today' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            >
              每日分析
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'history' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            >
              歷史績效
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'settings' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            >
              系統設定 (System)
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {activeTab === 'today' && (
          <div className="space-y-8">
            {/* Control Panel */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-center">
              <h2 className="text-2xl font-bold mb-4">每日市場策略</h2>
              <p className="text-slate-500 mb-6 max-w-2xl mx-auto">
                啟動 AI 掃描國內外新聞，生成 10 檔候選股，並篩選出前 3 名最佳標的存入投資組合。
              </p>

              <button
                onClick={startAnalysis}
                disabled={status !== AnalysisStatus.IDLE && status !== AnalysisStatus.COMPLETED && status !== AnalysisStatus.ERROR}
                className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-full text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg w-full sm:w-auto"
              >
                {status === AnalysisStatus.IDLE || status === AnalysisStatus.COMPLETED || status === AnalysisStatus.ERROR ? (
                  <>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    開始 AI 分析
                  </>
                ) : (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {status === AnalysisStatus.ANALYZING_NEWS && "正在掃描市場新聞..."}
                    {status === AnalysisStatus.PICKING_CANDIDATES && "正在挑選 10 檔候選股..."}
                    {status === AnalysisStatus.FILTERING_FINALISTS && "正在篩選前 3 名精選..."}
                    {status === AnalysisStatus.SAVING && "正在存入資料庫..."}
                  </>
                )}
              </button>

              {status === AnalysisStatus.ERROR && (
                <div className="mt-4 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg text-left">
                  <p className="font-bold">分析錯誤</p>
                  <p className="text-sm">{errorMessage}</p>
                </div>
              )}
            </div>

            {/* Results Section */}
            {(candidates.length > 0 || newsSummary) && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Column: Context & Candidates */}
                <div className="lg:col-span-2 space-y-8">
                  {/* News Summary */}
                  {newsSummary && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                      <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
                        市場脈動
                      </h3>
                      <div className="text-slate-600 leading-relaxed mb-4 whitespace-pre-line text-[15px]">
                        {/* Auto-format: Add line breaks after periods if it's a long block of text */}
                        {newsSummary.includes('•')
                          ? newsSummary
                          : newsSummary.replace(/。/g, '。\n\n')}
                      </div>

                      {/* Sources Display */}
                      {sources.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">新聞來源</h4>
                          <div className="flex flex-wrap gap-2">
                            {sources.map((source, idx) => (
                              <a
                                key={idx}
                                href={source.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors truncate max-w-[200px]"
                                title={source.title}
                              >
                                {source.title || new URL(source.uri).hostname}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 10 Candidates Grid */}
                  {candidates.length > 0 && (
                    <div>
                      <h3 className="text-lg font-bold text-slate-800 mb-4 px-1">初選 10 檔觀察名單</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {candidates.map((stock, idx) => (
                          <StockCard key={idx} stock={stock} type="candidate" />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: Finalists */}
                <div className="lg:col-span-1">
                  <div className="sticky top-24">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                      AI 精選前 3 名
                    </h3>

                    {finalists.length === 0 && status !== AnalysisStatus.IDLE && status !== AnalysisStatus.COMPLETED && status !== AnalysisStatus.ERROR && (
                      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 text-center text-indigo-800 animate-pulse">
                        AI 正在分析候選名單...
                      </div>
                    )}

                    <div className="space-y-4">
                      {finalists.map((stock, idx) => (
                        <StockCard key={idx} stock={stock} type="finalist" />
                      ))}
                    </div>

                    {finalists.length > 0 && (
                      <div className={`mt-6 p-4 rounded-xl text-sm border ${!isLatestTemp ? 'bg-green-50 text-green-800 border-green-200' : 'bg-yellow-50 text-yellow-800 border-yellow-200'}`}>
                        <div className="flex justify-between items-center mb-2">
                          <p className="font-semibold">
                            {!isLatestTemp ? '已儲存至 SQLite' : '預覽模式 (未儲存)'}
                          </p>
                          {isLatestTemp && (
                            <button
                              onClick={handleRetrySave}
                              className="px-2 py-1 text-xs bg-yellow-200 hover:bg-yellow-300 text-yellow-800 rounded border border-yellow-400 transition-colors"
                            >
                              重試儲存
                            </button>
                          )}
                        </div>
                        <p>
                          {!isLatestTemp
                            ? '選股結果已記錄，請查看歷史分頁。'
                            : '選股已完成，但伺服器連線異常。請確認 server.js 是否執行中，或點擊「重試」。'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-8">
            <PerformanceDashboard refreshTrigger={refreshTrigger} />
            <HistoryTable reports={history} onRefresh={loadHistory} />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-3xl mx-auto space-y-12">
            <EmailSubscription />
            <SettingsPanel />
          </div>
        )}

      </main>
    </div>
  );
};

export default App;
