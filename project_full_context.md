# Project Export

Generated on: 2025-12-12T04:31:41.733Z
Total Files: 37

## Project Structure
```text
.gitignore
AI檢測方式 .md
App.tsx
cloud_run_deploy.md
components/EmailSubscription.tsx
components/HistoryTable.tsx
components/PerformanceDashboard.tsx
components/SettingsPanel.tsx
components/StockCard.tsx
debug_fetch.js
Dockerfile
export_project_to_md.js
firebaseConfig.ts
handover_summary.md
implementation_plan.md
index.html
index.tsx
metadata.json
package.json
probe_yahoo.js
project_summary.md
README.md
server.js
services/apiService.ts
services/emailService.js
services/financeService.js
services/firestoreService.ts
services/geminiService.ts
services/logger.js
services/settingsService.ts
tests/e2e_test.js
tests/fix_db_limit.js
tests/inspect_db.js
test_yf.js
tsconfig.json
types.ts
vite.config.ts
```

## File: .gitignore
```text
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

cloud_run_deploy.md

# Database
*.db
*.db-shm
*.db-wal

```

---

## File: AI檢測方式 .md
```markdown
技術面防火牆 (The Technical Firewall)
此階段由 Node.js (Yahoo Finance) 負責計算，不帶感情地過濾 AI 的名單。
我們採用 RSI (相對強弱) 或 KD (隨機指標) 作為裁判。
技術過濾標準 (二選一，推薦 RSI)
1.方案 A：RSI 動能策略 (推薦：穩健波段)過濾邏輯：我們只買「強勢股」，不買「反彈股」。多方標準 (Pass)：RSI > 55 (代表買盤強勁，進入攻擊區)。空方標準 (Fail)：RSI < 45 (代表動能轉弱，主力撤退)。
	投資組合決策 (Portfolio Decision Logic)這是系統的大腦，負責決定當天要下單買賣什麼。假設投資組合上限為 5 檔。
2.賣出檢核 (優先執行) 🔴原則：只看技術面，AI 無權干涉。每天檢查庫存中的每一檔股票：獲利了結/停損條件：
	若使用 RSI：當 RSI 跌破 45 $\rightarrow$ 市價賣出。若使用 KD：
	當 KD 死亡交叉 $\rightarrow$ 市價賣出。
	硬性停損：若帳面虧損超過 10% $\rightarrow$ 強制賣出 (保命條款)。
	例外：即使這檔股票今天被 AI 剔除出榜單，只要技術指標沒壞 (RSI > 45)，就必須續抱。

3.買進檢核 (有空位才執行) 🔵原則：AI 推薦 + 技術認證。如果賣出後手上有現金（持股少於 5 檔）：從 AI 今天的「觀察名單」中挑選。檢查該股票的技術指標：若符合 多方標準 (RSI > 55 或 KD 金叉) $\rightarrow$ 市價買進。若不符合 $\rightarrow$ 放入觀察區，今日不動作 (避免接到正在跌的新聞股)。
4.下單與紀錄：依照訊號執行下單。系統將今日的買賣動作、成交價格寫入 history (歷史帳本)。
5.績效追蹤與優化 (Performance Tracking)為了長期驗證這套策略，
	系統會自動維護一份歷史紀錄表。每日紀錄：日期、總資產淨值、持倉水位。交易紀錄：每一筆交易的進場價、出場價、持有天數、報酬率。優化方向：
	每個月底檢視報表：
	如果發現「經常賣飛」(賣掉後噴出)，
	則將 RSI 賣出標準從 45 下調至 40。
	如果發現「經常停損」，則提高 AI 選股的門檻 (例如只選 Top 3)。
```

---

## File: App.tsx
```typescript

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

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const data = await getDailyReports();
    setHistory(data);
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
      setFinalists(step2Result);

      setStatus(AnalysisStatus.SAVING);

      // Step 3: Save to SQLite (via API)
      const today = new Date().toISOString().split('T')[0];
      const newReport: Omit<DailyReport, 'id'> = {
        date: today,
        newsSummary: step1Result.newsSummary,
        candidates: step1Result.candidates,
        finalists: step2Result,
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
                v2.7.0 <span className="text-indigo-600 font-bold bg-indigo-50 px-1 rounded">Latest: 全面升級 Fugle API 即時報價</span>
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
            <PerformanceDashboard />
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

```

---

## File: cloud_run_deploy.md
```markdown
# Google Cloud Run 部署指南 (包含資料庫持久化)

本指南將協助您將「台股 AI 分析師」部署到 Google Cloud Run，並設定 Cloud Storage 來儲存 SQLite 資料庫，確保資料不會因重啟而遺失。

## ✅ 1. 前置準備 (您需要執行的部分)

是的，您需要自行安裝與設定以下工具：

1.  **Google Cloud Project (GCP 專案)**
    - 前往 [Google Cloud Console](https://console.cloud.google.com/)。
    - 建立一個新專案 (例如命名為 `taiwan-stock-analyst`)。
    - **啟用計費功能** (Cloud Run 有免費額度，但仍需綁定信用卡)。

2.  **gcloud CLI (命令列工具)**
    - 下載並安裝：[Google Cloud CLI 文件](https://cloud.google.com/sdk/docs/install)
    - 安裝完成後，在終端機 (Terminal) 執行登入：
      ```powershell
      gcloud auth login
      ```
    - 設定要在哪個專案下操作 (將 `YOUR_PROJECT_ID` 換成您的專案 ID)：
      ```powershell
      gcloud config set project YOUR_PROJECT_ID
      ```

---

## 🚀 2. 部署流程

### 步驟一：建立 Docker 映像檔 (Image)

在專案根目錄 (`g:\WorkFolder\台股-ai-分析師`) 執行以下指令，將程式打包上傳到 Google Container Registry。
*請將 `stock-app` 替換為您想要的映像檔名稱*



```powershell
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/stock-app

```
*(注意：將 `YOUR_PROJECT_ID` 換成您實際的專案 ID)*

若這個指令成功，後續部署到 Cloud Run 時，記得也要使用這個修正後的映像檔名稱 
###這是實例
gcloud builds submit --tag gcr.io/gen-lang-client-0195512020/aistock-app

### 步驟二：建立儲存桶 (Bucket) 用於存檔

我們需要一個雲端資料夾來放 `finance.db`。

```powershell
# 建立一個新的 Bucket (名稱必須全球唯一，建議加上您的專案名或亂數)
#gcloud storage buckets create gs://YOUR_BUCKET_NAME --location=asia-east1
gcloud storage buckets create gs://aistock-gen-lang-client-0195512020 --location=asia-east1
```

### 步驟三：部署到 Cloud Run (掛載儲存空間)

這是最關鍵的一步。我們將映像檔部署為服務，並將剛剛建立的 Bucket 掛載到容器內的 `/mnt/data` 目錄。

請將以下指令中的全大寫變數替換為您的數值：
- `YOUR_PROJECT_ID`: 您的專案 ID
- `YOUR_BUCKET_NAME`: 步驟二建立的 Bucket 名稱
- `YOUR_GEMINI_API_KEY`: 您的 Gemini API Key


這是最關鍵的一步。我們將映像檔部署為服務，並將剛剛建立的 Bucket 掛載到容器內的 /mnt/data 目錄。

請將以下指令中的全大寫變數替換為您的數值：

gcloud run deploy stock-analyst-service `
  --image gcr.io/YOUR_PROJECT_ID/stock-app `
  --platform managed `
  --region asia-east1 `
  --allow-unauthenticated `
  --port 8080 `
  --execution-environment gen2 `
  --add-volume=name=db-storage,type=cloud-storage,bucket=YOUR_BUCKET_NAME `
  --add-volume-mount=volume=db-storage,mount-path=/mnt/data `
  --set-env-vars="DB_PATH=/mnt/data/finance.db,GEMINI_API_KEY=YOUR_GEMINI_API_KEY"

```powershell
gcloud run deploy stock-analyst-service --image gcr.io/gen-lang-client-0195512020/aistock-app --platform managed --region asia-east1 --allow-unauthenticated --port 8080 --execution-environment gen2 --add-volume 'name=db-storage,type=cloud-storage,bucket=aistock-gen-lang-client-0195512020' --add-volume-mount 'volume=db-storage,mount-path=/mnt/data' --set-env-vars 'DB_PATH=/mnt/data/finance.db,GEMINI_API_KEY=AIzaSyDhdHxiy2NzaJHlqvrEnzV_RZTg_8OOeEs'
```

### 指令參數解釋：
- `--add-volume`: 定義一個名為 `db-storage` 的儲存卷，連結到您的 Bucket。
- `--add-volume-mount`: 將這個儲存卷掛載到容器內的 `/mnt/data` 路徑。
- `--set-env-vars`: 
    - 設定 `DB_PATH=/mnt/data/finance.db`，告訴程式將資料庫存放在掛載的路徑下。
    - 設定 `GEMINI_API_KEY`，讓程式能使用 AI 功能。

---

## 🎉 3. 驗證

部署成功後，終端機顯示一個 **Service URL** (例如 `https://stock-analyst-service-xyz-uc.a.run.app`)。

1. 點擊連結開啟網頁。
2. 進行一次「每日分析」。
3. 顯示「已儲存至 SQLite」後，您可以嘗試重新部署或稍後再回來查看，「歷史績效」應該都會保留下來，因為資料庫實際上是存在 Google Cloud Storage 上。


### 修改重新打包與上傳：
npm run build
## powershell
gcloud builds submit --tag gcr.io/gen-lang-client-0195512020/aistock-app
###　重新部署到 Cloud Run：
## powershell
gcloud run deploy stock-analyst-service --image gcr.io/gen-lang-client-0195512020/aistock-app --platform managed --region asia-east1 --allow-unauthenticated --port 8080 --execution-environment gen2 --add-volume 'name=db-storage,type=cloud-storage,bucket=aistock-gen-lang-client-0195512020' --add-volume-mount 'volume=db-storage,mount-path=/mnt/data' --set-env-vars 'DB_PATH=/mnt/data/finance.db,GEMINI_API_KEY=AIzaSyDhdHxiy2NzaJHlqvrEnzV_RZTg_8OOeEs'


gcloud run deploy stock-analyst-service --image gcr.io/gen-lang-client-0195512020/aistock-app --platform managed --region asia-east1 --allow-unauthenticated --port 8080 --execution-environment gen2 --timeout 3600

--add-volume 'name=db-storage,type=cloud-storage,bucket=aistock-gen-lang-client-0195512020' --add-volume-mount 'volume=db-storage,mount-path=/mnt/data' --set-env-vars 'DB_PATH=/mnt/data/finance.db,GEMINI_API_KEY=XXXXXXX,SMTP_SERVICE=gmail,SMTP_USER=tsui.nfx@gmail.com,SMTP_PASS=bmuv uezi ttls czkp,CRON_SECRET=mySuperSecretKey'

## daily report
http://localhost:8080/api/cron/trigger


### 這不是單純的「重啟」，而是需要「重新製作映像檔並部署」。
'''
原因
Cloud Run 是執行「Docker 映像檔」。您剛剛在本地端執行 npm run build 只是更新了您電腦上的檔案 (dist 資料夾)，並沒有把這些新程式碼 (包含新的 Email 設定頁面) 傳送到 Google 的伺服器上。

解決步驟
您必須執行以下兩行指令，才能讓 Cloud Run 更新成最新的程式碼：
'''
上傳新程式碼 (製作新映像檔)：
powershell
gcloud builds submit --tag gcr.io/gen-lang-client-0195512020/aistock-app
這一步會把您電腦這幾次修改的 
server.js
、
App.tsx
 和剛剛 build 好的 dist 全部打包上傳。
更新 Cloud Run (部署)：
powershell
gcloud run deploy stock-analyst-service --image gcr.io/gen-lang-client-0195512020/aistock-app --platform managed --region asia-east1
(或者使用您 
cloud_run_deploy.md
 裡記錄的那串完整長指令，包含設定環境變數的那次)
執行完這兩步後，Cloud Run 上的網站才會出現「Email 設定」的功能。

提醒：由於我們這次新增了 Email 功能，您的 Cloud Run 環境變數 (SMTP_USER, SMTP_PASS) 可能還沒設定。您可以使用上述第 2 步的指令，在後面補上 --set-env-vars 來一次設定好，或是等部署完去 Cloud Run 網頁主控台補設定也可以。


### 之後如何更新程式 (Future Updates)
**每次改完程式碼後，請依序執行這兩個步驟：**
### 1. 重新打包 (Build)
這一步會把最新的程式碼做成映像檔。
```powershell
gcloud builds submit --tag gcr.io/gen-lang-client-0195512020/aistock-app
```
### 2. 重新部署 (Deploy)
Cloud Run 會自動記住之前的設定 (環境變數、掛載磁碟等)，所以只要指定 Image 更新即可。
```powershell
gcloud run deploy stock-analyst-service --image gcr.io/gen-lang-client-0195512020/aistock-app --region asia-east1
```
*(如果發現設定跑掉了，再用上面那串長的指令補回去即可)*

---

## 設定每日自動排程 (Cloud Scheduler)
這行指令會設定每天早上 8:30 自動呼叫您的 AI 進行分析。

請將 `[YOUR_URL]` 換成您 Cloud Run 的網址 (例如 `https://stock-xxx.a.run.app`)：

# 1. Build
gcloud builds submit --tag gcr.io/gen-lang-client-0195512020/aistock-app


gcloud run deploy stock-analyst-service --image gcr.io/gen-lang-client-0195512020/aistock-app --region asia-east1

### remote url
https://stock-analyst-service-1095113025304.asia-east1.run.app/

## daily report
http://localhost:8080/api/cron/trigger
https://stock-analyst-service-1095113025304.asia-east1.run.app/api/cron/trigger

### test
請執行 node tests/e2e_test.js 幫我做全系統檢查
```

---

## File: components/EmailSubscription.tsx
```typescript
import React, { useState, useEffect } from 'react';
import { getSubscribers, addSubscriber, deleteSubscriber } from '../services/apiService';
import { Subscriber } from '../types';

