
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'finance.db');

const db = new Database(dbPath);

const today = new Date().toISOString().split('T')[0];
// Mock entry date: 10 days ago
const entryDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

const mockData = {
    candidates: [],
    finalists: [], // Empty current portfolio
    sold: [
        { code: "2330", name: "台積電", entryPrice: 580, exitPrice: 570, currentPrice: 570, entryDate: entryDate, soldDate: today, roi: -1.72, reason: "[測試] 跌破月線", industry: "半導體" },
        { code: "2454", name: "聯發科", entryPrice: 950, exitPrice: 920, currentPrice: 920, entryDate: entryDate, soldDate: today, roi: -3.15, reason: "[測試] 外資賣超", industry: "IC設計" },
        { code: "2317", name: "鴻海", entryPrice: 105, exitPrice: 100, currentPrice: 100, entryDate: entryDate, soldDate: today, roi: -4.76, reason: "[測試] 營收衰退", industry: "電子代工" },
        { code: "2603", name: "長榮", entryPrice: 150, exitPrice: 140, currentPrice: 140, entryDate: entryDate, soldDate: today, roi: -6.66, reason: "[測試] 運價下跌", industry: "航運" },
        { code: "2609", name: "陽明", entryPrice: 50, exitPrice: 45, currentPrice: 45, entryDate: entryDate, soldDate: today, roi: -10.00, reason: "[測試] 停損賣出", industry: "航運" },
        { code: "2615", name: "萬海", entryPrice: 55, exitPrice: 48, currentPrice: 48, entryDate: entryDate, soldDate: today, roi: -12.72, reason: "[測試] 破底翻失敗", industry: "航運" },
        { code: "2382", name: "廣達", entryPrice: 220, exitPrice: 200, currentPrice: 200, entryDate: entryDate, soldDate: today, roi: -9.09, reason: "[測試] AI 降溫", industry: "電腦週邊" },
        { code: "3231", name: "緯創", entryPrice: 110, exitPrice: 100, currentPrice: 100, entryDate: entryDate, soldDate: today, roi: -9.09, reason: "[測試] 籌碼鬆動", industry: "電腦週邊" },
        { code: "2376", name: "技嘉", entryPrice: 280, exitPrice: 260, currentPrice: 260, entryDate: entryDate, soldDate: today, roi: -7.14, reason: "[測試] 顯卡需求降", industry: "板卡" },
        { code: "2383", name: "台光電", entryPrice: 400, exitPrice: 380, currentPrice: 380, entryDate: entryDate, soldDate: today, roi: -5.00, reason: "[測試] 銅箔基板", industry: "PCB" },
        { code: "3037", name: "欣興", entryPrice: 170, exitPrice: 160, currentPrice: 160, entryDate: entryDate, soldDate: today, roi: -5.88, reason: "[測試] ABF 供過於求", industry: "PCB" },
        { code: "3035", name: "智原", entryPrice: 350, exitPrice: 330, currentPrice: 330, entryDate: entryDate, soldDate: today, roi: -5.71, reason: "[測試] 製程延遲", industry: "IP" },
        { code: "3008", name: "大立光", entryPrice: 2500, exitPrice: 2400, currentPrice: 2400, entryDate: entryDate, soldDate: today, roi: -4.00, reason: "[測試] 鏡頭跌價", industry: "光學" },
        { code: "2308", name: "台達電", entryPrice: 300, exitPrice: 290, currentPrice: 290, entryDate: entryDate, soldDate: today, roi: -3.33, reason: "[測試] 充電樁趨緩", industry: "電源" },
        { code: "2303", name: "聯電", entryPrice: 50, exitPrice: 48, currentPrice: 48, entryDate: entryDate, soldDate: today, roi: -4.00, reason: "[測試] 成熟製程降價", industry: "晶圓代工" }
    ],
    sources: []
};

try {
    const stmt = db.prepare('INSERT INTO daily_reports (date, timestamp, newsSummary, data) VALUES (?, ?, ?, ?)');
    const info = stmt.run(today, Date.now(), "這是一份測試報告，用來驗證「賣出股票」與「持股天數」的顯示是否正確。", JSON.stringify(mockData));
    console.log(`Successfully injected test report with ID: ${info.lastInsertRowid}`);
    console.log("Please refresh your browser web page to see the result.");
} catch (e) {
    console.error("Failed to inject data:", e);
}
