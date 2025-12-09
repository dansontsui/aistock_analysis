
import { DailyReport, PortfolioItem, StockCandidate, WebSource, Subscriber } from "../types";

// 定義可能的 API 端點列表
// 1. '/api/reports' -> 用於生產環境 (Cloud Run) 或當前後端在同一 Port 時
// 2. 'http://localhost:8080/api/reports' -> 用於本機開發，當前端在 5173 但後端在 8080 時
const BASE_URLS = [
  '',  // 相對路徑
  'http://localhost:8080' // 本機備援
];

// 輔助函式：具備自動重試不同網域的 fetch
async function fetchWithFailover(endpoint: string, options?: RequestInit): Promise<Response> {
  let lastError;

  for (const base of BASE_URLS) {
    try {
      // 確保路徑格式正確 (避免 //api)
      const cleanBase = base.replace(/\/+$/, '');
      const url = `${cleanBase}${endpoint}`;

      console.log(`Trying to connect to: ${url}`);
      const response = await fetch(url, options);

      if (response.ok) {
        return response; // 成功連線，直接回傳
      }

      // 如果 404，可能是路徑不對，繼續試下一個
      // 如果 500，可能是伺服器錯誤，但至少連上了，也算成功的一種回應（交給呼叫端處理）
      if (response.status !== 404) {
        return response;
      }

    } catch (e) {
      console.log(`Connection to ${base} failed, trying next...`);
      lastError = e;
    }
  }

  throw new Error(`連線失敗 (All attempts failed). Last error: ${lastError?.message || 'Unknown'}`);
}

export const saveDailyReport = async (report: Omit<DailyReport, 'id'>): Promise<string | null> => {
  try {
    const response = await fetchWithFailover('/api/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(report),
    });

    if (!response.ok) throw new Error('Network response was not ok');

    const data = await response.json();
    console.log("Report saved with ID:", data.id);
    return data.id;
  } catch (error) {
    console.warn("Warning: Could not save report to API. Ensure server.js is running.");
    // 回傳 null 但不拋出錯誤，讓 UI 顯示暫存結果
    return null;
  }
};

export const getDailyReports = async (): Promise<DailyReport[]> => {
  try {
    const response = await fetchWithFailover('/api/reports');
    if (!response.ok) {
      console.warn("API unavailable, returning empty history list");
      return [];
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.warn("Error fetching reports:", error);
    return [];
  }
};

export const updateReportPrices = async (reportId: string, updatedFinalists: PortfolioItem[]) => {
  try {
    const response = await fetchWithFailover(`/api/reports/${reportId}/prices`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ finalists: updatedFinalists }),
    });

    if (!response.ok) throw new Error('Update failed');
    console.log("Prices updated successfully");
  } catch (error) {
    console.error("Error updating prices:", error);
  }
};



// Note: This replaces the client-side Gemini service
export const generateCandidates = async (): Promise<{ newsSummary: string; candidates: StockCandidate[]; sources: WebSource[] }> => {
  const response = await fetchWithFailover('/api/analyze/candidates', {
    method: 'POST',
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "生成候選名單失敗 (API)");
  }
  return response.json();
};

export const selectFinalists = async (candidates: StockCandidate[], newsSummary: string): Promise<PortfolioItem[]> => {
  const response = await fetchWithFailover('/api/analyze/finalists', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ candidates, newsSummary })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "篩選精選股失敗 (API)");
  }
  const data = await response.json();
  // Compatible with both old (array) and new ({ finalists, sold }) API response
  if (data.finalists && Array.isArray(data.finalists)) {
    return data.finalists;
  }
  return Array.isArray(data) ? data : [];
};

export const updateStockPricesAPI = async (stocks: any[]): Promise<any[]> => {
  const response = await fetchWithFailover('/api/analyze/prices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stocks })
  });
  if (!response.ok) throw new Error("更新股價失敗");
  return response.json();
};

// --- SUBSCRIBER API FUNC ---

export const getSubscribers = async (): Promise<Subscriber[]> => {
  try {
    const response = await fetchWithFailover('/api/subscribers');
    if (!response.ok) return [];
    return response.json();
  } catch (e) { return []; }
};

export const addSubscriber = async (email: string) => {
  const response = await fetchWithFailover('/api/subscribers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "新增失敗");
  }
  return response.json();
};

export const deleteSubscriber = async (id: number) => {
  await fetchWithFailover(`/api/subscribers/${id}`, { method: 'DELETE' });
};

// Update Entry Price
export const updateEntryPriceAPI = async (reportId: string, code: string, price: number) => {
  return fetchWithFailover(`/api/reports/${reportId}/entry-price`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, price })
  });
};
