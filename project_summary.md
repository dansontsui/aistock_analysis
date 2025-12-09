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