const EmailSubscription: React.FC = () => {
    const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
    const [newEmail, setNewEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const fetchList = async () => {
        const list = await getSubscribers();
        setSubscribers(list);
    };

    useEffect(() => {
        fetchList();
    }, []);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEmail) return;
        setLoading(true);
        setError('');
        try {
            await addSubscriber(newEmail);
            setNewEmail('');
            fetchList();
        } catch (err: any) {
            setError(err.message || '新增失敗');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('確定要移除此 Email 嗎?')) return;
        try {
            await deleteSubscriber(id);
            fetchList();
        } catch (e) { alert('移除失敗'); }
    };

    const toggleSubscriber = async (id: number, currentStatus: number) => {
        // Optimistic Update
        const nextStatus = !currentStatus;
        setSubscribers(prev => prev.map(s => s.id === id ? { ...s, is_active: nextStatus ? 1 : 0 } : s));

        try {
            await fetch('/api/subscribers/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, is_active: nextStatus })
            });
            // Background refresh to ensure consistency
            fetchList();
        } catch (e) {
            alert('更新失敗，將還原狀態');
            fetchList(); // Revert on error
        }
    };

    const toggleAll = async (isActive: boolean) => {
        // Optimistic Update
        if (!confirm(`確定要${isActive ? '全部啟用' : '全部停用'}嗎?`)) return;

        setSubscribers(prev => prev.map(s => ({ ...s, is_active: isActive ? 1 : 0 })));

        try {
            await fetch('/api/subscribers/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: isActive })
            });
            fetchList();
        } catch (e) {
            alert('更新失敗');
            fetchList();
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Email 訂閱管理
            </h3>

            <p className="text-sm text-slate-500 mb-4">
                新增 Email 至下方列表。勾選的信箱才會收到每日報告。
            </p>

            {/* Add Form */}
            <form onSubmit={handleAdd} className="flex gap-2 mb-6">
                <input
                    type="email"
                    placeholder="輸入 Email..."
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    required
                />
                <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
                >
                    {loading ? '新增中...' : '新增'}
                </button>
            </form>

            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

            {/* Bulk Actions */}
            {subscribers.length > 0 && (
                <div className="flex gap-2 mb-3 text-sm">
                    <button onClick={() => toggleAll(true)} className="text-blue-600 hover:text-blue-800 hover:underline">全選 (發送)</button>
                    <span className="text-slate-300">|</span>
                    <button onClick={() => toggleAll(false)} className="text-slate-500 hover:text-slate-700 hover:underline">全不選 (暫停)</button>
                </div>
            )}

            {/* List */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {subscribers.length === 0 ? (
                    <p className="text-center text-slate-400 py-4 text-sm">目前無訂閱者</p>
                ) : (
                    subscribers.map(sub => (
                        <div key={sub.id} className={`flex justify-between items-center p-3 rounded-lg border transition-all ${sub.is_active ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-transparent opacity-60'}`}>
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={!!sub.is_active}
                                    onChange={() => toggleSubscriber(sub.id, sub.is_active || 0)}
                                    className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                                />
                                <span className={`font-medium ${sub.is_active ? 'text-indigo-900' : 'text-slate-500'}`}>{sub.email}</span>
                            </div>
                            <button
                                onClick={() => handleDelete(sub.id)}
                                className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors"
                                title="移除"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default EmailSubscription;

```

---

## File: components/HistoryTable.tsx
```typescript
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
```

---

## File: components/PerformanceDashboard.tsx
```typescript
import React, { useEffect, useState } from 'react';

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

const PerformanceDashboard: React.FC = () => {
    const [data, setData] = useState<PerformanceData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:8080/api/performance')
            .then(res => res.json())
            .then(setData)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

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
                <StatCard label="近一年" stats={data.year1} />
            </div>
        </div>
    );
};

export default PerformanceDashboard;

```

---

## File: components/SettingsPanel.tsx
```typescript
import React, { useEffect, useState } from 'react';
import { getSettings, saveSetting, SystemConfig } from '../services/settingsService';

const AVAILABLE_PROVIDERS = ['gemini', 'qwen'];

const PROVIDER_MODELS: Record<string, string[]> = {
    gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-flash'],
    qwen: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long']
};

const DEFAULT_STEPS = [
    { key: 'layer1_news', label: 'Layer 1: News Hunter (全球情報搜查)' },
    { key: 'layer2_mapping', label: 'Layer 2: Industry Mapper (產業映射與聯想)' },
    { key: 'layer3_decision', label: 'Layer 3: Portfolio Manager (最終決策與選股)' }
];

// --- Default Prompts (Variables: {{TODAY}}, {{THEMES}}, {{NEWS_SUMMARY}}, {{CURRENT_PORTFOLIO}}, {{CANDIDATES}}) ---
const DEFAULT_PROMPTS: Record<string, string> = {
    layer1_news: `你是一位負責監控全球金融市場的「首席情報官」。請使用「繁體中文」回答。
任務：廣泛且深入地搜尋今日 ({{TODAY}}) 的「全球」與「台灣」財經新聞，撰寫一份「詳盡的市場情報報告」。

重點搜尋與分析範圍：
1. 國際金融：美股四大指數、科技巨頭 (Nvidia, Apple, TSMC ADR) 動態、Fed 利率預期、美債殖利率。
2. 關鍵原物料：WTI/Brent 原油、黃金、銅價、比特幣 (Bitcoin)。
3. 航運與貿易：SCFI/BDI 指數、紅海/地緣政治影響。
4. 台灣熱點：半導體供應鏈、AI 伺服器、重電綠能、營建資產、法說會與營收公佈。

報告要求：
- **廣度與深度並重**：不要只列標題，說明新聞背景與對市場的具體影響。
- **字數要求**：目標約 800~1000 字的詳盡摘要，確保資訊完整。
- **禁止直接選股**：在 themes 欄位僅提取「題材關鍵字」。

輸出格式 (JSON):
{
  "newsSummary": "今日市場重點整理 (請條列式，每點換行，使用 • 符號，內容需詳盡)...",
  "themes": [
    { "keyword": "航運", "impact": "High", "summary": "紅海危機升級，運價指數上漲..." },
    { "keyword": "CoWoS", "impact": "High", "summary": "台積電產能供不應求..." }
  ]
}`,

    layer2_mapping: `你是一位熟知「台灣產業供應鏈」的資深研究員。

今日市場熱門題材：
{{THEMES}}

任務：針對每個題材關鍵字，列出對應的「台灣概念股」。
1. 直接聯想：如「運價漲」-> 貨櫃三雄。
2. 二階聯想：如「銅價漲」-> 電線電纜/PCB。
3. 數量：每個題材至少列出 3-5 檔相關個股。


輸出格式 (JSON Object Array):
[
  { "code": "2330", "name": "台積電", "theme": "AI", "reason": "先進製程產能滿載..." },
  { "code": "2603", "name": "長榮", "theme": "航運", "reason": "紅海危機..." }
]
(請務必包含 code, name, theme 與 reason。reason 請用繁體中文簡述關聯性與看好理由)`,

    layer3_decision: `你是一位風格激進、追求「短線爆發力」的避險基金經理人。
請使用「繁體中文」回答。

【市場概況】：
{{NEWS_SUMMARY}}

【目前持倉 (Locked Holdings)】：
(這些股票技術面尚可，**必須保留**，不可賣出)
{{CURRENT_PORTFOLIO}}

【今日觀察名單 (Candidates)】：
(請從中挑選最強勢的股票填補剩餘空位。**特別注意 tech_note 欄位中的 RSI 數值**)
**選股標準：優先選擇 RSI > 55 的強勢動能股。避免 RSI < 45 的弱勢股。**
{{CANDIDATES}}

【決策任務】：
1. **核心原則**：你目前已持有部分股票 (Locked)。請檢視剩餘空位。
2. 從「觀察名單」中挑選最佳標的填滿空位。
3. 若「觀察名單」都不好，可以空手 (不必硬湊 5 檔)。
4. **禁止賣出「目前持倉」的股票**。

【輸出格式】(JSON Array of Final Portfolio):
[
   { "code": "2330", "name": "台積電", "entryPrice": 500, "reason": "【續抱】...", "industry": "半導體", "status": "HOLD" },
   { "code": "2603", "name": "長榮", "entryPrice": 0, "reason": "【新納入】...", "industry": "航運", "status": "BUY" }
]`
};

const SettingsPanel: React.FC = () => {
    const [configs, setConfigs] = useState<SystemConfig[]>([]);
    const [loading, setLoading] = useState(false);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [showDefaultPrompt, setShowDefaultPrompt] = useState(false);

    // Form State
    const [formData, setFormData] = useState<SystemConfig | null>(null);

    const fetchConfigs = async () => {
        try {
            const data = await getSettings();
            setConfigs(data);
        } catch (e) {
            console.error(e);
            alert('無法載入設定');
        }
    };

    useEffect(() => {
        fetchConfigs();
    }, []);

    const handleEdit = (stepKey: string) => {
        const existing = configs.find(c => c.step_key === stepKey);
        const defaultConfig: SystemConfig = {
            step_key: stepKey,
            provider: 'gemini',
            model_name: 'gemini-2.5-flash',
            temperature: 0.7,
            prompt_template: ''
        };
        setFormData(existing || defaultConfig);
        setEditingKey(stepKey);
        setShowDefaultPrompt(false);
    };

    const handleSave = async () => {
        if (!formData) return;
        setLoading(true);
        try {
            await saveSetting(formData);
            await fetchConfigs();
            setEditingKey(null);
            alert('設定已儲存！');
        } catch (e) {
            alert('儲存失敗');
        } finally {
            setLoading(false);
        }
    };

    const getConfigDisplay = (stepKey: string) => {
        return configs.find(c => c.step_key === stepKey);
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mt-8">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                ⚙️ AI 模型與系統設定 (System Settings)
            </h2>

            <div className="space-y-6">
                {DEFAULT_STEPS.map((step) => {
                    const config = getConfigDisplay(step.key);
                    const isEditing = editingKey === step.key;

                    if (isEditing && formData) {
                        return (
                            <div key={step.key} className="bg-slate-50 p-4 rounded-xl border border-blue-500 animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-slate-700">{step.label}</h3>
                                    <button onClick={() => setEditingKey(null)} className="text-slate-400 hover:text-slate-600">
                                        ✕
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Provider (模型來源)</label>
                                        <select
                                            value={formData.provider}
                                            onChange={e => setFormData({ ...formData, provider: e.target.value as any, model_name: PROVIDER_MODELS[e.target.value as any]?.[0] || '' })}
                                            className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                        >
                                            {AVAILABLE_PROVIDERS.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Model Name (模型名稱)</label>
                                        <select
                                            value={PROVIDER_MODELS[formData.provider]?.includes(formData.model_name) ? formData.model_name : 'custom'}
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (val !== 'custom') {
                                                    setFormData({ ...formData, model_name: val });
                                                } else {
                                                    // Keep 'custom' as a placeholder state or handle logic to show input
                                                    // Ideally we switch to custom input mode, but simpler here is just setting a flag or empty
                                                    setFormData({ ...formData, model_name: 'custom' });
                                                }
                                            }}
                                            className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                        >
                                            {PROVIDER_MODELS[formData.provider]?.map(model => (
                                                <option key={model} value={model}>{model}</option>
                                            ))}
                                            <option value="custom">自訂 (Custom)...</option>
                                        </select>

                                        {/* Allow custom input if 'custom' is selected OR if the current value is not in the list (legacy/custom) */}
                                        {(!PROVIDER_MODELS[formData.provider]?.includes(formData.model_name)) && (
                                            <input
                                                type="text"
                                                value={formData.model_name === 'custom' ? '' : formData.model_name}
                                                onChange={e => setFormData({ ...formData, model_name: e.target.value })}
                                                className="w-full mt-2 p-2 border border-slate-300 rounded-lg text-sm bg-yellow-50"
                                                placeholder="輸入自訂模型名稱..."
                                                autoFocus={formData.model_name === 'custom'}
                                            />
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Temperature (創意度 0-1)</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            max="1"
                                            value={formData.temperature}
                                            onChange={e => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                                            className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-xs font-bold text-slate-500">
                                            Prompt Template (提示詞模板)
                                        </label>
                                        {DEFAULT_PROMPTS[step.key] && (
                                            <button
                                                onClick={() => setShowDefaultPrompt(!showDefaultPrompt)}
                                                className="text-xs text-blue-600 hover:text-blue-800 underline"
                                            >
                                                {showDefaultPrompt ? '隱藏系統預設 Prompt' : '查看系統預設 Prompt'}
                                            </button>
                                        )}
                                    </div>
                                    {/* Variable Hints */}
                                    <div className="mb-2 text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-200">
                                        <span className="font-bold">可用變數：</span>
                                        {step.key === 'layer1_news' && <code className="bg-white border px-1 rounded mx-1">{`{{TODAY}}`}</code>}
                                        {step.key === 'layer2_mapping' && <code className="bg-white border px-1 rounded mx-1">{`{{THEMES}}`}</code>}
                                        {step.key === 'layer3_decision' && (
                                            <>
                                                <code className="bg-white border px-1 rounded mx-1">{`{{NEWS_SUMMARY}}`}</code>
                                                <code className="bg-white border px-1 rounded mx-1">{`{{CURRENT_PORTFOLIO}}`}</code>
                                                <code className="bg-white border px-1 rounded mx-1">{`{{CANDIDATES}}`}</code>
                                            </>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <textarea
                                            value={formData.prompt_template || ''}
                                            onChange={e => setFormData({ ...formData, prompt_template: e.target.value })}
                                            className="w-full h-48 p-3 border border-slate-300 rounded-lg text-sm font-mono text-slate-600 leading-relaxed"
                                            placeholder="在此輸入自定義 Prompt (若留空，系統將使用預設邏輯)..."
                                        />
                                        {showDefaultPrompt && DEFAULT_PROMPTS[step.key] && (
                                            <div className="h-48 p-3 bg-slate-100 border border-slate-200 rounded-lg overflow-y-auto">
                                                <div className="text-xs font-bold text-slate-400 mb-2 sticky top-0 bg-slate-100 pb-2 border-b">系統預設參考 (Read Only):</div>
                                                <pre className="text-xs text-slate-500 font-mono whitespace-pre-wrap">
                                                    {DEFAULT_PROMPTS[step.key]}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2">
                                    <button
                                        onClick={() => setEditingKey(null)}
                                        className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm"
                                    >
                                        取消
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={loading}
                                        className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-bold shadow-sm"
                                    >
                                        {loading ? '儲存中...' : '確認儲存'}
                                    </button>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div key={step.key} className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div>
                                <h3 className="font-bold text-slate-700 text-sm mb-1">{step.label}</h3>
                                <div className="flex items-center gap-3 text-xs text-slate-500">
                                    <span className={`px-2 py-0.5 rounded text-white font-bold ${config?.provider === 'qwen' ? 'bg-purple-500' : 'bg-green-500'}`}>
                                        {config?.provider.toUpperCase() || 'DEFAULT'}
                                    </span>
                                    <span className="font-mono bg-slate-200 px-2 py-0.5 rounded text-slate-700">
                                        {config?.model_name || 'System Default'}
                                    </span>
                                    <span>Temp: {config?.temperature ?? 0.7}</span>
                                </div>
                            </div>
                            <button
                                onClick={() => handleEdit(step.key)}
                                className="px-3 py-1.5 text-blue-600 hover:bg-blue-50 font-bold rounded-lg text-sm transition-colors border border-blue-200"
                            >
                                編輯設定
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default SettingsPanel;

```

---

## File: components/StockCard.tsx
```typescript
import React from 'react';
import { Stock, PortfolioItem } from '../types';

interface StockCardProps {
  stock: Stock | PortfolioItem;
  type: 'candidate' | 'finalist';
  onUpdatePrice?: (code: string, newPrice: number) => void;
}

const StockCard: React.FC<StockCardProps> = ({ stock, type, onUpdatePrice }) => {
  const isFinalist = type === 'finalist';
  // Ensure we have a PortfolioItem shape when finalist
  const item = stock as PortfolioItem;

  // Safe accessors to avoid undefined crashes
  const entryPrice = item?.entryPrice ?? 0;
  // Use currentPrice if available, otherwise fall back to stock.price
  const currentPrice = item?.currentPrice ?? stock?.price ?? 0;
  const roi = item?.roi ?? 0;
  const reason = stock?.reason ?? '';
  const industry = stock?.industry ?? '';
  const code = stock?.code ?? '';
  const name = stock?.name ?? '';

  // Color for ROI
  const getRoiColor = (roiVal: number) => {
    if (roiVal > 0) return 'text-red-500'; // Taiwan Red is up
    if (roiVal < 0) return 'text-green-500'; // Taiwan Green is down
    return 'text-gray-500';
  };

  // State for Editing
  const [isEditing, setIsEditing] = React.useState(false);
  const [editPrice, setEditPrice] = React.useState('');

  const handleStartEdit = () => {
    setEditPrice(String(entryPrice));
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const val = parseFloat(editPrice);
    if (!isNaN(val) && onUpdatePrice) {
      onUpdatePrice(code, val);
    }
    setIsEditing(false);
  };

  return (
    <div className={`p-4 rounded-xl border transition-all duration-200 ${isFinalist
      ? 'bg-white border-blue-200 shadow-md hover:shadow-lg'
      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
      }`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-slate-200 text-slate-700 mb-1">
            {code}
          </span>
          <h3 className="font-bold text-lg text-slate-800">{name}</h3>
          {industry && <p className="text-xs text-slate-500">{industry}</p>}
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-500">現價</div>
          <div className="font-mono font-medium">
            {currentPrice}
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-600 mb-3 whitespace-pre-line leading-relaxed">
        {reason}
      </p>

      {isFinalist && (
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-slate-400 text-xs flex items-center gap-1">
              進場價
              {onUpdatePrice && !isEditing && (
                <button onClick={handleStartEdit} className="text-slate-400 hover:text-indigo-600" title="修改進場價">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
              )}
            </span>

            {isEditing ? (
              <div className="flex items-center gap-1 mt-1">
                <input
                  type="number"
                  value={editPrice}
                  onChange={e => setEditPrice(e.target.value)}
                  className="w-20 px-1 py-0.5 text-sm border rounded"
                />
                <button onClick={handleSaveEdit} className="text-green-600 hover:bg-green-100 rounded p-0.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </button>
                <button onClick={() => setIsEditing(false)} className="text-red-500 hover:bg-red-100 rounded p-0.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <div className="font-mono">{entryPrice}</div>
            )}

          </div>
          <div className="text-right">
            <span className="text-slate-400 text-xs">報酬率</span>
            <div className={`font-mono font-bold ${getRoiColor(roi)}`}>
              {roi > 0 ? '+' : ''}{roi.toFixed(2)}%
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockCard;
```

---

## File: debug_fetch.js
```javascript
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

```

---

## File: Dockerfile
```text
# Build Stage
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the frontend (Vite)
# This creates the dist/ folder
RUN npm run build

# Production Stage
FROM node:20-alpine AS production

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy built frontend assets from build stage
COPY --from=build /app/dist ./dist

# Copy backend server file
# Copy backend files
COPY server.js .
COPY services ./services

# Expose port 8080 (Cloud Run default)
EXPOSE 8080

# Start server
CMD ["npm", "run", "server"]

```

---

## File: export_project_to_md.js
```javascript

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = process.cwd();
const outputFile = path.join(rootDir, 'project_full_context.md');

// Configuration
const ignoreDirs = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.gemini',
    'coverage',
    '.vscode',
    '.idea'
];

const ignoreFiles = [
    'finance.db',
    'finance.db-journal',
    'package-lock.json',
    'yarn.lock',
    '.DS_Store',
    'project_full_context.md',
    '.env',
    '.env.local' // Exclude secrets for safety
];

const binaryExts = [
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
    '.pdf', '.db', '.sqlite', '.exe', '.dll', '.bin'
];

function getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            if (!ignoreDirs.includes(file)) {
                getAllFiles(filePath, fileList);
            }
        } else {
            const ext = path.extname(file).toLowerCase();
            if (!ignoreFiles.includes(file) && !binaryExts.includes(ext)) {
                fileList.push(filePath);
            }
        }
    });

    return fileList;
}

console.log(`Scanning project in: ${rootDir}`);
const files = getAllFiles(rootDir);
console.log(`Found ${files.length} text files.`);

let output = `# Project Export\n\n`;
output += `Generated on: ${new Date().toISOString()}\n`;
output += `Total Files: ${files.length}\n\n`;

// 1. File Tree
output += `## Project Structure\n\`\`\`text\n`;
files.forEach(f => {
    output += path.relative(rootDir, f).replace(/\\/g, '/') + '\n';
});
output += `\`\`\`\n\n`;

// 2. File Contents
files.forEach(f => {
    const relativePath = path.relative(rootDir, f).replace(/\\/g, '/');
    let ext = path.extname(f).substring(1);

    // Map extensions to markdown languages
    if (ext === 'js' || ext === 'jsx') ext = 'javascript';
    if (ext === 'ts' || ext === 'tsx') ext = 'typescript';
    if (ext === 'md') ext = 'markdown';
    if (ext === '') ext = 'text';

    let content = "";
    try {
        content = fs.readFileSync(f, 'utf8');
    } catch (e) {
        content = `[Error reading file: ${e.message}]`;
    }

    output += `## File: ${relativePath}\n`;
    output += `\`\`\`${ext}\n`;
    output += content + '\n';
    output += `\`\`\`\n\n---\n\n`;
});

fs.writeFileSync(outputFile, output);
console.log(`Successfully exported to: ${outputFile}`);

```

---

## File: firebaseConfig.ts
```typescript
// This file is no longer used.
// The application has migrated to a SQLite + Node.js backend architecture.
// See server.js and services/apiService.ts for the new implementation.
export const db = null;

```

---

## File: handover_summary.md
```markdown
# 台股 AI 分析師 - 交接與進度總結 (Handover Summary)

## 📌 專案概況 (Project Status)
本專案為「台股 AI 分析師」網頁應用程式，目前已完成 **多模型架構改造 (Multi-Model Architecture)** 與 **系統設定前台化 (Settings UI)**。

### ✅ 已完成功能 (Completed Features)
1.  **多模型支援 (Multi-Model Support)**：
    *   **Backend**：重構 `server.js`，引入 `callAI` 統一介面，支援 `gemini` (Google) 與 `qwen` (Alibaba) 兩種 Provider。
    *   **Layered Config**：
        *   **Step 1 (Global News)**：預設使用 `gemini-2.5-flash` (搭配 Google Search Tool)。
        *   **Step 2 (Stock Recommendation)**：預設使用 `qwen-turbo` (原生 OpenAI-compatible API)。
    *   **Database**：新增 `system_configs` 表格儲存各步驟的模型設定與 Prompt。

2.  **系統設定介面 (System Settings UI)**：
    *   **Frontend**：在 `App.tsx` 新增「系統設定 (System)」分頁。
    *   **SettingsPanel**：實作 `components/SettingsPanel.tsx`，提供視覺化介面調整：
        *   **Provider 切換**：Gemini / Qwen。
        *   **Model 下拉選單**：自動列出該 Provider 支援的模型 (含自訂功能)。
        *   **Prompt 編輯**：可隨時修改 AI 提示詞。
    *   **SSL Fix**：解決本地開發環境 (Corporate/VPN) 的 `SELF_SIGNED_CERT_IN_CHAIN` 問題 (於 `server.js` 設置 `NODE_TLS_REJECT_UNAUTHORIZED = "0"`).

3.  **Qwen 整合細節**：
    *   使用 DashScope Global API (`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`).
    *   API Key 透過環境變數 `DASHSCOPE_API_KEY` 管理。
    *   預設模型改為 `qwen-turbo` 以避開未付費帳號的 `AccessDenied` 錯誤。

4.  **Gemini 整合細節**：
    *   修復 `@google/genai` SDK 回傳值解析錯誤 (`response.text` vs `response.response.text()`)。

---

## 🛠️ 技術架構與關鍵檔案 (Technical Context)
*   **Repo Root**: `g:\WorkFolder\台股-ai-分析師`
*   **Server**: `server.js` (核心 API 與排程邏輯).
*   **Database**: `finance.db` (SQLite, 包含 `system_configs` 表).
*   **Frontend**: `App.tsx`, `components/SettingsPanel.tsx`.
*   **Deployment**: Google Cloud Run + Cloud Scheduler.

## 🚀 待辦事項/下一步 (Next Steps)
1.  **部署驗證 (Deployment Verification)**：
    *   User 需執行 Cloud Build 與 Cloud Run Deploy。
    *   **關鍵動作**：需在 Cloud Run 新增環境變數 `DASHSCOPE_API_KEY`。
2.  **觀察每日排程**：
    *   確認 Daily Analysis (Step 1 + Step 2) 在 Cloud Run 上能否正常觸發。
3.  **UI 優化 (Optional)**：
    *   目前 Settings UI 位於 System 分頁，功能已完整，可視需求美化或增加權限控管。

## 🔑 環境變數 (Environment Variables)
*   `GEMINI_API_KEY` / `API_KEY`: Google Gemini 用。
*   `DASHSCOPE_API_KEY`: Alibaba Qwen 用 (新稱)。
*   `CRON_SECRET`: 排程觸發金鑰。

---

## 📝 給下一位 AI 的指令 (Instructions for Next AI)
請讀取此檔案以了解目前系統狀態。核心邏輯在 `server.js` 的 `callAI`, `callGemini`, `callQwen` 函式中。
若 User 詢問關於「模型設定」或「Qwen 連線」的問題，請優先檢查 `system_configs` 資料庫內容與環境變數設定。
目前的 `SettingsPanel.tsx` 已經支援動態下拉選單，若需新增模型選項，請修改 `SettingsPanel.tsx` 中的 `PROVIDER_MODELS` 常數。

```

---

## File: implementation_plan.md
```markdown
# Cloud Run 部署計畫

## 目標描述
將「台股 AI 分析師」應用程式部署至 **Google Cloud Run**。這包含將應用程式容器化 (Containerization)，並提供如何在 Cloud Run 上設定 SQLite 資料庫持久化儲存的指南。

## 預計變更

### [根目錄]
#### [NEW] [Dockerfile](Dockerfile)
- 建立多階段 (Multi-stage) Dockerfile：
    - **建置階段 (Build Stage)**：安裝依賴並執行 `npm run build` 產生靜態檔案。
    - **生產階段 (Production Stage)**：使用輕量級 Node.js映像檔，複製 `server.js` 與 `dist/` 資料夾，並只安裝生產環境依賴。
    - **Port**: 8080。
    - **啟動指令**: `npm run server`。

#### [NEW] [cloud_run_deploy.md](C:\Users\danson_tsui\.gemini\antigravity\brain\46b804a6-d004-4088-9cda-439898adc4c4\cloud_run_deploy.md)
- 建立一份完整的部署指南，包含：
    1.  **前置作業**：GCP 專案設定、gcloud CLI 安裝。
    2.  **環境變數**：設定 `GEMINI_API_KEY` 與 `DB_PATH`。
    3.  **資料持久化策略 (Persistence Strategy)**：
        - 使用 **Cloud Storage FUSE** 掛載儲存桶 (Bucket) 作為資料庫存放位置。
        - *理由*：Cloud Run 本身是無狀態的 (Stateless)，如果不掛載外部儲存空間，SQLite 的 `finance.db` 會在每次重新部署或重啟時消失。
    4.  **部署指令**：使用 `gcloud builds submit` 建置映像檔，與 `gcloud run deploy` 進行部署。

## 驗證計畫

### 自動化測試
- **Docker 建置測試**：在本地執行 `docker build -t test-app .` 以確保 Dockerfile 語法與建置流程正確 (需本地有 Docker 環境)。
- **啟動測試**：執行 `docker run -p 8080:8080 test-app` 並檢查 `localhost:8080` 是否能正常瀏覽。

### 手動驗證
- 由於無法直接操作使用者的 GCP 帳號，驗證將依賴：
    - 檢查 `Dockerfile` 的邏輯正確性。
    - 確認 `server.js` 對 `DB_PATH` 的支援 (已確認)。
    - 使用者依照指南操作後的反饋。

```

---

## File: index.html
```html
<!DOCTYPE html>
<html lang="zh-TW">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>台股 AI 分析師</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
      body { font-family: 'Inter', sans-serif; }
    </style>
  <script type="importmap">
{
  "imports": {
    "react": "https://aistudiocdn.com/react@^19.2.1",
    "react-dom/": "https://aistudiocdn.com/react-dom@^19.2.1/",
    "@google/genai": "https://aistudiocdn.com/@google/genai@^1.31.0",
    "react/": "https://aistudiocdn.com/react@^19.2.1/",
    "express": "https://aistudiocdn.com/express@^5.2.1",
    "firebase/": "https://aistudiocdn.com/firebase@^12.6.0/",
    "path": "https://aistudiocdn.com/path@^0.12.7",
    "cors": "https://aistudiocdn.com/cors@^2.8.5",
    "url": "https://aistudiocdn.com/url@^0.11.4",
    "better-sqlite3": "https://aistudiocdn.com/better-sqlite3@^12.5.0",
    "fs": "https://aistudiocdn.com/fs@^0.0.1-security"
  }
}
</script>
<link rel="stylesheet" href="/index.css">
</head>
  <body class="bg-slate-50 text-slate-900">
    <div id="root"></div>
  <script type="module" src="/index.tsx"></script>
</body>
</html>
```

---

## File: index.tsx
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

---

## File: metadata.json
```json
{
  "name": "台股 AI 分析師",
  "description": "針對台灣股市的 AI 日常選股工具。它會分析新聞以生成 10 檔候選股，並進一步篩選出 3 檔精選股，透過 SQLite 資料庫追蹤績效。",
  "requestFramePermissions": []
}
```

---

## File: package.json
```json
{
  "name": "台股-ai-分析師",
  "private": true,
  "version": "2.7.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "start": "node server.js",
    "server": "node server.js",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@google/genai": "^1.31.0",
    "better-sqlite3": "^12.5.0",
    "cors": "^2.8.5",
    "express": "^5.2.1",
    "firebase": "^12.6.0",
    "fs": "^0.0.1-security",
    "nodemailer": "^7.0.11",
    "path": "^0.12.7",
    "react": "^19.2.1",
    "react-dom": "^19.2.1",
    "technicalindicators": "^3.1.0",
    "url": "^0.11.4",
    "yahoo-finance2": "^3.10.2"
  },
  "devDependencies": {
    "@types/node": "^22.14.0",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "~5.8.2",
    "vite": "^6.2.0"
  }
}
```

---

## File: probe_yahoo.js
```javascript
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

async function probe() {
    const symbol = '1519.TW';
    console.log(`Checking ${symbol}...`);
    try {
        const quote = await yahooFinance.quote(symbol);
        console.log('--- QUOTE ---');
        console.log('Regular Market Price:', quote.regularMarketPrice);
        console.log('Regular Market Time:', quote.regularMarketTime);
        console.log('Post Market Price:', quote.postMarketPrice);
        console.log('Post Market Time:', quote.postMarketTime);
        console.log('Bid:', quote.bid);
        console.log('Ask:', quote.ask);

        // Check historical
        const queryOptions = { period1: '2024-12-01', period2: '2025-12-30' };
        const historical = await yahooFinance.historical(symbol, queryOptions);
        const last = historical[historical.length - 1];
        console.log('--- HISTORICAL ---');
        console.log('Last Hist Date:', last.date);
        console.log('Last Hist Close:', last.close);
        console.log('Last Hist High:', last.high);

    } catch (e) {
        console.error(e);
    }
}

probe();

```

---

## File: project_summary.md
```markdown
# 台股 AI 分析師 (Taiwan Stock AI Analyst) 專案分析報告

這個專案是一個結合 **Google Gemini AI** 的台股分析 Web 應用程式，旨在每日掃描市場新聞，篩選出潛力股，並提供投資組合建議。

## 🛠️ 技術架構 (Tech Stack)

### 前端 (Frontend)
- **核心框架**: React 19 + TypeScript
- **建置工具**: Vite
- **樣式庫**: Tailwind CSS
- **主要檔案**: `App.tsx` (主邏輯), `components/` (UI 元件)

### 後端 (Backend)
- **伺服器**: Node.js + Express (`server.js`)
- **資料庫**: SQLite (`better-sqlite3`), 儲存於 `finance.db`
- **主要功能**: 提供 API 存取報告、儲存分析結果、資料庫備份下載

### AI 整合 (AI Integration)
- **模型**: Google Gemini (透過 `@google/genai` SDK)
- **應用場景**: 
  1. 掃描新聞並生成 10 檔候選股 (`generateCandidates`)
  2. 從候選名單中篩選前 3 名精選股 (`selectFinalists`)
- **服務層**: `services/geminiService.ts`

## 🚀 主要功能 (Key Features)

### 1. 每日市場策略 (Daily Analysis)
- **自動化流程**: 
  - 第一步：AI 掃描新聞，產出市場摘要及 10 檔候選股。
  - 第二步：AI 進一步分析，從 10 檔中挑選 3 檔最佳標的。
  - 第三步：將結果存入後端 SQLite 資料庫。
- **UI 呈現**: 包含新聞摘要、來源連結、候選股列表、精選前3名展示。

### 2. 歷史績效 (History)
- 檢視過去的每日分析報告。
- 顯示過往的選股結果與當時的新聞摘要。

### 3. 資料保存與備份 (Data & Backup)
- **本地資料庫**: 使用 SQLite 儲存所有分析紀錄。
- **備份功能**: 介面提供「下載 DB」按鈕，可直接下載 `finance.db` 檔案進行備份。

## 📂 專案結構摘要

- **`App.tsx`**: 應用程式主入口，處理分析流程狀態 (`ANALYZING_NEWS`, `PICKING_CANDIDATES`, 等) 與 UI 切換。
- **`server.js`**: 簡易後端，負責 SQLite 操作 (CRUD) 與靜態檔案服務。
- **`services/`**: 
  - `geminiService`: 封裝與 Google AI 的互動邏輯。
  - `apiService`: 封裝與自家後端的 API 呼叫。
- **`.env.local`**: 需設定 `GEMINI_API_KEY` 以啟用 AI 功能。

## 💡 總結
這是一個架構清晰、前後端分離的現代化 Web 應用。利用 GenAI 的強大理解能力來輔助股票分析，並透過本地 SQLite 簡單有效地管理數據。適合個人使用或作為 AI 應用開發的參考範例。

```

---

## File: README.md
```markdown
<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1Yuz1259B5UaWXOrXHUn-h6WD21vH4MOP

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

```

---

## File: server.js
```javascript
// Disable SSL validation for corporate networks/local dev
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import express from 'express';
import Database from 'better-sqlite3';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";
import { sendDailyReportEmail } from './services/emailService.js';
import { analyzeStockTechnicals, getStockPrice, filterCandidates } from './services/financeService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 1. LOAD ENVIRONMENT VARIABLES (Local Dev Support) ---
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  console.log('[Config] Loading .env.local...');
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split(/\r?\n/).forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  } catch (e) { console.error("[Config] Failed to load .env.local", e); }
}

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
// DEBUG: Log all requests
app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.url}`);
  next();
});
app.use(express.static(path.join(__dirname, 'dist')));

// --- 2. DATABASE CONFIGURATION ---
let dbPath = process.env.DB_PATH || 'finance.db';
if (process.env.DB_PATH) {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    try { fs.mkdirSync(dbDir, { recursive: true }); } catch (e) { }
  }
}

let db;
try {
  db = new Database(dbPath);
  db.pragma('journal_mode = DELETE');
  console.log(`[Database] Connected to ${dbPath}`);
} catch (error) {
  console.error("[CRITICAL] Database connection failed:", error);
  process.exit(1);
}

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    newsSummary TEXT,
    data JSON
  );

  CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS system_configs (
    step_key TEXT PRIMARY KEY,
    provider TEXT NOT NULL,         -- 'gemini', 'qwen'
    model_name TEXT NOT NULL,       -- 'gemini-2.5-flash', 'qwen-max'
    temperature REAL DEFAULT 0.7,
    prompt_template TEXT,           -- Optional: Override default prompt
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  INSERT OR IGNORE INTO system_configs (step_key, provider, model_name) VALUES 
  ('global_news', 'gemini', 'gemini-2.5-flash'),
  ('stock_recommendation', 'qwen', 'qwen-turbo'),
  ('layer1_news', 'gemini', 'gemini-2.5-flash'),
  ('layer2_mapping', 'gemini', 'gemini-1.5-flash'),
  ('layer3_decision', 'gemini', 'gemini-1.5-pro');

`);

// --- Migration: Add 'is_active' to subscribers if not exists ---
try {
  const tableInfo = db.prepare("PRAGMA table_info(subscribers)").all();
  const hasActive = tableInfo.some(col => col.name === 'is_active');
  if (!hasActive) {
    console.log("[Migration] Adding 'is_active' column to subscribers...");
    db.prepare("ALTER TABLE subscribers ADD COLUMN is_active INTEGER DEFAULT 1").run();
  }
} catch (e) { console.error("[Migration] Failed to add is_active:", e); }

// --- 3. AI CONFIGURATION & HELPER ---

// Generic Call AI Function (Switchable Providers)
const callAI = async (stepKey, prompt, fallbackConfig = {}) => {
  // 1. Load Config from DB
  let config = { provider: 'gemini', model_name: 'gemini-2.5-flash', temperature: 0.7 };
  try {
    const row = db.prepare('SELECT * FROM system_configs WHERE step_key = ?').get(stepKey);
    if (row) config = { ...config, ...row };
  } catch (e) {
    console.warn(`[Config] Failed to load config for ${stepKey}, using default.`);
  }

  console.log(`[AI] Step: ${stepKey} | Provider: ${config.provider} | Model: ${config.model_name}`);

  // 1.5 Dynamic Prompt Substitution
  let finalPrompt = prompt;
  if (config.prompt_template && config.prompt_template.trim() !== "") {
    console.log(`[AI] Using Custom Prompt Template for ${stepKey}`);
    finalPrompt = config.prompt_template;

    // Replace variables (e.g., {{TODAY}}) from fallbackConfig.variables
    if (fallbackConfig.variables) {
      for (const [key, value] of Object.entries(fallbackConfig.variables)) {
        // Replace all occurrences of {{KEY}}
        const placeholder = `{{${key}}}`;
        finalPrompt = finalPrompt.split(placeholder).join(String(value));
      }
    }
  }

  // 2. Dispatch to Provider
  if (config.provider === 'qwen') {
    return await callQwen(config.model_name, finalPrompt, config.temperature);
  } else {
    // Default to Gemini
    return await callGemini(config.model_name, finalPrompt, fallbackConfig);
  }
};

// Provider: Google Gemini
const callGemini = async (modelName, prompt, config) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const ai = new GoogleGenAI({ apiKey });

  // Retry fallback for Gemini models if primary fails
  const models = [modelName, "gemini-2.5-flash", "gemini-1.5-flash"];
  let lastError;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: config
      });
      // Standardize output to { text: string }
      // The @google/genai SDK v1 returns text directly in response.text or response.candidates[0].content...
      const text = response.text || (response.candidates?.[0]?.content?.parts?.[0]?.text) || "";
      if (!text) throw new Error("Empty response from AI");
      return { text };
    } catch (error) {
      console.warn(`[Gemini] Model ${model} failed: ${error.message}`);
      lastError = error;
    }
  }
  throw lastError;
};

// Provider: Alibaba Qwen (using OpenAI-compatible endpoint)
const callQwen = async (modelName, prompt, temperature) => {
  const apiKey = process.env.DASHSCOPE_API_KEY; // Must be set in .env
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY missing for Qwen");

  const url = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName, // e.g., 'qwen-max', 'qwen-plus'
        messages: [{ role: "user", content: prompt }], // Simple one-shot prompt
        temperature: temperature
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Qwen API Error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    return { text: data.choices[0].message.content };
  } catch (error) {
    console.error("[Qwen] API Failed:", error);
    throw error;
  }
};


const getTodayString = () => new Date().toISOString().split('T')[0];
const extractJson = (text) => {
  if (!text) return "";
  // 1. Remove Markdown code blocks first
  let clean = text.replace(/```json\s*/g, "").replace(/```\s*$/g, "").replace(/```/g, "").trim();

  // 2. Find the JSON object or array
  const firstCurly = clean.indexOf('{');
  const firstSquare = clean.indexOf('[');
  let startIndex = -1;

  // Determine start based on which appears first
  if (firstCurly !== -1 && firstSquare !== -1) {
    startIndex = Math.min(firstCurly, firstSquare);
  } else if (firstCurly !== -1) {
    startIndex = firstCurly;
  } else if (firstSquare !== -1) {
    startIndex = firstSquare;
  }

  if (startIndex !== -1) {
    // Determine corresponding end char
    const isArray = clean[startIndex] === '[';
    const endChar = isArray ? ']' : '}';
    const endIndex = clean.lastIndexOf(endChar);
    if (endIndex > startIndex) {
      return clean.substring(startIndex, endIndex + 1);
    }
  }

  return clean;
};



// --- 4. API ROUTES ---

// --- SUBSCRIBER APIS ---
app.get('/api/subscribers', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM subscribers ORDER BY id DESC').all();
    res.json(rows);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch subscribers' }); }
});

app.post('/api/subscribers/toggle', (req, res) => {
  try {
    const { id, is_active } = req.body;
    db.prepare('UPDATE subscribers SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/subscribers/batch', (req, res) => {
  try {
    const { is_active } = req.body;
    db.prepare('UPDATE subscribers SET is_active = ?').run(is_active ? 1 : 0);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/subscribers', (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Invalid email' });
    const info = db.prepare('INSERT INTO subscribers (email) VALUES (?)').run(email);
    res.json({ success: true, id: info.lastInsertRowid, email });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Failed to add subscriber' });
  }
});

app.delete('/api/subscribers/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM subscribers WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete' }); }
});

// AI: Generate Candidates
app.post('/api/analyze/candidates', async (req, res) => {
  console.log("[AI] Generating 10 candidates (Full Pipeline)...");
  try {

    // --- Layer 1: News ---
    console.log("[Step 1] Layer 1: News Hunter...");
    const today = getTodayString();
    const l1Prompt = `
        你是一位負責監控全球金融市場的「首席情報官」。請使用「繁體中文」回答。
        任務：廣泛且深入地搜尋今日 (${today}) 的「全球」與「台灣」財經新聞，撰寫一份「詳盡的市場情報報告」。
        
        重點搜尋與分析範圍：
        1. 國際金融：美股四大指數、科技巨頭 (Nvidia, Apple, TSMC ADR) 動態、Fed 利率預期、美債殖利率。
        2. 關鍵原物料：WTI/Brent 原油、黃金、銅價、比特幣 (Bitcoin)。
        3. 航運與貿易：SCFI/BDI 指數、紅海/地緣政治影響。
        4. 台灣熱點：半導體供應鏈、AI 伺服器、重電綠能、營建資產、法說會與營收公佈。

        報告要求：
        - **廣度與深度並重**：不要只列標題，說明新聞背景與對市場的具體影響。
        - **字數要求**：目標約 800~1000 字的詳盡摘要，確保資訊完整。
        - **禁止直接選股**：在 themes 欄位僅提取「題材關鍵字」。

        輸出格式 (JSON):
        {
          "newsSummary": "今日市場重點整理 (請條列式，每點換行，使用 • 符號，內容需詳盡)...",
          "themes": [
            { "keyword": "航運", "impact": "High", "summary": "紅海危機升級，運價指數上漲..." },
            { "keyword": "CoWoS", "impact": "High", "summary": "台積電產能供不應求..." }
          ]
        }
    `;
    const l1Response = await callAI('layer1_news', l1Prompt, {
      tools: [{ googleSearch: {} }],
      variables: { TODAY: today }
    });
    const l1Data = JSON.parse(extractJson(l1Response.text || "{}"));
    const newsSummary = l1Data.newsSummary || "";
    const themes = l1Data.themes || [];
    console.log(`[Layer 1] Found ${themes.length} themes.`);

    // --- Layer 2: Mapping ---
    console.log("[Step 2] Layer 2: Industry Mapper...");
    const l2Prompt = `
        你是一位熟知「台灣產業供應鏈」的資深研究員。
        今日市場熱門題材：
        ${JSON.stringify(themes)}

        任務：針對每個題材關鍵字，列出對應的「台灣概念股」。
        1. 直接聯想機制：如「運價漲」-> 貨櫃三雄。
        2. 二階聯想機制：如「銅價漲」-> 電線電纜/PCB。
        3. 每個題材列出 3-5 檔相關個股。

        輸出格式 (JSON Object Array):
        [
          { "code": "2330", "name": "台積電", "theme": "AI", "reason": "先進製程強勁" },
          { "code": "2603", "name": "長榮", "theme": "航運", "reason": "運價上漲受惠" }
        ]
        (請務必包含 reason 欄位解釋關聯性)
    `;
    const l2Response = await callAI('layer2_mapping', l2Prompt, {
      variables: { THEMES: JSON.stringify(themes) }
    });
    const rawCandidates = JSON.parse(extractJson(l2Response.text || "[]"));
    console.log(`[Layer 2] Mapped ${rawCandidates.length} potential candidates.`);

    // --- Layer 2.5: Tech Filter ---
    console.log("[Step 2.5] Layer 2.5: Tech Filter...");
    // filterCandidates now handles objects and fetching names
    const robustCandidates = await filterCandidates(rawCandidates);
    console.log(`[Layer 2.5] ${robustCandidates.length} stocks passed filters.`);

    // Format for Frontend
    // Frontend expects: { code, name, price, reason, industry (optional) }
    const finalCandidates = robustCandidates.map(c => ({
      code: c.code,
      name: c.name || c.code,
      price: c.price,
      reason: c.reason ? `[${c.theme}] ${c.reason}` : `AI Mapped: ${c.theme}`,
      industry: c.theme || "N/A",
      tech_note: c.tech_note
    }));

    // Return Top 10 by default or all robust ones
    // Usually limit to 10 for UI not to be overwhelmed
    const limitedCandidates = finalCandidates.slice(0, 10);

    // Sources: we don't really have them structured from this flow unless we extract from L1 tools
    // We can assume Gemini tool usage if available, but for now empty is okay.
    const sources = [];

    res.json({ newsSummary, candidates: limitedCandidates, sources });

  } catch (error) {
    console.error("[AI Error]", error);
    res.status(500).json({ error: error.message });
  }
});

// AI: Select Finalists
// AI: Select Finalists (Portfolio Rebalancing)
app.post('/api/analyze/finalists', async (req, res) => {
  console.log("[AI] Rebalancing Portfolio (Max 5 Stocks)...");
  try {
    const { candidates, newsSummary } = req.body;


    // 1. Fetch Current Portfolio (from the latest report)
    let currentPortfolio = [];
    try {
      const latestReport = db.prepare('SELECT data FROM daily_reports ORDER BY timestamp DESC LIMIT 1').get();
      if (latestReport) {
        const data = JSON.parse(latestReport.data);
        if (data.finalists && Array.isArray(data.finalists)) {
          currentPortfolio = data.finalists;
        }
      }
    } catch (e) { console.warn("[DB] No previous portfolio found."); }

    // --- Technical Firewall: Pre-Filter ---
    // We strictly identify who MUST stay (Keepers) and who MUST go (Leavers)
    const keepers = [];
    const leavers = []; // These are effectively sold before AI sees them

    await Promise.all(currentPortfolio.map(async (p) => {
      try {
        const ta = await analyzeStockTechnicals(p.code);
        // Sell Condition: RSI < 45
        // Hold Condition: RSI >= 45 (Even if AI dislikes it, we keep it as per User Rule)
        if (ta.rsi < 45) {
          leavers.push({ ...p, reason: `[Firewall] RSI轉弱(${ta.rsi.toFixed(1)} < 45)` });
        } else {
          // Attach TA info for AI context
          keepers.push({ ...p, ta });
        }
      } catch (error) {
        console.error(`Error analyzing ${p.code}`, error);
        keepers.push(p); // Safe default: Keep
      }
    }));

    console.log(`[Firewall] Keepers: ${keepers.length} (${keepers.map(k => k.name)}), Leavers: ${leavers.length}`);

    // 2. Prompt for Rebalancing
    // We only pass KEEPERS as the "Current Portfolio" to the AI.
    // The AI's job is to FILL the remaining slots (5 - keepers.length).
    const prompt = `
        你是一位專業的基金經理人，負責管理一個「最多持股 5 檔」的台股投資組合。
        請使用「繁體中文」回答。

        市場概況：${newsSummary}

        【目前持倉 (Locked Holdings)】：
        (這些股票技術面尚可，**必須保留**，不可賣出)
        ${JSON.stringify(keepers.map(k => ({
      code: k.code,
      name: k.name,
      entryPrice: k.entryPrice,
      industry: k.industry,
      rsi: k.ta?.rsi?.toFixed(1) || 'N/A'
    })))}

        【今日觀察名單 (Candidates)】：
        (請從中挑選最強勢的股票填補剩餘空位。**特別注意 tech_note 欄位中的 RSI 數值**)
        **選股標準：優先選擇 RSI > 55 的強勢動能股。避免 RSI < 45 的弱勢股。**
        ${JSON.stringify(candidates)}

        【決策任務】：
        1. **核心原則**：你目前已持有 ${keepers.length} 檔股票 (Locked)。你還有 ${5 - keepers.length} 個空位。
        2. 從「觀察名單」中挑選最佳標的填滿空位。
        3. 若「觀察名單」都不好，可以空手 (不必硬湊 5 檔)。
        4. **禁止賣出「目前持倉」的股票**。

        【輸出格式】：僅限 JSON 陣列 (最終的持股名單)。
        [
           // 必須包含所有 Locked Holdings
           { "code": "2330", "name": "台積電", "entryPrice": 500, "reason": "【續抱】技術面仍強(RSI=60)...", "industry": "半導體", "status": "HOLD" },
           
           // 新買入
           { "code": "2454", "name": "聯發科", "entryPrice": 0, "reason": "【新納入】...", "industry": "IC設計", "status": "BUY" }
        ]
    `;

    // Use 'layer3_decision' step config (New System)
    const response = await callAI('layer3_decision', prompt, {
      variables: {
        NEWS_SUMMARY: newsSummary,
        CURRENT_PORTFOLIO: JSON.stringify(keepers),
        CANDIDATES: JSON.stringify(candidates)
      }
    });
    const text = response.text || "[]";
    let newPortfolioRaw = JSON.parse(extractJson(text));
    if (!Array.isArray(newPortfolioRaw)) newPortfolioRaw = []; // Fault tolerance

    // --- Post-Process Enforcement ---
    // 1. Ensure all Keepers are present
    const keeperCodes = new Set(keepers.map(k => k.code));
    const aiPickedCodes = new Set(newPortfolioRaw.map(p => p.code));

    // Add back missing keepers
    keepers.forEach(k => {
      if (!aiPickedCodes.has(k.code)) {
        newPortfolioRaw.unshift({
          code: k.code,
          name: k.name,
          entryPrice: k.entryPrice,
          industry: k.industry,
          status: 'HOLD',
          reason: '[Firewall] System Force Keep (RSI > 45)'
        });
      }
    });

    // 2. Limit to 5 (prioritize Keepers, then AI's first choices)
    // Actually simpler: just slice to 5? 
    // But we added keepers to front (unshift) or AI might have put them anywhere.
    // Let's deduplicate first (just in case)
    const uniqueMap = new Map();
    newPortfolioRaw.forEach(p => uniqueMap.set(p.code, p));
    const finalPortfolio = Array.from(uniqueMap.values()).slice(0, 5); // Hard limit 5 userspace



    // 3. Price Validation & Merging
    console.log("[Price Check] Fetching real-time prices (via Yahoo Finance)...");

    // Helper to get prices for all items in parallel
    const allCodes = [...new Set(newPortfolioRaw.map(i => i.code).concat(currentPortfolio.map(i => i.code)))];
    const priceMap = new Map();

    await Promise.all(allCodes.map(async (code) => {
      const price = await getStockPrice(code);
      if (price > 0) priceMap.set(String(code), price);
    }));

    const result = newPortfolioRaw.map(item => {
      const verifiedPrice = priceMap.get(item.code);
      const currentPrice = (verifiedPrice && verifiedPrice > 0) ? verifiedPrice : (item.currentPrice || 0);

      // Determine Entry Price:
      // - If HOLD (exists in currentPortfolio), keep original entryPrice
      // - If BUY (new), use verifiedPrice as entryPrice
      // - Safety fallback: if entryPrice is 0, use currentPrice

      let entryPrice = parseFloat(item.entryPrice) || 0;
      let currentPriceVal = parseFloat(currentPrice) || 0;
      let entryDate = item.entryDate || getTodayString();

      // Normalize code to string for comparison
      const itemCode = String(item.code).trim();
      const isNew = !currentPortfolio.find(p => String(p.code).trim() === itemCode);

      if (isNew || !entryPrice || entryPrice === 0) {
        entryPrice = currentPriceVal;
        entryDate = getTodayString(); // Reset date for new entry or fix
      }

      // Calculate ROI
      const roi = entryPrice ? ((currentPriceVal - entryPrice) / entryPrice) * 100 : 0;

      return {
        code: itemCode,
        name: String(item.name),
        industry: String(item.industry),
        reason: String(item.reason),
        entryPrice,
        entryDate,
        currentPrice: currentPriceVal,
        roi,
        status: isNew ? 'NEW' : 'HOLD'
      };
    });

    // Calculate Sold Stocks
    // Stocks in currentPortfolio but NOT in result are "SOLD"
    const soldStocks = currentPortfolio
      .filter(curr => !result.find(r => r.code === curr.code))
      .map(s => ({
        code: s.code,
        name: s.name,
        entryPrice: s.entryPrice,
        exitPrice: priceMap.get(s.code) || s.currentPrice, // Best effort current price
        return: 0 // Ideally calculate final return if possible
      }));

    // Calculate final return for sold stocks
    soldStocks.forEach(s => {
      const roi = s.entryPrice ? ((s.exitPrice - s.entryPrice) / s.entryPrice) * 100 : 0;
      s.roi = roi;
    });

    console.log(`[Portfolio] Rebalanced. New count: ${result.length}, Sold: ${soldStocks.length}`);
    res.json({ finalists: result, sold: soldStocks });


  } catch (error) {
    console.error("[AI Error]", error);
    res.status(500).json({ error: error.message });
  }
});

// AI: Update Stock Prices
app.post('/api/analyze/prices', async (req, res) => {
  console.log("[AI] Updating stock prices...");
  try {
    const { stocks } = req.body; // Expecting array of PortfolioItem
    if (!stocks || stocks.length === 0) return res.json([]);

    // Use Yahoo Finance (now Fugle) to fetch prices sequentially to avoid Rate Limit (429)
    const priceMap = new Map();
    for (const stock of stocks) {
      const price = await getStockPrice(stock.code);
      if (price > 0) priceMap.set(String(stock.code), price);
    }

    const updatedStocks = stocks.map(stock => {
      const currentPrice = priceMap.get(String(stock.code)) || stock.currentPrice;

      // Self-healing: If entryPrice is missing or 0, set it to currentPrice (treat as new entry)
      let entryPrice = stock.entryPrice;
      if (!entryPrice || entryPrice === 0) {
        entryPrice = currentPrice;
      }

      const roi = entryPrice ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
      return { ...stock, currentPrice, entryPrice, roi };
    });

    res.json(updatedStocks);
  } catch (error) {
    console.error("[AI Error]", error);
    res.status(500).json({ error: error.message });
  }
});

// Update Entry Price Manually
app.post('/api/reports/:id/entry-price', (req, res) => {
  const { id } = req.params;
  const { code, price } = req.body;
  const newEntryPrice = parseFloat(price);

  if (isNaN(newEntryPrice)) return res.status(400).json({ error: 'Invalid price' });

  try {
    const row = db.prepare('SELECT * FROM daily_reports WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Report not found' });

    let data = JSON.parse(row.data);
    let found = false;

    if (data.finalists) {
      data.finalists = data.finalists.map(item => {
        if (item.code === code) {
          found = true;
          // Update Entry Price
          item.entryPrice = newEntryPrice;
          // Recalculate ROI
          if (item.currentPrice) {
            item.roi = ((item.currentPrice - newEntryPrice) / newEntryPrice) * 100;
          }
        }
        return item;
      });
    }

    if (!found) return res.status(404).json({ error: 'Stock not found in report' });

    db.prepare('UPDATE daily_reports SET data = ? WHERE id = ?').run(JSON.stringify(data), id);
    console.log(`[Report] Updated entry price for ${code} to ${newEntryPrice}`);
    res.json({ success: true });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Reports: Get All
app.get('/api/reports', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM daily_reports ORDER BY timestamp DESC').all();
    const reports = rows
      .map(row => {
        try {
          const parsedData = JSON.parse(row.data);

          // Safety: Ensure finalists is an array
          if (!Array.isArray(parsedData.finalists)) {
            console.warn(`[Report ${row.id}] Warning: 'finalists' is not an array.`, parsedData);
            parsedData.finalists = [];
          }

          return {
            id: row.id.toString(),
            date: row.date,
            timestamp: row.timestamp,
            newsSummary: row.newsSummary,
            ...parsedData
          };
        } catch (e) {
          console.error(`[Report ${row.id}] Corrupted JSON data:`, row.data, e);
          return null; // Filter out completely bad rows
        }
      })
      .filter(r => r !== null); // Remove nulls

    console.log(`[API] Returning ${reports.length} valid reports.`);
    res.json(reports);
  } catch (error) {
    console.error("[API Error]", error);
    res.status(500).json({ error: 'DB Error' });
  }
});

// Reports: Get Performance Stats
app.get('/api/performance', (req, res) => {
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
              exitDate: trade.soldDate || new Date(row.timestamp).toISOString().split('T')[0], // Fallback to report date
              timestamp: row.timestamp // Approximate timestamp
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
      const totalRoi = periodTrades.reduce((sum, t) => sum + (t.roi || 0), 0); // Simple summation of ROI%

      return { count, wins, winRate, avgRoi, totalRoi };
    };

    const stats = {
      month1: calculateStats(30),
      month3: calculateStats(90),
      month6: calculateStats(180),
      year1: calculateStats(365),
      allTime: calculateStats(9999)
    };


    console.log(`[Performance] Calculated stats based on ${allTrades.length} sold trades.`);
    res.json(stats);

  } catch (error) {
    console.error("[API Error]", error);
    res.status(500).json({ error: 'Stats Error' });
  }
});

// Reports: Create
app.post('/api/reports', (req, res) => {
  try {
    const { date, timestamp, newsSummary, candidates, finalists, sources } = req.body;
    const jsonData = JSON.stringify({ candidates, finalists, sources });
    const info = db.prepare('INSERT INTO daily_reports (date, timestamp, newsSummary, data) VALUES (?, ?, ?, ?)').run(date, timestamp, newsSummary, jsonData);
    res.json({ id: info.lastInsertRowid.toString(), success: true });
  } catch (error) { res.status(500).json({ error: 'Save Failed' }); }
});

// Reports: Update Prices & Trigger Auto-Decision
app.put('/api/reports/:id/prices', async (req, res) => {
  try {
    const { id } = req.params;
    const { finalists } = req.body; // Frontend provided prices (reference)

    const row = db.prepare('SELECT data FROM daily_reports WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    let currentData = JSON.parse(row.data);
    let currentPortfolio = currentData.finalists || [];
    let candidates = currentData.candidates || [];
    let soldList = currentData.sold || [];
    let nextPortfolio = [];

    // --- Technical Firewall Logic ---
    console.log(`[Auto-Decision] Re-evaluating Portfolio for Report ${id}...`);

    // 1. Sell Check (Technical Firewall)
    for (const stock of currentPortfolio) {
      try {
        // Fetch fresh technicals
        const ta = await analyzeStockTechnicals(stock.code);
        // CRITICAL FIX: Use Real-time Intraday Price, not Historical Candle Price (which might be yesterday)
        const rtPrice = await getStockPrice(stock.code);
        const currentPrice = rtPrice > 0 ? rtPrice : (ta.price || stock.price);

        // CRITICAL: Preserve original entry price.
        const entryPrice = stock.entryPrice || currentPrice;
        const roi = entryPrice ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;

        console.log(`[Debug] ${stock.name} (${stock.code}): DB_Entry=${stock.entryPrice}, Cur=${currentPrice}, Used_Entry=${entryPrice}, ROI=${roi.toFixed(2)}%`);


        let shouldSell = false;
        let sellReason = "";

        // Firewall Rule: Force Keep if RSI > 45 (System Keep)
        // Firewall Rule: Allow Sell only if RSI < 45 (Leavers)

        if (ta.rsi < 45) {
          shouldSell = true;
          sellReason = `[Auto] RSI轉弱(${ta.rsi.toFixed(1)} < 45)`;
        } else if (roi < -10) {
          // Hard Stop Loss (Override Keep? user said "Sell < 45 OR Loss > 10")
          // Let's assume Loss > 10 is a hard exit regardless of RSI? 
          // Or should Firewall protect even deep loss? 
          // Usually Stop Loss is supreme.
          shouldSell = true;
          sellReason = `[Auto] 停損出場(${roi.toFixed(1)}%)`;
        }

        if (shouldSell) {
          soldList.push({
            ...stock,
            entryPrice, // Ensure we record the base
            exitPrice: currentPrice,
            roi: roi,
            reason: sellReason,
            soldDate: new Date().toISOString().split('T')[0]
          });
          console.log(`[Auto-Decision] SOLD ${stock.name}: ${sellReason}`);
        } else {
          // Keep holding
          // Keep holding
          nextPortfolio.push({
            ...stock,
            price: currentPrice,
            currentPrice: currentPrice, // Explicitly update this for frontend consistency
            entryPrice, // Persist this!
            roi: roi,
            status: 'HOLD',
            // Keep original AI comment + Append Technical Update (Avoid Duplication)
            reason: stock.reason.split('\n\n[最新技術]:')[0] + (ta.technicalReason ? `\n\n[最新技術]: ${ta.technicalReason}` : '')
          });
        }
      } catch (e) {
        console.error(`[Auto-Decision] Error processing ${stock.code}:`, e);
        nextPortfolio.push(stock);
      }
    }

    // 2. Buy Check (Fill slots) - DISABLE per user request (Wait for next AI decision)
    /*
    if (nextPortfolio.length < 5) {
      console.log(`[Auto-Decision] Portfolio has space (${nextPortfolio.length}/5). Checking candidates...`);
      for (const candidate of candidates) {
        if (nextPortfolio.length >= 5) break;
        if (nextPortfolio.some(p => p.code === candidate.code)) continue;

        try {
          const ta = await analyzeStockTechnicals(candidate.code);
          // Rule: RSI > 55 to Buy
          if (ta.rsi > 55) {
            nextPortfolio.push({
              code: candidate.code,
              name: candidate.name,
              entryPrice: ta.price, // Set Entry Price NOW
              price: ta.price,
              industry: candidate.theme || 'Auto-Pick',
              status: 'BUY',
              reason: `[Auto] RSI轉強(${ta.rsi.toFixed(1)} > 55)`,
              roi: 0
            });
            console.log(`[Auto-Decision] BOUGHT ${candidate.name}: RSI=${ta.rsi.toFixed(1)}`);
          }
        } catch (e) { console.error(`[Auto-Decision] Error checking candidate ${candidate.code}`, e); }
      }
    }
    */

    const newData = { ...currentData, finalists: nextPortfolio, sold: soldList };
    db.prepare('UPDATE daily_reports SET data = ? WHERE id = ?').run(JSON.stringify(newData), id);
    console.log(`[Auto-Decision] Done. Portfolio size: ${nextPortfolio.length}`);

    res.json({ success: true, finalists: nextPortfolio });
  } catch (error) {
    console.error("[Auto-Decision] Failed:", error);
    res.status(500).json({ error: 'Update Failed' });
  }
});

// Backup: Download DB
app.get('/api/backup', (req, res) => {
  if (fs.existsSync(dbPath)) res.download(dbPath, 'finance.db');
  else res.status(404).send('File not found');
});

// --- AUTOMATION: Run Daily Analysis & Email ---
let isAnalysisRunning = false;

const runDailyAnalysis = async () => {
  if (isAnalysisRunning) {
    console.log("[Automation] Blocked: Analysis already running.");
    return { success: false, error: 'Already running' };
  }
  isAnalysisRunning = true;
  console.log("[Automation] Starting Daily Analysis Job...");

  const today = getTodayString();
  const timestamp = Date.now();

  try {
    // ------------------------------------------------------------------
    // Layer 1: Global News Hunter (AI)
    // Goal: Find keywords/themes (e.g., "Shipping", "Copper")
    // ------------------------------------------------------------------
    console.log("[Automation] Layer 1: News Hunter (Searching Themes)...");

    const l1Prompt = `
        你是一位負責監控全球金融市場的「首席情報官」。請使用「繁體中文」回答。
        任務：廣泛搜尋今日 (${today}) 的「全球」與「台灣」財經新聞，找出市場的「資金流向」與「熱門題材」。
        
        重點關注：
        1. 國際金融：美股強勢板塊 (AI, 半導體, 傳產)、Fed 態度、美債殖利率。
        2. 大宗商品：原油、黃金、銅價、航運指數 (SCFI/BDI)。
        3. 台灣熱點：本土政策 (重電/房市)、法說會利多、營收公佈。

        限制：
        - 禁止直接選股，只提取「題材關鍵字」。
        - 廣度優先，涵蓋傳產、金融、原物料。

        輸出格式 (JSON):
        {
          "newsSummary": "今日市場重點整理 (請條列式，每點換行，使用 • 符號)...",
          "themes": [
            { "keyword": "航運", "impact": "High", "summary": "紅海危機升級，運價看漲。" },
            { "keyword": "AI伺服器", "impact": "High", "summary": "NVIDIA財報優於預期。" }
          ]
        }
    `;

    // Use 'layer1_news' config (Default: Gemini 2.5 Flash)
    const l1Response = await callAI('layer1_news', l1Prompt, {
      tools: [{ googleSearch: {} }],
      variables: { TODAY: today }
    });
    const l1Data = JSON.parse(extractJson(l1Response.text || "{}"));
    const newsSummary = l1Data.newsSummary || "無新聞摘要";
    const themes = l1Data.themes || [];
    console.log(`[Layer 1] Found ${themes.length} themes:`, themes.map(t => t.keyword).join(', '));


    // ------------------------------------------------------------------
    // Layer 2: Industry Mapper (AI)
    // Goal: Map themes to specific stock codes (Long List)
    // ------------------------------------------------------------------
    console.log("[Automation] Layer 2: Industry Mapper (Mapping Stocks)...");

    const l2Prompt = `
        你是一位熟知「台灣產業供應鏈」的資深研究員。
        
        今日市場熱門題材：
        ${JSON.stringify(themes)}

        任務：針對每個題材關鍵字，列出對應的「台灣概念股」。
        1. 直接聯想：如「運價漲」-> 貨櫃三雄。
        2. 二階聯想：如「銅價漲」-> 電線電纜/PCB。
        3. 數量：每個題材至少列出 3-5 檔相關個股。

        輸出格式 (JSON Object Array):
        [
          { "code": "2330", "name": "台積電", "theme": "AI", "reason": "先進製程產能滿載，獨家供應輝達晶片" },
          { "code": "2603", "name": "長榮", "theme": "航運", "reason": "紅海危機導致運價指數上漲" }
        ]
        (請務必包含 code, name, theme 與 reason。reason 請用繁體中文簡述關聯性與看好理由)
    `;

    // Use 'layer2_mapping' config (Default: Qwen Turbo/Max for reasoning)
    const l2Response = await callAI('layer2_mapping', l2Prompt, {
      variables: { THEMES: JSON.stringify(themes) }
    });
    // AI might return just codes or objects now. Let's normalize.
    let rawStockData = JSON.parse(extractJson(l2Response.text || "[]"));

    // Normalize to objects if AI returned strings
    if (rawStockData.length > 0 && typeof rawStockData[0] === 'string') {
      rawStockData = rawStockData.map(code => ({ code, name: "" }));
    }

    console.log(`[Layer 2] Mapped ${rawStockData.length} raw candidates.`);


    // ------------------------------------------------------------------
    // Layer 2.5: The Tech Filter (Code)
    // Goal: Filter out low volume or weak trend stocks
    // ------------------------------------------------------------------
    console.log("[Automation] Layer 2.5: Tech Filter (Cleaning Data)...");

    // This function checks Volume > 1000 and Price > MA20
    const robustStocks = await filterCandidates(rawStockData);
    console.log(`[Layer 2.5] ${robustStocks.length} stocks passed the filter.`);

    // If too few stocks, maybe add some default indices or heavy weights? 
    // For now, let's respect the filter. If 0, AI will have nothing to pick.


    // ------------------------------------------------------------------
    // Layer 3: Portfolio Manager (Final Decision) (AI)
    // Goal: Pick Top 5 from the robust list based on news & tech status
    // ------------------------------------------------------------------
    console.log("[Automation] Layer 3: Portfolio Manager (Final Decision)...");

    // Fetch previous portfolio for rebalancing context
    let currentPortfolio = [];
    try {
      const latestReport = db.prepare('SELECT data FROM daily_reports ORDER BY timestamp DESC LIMIT 1').get();
      if (latestReport) {
        const d = JSON.parse(latestReport.data);
        if (d.finalists && Array.isArray(d.finalists)) currentPortfolio = d.finalists;
      }
    } catch (e) { console.warn("[DB] No previous portfolio found."); }

    // Re-verify current portfolio status (Technical Check)
    // We want to sell if they violate hard rules (Sell Signal)
    const portfolioWithTA = await Promise.all(currentPortfolio.map(async (stock) => {
      const ta = await analyzeStockTechnicals(stock.code);
      return { ...stock, ta };
    }));

    // --- Technical Firewall: Pre-Filter ---
    const keepers = [];
    const leavers = [];

    portfolioWithTA.forEach(p => {
      if (p.ta.action === 'SELL') {
        leavers.push({ ...p, reason: `[Firewall] RSI轉弱(${p.ta.rsi.toFixed(1)} < 45)` });
      } else {
        keepers.push(p);
      }
    });

    console.log(`[Firewall-Daily] Keepers: ${keepers.length} (${keepers.map(k => k.name)}), Leavers: ${leavers.length}`);


    const l3Prompt = `
        你是一位風格激進、追求「短線爆發力」的避險基金經理人。
        請使用「繁體中文」回答。

        【市場概況】：${newsSummary}
        
        【目前持倉 (Locked Holdings)】：
        (這些股票技術面尚可，**必須保留**，不可賣出)
        ${JSON.stringify(keepers.map(p => ({
      code: p.code,
      name: p.name,
      entryPrice: p.entryPrice,
      ROI: p.roi ? p.roi.toFixed(1) + '%' : '0%',
      TA: `RSI=${p.ta.rsi?.toFixed(1)}`
    })))}

        【強勢候選名單 (Candidates)】：
        (這些股票已通過程式篩選：成交量>1000張 且 股價站上月線。**請務必檢查 tech_note 中的 RSI 數值**)
        **選股標準：優先選擇 RSI > 55 的強勢動能股。避免 RSI < 45 的弱勢股。**
        ${JSON.stringify(robustStocks)}

        【決策任務】：
        1. **核心原則**：你目前已持有 ${keepers.length} 檔股票 (Locked)。你還有 ${5 - keepers.length} 個空位。
        2. 從「強勢候選名單」中挑選最佳標的填滿空位。
        3. 若候選名單都不好，可以空手。
        4. **禁止賣出「Locked Holdings」的股票**。

        【輸出格式】(JSON Array of Final Portfolio):
        [
           { "code": "2330", "name": "台積電", "entryPrice": 500, "reason": "【續抱】...", "industry": "半導體", "status": "HOLD" },
           { "code": "2603", "name": "長榮", "entryPrice": 0, "reason": "【新納入】紅海危機受惠...", "industry": "航運", "status": "BUY" }
        ]
    `;

    // Use 'layer3_decision' step config (New System)
    const l3Response = await callAI('layer3_decision', l3Prompt, {
      variables: {
        NEWS_SUMMARY: newsSummary,
        CURRENT_PORTFOLIO: JSON.stringify(keepers),
        CANDIDATES: JSON.stringify(robustStocks)
      }
    });

    const text = l3Response.text || "[]";
    let nextPortfolio = JSON.parse(extractJson(text));
    if (!Array.isArray(nextPortfolio)) nextPortfolio = [];

    // --- Post-Process Enforcement ---
    // 1. Ensure all codes are strings for consistent Map keys
    nextPortfolio.forEach(p => p.code = String(p.code).trim());
    keepers.forEach(k => k.code = String(k.code).trim());

    const aiPickedCodes = new Set(nextPortfolio.map(p => p.code));

    // 2. Add back missing keepers (Firewall rule: Must Keep)
    // We unshift them to the front to prioritize them
    [...keepers].reverse().forEach(k => {
      if (!aiPickedCodes.has(k.code)) {
        nextPortfolio.unshift({
          code: k.code,
          name: k.name,
          entryPrice: k.entryPrice,
          industry: k.industry || k.theme, // Fallback
          status: 'HOLD',
          reason: '[Firewall] System Force Keep (RSI > 45)'
        });
      }
    });

    // 3. Deduplicate (Last write wins usually, but here we want to keep current updated props)
    // We iterate portfolio and fill map.
    const uniqueMap = new Map();
    nextPortfolio.forEach(p => uniqueMap.set(p.code, p));

    // 4. STRICT LIMIT TO 5
    // Force slice to ensure max 5 items
    // If we have > 5 keepers, we technically violate the rule "Keep all keepers" OR "Limit 5".
    // Rules say "Limit 5" is harder constraint for UI layout? 
    // Yes, for now strict 5.
    const finalPortfolio = Array.from(uniqueMap.values()).slice(0, 5);

    console.log(`[Portfolio] Rebalanced. New count: ${finalPortfolio.length}`);


    const newPortfolioRaw = finalPortfolio;


    // ------------------------------------------------------------------
    // Finalization: Price Check & Save
    // ------------------------------------------------------------------
    console.log("[Automation] Finalizing Report...");

    // Get real-time prices for Finalists to calculate ROI correctly
    const finalCodes = newPortfolioRaw.map(i => i.code);
    const candidateCodes = robustStocks.map(i => i.code);
    const allCodes = [...new Set([...finalCodes, ...candidateCodes])];

    const priceMap = new Map();
    for (const code of allCodes) {
      const p = await getStockPrice(code);
      if (p > 0) priceMap.set(String(code), p);
    }

    // 1. Process Finalists
    const finalists = newPortfolioRaw.map(item => {
      const code = String(item.code).trim();
      let currentPrice = priceMap.get(code) || item.currentPrice || 0;

      // Formatting: Round current price to 2 decimals
      currentPrice = parseFloat(currentPrice.toFixed(2));

      let entryPrice = parseFloat(item.entryPrice) || 0;
      let entryDate = item.entryDate || getTodayString();
      const isNew = !currentPortfolio.find(p => String(p.code).trim() === code);

      if (isNew || !entryPrice) {
        entryPrice = currentPrice;
        entryDate = getTodayString();
      }

      // Formatting: Round entry price to 2 decimals
      entryPrice = parseFloat(entryPrice.toFixed(2));

      const roi = entryPrice ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;

      return {
        ...item,
        code,
        currentPrice,
        entryPrice,
        entryDate,
        roi,
        status: isNew ? 'NEW' : 'HOLD'
      };
    });

    // 2. Process Candidates (for UI: "今日觀察名單")
    const candidates = robustStocks.map(s => {
      const code = s.code;
      let price = priceMap.get(code) || s.price || 0;
      price = parseFloat(price.toFixed(2)); // Round to 2 decimals

      // Combine AI Reason and Technical Note for display
      // s.reason comes from Layer 2 (AI), s.tech_note comes from Layer 2.5 (Filter)
      const aiReason = s.reason ? `🎯 ${s.reason}` : `AI Recommended: ${s.theme}`;
      const techReason = s.tech_note ? `📊 ${s.tech_note}` : '';
      const combinedReason = `${aiReason}<br/><span style="color:#6b7280; font-size:0.85em;">${techReason}</span>`;

      return {
        code: code,
        name: s.name || "",
        price: price,
        reason: combinedReason, // HTML formatted for Email/UI
        industry: s.theme || "System Filtered"
      };
    });

    // 3. Process Sold
    const soldStocks = currentPortfolio
      .filter(curr => !finalists.find(r => r.code === curr.code))
      .map(s => {
        const exitPrice = priceMap.get(s.code) || s.currentPrice;
        const roi = s.entryPrice ? ((exitPrice - s.entryPrice) / s.entryPrice) * 100 : 0;
        return { ...s, exitPrice, roi, reason: "AI 換股操作 / 觸發停損利" };
      });


    // Save DB
    console.log(`[Automation] Saving Report (Finalists: ${finalists.length}, Candidates: ${candidates.length})...`);
    const jsonData = JSON.stringify({ candidates, finalists, sources: [], sold: soldStocks, themes }); // Saved themes too
    const info = db.prepare('INSERT INTO daily_reports (date, timestamp, newsSummary, data) VALUES (?, ?, ?, ?)').run(today, timestamp, newsSummary, jsonData);

    // Send Email (Filter by is_active)
    console.log("[Automation] Sending Email...");
    let subscriberEmails = [];
    try {
      // Only select Active subscribers
      subscriberEmails = db.prepare('SELECT email FROM subscribers WHERE is_active = 1').all().map(r => r.email);
    } catch (e) { }

    const reportData = { date: today, newsSummary, finalists, sold: soldStocks, candidates }; // Added candidates
    await sendDailyReportEmail(reportData, subscriberEmails);

    return { success: true, id: info.lastInsertRowid };

  } catch (error) {
    console.error("[Automation] Job Failed:", error);
    return { success: false, error: error.message };
  } finally {
    isAnalysisRunning = false;
  }
};

// CRON Trigger Route (Supports both GET and POST)
app.use('/api/cron/trigger', async (req, res) => {
  if (isAnalysisRunning) {
    console.warn("[Cron] Job skipped - Analysis already in progress.");
    return res.status(429).json({ error: 'Analysis in progress' });
  }

  // Run async (don't wait if timeout is a concern, but Cloud Scheduler needs 200 OK)
  // For Cloud Run Gen2, we can wait up to 60mins.
  const result = await runDailyAnalysis();
  res.json(result);
});

// 9. Update Price for Report Item
app.post('/api/reports/:id/entry-price', async (req, res) => {
  const { code, price } = req.body;
  if (!code || price === undefined) return res.status(400).json({ error: "Missing code or price" });

  try {
    const report = db.prepare('SELECT data FROM daily_reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ error: "Report not found" });

    const data = JSON.parse(report.data);
    if (data.finalists) {
      const idx = data.finalists.findIndex(f => f.code === code);
      if (idx !== -1) {
        data.finalists[idx].entryPrice = parseFloat(price);
        const currentPrice = data.finalists[idx].currentPrice || 0;
        data.finalists[idx].roi = price > 0 ? ((currentPrice - price) / price) * 100 : 0;
        db.prepare('UPDATE daily_reports SET data = ? WHERE id = ?').run(JSON.stringify(data), req.params.id);
        return res.json({ success: true });
      }
    }
    res.status(404).json({ error: "Stock code not found" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 10. Clear All History (Protected)
app.delete('/api/admin/clear-history', (req, res) => {
  const { password } = req.body;
  if (password !== 'abcd1234') return res.status(401).json({ error: "密碼錯誤" });
  try {
    db.prepare('DELETE FROM daily_reports').run();
    console.log('[Admin] History cleared.');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "清除失敗" }); }
});

// 11. System Settings API
app.get('/api/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM system_configs').all();
    res.json(rows);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch settings' }); }
});

app.post('/api/settings', (req, res) => {
  const { step_key, provider, model_name, prompt_template } = req.body;
  if (!step_key || !provider || !model_name) return res.status(400).json({ error: "Missing required fields" });

  try {
    const stmt = db.prepare(`
      INSERT INTO system_configs (step_key, provider, model_name, prompt_template, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(step_key) DO UPDATE SET
        provider = excluded.provider,
        model_name = excluded.model_name,
        prompt_template = excluded.prompt_template,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(step_key, provider, model_name, prompt_template);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to save setting" });
  }
});

// CRON Endpoint for Cloud Scheduler
app.get('/api/cron/trigger', async (req, res) => {
  // Simple security check (Optional: check for specific header from Cloud Scheduler)
  // const cronSecret = req.headers['x-cron-secret'];
  // if (cronSecret !== process.env.CRON_SECRET) return res.status(403).send('Forbidden');

  console.log("[Cron] Trigger received.");
  // Run asynchronously (Cloud Scheduler has timeout, but we should return 200 OK quickly if it takes very long, 
  // however Cloud Run can handle ~60 mins requests. Let's await it to report status.)

  const result = await runDailyAnalysis();

  if (result.success) {
    res.json({ message: 'Daily analysis completed', reportId: result.id.toString() });
  } else {
    res.status(500).json({ error: 'Daily analysis failed', details: result.error });
  }
});

// Start Server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

```

---

## File: services/apiService.ts
```typescript

import { DailyReport, PortfolioItem, StockCandidate, WebSource, Subscriber } from "../types";

// 定義可能的 API 端點列表
// 1. '/api/reports' -> 用於生產環境 (Cloud Run) 或當前後端在同一 Port 時
// 2. 'http://localhost:8080/api/reports' -> 用於本機開發，當前端在 5173 但後端在 8080 時
const BASE_URLS = [
  '',  // 相對路徑
  'http://localhost:8080' // 本機備援
];

// 輔助函式：具備自動重試不同網域的 fetch
async function fetchWithFailover(endpoint: string, options?: RequestInit): Promise<Response> {
  let lastError;

  for (const base of BASE_URLS) {
    try {
      // 確保路徑格式正確 (避免 //api)
      const cleanBase = base.replace(/\/+$/, '');
      const url = `${cleanBase}${endpoint}`;

      console.log(`Trying to connect to: ${url}`);
      const response = await fetch(url, options);

      if (response.ok) {
        return response; // 成功連線，直接回傳
      }

      // 如果 404，可能是路徑不對，繼續試下一個
      // 如果 500，可能是伺服器錯誤，但至少連上了，也算成功的一種回應（交給呼叫端處理）
      if (response.status !== 404) {
        return response;
      }

    } catch (e) {
      console.log(`Connection to ${base} failed, trying next...`);
      lastError = e;
    }
  }

  throw new Error(`連線失敗 (All attempts failed). Last error: ${lastError?.message || 'Unknown'}`);
}

export const saveDailyReport = async (report: Omit<DailyReport, 'id'>): Promise<string | null> => {
  try {
    const response = await fetchWithFailover('/api/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(report),
    });

    if (!response.ok) throw new Error('Network response was not ok');

    const data = await response.json();
    console.log("Report saved with ID:", data.id);
    return data.id;
  } catch (error) {
    console.warn("Warning: Could not save report to API. Ensure server.js is running.");
    // 回傳 null 但不拋出錯誤，讓 UI 顯示暫存結果
    return null;
  }
};

export const getDailyReports = async (): Promise<DailyReport[]> => {
  try {
    const response = await fetchWithFailover('/api/reports');
    if (!response.ok) {
      console.warn("API unavailable, returning empty history list");
      return [];
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.warn("Error fetching reports:", error);
    return [];
  }
};

export const updateReportPrices = async (reportId: string, updatedFinalists: PortfolioItem[]) => {
  try {
    const response = await fetchWithFailover(`/api/reports/${reportId}/prices`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ finalists: updatedFinalists }),
    });

    if (!response.ok) throw new Error('Update failed');
    console.log("Prices updated successfully");
  } catch (error) {
    console.error("Error updating prices:", error);
  }
};



// Note: This replaces the client-side Gemini service
export const generateCandidates = async (): Promise<{ newsSummary: string; candidates: StockCandidate[]; sources: WebSource[] }> => {
  const response = await fetchWithFailover('/api/analyze/candidates', {
    method: 'POST',
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "生成候選名單失敗 (API)");
  }
  return response.json();
};

export const selectFinalists = async (candidates: StockCandidate[], newsSummary: string): Promise<PortfolioItem[]> => {
  const response = await fetchWithFailover('/api/analyze/finalists', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ candidates, newsSummary })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "篩選精選股失敗 (API)");
  }
  const data = await response.json();
  // Compatible with both old (array) and new ({ finalists, sold }) API response
  if (data.finalists && Array.isArray(data.finalists)) {
    return data.finalists;
  }
  return Array.isArray(data) ? data : [];
};

export const updateStockPricesAPI = async (stocks: any[]): Promise<any[]> => {
  const response = await fetchWithFailover('/api/analyze/prices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stocks })
  });
  if (!response.ok) throw new Error("更新股價失敗");
  return response.json();
};

