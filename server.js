import express from 'express';
import Database from 'better-sqlite3';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";
import { sendDailyReportEmail } from './services/emailService.js';

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
  db.pragma('journal_mode = WAL');
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// --- 3. AI CONFIGURATION ---
const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) console.warn("[AI] Warning: GEMINI_API_KEY is missing.");
  return new GoogleGenAI({ apiKey });
};

// Helper: Generate Content with Fallback
const generateContentWithFallback = async (ai, prompt, config) => {
  // 優先使用最新的 2.5 Flash (User Requested)，若失敗則退守舊版
  const models = ["gemini-2.5-pro", "gemini-2.5-flash", "models/gemini-2.5-flash", "gemini-2.0-flash-exp", "gemini-1.5-flash-002", "gemini-1.5-flash"];
  let lastError;

  for (const model of models) {
    try {
      console.log(`[AI] Trying model: ${model}`);
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config
      });
      console.log(`[AI] Success with model: ${model}`);
      return response;
    } catch (error) {
      console.warn(`[AI] Model ${model} failed:`, error.message);
      // If it's a 404 (Not Found) or 400 (Bad Request), try next.
      // If it's 401/403 (Auth), it probably won't work for others either, but we try anyway.
      lastError = error;
    }
  }
  throw lastError || new Error("All AI models failed.");
};

