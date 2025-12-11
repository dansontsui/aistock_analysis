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
