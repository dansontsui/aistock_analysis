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


gcloud run deploy stock-analyst-service --image gcr.io/gen-lang-client-0195512020/aistock-app --platform managed --region asia-east1 --allow-unauthenticated --port 8080 --execution-environment gen2 



--add-volume 'name=db-storage,type=cloud-storage,bucket=aistock-gen-lang-client-0195512020' --add-volume-mount 'volume=db-storage,mount-path=/mnt/data' --set-env-vars 'DB_PATH=/mnt/data/finance.db,GEMINI_API_KEY=AIzaSyDhdHxiy2NzaJHlqvrEnzV_RZTg_8OOeEs,SMTP_SERVICE=gmail,SMTP_USER=tsui.nfx@gmail.com,SMTP_PASS=bmuv uezi ttls czkp,CRON_SECRET=mySuperSecretKey'

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
```

### remote url
https://stock-analyst-service-1095113025304.asia-east1.run.app/