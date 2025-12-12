
import Database from 'better-sqlite3';

const db = new Database('finance.db');

const row = db.prepare('SELECT id, data FROM daily_reports ORDER BY timestamp DESC LIMIT 1').get();

if (row) {
    const data = JSON.parse(row.data);
    const finalists = data.finalists || [];
    console.log(`Report ID: ${row.id}`);
    console.log(`Finalists Count: ${finalists.length}`);
    finalists.forEach((f, i) => {
        console.log(`${i + 1}. ${f.code} ${f.name} (${f.status})`);
    });
} else {
    console.log("No reports found.");
}
