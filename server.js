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
import { analyzeStockTechnicals, getStockPrice } from './services/financeService.js';

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
  ('stock_recommendation', 'qwen', 'qwen-turbo');

`);

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

  // 2. Dispatch to Provider
  if (config.provider === 'qwen') {
    return await callQwen(config.model_name, prompt, config.temperature);
  } else {
    // Default to Gemini
    return await callGemini(config.model_name, prompt, fallbackConfig);
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

    // Use configurable AI with 'global_news' step key
    // Pass Google Search config in case it's Gemini (Qwen currently ignores this via API)
    const response = await callAI('global_news', prompt, { tools: [{ googleSearch: {} }] });
    const text = response.text || "{}";
    const data = JSON.parse(extractJson(text));

    // Extract Sources (Only if provider sent them structure, mostly Gemini specific)
    // Note: callAI standardizes to text, so we might lose groundingMetadata if we don't return full object.
    // For now, let's keep it simple. If Qwen is used, sources might need different handling.
    // But since Step 1 is Gemini default, we lose grounding metadata in current callAI/callGemini implementation.
    // Fix: Update callGemini to return raw response too if needed? 
    // Actually, let's just accept sources are empty for now or parse from text if model provides.
    // Or... we can attach raw response to the return object in callGemini.
    const sources = [];
    // (Grounding extraction omitted for simplicity in this refactor, can re-add if critical)

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
        3. 決定是否要「買入」潛力新股 (若空間不足，需先賣出)。
        4. **嚴格遵守**：總持股數量不得超過 5 檔。

        【選股邏輯】：
        - 優先保留強勢股 (獲利中、趨勢向上)。
        - 優先剔除弱勢股 (虧損擴大、技術面轉空)。
        - 新買入股票必須有極強的技術面或基本面理由。
        - **請給出具體的技術分析理由、基本面理由以及進出場策略。**

        【輸出格式】：僅限 JSON 陣列 (最終的 0~5 檔持股)。
        [
           // 若是保留原有持股，請保留原本的 entryPrice (進場價)
           { "code": "2330", "name": "台積電", "entryPrice": 500, "reason": "續抱...理由...", "industry": "...", "status": "HOLD" },
           
           // 若是新買入，請設定 status: "BUY" (後續會自動填入今日價格)
           { "code": "2454", "name": "聯發科", "entryPrice": 0, "reason": "新納入...理由...", "industry": "...", "status": "BUY" }
        ]
    `;

    // Use 'stock_recommendation' step config (Default: Qwen)
    const response = await callAI('stock_recommendation', prompt);
    const text = response.text || "[]";
    const newPortfolioRaw = JSON.parse(extractJson(text));
    if (!Array.isArray(newPortfolioRaw)) throw new Error("AI output not array");


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

    // Use Yahoo Finance to fetch prices
    const priceMap = new Map();
    await Promise.all(stocks.map(async (stock) => {
      const price = await getStockPrice(stock.code);
      if (price > 0) priceMap.set(String(stock.code), price);
    }));

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
    // Use 'global_news' config (Default: Gemini 2.5)
    const candResponse = await callAI('global_news', candPrompt, { tools: [{ googleSearch: {} }] });
    const candText = candResponse.text || "{}";
    const candData = JSON.parse(extractJson(candText));
    const newsSummary = candData.newsSummary || "No summary";
    const candidates = candData.candidates || [];

    // Extract Sources 
    // (Note: callAI returns simplified structure. For full grounding metadata in Gemini, we'd need to adjust callGemini return.
    // For now, minimizing changes, sources might be empty if not handled. If user needs sources, we can enhance callGemini later.)
    const sources = [];
    // if (candResponse.candidates?.[0]?.groundingMetadata?.groundingChunks) ... (See previous note)


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

    // --- 2. Technical Analysis Integration ---
    console.log("[Automation] Step 2.5: Running Technical Analysis...");

    // Analyze Current Portfolio
    const portfolioWithTA = await Promise.all(currentPortfolio.map(async (stock) => {
      const ta = await analyzeStockTechnicals(stock.code);
      return { ...stock, ta };
    }));

    // Analyze Candidates (optional, for filtering)
    // Analyze Candidates (optional, for filtering)
    const candidatesWithTA = (await Promise.all(candidates.map(async (stock) => {
      const ta = await analyzeStockTechnicals(stock.code);
      return { ...stock, ta };
    }))).filter(c => !c.ta.error && c.ta.status !== 'UNKNOWN');

    const finPrompt = `
        你是一位專業的基金經理人，負責管理一個「最多持股 5 檔」的台股投資組合。
        請使用「繁體中文」回答。

        市場概況：${newsSummary}

        【目前持倉 (Current Portfolio)】：
        (包含技術分析訊號，請優先遵守 TA ACTION 指令)
        ${JSON.stringify(portfolioWithTA.map(p => ({
      code: p.code,
      name: p.name,
      entryPrice: p.entryPrice,
      currentMA_Status: p.ta.technicalReason,
      TA_ACTION: p.ta.action, // SELL, HOLD
      TA_SIGNALS: p.ta.signals // TREND_REVERSAL, HIGH_BIAS_REVERSAL, etc.
    })))}

        【今日觀察名單 (New Candidates)】：
        ${JSON.stringify(candidatesWithTA.map(c => ({
      code: c.code,
      name: c.name,
      technical_view: c.ta.technicalReason,
      is_strong_trend: c.ta.signals.includes('STRONG_UPTREND')
    })))}

        【決策任務】：
        1. **優先執行技術分析指令 (Hard Rules)**：
           - **賣出規則 (雙軌制)**：
             - 若 TA_ACTION 為 "SELL"，**必須立刻賣出**。
           - **買入規則**：
             - 優先選擇強勢股 (股價 > 月線 > 季線)。
             - **禁止買入** 空頭排列 (股價 < 季線) 的股票。

        2. **撰寫完整理由 (reason)**：
           - **必須包含「進場/決策當下的技術面狀況」** (例如：目前股價 1480 站穩月線，均線多頭排列)。
           - 請勿簡略，請完整說明看好的產業趨勢以及技術面支撐點位。

        3. 決定是否要「賣出」或「買入」新標的 (嚴格限制總持股 5 檔)。

        【輸出格式】：僅限 JSON 陣列 (最終的持股名單)。
        [
           { "code": "2330", "name": "台積電", "entryPrice": 500, "reason": "【續抱】技術面強勢：股價(1480)站穩月線之上，且MA5穿越MA10形成黃金交叉。基本面：受惠AI先進封裝產能供不應求...", "industry": "半導體", "status": "HOLD" },
           { "code": "2454", "name": "聯發科", "entryPrice": 0, "reason": "【新納入】技術面翻多：股價突破季線反壓，RSI轉強。天璣9400晶片出貨暢旺...", "industry": "IC設計", "status": "BUY" }
        ]
    `;
    // Use 'stock_recommendation' config (Default: Qwen)
    const finResponse = await callAI('stock_recommendation', finPrompt);
    const newPortfolioRaw = JSON.parse(extractJson(finResponse.text || "[]"));


    // 3. Price Verification
    console.log("[Automation] Step 3: Verifying Prices...");
    // Use Yahoo Finance to fetch prices
    const priceMap = new Map();
    await Promise.all(newPortfolioRaw.map(async (item) => {
      const price = await getStockPrice(item.code);
      if (price > 0) priceMap.set(String(item.code), price);
    }));

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

        // Find reason from Technical Analysis
        const taInfo = portfolioWithTA.find(p => p.code === s.code);
        let sellReason = "AI 綜合判斷賣出"; // Default
        if (taInfo && taInfo.ta && taInfo.ta.action === 'SELL') {
          sellReason = `【觸發硬規則】${taInfo.ta.technicalReason}`;
        }

        return { ...s, exitPrice, roi, reason: sellReason };
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
