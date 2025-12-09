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
