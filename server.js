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
  ('stock_recommendation', 'qwen', 'qwen-turbo'),
  ('layer1_news', 'gemini', 'gemini-2.5-flash'),
  ('layer2_mapping', 'gemini', 'gemini-1.5-flash'),
  ('layer3_decision', 'gemini', 'gemini-1.5-pro');

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
    const l1Response = await callAI('layer1_news', l1Prompt, { tools: [{ googleSearch: {} }] });
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

        輸出格式 (JSON String Array):
        ["2603", "2609", "2615", "1605", "2330", ...] 
        (請直接輸出純字串陣列，包含所有想到的股票代號)
    `;

    // Use 'layer2_mapping' config (Default: Qwen Turbo/Max for reasoning)
    const l2Response = await callAI('layer2_mapping', l2Prompt);
    const rawStockCodes = JSON.parse(extractJson(l2Response.text || "[]"));
    console.log(`[Layer 2] Mapped ${rawStockCodes.length} raw candidates.`);


    // ------------------------------------------------------------------
    // Layer 2.5: The Tech Filter (Code)
    // Goal: Filter out low volume or weak trend stocks
    // ------------------------------------------------------------------
    console.log("[Automation] Layer 2.5: Tech Filter (Cleaning Data)...");

    // This function checks Volume > 1000 and Price > MA20
    const robustStocks = await filterCandidates(rawStockCodes);
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

    const l3Prompt = `
        你是一位風格激進、追求「短線爆發力」的避險基金經理人。
        請使用「繁體中文」回答。

        【市場概況】：${newsSummary}
        
        【目前持倉 (Current Portfolio)】：
        (請檢視 TA_ACTION，若為 SELL 必須賣出)
        ${JSON.stringify(portfolioWithTA.map(p => ({
      code: p.code,
      name: p.name,
      entryPrice: p.entryPrice,
      ROI: p.roi ? p.roi.toFixed(1) + '%' : '0%',
      TA_ACTION: p.ta.action,
      TA_REASON: p.ta.technicalReason
    })))}

        【強勢候選名單 (Candidates)】：
        (這些股票已通過程式篩選：成交量>1000張 且 股價站上月線)
        ${JSON.stringify(robustStocks)}

        【決策任務】：
        1. **賣出決策**：
           - 嚴格執行目前持倉的 TA_ACTION (SELL)。
           - 若基本面題材消失，也可賣出。
        2. **買入決策**：
           - 從「強勢候選名單」中挑選與「今日題材」共振最強的股票。
           - 若候選名單為空，或無好標的，可空手。
        3. **總持股限制**：最多 5 檔。

        【輸出格式】(JSON Array of Final Portfolio):
        [
           { "code": "2330", "name": "台積電", "entryPrice": 500, "reason": "【續抱】...", "industry": "半導體", "status": "HOLD" },
           { "code": "2603", "name": "長榮", "entryPrice": 0, "reason": "【新納入】紅海危機受惠，且量價齊揚...", "industry": "航運", "status": "BUY" }
        ]
    `;

    // Use 'layer3_decision' config (Default: Gemini 1.5 Pro)
    const l3Response = await callAI('layer3_decision', l3Prompt);
    const newPortfolioRaw = JSON.parse(extractJson(l3Response.text || "[]"));


    // ------------------------------------------------------------------
    // Finalization: Price Check & Save
    // ------------------------------------------------------------------
    console.log("[Automation] Finalizing Report...");

    // Helper to fetch prices including candidates (for UI display)
    // Candidates in UI now comes from 'robustStocks' (Layer 2.5 winners)
    // Let's attach names to robustStocks if possible? 
    // Since robustStocks items (from filterCandidates) might not have Names yet (filterCandidates didn't return names).
    // We can fetch names from final portfolio or just leave as code for now.
    // Ideally we want names. 'yahoo-finance' historical doesn't give name. 
    // We can use 'quote' in filterCandidates or just live with codes in the "Candidates" section of the report.
    // Or we can try to guess names from Layer 2 (AI output raw codes).
    // Let's just store Code/Price/Note in candidates.

    // Get real-time prices for Finalists to calculate ROI correctly
    const finalCodes = newPortfolioRaw.map(i => i.code);
    const candidateCodes = robustStocks.map(i => i.code);
    const allCodes = [...new Set([...finalCodes, ...candidateCodes])];

    const priceMap = new Map();
    await Promise.all(allCodes.map(async (code) => {
      const p = await getStockPrice(code);
      if (p > 0) priceMap.set(String(code), p);
    }));

    // 1. Process Finalists
    const finalists = newPortfolioRaw.map(item => {
      const code = String(item.code).trim();
      const currentPrice = priceMap.get(code) || item.currentPrice || 0;

      let entryPrice = parseFloat(item.entryPrice) || 0;
      let entryDate = item.entryDate || getTodayString();
      const isNew = !currentPortfolio.find(p => String(p.code).trim() === code);

      if (isNew || !entryPrice) {
        entryPrice = currentPrice;
        entryDate = getTodayString();
      }

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
    const candidates = robustStocks.map(s => ({
      code: s.code,
      name: "", // UI can display Code if Name missing
      price: priceMap.get(s.code) || s.price,
      reason: s.tech_note,
      industry: "System Filtered"
    }));

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

    // Send Email
    console.log("[Automation] Sending Email...");
    let subscriberEmails = [];
    try {
      subscriberEmails = db.prepare('SELECT email FROM subscribers').all().map(r => r.email);
    } catch (e) { }

    const reportData = { date: today, newsSummary, finalists, sold: soldStocks };
    await sendDailyReportEmail(reportData, subscriberEmails);

    return { success: true, id: info.lastInsertRowid };

  } catch (error) {
    console.error("[Automation] Job Failed:", error);
    return { success: false, error: error.message };
  }
};

// CRON Trigger Route
app.post('/api/cron/trigger', async (req, res) => {
  // Check secret if needed (Simple protection)
  // const auth = req.headers['authorization'];
  // if (auth !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });

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
