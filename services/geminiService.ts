
import { GoogleGenAI } from "@google/genai";
import { StockCandidate, PortfolioItem, WebSource } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Helper to get today's date string for prompts
const getTodayString = () => new Date().toISOString().split('T')[0];

// Helper to reliably extract JSON from markdown or conversational text
const extractJson = (text: string): string => {
  if (!text) return "";

  // 1. Remove markdown code blocks (```json ... ```)
  let clean = text.replace(/```json\s*/g, "").replace(/```\s*$/g, "").replace(/```/g, "").trim();

  // 2. Determine if the content is likely an Array or an Object
  const firstSquare = clean.indexOf('[');
  const firstCurly = clean.indexOf('{');

  let startIndex = -1;
  let endIndex = -1;

  // Case A: Array appears first, or only array exists
  if (firstSquare !== -1 && (firstCurly === -1 || firstSquare < firstCurly)) {
    startIndex = firstSquare;
    endIndex = clean.lastIndexOf(']');
  }
  // Case B: Object appears first, or only object exists
  else if (firstCurly !== -1) {
    startIndex = firstCurly;
    endIndex = clean.lastIndexOf('}');
  }

  // 3. Extract the substring if valid indices found
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return clean.substring(startIndex, endIndex + 1);
  }

  // Fallback: return cleaned text and hope for the best
  return clean;
};

/**
 * Step 1: Analyze news and generate 10 candidates
 */
export const generateCandidates = async (): Promise<{ newsSummary: string; candidates: StockCandidate[]; sources: WebSource[] }> => {
  const model = "gemini-2.5-pro";

  const prompt = `
    你是一位台灣股市的專業分析師。請使用「繁體中文」回答。
    
    任務 1：搜尋今日 (${getTodayString()}) 最重要的國內外財經新聞，特別是影響台股的重大事件。
    任務 2：根據新聞，找出看好的產業板塊或題材。
    任務 3：選出 10 檔最可能受惠的台灣股票 (上市或上櫃)。
    
    要求：
    - 股票代碼必須是正確的台股代號 (例如 2330)。
    - 請透過搜尋找出目前的預估價格。
    - 每檔股票請提供簡短的推薦理由。
    - 所有內容必須是繁體中文。
    
    輸出格式：僅限 JSON。JSON 必須嚴格遵守以下結構：
    {
      "newsSummary": "一段關於今日市場新聞的簡明摘要...",
      "candidates": [
        {
          "code": "股票代號",
          "name": "股票名稱",
          "price": 100.0,
          "reason": "推薦理由",
          "industry": "產業類別"
        }
      ]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "{}";
    const jsonString = extractJson(text);
    const data = JSON.parse(jsonString);

    // Extract grounding sources
    const sources: WebSource[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web) {
          sources.push({ title: chunk.web.title, uri: chunk.web.uri });
        }
      });
    }

    return {
      newsSummary: data.newsSummary || "無法取得新聞摘要。",
      candidates: data.candidates || [],
      sources
    };
  } catch (error) {
    console.error("Error generating candidates:", error);
    throw new Error("生成候選名單失敗。無法解析 AI 回應。");
  }
};

/**
 * Step 2: Filter 10 candidates down to 3 finalists
 */
export const selectFinalists = async (candidates: StockCandidate[], newsSummary: string): Promise<PortfolioItem[]> => {
  const model = "gemini-2.5-flash";

  const candidatesJson = JSON.stringify(candidates);

  const prompt = `
    你是一位風格穩健但善於把握機會的投資組合經理。請使用「繁體中文」回答。
    
    背景資訊：
    今日新聞摘要：${newsSummary}
    
    候選名單 (10 檔)：
    ${candidatesJson}
    
    任務：
    分析上述 10 檔候選股。對其基本面或近期動能進行深入檢查。
    選出前 3 名「風險回報比」最佳的股票，適合短中線持有。
    
    輸出格式：僅限 JSON。JSON 必須嚴格遵守以下結構 (請注意是陣列 Array)：
    [
      {
        "code": "股票代號",
        "name": "股票名稱",
        "entryPrice": 100.0,
        "reason": "詳細的獲選理由，解釋為何這檔股票勝出",
        "industry": "產業類別"
      }
    ]
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "[]";
    const jsonString = extractJson(text);
    const finalists = JSON.parse(jsonString);

    if (!Array.isArray(finalists)) {
      console.error("AI output is not an array:", finalists);
      throw new Error("AI output is not an array");
    }

    // Map to PortfolioItem structure
    return finalists.map((item: any) => ({
      ...item,
      entryDate: getTodayString(),
      currentPrice: item.entryPrice || 0, // Initial state
      roi: 0
    }));

  } catch (error) {
    console.error("Error selecting finalists:", error);
    throw new Error("篩選精選股失敗。無法解析 AI 回應。");
  }
};

/**
 * Update prices for a list of stocks using Search
 */
export const updateStockPrices = async (stocks: PortfolioItem[]): Promise<PortfolioItem[]> => {
  if (stocks.length === 0) return [];

  const stockList = stocks.map(s => `${s.name} (${s.code})`).join(", ");
  const prompt = `
    找出以下台灣股票的「即時股價」(Current real-time stock price)：${stockList}。
    
    請回傳一個 JSON 物件，key 是股票代號，value 是目前的數字價格。
    範例：{ "prices": [{ "code": "2330", "price": 500 }] }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "{}";
    const jsonString = extractJson(text);
    const data = JSON.parse(jsonString);
    const priceMap = new Map<string, number>();

    if (data.prices && Array.isArray(data.prices)) {
      data.prices.forEach((p: any) => priceMap.set(p.code, p.price));
    }

    return stocks.map(stock => {
      const currentPrice = priceMap.get(stock.code) || stock.currentPrice;
      const roi = ((currentPrice - stock.entryPrice) / stock.entryPrice) * 100;
      return {
        ...stock,
        currentPrice,
        roi
      };
    });

  } catch (error) {
    console.error("Error updating prices:", error);
    return stocks; // Return original if update fails
  }
};
