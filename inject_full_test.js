
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'finance.db');

const db = new Database(dbPath);

const today = new Date().toISOString().split('T')[0];
// Mock entry date: 20 days ago
const entryDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

const mockData = {
    // 1. Candidates (今日觀察名單)
    candidates: [
        { code: "2330", name: "台積電", price: 1030, reason: "AI 需求強勁，站上千元大關", theme: "半導體" },
        { code: "2317", name: "鴻海", price: 210, reason: "GB200 出貨順利", theme: "AI伺服器" },
        { code: "2382", name: "廣達", price: 290, reason: "雲端業務成長", theme: "AI伺服器" }
    ],

    // 2. Finalists (目前持倉 / 追蹤股)
    finalists: [
        {
            code: "2454",
            name: "聯發科",
            entryPrice: 1300,
            currentPrice: 1350,
            entryDate: entryDate,
            roi: 3.85,
            status: "HOLD",
            reason: "天璣 9400 發表在即，法人看好",
            industry: "IC設計"
        },
        {
            code: "3035",
            name: "智原",
            entryPrice: 380,
            currentPrice: 360,
            entryDate: entryDate,
            roi: -5.26,
            status: "HOLD",
            reason: "IP 權利金穩定，技術面震盪整理",
            industry: "IP矽智財"
        },
        {
            code: "2603",
            name: "長榮",
            entryPrice: 180,
            currentPrice: 200,
            entryDate: entryDate,
            roi: 11.11,
            status: "NEW",
            reason: "紅海危機未解，運價高檔震盪",
            industry: "航運"
        }
    ],

    // 3. Sold (已剔除)
    sold: [
        { code: "3008", name: "大立光", entryPrice: 2500, exitPrice: 2400, currentPrice: 2350, entryDate: entryDate, soldDate: today, roi: -4.00, reason: "[測試] 鏡頭跌價", industry: "光學" },
        { code: "2303", name: "聯電", entryPrice: 50, exitPrice: 48, currentPrice: 48.5, entryDate: entryDate, soldDate: today, roi: -4.00, reason: "[測試] 成熟製程降價", industry: "晶圓代工" },
        { code: "2609", name: "陽明", entryPrice: 60, exitPrice: 55, currentPrice: 54, entryDate: entryDate, soldDate: today, roi: -8.33, reason: "[測試] 運價修正", industry: "航運" }
    ],

    sources: []
};

try {
    const stmt = db.prepare('INSERT INTO daily_reports (date, timestamp, newsSummary, data) VALUES (?, ?, ?, ?)');
    const info = stmt.run(today, Date.now(), "這是一份「完整版」的測試報告，包含持有、觀察與賣出，供您確認所有功能。", JSON.stringify(mockData));
    console.log(`Successfully injected FULL test report with ID: ${info.lastInsertRowid}`);
    console.log("Please refresh your browser web page to see the result.");
} catch (e) {
    console.error("Failed to inject data:", e);
}
