
// E2E Test Script for Taiwan Stock AI Analyst
// Usage: node tests/e2e_test.js
// Expects server to be running on localhost:8080 or 8081

const BASE_URL = 'http://localhost:8080'; // Default, will try to detect or fail over

async function runTest() {
    console.log("🚀 Starting E2E System Test...");

    // 0. Health Check
    try {
        const res = await fetch(`${BASE_URL}/`);
        if (!res.ok) throw new Error(`Server Check Failed: ${res.status}`);
        console.log("✅ Server is online.");
    } catch (e) {
        console.error("❌ Server is offline or unreachable. Please start 'npm run server'.");
        process.exit(1);
    }

    // 1. Clear History (Reset State)
    console.log("\nStep 1: Clearing Database...");
    try {
        const res = await fetch(`${BASE_URL}/api/admin/clear-history`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'abcd1234' })
        });
        const data = await res.json();
        if (data.success) console.log("✅ Database cleared.");
        else throw new Error(data.error);
    } catch (e) { console.error(`❌ Clear DB Failed: ${e.message}`); }

    // 2. Generate Candidates (Layer 1 & 2)
    console.log("\nStep 2: Generating Candidates (This triggers AI, wait ~60s)...");
    let generatedCandidates = [];
    try {
        const res = await fetch(`${BASE_URL}/api/analyze/candidates`, { method: 'POST' });
        const text = await res.text();
        try {
            const data = JSON.parse(text);
            if (data.success && Array.isArray(data.candidates)) {
                console.log(`✅ Candidates Generated: ${data.candidates.length} stocks found.`);
                generatedCandidates = data.candidates;
            } else {
                throw new Error(`Invalid response format: ${JSON.stringify(data).substring(0, 200)}...`);
            }
        } catch (e) {
            throw new Error(`JSON Parse Error: ${e.message}\nRaw Response: ${text.substring(0, 500)}`);
        }
    } catch (e) {
        console.error(`❌ Candidate Generation Failed: ${e.message}`);
    }

    // 3. Finalize Portfolio (Layer 3)
    console.log("\nStep 3: Finalizing Portfolio (Firewall Check)...");
    let selectedFinalists = [];
    try {
        const res = await fetch(`${BASE_URL}/api/analyze/finalists`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candidates: generatedCandidates })
        });
        const text = await res.text();
        try {
            const data = JSON.parse(text);
            if (data.finalists && Array.isArray(data.finalists)) {
                console.log(`✅ Portfolio Finalized: ${data.finalists.length} stocks selected.`);
                selectedFinalists = data.finalists;
                data.finalists.forEach(s => console.log(`   - ${s.name} (${s.code}): RSI=${s.ta?.rsi?.toFixed(1) || 'N/A'}`));
            } else {
                throw new Error(`Invalid response format: ${JSON.stringify(data).substring(0, 200)}...`);
            }
        } catch (e) {
            throw new Error(`JSON Parse Error: ${e.message}\nRaw Response: ${text.substring(0, 500)}`);
        }
    } catch (e) { console.error(`❌ Portfolio Finalization Failed: ${e.message}`); }

    // 4. Save Report
    console.log("\nStep 4: Saving Daily Report...");
    let reportId = null;
    try {
        const saveRes = await fetch(`${BASE_URL}/api/reports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: new Date().toISOString().split('T')[0],
                timestamp: Date.now(),
                newsSummary: "E2E Test Summary",
                candidates: [], // Simplify
                finalists: selectedFinalists,
                sources: []
            })
        });
        const saveData = await saveRes.json();
        if (saveData.success) {
            reportId = saveData.id;
            console.log(`✅ Report Saved. ID: ${reportId}`);
        } else throw new Error("Save failed");

    } catch (e) { console.error(`❌ Save Report Failed: ${e.message}`); }

    // 5. Update Prices
    if (reportId) {
        console.log(`\nStep 5: Updating Prices for Report ${reportId}...`);
        try {
            const res = await fetch(`${BASE_URL}/api/reports/${reportId}/prices`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ finalists: [] }) // Backend re-fetches anyway
            });
            const data = await res.json();
            if (data.success) {
                console.log("✅ Prices Updated.");
                // Verify content
                const updatedPortfolio = data.finalists;
                updatedPortfolio.forEach(s => {
                    console.log(`   - ${s.name}: Price=${s.price}, Cur=${s.currentPrice}, ROI=${s.roi.toFixed(2)}%, Reason includes Tech? ${s.reason.includes('[最新技術]')}`);
                });
            } else throw new Error(data.error);
        } catch (e) { console.error(`❌ Update Price Failed: ${e.message}`); }
    }

    // 6. Test Cron Trigger (Auto Analysis + Email)
    console.log("\nStep 6: Testing Cron Trigger (Auto Analysis & Email)...");
    try {
        // Note: This endpoint is GET
        const res = await fetch(`${BASE_URL}/api/cron/trigger`);
        const data = await res.json();
        if (res.ok && (data.reportId || data.message)) {
            console.log(`✅ Cron Triggered Successfully. Report ID: ${data.reportId || 'N/A'}`);
            console.log("   (Check server logs to verify Email Sending status)");
        } else {
            throw new Error(data.error || "Unknown error");
        }
    } catch (e) {
        console.error(`❌ Cron Trigger Failed: ${e.message}`);
    }

    console.log("\n🎉 Test Complete.");
}

runTest();