const getTodayString = () => new Date().toISOString().split('T')[0];
const extractJson = (text) => {
  if (!text) return "";
  let clean = text.replace(/```json\s*/g, "").replace(/```\s*$/g, "").replace(/```/g, "").trim();
  const firstSquare = clean.indexOf('[');
  const firstCurly = clean.indexOf('{');
  let startIndex = -1, endIndex = -1;

  if (firstSquare !== -1 && (firstCurly === -1 || firstSquare < firstCurly)) {
    startIndex = firstSquare;
    endIndex = clean.lastIndexOf(']');
  } else if (firstCurly !== -1) {
    startIndex = firstCurly;
    endIndex = clean.lastIndexOf('}');
  }
  return (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) ? clean.substring(startIndex, endIndex + 1) : clean;
};

// --- NEW Helper: Get Real-Time Prices using AI & Search ---
const getRealTimePrices = async (ai, stocks) => {
  if (!stocks || stocks.length === 0) return new Map();

  const stockList = stocks.map(s => `${s.name} (${s.code})`).join(", ");
  const prompt = `
      找出以下台灣股票的「即時股價」(Current real-time stock price)：${stockList}。
      請回傳一個 JSON 物件，key 是股票代號，value 是目前的數字價格。
      範例：{ "prices": [{ "code": "2330", "price": 500 }] }
  `;

  try {
    const response = await generateContentWithFallback(ai, prompt, { tools: [{ googleSearch: {} }] });
    const text = response.text || "{}";
    const data = JSON.parse(extractJson(text));

    const priceMap = new Map();
    if (data.prices && Array.isArray(data.prices)) {
      data.prices.forEach(p => priceMap.set(p.code, p.price));
    }
    return priceMap;
  } catch (error) {
    console.warn("[Price Check] Failed to fetch prices via AI:", error);
    return new Map();
  }
};

// --- 4. API ROUTES ---

// --- SUBSCRIBER APIS ---
app.get('/api/subscribers', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM subscribers ORDER BY id DESC').all();
    res.json(rows);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch subscribers' }); }
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
  console.log("[AI] Generating 10 candidates...");
  try {
    const ai = getAI();
    const prompt = `
        你是一位台灣股市的專業分析師。請使用「繁體中文」回答。
        任務：廣泛搜尋今日 (${getTodayString()}) 的「全球」與「台灣」財經新聞。
        重點關注：
        1. 美股重要指數與權值股表現 (Nasdaq, 費半 SOX, NVIDIA, Apple, AMD, 台積電 ADR)。
        2. 總體經濟指標 (Fed 利率決策, CPI, 美債殖利率)。
        3. 台灣本地熱門題材 (法說會, 營收公布, 產業動態)。
        綜合上述國際與國內資訊，選出 10 檔最值得關注的台灣股票。
        輸出格式：僅限 JSON。
        {
          "newsSummary": "新聞摘要...",
          "candidates": [ { "code": "2330", "name": "台積電", "price": 1000, "reason": "...", "industry": "..." } ]
        }
    `;

    const response = await generateContentWithFallback(ai, prompt, { tools: [{ googleSearch: {} }] });

    const text = response.text || "{}";
    const data = JSON.parse(extractJson(text));

    // Extract Sources
    const sources = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      response.candidates[0].groundingMetadata.groundingChunks.forEach(c => {
        if (c.web) sources.push({ title: c.web.title, uri: c.web.uri });
      });
    }

    res.json({ newsSummary: data.newsSummary || "", candidates: data.candidates || [], sources });
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
    const ai = getAI();

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

    console.log(`[Portfolio] Current Holdings: ${currentPortfolio.length} stocks.`);

    // 2. Prompt for Rebalancing
    const prompt = `
        你是一位專業的基金經理人，負責管理一個「最多持股 5 檔」的台股投資組合。
        請使用「繁體中文」回答。

        市場概況：${newsSummary}

        【目前持倉 (Current Portfolio)】：
        ${JSON.stringify(currentPortfolio)}

        【今日觀察名單 (New Candidates)】：
        ${JSON.stringify(candidates)}

        【決策任務】：
        1. 檢視「目前持倉」與「今日觀察名單」。
        2. 決定是否要「賣出」(剔除) 表現不佳或前景轉弱的持股。
        3. 決定是否要「買入」(新增) 強力看好的新標的。
        4. **嚴格限制**：最終持股名單 (原有+新增) **不可超過 5 檔**。
        5. 若目前持倉表現良好且無更好標的，可維持現狀。

        【輸出格式】：僅限 JSON 陣列 (最終的持股名單)。
        [
           // 若是保留原有持股，請保留原本的 entryPrice (進場價)
           { "code": "2330", "name": "台積電", "entryPrice": 500, "reason": "續抱...", "industry": "...", "status": "HOLD" },
           
           // 若是新買入，請設定 status: "BUY" (後續會自動填入今日價格)
           { "code": "2454", "name": "聯發科", "entryPrice": 0, "reason": "新納入...", "industry": "...", "status": "BUY" }
        ]
    `;

    const response = await generateContentWithFallback(ai, prompt, { tools: [{ googleSearch: {} }] });

    const text = response.text || "[]";
    const newPortfolioRaw = JSON.parse(extractJson(text));
    if (!Array.isArray(newPortfolioRaw)) throw new Error("AI output not array");

    // 3. Price Validation & Merging
    console.log("[Price Check] Verifying prices for new portfolio...");

    // Identify which stocks need real-time price check (New BUYs or Missing Price)
    // Actually, we should update ALL current prices to ensure the dashboard is fresh.
    const priceMap = await getRealTimePrices(ai, newPortfolioRaw);

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

    const ai = getAI();

    // Use the shared helper to fetch prices
    const priceMap = await getRealTimePrices(ai, stocks);

    const updatedStocks = stocks.map(stock => {
      const currentPrice = priceMap.get(stock.code) || stock.currentPrice;

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

// Reports: Create
app.post('/api/reports', (req, res) => {
  try {
    const { date, timestamp, newsSummary, candidates, finalists, sources } = req.body;
    const jsonData = JSON.stringify({ candidates, finalists, sources });
    const info = db.prepare('INSERT INTO daily_reports (date, timestamp, newsSummary, data) VALUES (?, ?, ?, ?)').run(date, timestamp, newsSummary, jsonData);
    res.json({ id: info.lastInsertRowid.toString(), success: true });
  } catch (error) { res.status(500).json({ error: 'Save Failed' }); }
});

// Reports: Update Prices
app.put('/api/reports/:id/prices', (req, res) => {
  try {
    const { id } = req.params;
    const { finalists } = req.body;
    const row = db.prepare('SELECT data FROM daily_reports WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    const currentData = JSON.parse(row.data);
    const newData = { ...currentData, finalists };
    db.prepare('UPDATE daily_reports SET data = ? WHERE id = ?').run(JSON.stringify(newData), id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Update Failed' }); }
});

// Backup: Download DB
app.get('/api/backup', (req, res) => {
  if (fs.existsSync(dbPath)) res.download(dbPath, 'finance.db');
  else res.status(404).send('File not found');
});

// --- AUTOMATION: Run Daily Analysis & Email ---
const runDailyAnalysis = async () => {
  console.log("[Automation] Starting Daily Analysis Job...");
  const ai = getAI();
  const today = getTodayString();
  const timestamp = Date.now();

  try {
    // 1. Get News & Candidates
    console.log("[Automation] Step 1: Getting News & Candidates...");

    // (Reusing prompt from /api/analyze/candidates)
    const candPrompt = `
        你是一位台灣股市的專業分析師。請使用「繁體中文」回答。
        任務：廣泛搜尋今日 (${today}) 的「全球」與「台灣」財經新聞。
        重點關注：
        1. 美股重要指數與權值股表現 (Nasdaq, 費半 SOX, NVIDIA, Apple, AMD, 台積電 ADR)。
        2. 總體經濟指標 (Fed 利率決策, CPI, 美債殖利率)。
        3. 台灣本地熱門題材 (法說會, 營收公布, 產業動態)。
        綜合上述國際與國內資訊，選出 10 檔最值得關注的台灣股票。
        輸出格式：僅限 JSON。
        {
          "newsSummary": "新聞摘要...",
          "candidates": [ { "code": "2330", "name": "台積電", "price": 1000, "reason": "...", "industry": "..." } ]
        }
    `;
    const candResponse = await generateContentWithFallback(ai, candPrompt, { tools: [{ googleSearch: {} }] });
    const candText = candResponse.text || "{}";
    const candData = JSON.parse(extractJson(candText));
    const newsSummary = candData.newsSummary || "No summary";
    const candidates = candData.candidates || [];

    // Extract Sources
    const sources = [];
    if (candResponse.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      candResponse.candidates[0].groundingMetadata.groundingChunks.forEach(c => {
        if (c.web) sources.push({ title: c.web.title, uri: c.web.uri });
      });
    }

    // 2. Portfolio Rebalancing (Finalists)
    console.log("[Automation] Step 2: Rebalancing Portfolio...");

    // Fetch previous portfolio
    let currentPortfolio = [];
    try {
      const latestReport = db.prepare('SELECT data FROM daily_reports ORDER BY timestamp DESC LIMIT 1').get();
      if (latestReport) {
        const d = JSON.parse(latestReport.data);
        if (d.finalists && Array.isArray(d.finalists)) currentPortfolio = d.finalists;
      }
    } catch (e) { console.warn("[DB] No previous portfolio found."); }

    const finPrompt = `
        你是一位專業的基金經理人，負責管理一個「最多持股 5 檔」的台股投資組合。
        請使用「繁體中文」回答。

        市場概況：${newsSummary}

        【目前持倉 (Current Portfolio)】：
        ${JSON.stringify(currentPortfolio)}

        【今日觀察名單 (New Candidates)】：
        ${JSON.stringify(candidates)}

        【決策任務】：
        1. 檢視「目前持倉」與「今日觀察名單」。
        2. 決定是否要「賣出」(剔除) 表現不佳或前景轉弱的持股。
        3. 決定是否要「買入」(新增) 強力看好的新標的。
        4. **嚴格限制**：最終持股名單 (原有+新增) **不可超過 5 檔**。
        5. 若目前持倉表現良好且無更好標的，可維持現狀。

        【輸出格式】：僅限 JSON 陣列 (最終的持股名單)。
        [
           { "code": "2330", "name": "台積電", "entryPrice": 500, "reason": "續抱...", "industry": "...", "status": "HOLD" },
           { "code": "2454", "name": "聯發科", "entryPrice": 0, "reason": "新納入...", "industry": "...", "status": "BUY" }
        ]
    `;
    const finResponse = await generateContentWithFallback(ai, finPrompt, { tools: [{ googleSearch: {} }] });
    const newPortfolioRaw = JSON.parse(extractJson(finResponse.text || "[]"));

    // 3. Price Verification
    console.log("[Automation] Step 3: Verifying Prices...");
    const priceMap = await getRealTimePrices(ai, newPortfolioRaw);

    const finalists = newPortfolioRaw.map(item => {
      const itemCode = String(item.code).trim();
      const verifiedPrice = priceMap.get(itemCode) || priceMap.get(item.code); // Try both key types

      let currentPriceVal = parseFloat((verifiedPrice && verifiedPrice > 0) ? verifiedPrice : (item.currentPrice || 0)) || 0;
      let entryPrice = parseFloat(item.entryPrice) || 0;
      let entryDate = item.entryDate || getTodayString();

      const isNew = !currentPortfolio.find(p => String(p.code).trim() === itemCode);

      if (isNew || !entryPrice || entryPrice === 0) {
        entryPrice = currentPriceVal;
        entryDate = getTodayString();
      }
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
    const soldStocks = currentPortfolio
      .filter(curr => !finalists.find(r => r.code === curr.code))
      .map(s => {
        const exitPrice = priceMap.get(s.code) || s.currentPrice;
        const roi = s.entryPrice ? ((exitPrice - s.entryPrice) / s.entryPrice) * 100 : 0;
        return { ...s, exitPrice, roi };
      });

    // 4. Save to DB
    console.log(`[Automation] Step 4: Saving Report... (Sold: ${soldStocks.length})`);
    const jsonData = JSON.stringify({ candidates, finalists, sources, sold: soldStocks });
    const info = db.prepare('INSERT INTO daily_reports (date, timestamp, newsSummary, data) VALUES (?, ?, ?, ?)').run(today, timestamp, newsSummary, jsonData);
    console.log(`[Automation] Saved Report ID: ${info.lastInsertRowid}`);

    // 5. Send Email
    console.log("[Automation] Step 5: Sending Email...");
    // Fetch Subscribers from DB
    let subscriberEmails = [];
    try {
      const rows = db.prepare('SELECT email FROM subscribers').all();
      subscriberEmails = rows.map(row => row.email);
    } catch (e) { console.warn("[DB] Failed to fetch subscribers for email", e); }

    const reportData = { date: today, newsSummary, finalists, sold: soldStocks };
    // Pass subscribers to email service (service will mix with env if needed)
    await sendDailyReportEmail(reportData, subscriberEmails);

    console.log("[Automation] Job Completed Successfully.");
    return { success: true, id: info.lastInsertRowid };

  } catch (error) {
    console.error("[Automation] Job Failed:", error);
    return { success: false, error: error.message };
  }
};

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
