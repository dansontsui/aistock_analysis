
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'finance.db');

const db = new Database(dbPath);

console.log("Connecting to database...");

// 1. Get the latest report
const row = db.prepare('SELECT id, data FROM daily_reports ORDER BY timestamp DESC LIMIT 1').get();

if (!row) {
    console.error("No reports found!");
    process.exit(1);
}

console.log(`Found latest report ID: ${row.id}`);
const data = JSON.parse(row.data);

// 2. Define Fake Sold Items (Real Codes for Price Checking)
const fakeSold = [
    {
        code: "2330", name: "台積電",
        entryPrice: 1010, exitPrice: 1000, currentPrice: 1000,
        entryDate: "2024-11-01", soldDate: new Date().toISOString().split('T')[0],
        roi: -0.99, reason: "[測試] 跌破千元關卡", industry: "半導體"
    },
    {
        code: "2454", name: "聯發科",
        entryPrice: 1350, exitPrice: 1300, currentPrice: 1300,
        entryDate: "2024-10-15", soldDate: new Date().toISOString().split('T')[0],
        roi: -3.70, reason: "[測試] 手機需求疲軟", industry: "IC設計"
    },
    {
        code: "3231", name: "緯創",
        entryPrice: 120, exitPrice: 115, currentPrice: 115,
        entryDate: "2024-11-20", soldDate: new Date().toISOString().split('T')[0],
        roi: -4.17, reason: "[測試] 外資調節", industry: "電腦週邊"
    },
    {
        code: "3035", name: "智原",
        entryPrice: 280, exitPrice: 260, currentPrice: 260,
        entryDate: "2024-10-01", soldDate: new Date().toISOString().split('T')[0],
        roi: -7.14, reason: "[測試] 營收不如預期", industry: "IP"
    },
    {
        code: "2609", name: "陽明",
        entryPrice: 70, exitPrice: 65, currentPrice: 65,
        entryDate: "2024-11-10", soldDate: new Date().toISOString().split('T')[0],
        roi: -7.14, reason: "[測試] 運價修正", industry: "航運"
    }
];

// 3. Merge or Overwrite sold list
data.sold = fakeSold;

// 4. Save back to DB
db.prepare('UPDATE daily_reports SET data = ? WHERE id = ?').run(JSON.stringify(data), row.id);

console.log("Successfully injected 5 fake sold items into the latest report.");
console.log("Please refresh your browser.");
