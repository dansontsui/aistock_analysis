
import Database from 'better-sqlite3';

const db = new Database('finance.db');

const row = db.prepare('SELECT id, data FROM daily_reports WHERE id = 86').get();

if (row) {
    const data = JSON.parse(row.data);
    if (data.finalists && data.finalists.length > 5) {
        console.log(`Fixing report ${row.id}: shrinking finalists from ${data.finalists.length} to 5.`);
        // Keep top 5
        data.finalists = data.finalists.slice(0, 5);
        db.prepare('UPDATE daily_reports SET data = ? WHERE id = ?').run(JSON.stringify(data), row.id);
        console.log("Fixed.");
    } else {
        console.log("Report seems fine (<= 5).");
    }
}