// --- SUBSCRIBER API FUNC ---

export const getSubscribers = async (): Promise<Subscriber[]> => {
  try {
    const response = await fetchWithFailover('/api/subscribers');
    if (!response.ok) return [];
    return response.json();
  } catch (e) { return []; }
};

export const addSubscriber = async (email: string) => {
  const response = await fetchWithFailover('/api/subscribers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "新增失敗");
  }
  return response.json();
};

export const deleteSubscriber = async (id: number) => {
  await fetchWithFailover(`/api/subscribers/${id}`, { method: 'DELETE' });
};

// Update Entry Price
export const updateEntryPriceAPI = async (reportId: string, code: string, price: number) => {
  return fetchWithFailover(`/api/reports/${reportId}/entry-price`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, price })
  });
};

export const clearHistoryAPI = async (password: string) => {
  const response = await fetchWithFailover('/api/admin/clear-history', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "清除失敗");
  }
  return response.json();
};

```

---

## File: services/emailService.js
```javascript
// services/emailService.js
import nodemailer from 'nodemailer';

// Configure Transporter (Gmail)
const createTransporter = () => {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    console.warn("[Email] SMTP credentials missing in .env.local");
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
};

export const sendDailyReportEmail = async (report, subscribers = []) => {
  const transporter = createTransporter();
  if (!transporter) return false;

  // Merge Env Receiver + DB Subscribers
  let receivers = [];

  // Add Env Receiver (split by comma if multiple)
  if (process.env.RECEIVER_EMAIL) {
    receivers = [...receivers, ...process.env.RECEIVER_EMAIL.split(',')];
  }

  // Add DB Subscribers
  if (subscribers && Array.isArray(subscribers)) {
    receivers = [...receivers, ...subscribers];
  }

  // Clean, Trim, Deduplicate
  receivers = receivers
    .map(e => e.trim())
    .filter(e => e && e.includes('@')); // Simple validation
  receivers = [...new Set(receivers)];

  // Fallback
  if (receivers.length === 0) receivers.push(process.env.SMTP_USER);

  const receiverString = receivers.join(',');
  console.log(`[Email] Sending to: ${receiverString}`);

  // Format Email Body (HTML)
  const currentDate = report.date;
  const portfolio = report.finalists || [];

  const portfolioHtml = `
    <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
      <thead>
        <tr style="background-color: #f3f4f6; text-align: left;">
          <th style="padding: 12px; border: 1px solid #e5e7eb;">狀態</th>
          <th style="padding: 12px; border: 1px solid #e5e7eb;">代號</th>
          <th style="padding: 12px; border: 1px solid #e5e7eb;">名稱</th>
          <th style="padding: 12px; border: 1px solid #e5e7eb;">產業</th>
          <th style="padding: 12px; border: 1px solid #e5e7eb;">進場價</th>
          <th style="padding: 12px; border: 1px solid #e5e7eb;">報酬率</th>
          <th style="padding: 12px; border: 1px solid #e5e7eb;">理由</th>
        </tr>
      </thead>
      <tbody>
  ` + portfolio.map(stock => {
    const statusColor = stock.status === 'NEW' ? '#dc2626' : '#059669'; // Red for New, Green for Hold
    const statusText = stock.status === 'NEW' ? '🔥 新增' : '🛡️ 續抱';
    const roiColor = (stock.roi || 0) >= 0 ? '#dc2626' : '#059669';
    return `
      <tr>
        <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold; color: ${statusColor};">${statusText}</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">${stock.code}</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb;">${stock.name}</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb; color: #6b7280;">${stock.industry}</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb;">${stock.entryPrice}</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold; color: ${roiColor};">${stock.roi ? stock.roi.toFixed(2) : '0.00'}%</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb; font-size: 0.9em;">${stock.reason}</td>
      </tr>
    `;
  }).join('') + `</tbody></table>`;

  // Sold Stocks HTML
  const sold = report.sold || [];
  let soldHtml = '';
  if (sold.length > 0) {
    soldHtml = `
        <div style="margin-top: 30px; background-color: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e5e7eb;">
          <h2 style="font-size: 1.25rem; font-weight: bold; margin-bottom: 15px; border-left: 4px solid #9ca3af; padding-left: 10px;">📉 已賣出/剔除 (Sold)</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f3f4f6; text-align: left;">
                <th style="padding: 12px; border: 1px solid #e5e7eb;">代號</th>
                <th style="padding: 12px; border: 1px solid #e5e7eb;">名稱</th>
                <th style="padding: 12px; border: 1px solid #e5e7eb;">進場價</th>
                <th style="padding: 12px; border: 1px solid #e5e7eb;">出場價</th>
                <th style="padding: 12px; border: 1px solid #e5e7eb;">報酬率</th>
                <th style="padding: 12px; border: 1px solid #e5e7eb;">賣出理由</th>
              </tr>
            </thead>
            <tbody>
              ${sold.map(s => {
      const roiClass = s.roi >= 0 ? '#dc2626' : '#059669'; // Red for profit
      return `
                  <tr>
                    <td style="padding: 12px; border: 1px solid #e5e7eb;">${s.code}</td>
                    <td style="padding: 12px; border: 1px solid #e5e7eb;">${s.name}</td>
                    <td style="padding: 12px; border: 1px solid #e5e7eb;">${s.entryPrice}</td>
                    <td style="padding: 12px; border: 1px solid #e5e7eb;">${s.exitPrice}</td>
                    <td style="padding: 12px; border: 1px solid #e5e7eb; color: ${roiClass}; font-weight: bold;">${s.roi ? s.roi.toFixed(2) : 0}%</td>
                    <td style="padding: 12px; border: 1px solid #e5e7eb; font-size: 0.9em; color: #4b5563;">${s.reason || 'AI 判斷調整'}</td>
                  </tr>
                  `;
    }).join('')}
            </tbody>
          </table>
        </div>
        `;
  }

  const htmlContent = `
    <div style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #374151;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #4f46e5; margin-bottom: 10px;">📊 AI 台股每日分析報告</h1>
        <p style="color: #6b7280;">日期：${currentDate}</p>
      </div>

      <div style="background-color: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e5e7eb;">
        <h2 style="font-size: 1.25rem; font-weight: bold; margin-bottom: 15px; border-left: 4px solid #4f46e5; padding-left: 10px;">📰 市場摘要</h2>
        <p style="line-height: 1.6;">${report.newsSummary}</p>
      </div>

      <div style="margin-top: 30px; background-color: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e5e7eb;">
        <h2 style="font-size: 1.25rem; font-weight: bold; margin-bottom: 15px; border-left: 4px solid #10b981; padding-left: 10px;">📈 目前最新持倉 (Current Portfolio)</h2>
        <p style="color: #6b7280; font-size: 0.9rem;">AI 已根據今日行情進行再平衡，以下是最新建議持股（上限 5 檔）：</p>
        ${portfolioHtml}
      </div>

      ${soldHtml}

      <!-- New Section: Candidates -->
       <div style="margin-top: 30px; background-color: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e5e7eb;">
        <h2 style="font-size: 1.25rem; font-weight: bold; margin-bottom: 15px; border-left: 4px solid #f59e0b; padding-left: 10px;">⚡ AI 今日觀察名單 (Candidates)</h2>
        <p style="color: #6b7280; font-size: 0.9rem;">AI 根據市場題材篩選出的強勢股，列入觀察但不一定買進：</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <thead>
            <tr style="background-color: #f3f4f6; text-align: left;">
              <th style="padding: 12px; border: 1px solid #e5e7eb;">代號</th>
              <th style="padding: 12px; border: 1px solid #e5e7eb;">名稱</th>
              <th style="padding: 12px; border: 1px solid #e5e7eb;">現價</th>
              <th style="padding: 12px; border: 1px solid #e5e7eb;">AI 分析觀點</th>
            </tr>
          </thead>
          <tbody>
            ${(report.candidates || []).map(c => `
              <tr>
                <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">${c.code}</td>
                <td style="padding: 12px; border: 1px solid #e5e7eb;">${c.name}</td>
                <td style="padding: 12px; border: 1px solid #e5e7eb;">${c.price}</td>
                <td style="padding: 12px; border: 1px solid #e5e7eb; font-size: 0.9em; color: #4b5563;">${c.reason}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>


      <div style="margin-top: 40px; text-align: center; color: #9ca3af; font-size: 0.8rem;">
        <p>此信件由 Google Cloud Run 自動發送</p>
        <p>AI 分析僅供參考，投資請自負風險</p>
      </div>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: `"AI Stock Analyst" <${process.env.SMTP_USER}>`,
      to: receiverString,
      subject: `[AI Stock] 每日投資組合報告 - ${currentDate}`,
      html: htmlContent
    });
    console.log(`[Email] Sent: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error("[Email] Send Failed:", error);
    return false;
  }
};

```

---

## File: services/financeService.js
```javascript
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
            analysis.technicalReason += `RSI過熱(${currentRSI.toFixed(1)} > 55) 動能強勁; `;
        } else if (currentRSI < 45) {
            analysis.signals.push('RSI_BEARISH');
            analysis.action = 'SELL';
            analysis.technicalReason += `RSI轉弱(${currentRSI.toFixed(1)} < 45) 動能不足; `;
        } else {
            analysis.technicalReason += `RSI盤整(${currentRSI.toFixed(1)}); `;
        }

        // MA Logic
        if (lastClose > currentMA20) {
            analysis.signals.push('MA20_BULLISH');
            if (analysis.action === 'NEUTRAL') analysis.action = 'HOLD';
        } else {
            analysis.signals.push('MA20_BEARISH');
            if (analysis.action === 'HOLD') analysis.action = 'SELL';
        }

        if (analysis.action === 'BUY') analysis.technicalReason = `✅[強勢] ${analysis.technicalReason} `;
        if (analysis.action === 'SELL') analysis.technicalReason = `❌[弱勢] ${analysis.technicalReason} `;

        return analysis;

    } catch (err) {
        console.error(`[FinanceService] Error analyzing ${code}: `, err.message);
        return {
            code,
            error: err.message,
            action: 'NEUTRAL',
            technicalReason: 'API 連線錯誤',
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
            // Docs: volume (成交量，單位：股)
            // Requirement: > 1000 "lots" (張) => > 1,000,000 shares

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

```

---

## File: services/firestoreService.ts
```typescript
import { db } from "../firebaseConfig";
import { collection, addDoc, query, orderBy, getDocs, Timestamp, doc, updateDoc } from "firebase/firestore";
import { DailyReport, PortfolioItem } from "../types";

const COLLECTION_NAME = "daily_reports";

export const saveDailyReport = async (report: Omit<DailyReport, 'id'>) => {
  try {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...report,
      timestamp: Timestamp.now()
    });
    console.log("Document written with ID: ", docRef.id);
    return docRef.id;
  } catch (e) {
    console.error("Error adding document: ", e);
    // Allow app to continue even if firebase fails (for demo purposes if user hasn't set up key)
    alert("Error saving to Firebase. Check console and firebaseConfig.ts");
    return null;
  }
};

export const getDailyReports = async (): Promise<DailyReport[]> => {
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    const reports: DailyReport[] = [];
    querySnapshot.forEach((doc) => {
      reports.push({ id: doc.id, ...doc.data() } as DailyReport);
    });
    return reports;
  } catch (e) {
    console.error("Error getting documents: ", e);
    return [];
  }
};

export const updateReportPrices = async (reportId: string, updatedFinalists: PortfolioItem[]) => {
  try {
    const reportRef = doc(db, COLLECTION_NAME, reportId);
    await updateDoc(reportRef, {
      finalists: updatedFinalists
    });
  } catch (e) {
    console.error("Error updating document: ", e);
  }
};

```

---

## File: services/geminiService.ts
```typescript

import { GoogleGenAI } from "@google/genai";
import { StockCandidate, PortfolioItem, WebSource } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Helper to get today's date string for prompts
const getTodayString = () => new Date().toISOString().split('T')[0];

// Helper to reliably extract JSON from markdown or conversational text
const extractJson = (text: string): string => {
  if (!text) return "";

  // 1. Remove markdown code blocks (```json ... ```)
  let clean = text.replace(/```json\s*/g, "").replace(/```\s*$/g, "").replace(/```/g, "").trim();

  // 2. Determine if the content is likely an Array or an Object
  const firstSquare = clean.indexOf('[');
  const firstCurly = clean.indexOf('{');

  let startIndex = -1;
  let endIndex = -1;

  // Case A: Array appears first, or only array exists
  if (firstSquare !== -1 && (firstCurly === -1 || firstSquare < firstCurly)) {
    startIndex = firstSquare;
    endIndex = clean.lastIndexOf(']');
  }
  // Case B: Object appears first, or only object exists
  else if (firstCurly !== -1) {
    startIndex = firstCurly;
    endIndex = clean.lastIndexOf('}');
  }

  // 3. Extract the substring if valid indices found
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return clean.substring(startIndex, endIndex + 1);
  }

  // Fallback: return cleaned text and hope for the best
  return clean;
};

/**
 * Step 1: Analyze news and generate 10 candidates
 */
export const generateCandidates = async (): Promise<{ newsSummary: string; candidates: StockCandidate[]; sources: WebSource[] }> => {
  const model = "gemini-2.5-pro";

  const prompt = `
    你是一位台灣股市的專業分析師。請使用「繁體中文」回答。
    
    任務 1：搜尋今日 (${getTodayString()}) 最重要的國內外財經新聞，特別是影響台股的重大事件。
    任務 2：根據新聞，找出看好的產業板塊或題材。
    任務 3：選出 10 檔最可能受惠的台灣股票 (上市或上櫃)。
    
    要求：
    - 股票代碼必須是正確的台股代號 (例如 2330)。
    - 請透過搜尋找出目前的預估價格。
    - 每檔股票請提供簡短的推薦理由。
    - 所有內容必須是繁體中文。
    
    輸出格式：僅限 JSON。JSON 必須嚴格遵守以下結構：
    {
      "newsSummary": "一段關於今日市場新聞的簡明摘要...",
      "candidates": [
        {
          "code": "股票代號",
          "name": "股票名稱",
          "price": 100.0,
          "reason": "推薦理由",
          "industry": "產業類別"
        }
      ]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "{}";
    const jsonString = extractJson(text);
    const data = JSON.parse(jsonString);

    // Extract grounding sources
    const sources: WebSource[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web) {
          sources.push({ title: chunk.web.title, uri: chunk.web.uri });
        }
      });
    }

    return {
      newsSummary: data.newsSummary || "無法取得新聞摘要。",
      candidates: data.candidates || [],
      sources
    };
  } catch (error) {
    console.error("Error generating candidates:", error);
    throw new Error("生成候選名單失敗。無法解析 AI 回應。");
  }
};

/**
 * Step 2: Filter 10 candidates down to 3 finalists
 */
export const selectFinalists = async (candidates: StockCandidate[], newsSummary: string): Promise<PortfolioItem[]> => {
  const model = "gemini-2.5-flash";

  const candidatesJson = JSON.stringify(candidates);

  const prompt = `
    你是一位風格穩健但善於把握機會的投資組合經理。請使用「繁體中文」回答。
    
    背景資訊：
    今日新聞摘要：${newsSummary}
    
    候選名單 (10 檔)：
    ${candidatesJson}
    
    任務：
    分析上述 10 檔候選股。對其基本面或近期動能進行深入檢查。
    選出前 3 名「風險回報比」最佳的股票，適合短中線持有。
    
    輸出格式：僅限 JSON。JSON 必須嚴格遵守以下結構 (請注意是陣列 Array)：
    [
      {
        "code": "股票代號",
        "name": "股票名稱",
        "entryPrice": 100.0,
        "reason": "詳細的獲選理由，解釋為何這檔股票勝出",
        "industry": "產業類別"
      }
    ]
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "[]";
    const jsonString = extractJson(text);
    const finalists = JSON.parse(jsonString);

    if (!Array.isArray(finalists)) {
      console.error("AI output is not an array:", finalists);
      throw new Error("AI output is not an array");
    }

    // Map to PortfolioItem structure
    return finalists.map((item: any) => ({
      ...item,
      entryDate: getTodayString(),
      currentPrice: item.entryPrice || 0, // Initial state
      roi: 0
    }));

  } catch (error) {
    console.error("Error selecting finalists:", error);
    throw new Error("篩選精選股失敗。無法解析 AI 回應。");
  }
};

/**
 * Update prices for a list of stocks using Search
 */
export const updateStockPrices = async (stocks: PortfolioItem[]): Promise<PortfolioItem[]> => {
  if (stocks.length === 0) return [];

  const stockList = stocks.map(s => `${s.name} (${s.code})`).join(", ");
  const prompt = `
    找出以下台灣股票的「即時股價」(Current real-time stock price)：${stockList}。
    
    請回傳一個 JSON 物件，key 是股票代號，value 是目前的數字價格。
    範例：{ "prices": [{ "code": "2330", "price": 500 }] }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "{}";
    const jsonString = extractJson(text);
    const data = JSON.parse(jsonString);
    const priceMap = new Map<string, number>();

    if (data.prices && Array.isArray(data.prices)) {
      data.prices.forEach((p: any) => priceMap.set(p.code, p.price));
    }

    return stocks.map(stock => {
      const currentPrice = priceMap.get(stock.code) || stock.currentPrice;
      const roi = ((currentPrice - stock.entryPrice) / stock.entryPrice) * 100;
      return {
        ...stock,
        currentPrice,
        roi
      };
    });

  } catch (error) {
    console.error("Error updating prices:", error);
    return stocks; // Return original if update fails
  }
};

```

---

## File: services/logger.js
```javascript

import fs from 'fs';

function logError(msg) {
    try {
        fs.appendFileSync('debug_error.log', new Date().toISOString() + ': ' + msg + '\n');
    } catch (e) { }
}

```

---

## File: services/settingsService.ts
```typescript
const API_URL = import.meta.env.VITE_API_URL || '';

export interface SystemConfig {
    step_key: string;
    provider: 'gemini' | 'qwen';
    model_name: string;
    temperature: number;
    prompt_template?: string; // Optional custom prompt
    updated_at?: string;
}

export const getSettings = async (): Promise<SystemConfig[]> => {
    const res = await fetch(`${API_URL}/api/settings`);
    if (!res.ok) throw new Error("Failed to fetch settings");
    return res.json();
};

export const saveSetting = async (config: SystemConfig): Promise<void> => {
    const res = await fetch(`${API_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error("Failed to save setting");
};

```

---

## File: tests/e2e_test.js
```javascript

// E2E Test Script for Taiwan Stock AI Analyst
// Usage: node tests/e2e_test.js
// Expects server to be running on localhost:8080 or 8081

const BASE_URL = 'http://localhost:8080'; // Default, will try to detect or fail over

async function runTest() {
    console.log("🚀 Starting E2E System Test...");

    // 0. Health Check
    try {
        const res = await fetch(`${BASE_URL}/`);
        if (!res.ok) throw new Error(`Server Check Failed: ${res.status}`);
        console.log("✅ Server is online.");
    } catch (e) {
        console.error("❌ Server is offline or unreachable. Please start 'npm run server'.");
        process.exit(1);
    }

    // 1. Clear History (Reset State)
    console.log("\nStep 1: Clearing Database...");
    try {
        const res = await fetch(`${BASE_URL}/api/admin/clear-history`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'abcd1234' })
        });
        const data = await res.json();
        if (data.success) console.log("✅ Database cleared.");
        else throw new Error(data.error);
    } catch (e) { console.error(`❌ Clear DB Failed: ${e.message}`); }

    // 2. Generate Candidates (Layer 1 & 2)
    console.log("\nStep 2: Generating Candidates (This triggers AI, wait ~60s)...");
    let generatedCandidates = [];
    try {
        const res = await fetch(`${BASE_URL}/api/analyze/candidates`, { method: 'POST' });
        const text = await res.text();
        try {
            const data = JSON.parse(text);
            if (data.success && Array.isArray(data.candidates)) {
                console.log(`✅ Candidates Generated: ${data.candidates.length} stocks found.`);
                generatedCandidates = data.candidates;
            } else {
                throw new Error(`Invalid response format: ${JSON.stringify(data).substring(0, 200)}...`);
            }
        } catch (e) {
            throw new Error(`JSON Parse Error: ${e.message}\nRaw Response: ${text.substring(0, 500)}`);
        }
    } catch (e) {
        console.error(`❌ Candidate Generation Failed: ${e.message}`);
    }

    // 3. Finalize Portfolio (Layer 3)
    console.log("\nStep 3: Finalizing Portfolio (Firewall Check)...");
    let selectedFinalists = [];
    try {
        const res = await fetch(`${BASE_URL}/api/analyze/finalists`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candidates: generatedCandidates })
        });
        const text = await res.text();
        try {
            const data = JSON.parse(text);
            if (data.finalists && Array.isArray(data.finalists)) {
                console.log(`✅ Portfolio Finalized: ${data.finalists.length} stocks selected.`);
                selectedFinalists = data.finalists;
                data.finalists.forEach(s => console.log(`   - ${s.name} (${s.code}): RSI=${s.ta?.rsi?.toFixed(1) || 'N/A'}`));
            } else {
                throw new Error(`Invalid response format: ${JSON.stringify(data).substring(0, 200)}...`);
            }
        } catch (e) {
            throw new Error(`JSON Parse Error: ${e.message}\nRaw Response: ${text.substring(0, 500)}`);
        }
    } catch (e) { console.error(`❌ Portfolio Finalization Failed: ${e.message}`); }

    // 4. Save Report
    console.log("\nStep 4: Saving Daily Report...");
    let reportId = null;
    try {
        const saveRes = await fetch(`${BASE_URL}/api/reports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: new Date().toISOString().split('T')[0],
                timestamp: Date.now(),
                newsSummary: "E2E Test Summary",
                candidates: [], // Simplify
                finalists: selectedFinalists,
                sources: []
            })
        });
        const saveData = await saveRes.json();
        if (saveData.success) {
            reportId = saveData.id;
            console.log(`✅ Report Saved. ID: ${reportId}`);
        } else throw new Error("Save failed");

    } catch (e) { console.error(`❌ Save Report Failed: ${e.message}`); }

    // 5. Update Prices
    if (reportId) {
        console.log(`\nStep 5: Updating Prices for Report ${reportId}...`);
        try {
            const res = await fetch(`${BASE_URL}/api/reports/${reportId}/prices`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ finalists: [] }) // Backend re-fetches anyway
            });
            const data = await res.json();
            if (data.success) {
                console.log("✅ Prices Updated.");
                // Verify content
                const updatedPortfolio = data.finalists;
                updatedPortfolio.forEach(s => {
                    console.log(`   - ${s.name}: Price=${s.price}, Cur=${s.currentPrice}, ROI=${s.roi.toFixed(2)}%, Reason includes Tech? ${s.reason.includes('[最新技術]')}`);
                });
            } else throw new Error(data.error);
        } catch (e) { console.error(`❌ Update Price Failed: ${e.message}`); }
    }

    // 6. Test Cron Trigger (Auto Analysis + Email)
    console.log("\nStep 6: Testing Cron Trigger (Auto Analysis & Email)...");
    try {
        // Note: This endpoint is GET
        const res = await fetch(`${BASE_URL}/api/cron/trigger`);
        const data = await res.json();
        if (res.ok && (data.reportId || data.message)) {
            console.log(`✅ Cron Triggered Successfully. Report ID: ${data.reportId || 'N/A'}`);
            console.log("   (Check server logs to verify Email Sending status)");
        } else {
            throw new Error(data.error || "Unknown error");
        }
    } catch (e) {
        console.error(`❌ Cron Trigger Failed: ${e.message}`);
    }

    console.log("\n🎉 Test Complete.");
}

runTest();

```

---

## File: tests/fix_db_limit.js
```javascript

import Database from 'better-sqlite3';

const db = new Database('finance.db');

const row = db.prepare('SELECT id, data FROM daily_reports WHERE id = 86').get();

if (row) {
    const data = JSON.parse(row.data);
    if (data.finalists && data.finalists.length > 5) {
        console.log(`Fixing report ${row.id}: shrinking finalists from ${data.finalists.length} to 5.`);
        // Keep top 5
        data.finalists = data.finalists.slice(0, 5);
        db.prepare('UPDATE daily_reports SET data = ? WHERE id = ?').run(JSON.stringify(data), row.id);
        console.log("Fixed.");
    } else {
        console.log("Report seems fine (<= 5).");
    }
}

```

---

## File: tests/inspect_db.js
```javascript

import Database from 'better-sqlite3';

const db = new Database('finance.db');

const row = db.prepare('SELECT id, data FROM daily_reports ORDER BY timestamp DESC LIMIT 1').get();

if (row) {
    const data = JSON.parse(row.data);
    const finalists = data.finalists || [];
    console.log(`Report ID: ${row.id}`);
    console.log(`Finalists Count: ${finalists.length}`);
    finalists.forEach((f, i) => {
        console.log(`${i + 1}. ${f.code} ${f.name} (${f.status})`);
    });
} else {
    console.log("No reports found.");
}

```

---

## File: test_yf.js
```javascript
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

```

---

## File: tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "module": "ESNext",
    "lib": [
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ],
    "skipLibCheck": true,
    "types": [
      "node"
    ],
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "moduleDetection": "force",
    "allowJs": true,
    "jsx": "react-jsx",
    "paths": {
      "@/*": [
        "./*"
      ]
    },
    "allowImportingTsExtensions": true,
    "noEmit": true
  }
}
```

---

## File: types.ts
```typescript
export interface Stock {
  code: string;
  name: string;
  price: number;
  reason: string;
  industry?: string;
  dailyChange?: number; // percentage
}

export interface StockCandidate extends Stock {
  score?: number;
}

export interface PortfolioItem extends Stock {
  entryPrice: number;
  entryDate: string;
  currentPrice: number;
  roi: number;
}

export interface WebSource {
  title: string;
  uri: string;
}
// ... existing types
export interface Subscriber {
  id: number;
  email: string;
  is_active?: number;
  created_at: string;
}

export interface DailyReport {
  id?: string; // Firebase ID
  date: string;
  newsSummary: string;
  candidates: StockCandidate[];
  finalists: PortfolioItem[];
  sources?: WebSource[];
  timestamp: number;
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  ANALYZING_NEWS = 'ANALYZING_NEWS',
  PICKING_CANDIDATES = 'PICKING_CANDIDATES',
  FILTERING_FINALISTS = 'FILTERING_FINALISTS',
  SAVING = 'SAVING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}
```

---

## File: vite.config.ts
```typescript
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false
        }
      }
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});

```

---

