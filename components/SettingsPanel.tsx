import React, { useEffect, useState } from 'react';
import { getSettings, saveSetting, SystemConfig } from '../services/settingsService';

const AVAILABLE_PROVIDERS = ['gemini', 'qwen'];

const PROVIDER_MODELS: Record<string, string[]> = {
    gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-flash'],
    qwen: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long']
};

const DEFAULT_STEPS = [
    { key: 'layer1_news', label: 'Layer 1: News Hunter (全球情報搜查)' },
    { key: 'layer2_mapping', label: 'Layer 2: Industry Mapper (產業映射與聯想)' },
    { key: 'layer3_decision', label: 'Layer 3: Portfolio Manager (最終決策與選股)' }
];

// --- Default Prompts (Variables: {{TODAY}}, {{THEMES}}, {{NEWS_SUMMARY}}, {{CURRENT_PORTFOLIO}}, {{CANDIDATES}}) ---
const DEFAULT_PROMPTS: Record<string, string> = {
    layer1_news: `你是一位負責監控全球金融市場的「首席情報官」。請使用「繁體中文」回答。
任務：廣泛搜尋今日 ({{TODAY}}) 的「全球」與「台灣」財經新聞，找出市場的「資金流向」與「熱門題材」。

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
}`,

    layer2_mapping: `你是一位熟知「台灣產業供應鏈」的資深研究員。

今日市場熱門題材：
{{THEMES}}

任務：針對每個題材關鍵字，列出對應的「台灣概念股」。
1. 直接聯想：如「運價漲」-> 貨櫃三雄。
2. 二階聯想：如「銅價漲」-> 電線電纜/PCB。
3. 數量：每個題材至少列出 3-5 檔相關個股。

輸出格式 (JSON Object Array):
[
  { "code": "2330", "name": "台積電", "theme": "AI" },
  { "code": "2603", "name": "長榮", "theme": "航運" }
]
(請務必包含 code 與 name，name 請用繁體中文)`,

    layer3_decision: `你是一位風格激進、追求「短線爆發力」的避險基金經理人。
請使用「繁體中文」回答。

【市場概況】：
{{NEWS_SUMMARY}}

【目前持倉 (Locked Holdings)】：
(這些股票技術面尚可，**必須保留**，不可賣出)
{{CURRENT_PORTFOLIO}}

【今日觀察名單 (Candidates)】：
(請從中挑選最強勢的股票填補剩餘空位。**特別注意 tech_note 欄位中的 RSI 數值**)
**選股標準：優先選擇 RSI > 55 的強勢動能股。避免 RSI < 45 的弱勢股。**
{{CANDIDATES}}

【決策任務】：
1. **核心原則**：你目前已持有部分股票 (Locked)。請檢視剩餘空位。
2. 從「觀察名單」中挑選最佳標的填滿空位。
3. 若「觀察名單」都不好，可以空手 (不必硬湊 5 檔)。
4. **禁止賣出「目前持倉」的股票**。

【輸出格式】(JSON Array of Final Portfolio):
[
   { "code": "2330", "name": "台積電", "entryPrice": 500, "reason": "【續抱】...", "industry": "半導體", "status": "HOLD" },
   { "code": "2603", "name": "長榮", "entryPrice": 0, "reason": "【新納入】...", "industry": "航運", "status": "BUY" }
]`
};

const SettingsPanel: React.FC = () => {
    const [configs, setConfigs] = useState<SystemConfig[]>([]);
    const [loading, setLoading] = useState(false);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [showDefaultPrompt, setShowDefaultPrompt] = useState(false);

    // Form State
    const [formData, setFormData] = useState<SystemConfig | null>(null);

    const fetchConfigs = async () => {
        try {
            const data = await getSettings();
            setConfigs(data);
        } catch (e) {
            console.error(e);
            alert('無法載入設定');
        }
    };

    useEffect(() => {
        fetchConfigs();
    }, []);

    const handleEdit = (stepKey: string) => {
        const existing = configs.find(c => c.step_key === stepKey);
        const defaultConfig: SystemConfig = {
            step_key: stepKey,
            provider: 'gemini',
            model_name: 'gemini-2.5-flash',
            temperature: 0.7,
            prompt_template: ''
        };
        setFormData(existing || defaultConfig);
        setEditingKey(stepKey);
        setShowDefaultPrompt(false);
    };

    const handleSave = async () => {
        if (!formData) return;
        setLoading(true);
        try {
            await saveSetting(formData);
            await fetchConfigs();
            setEditingKey(null);
            alert('設定已儲存！');
        } catch (e) {
            alert('儲存失敗');
        } finally {
            setLoading(false);
        }
    };

    const getConfigDisplay = (stepKey: string) => {
        return configs.find(c => c.step_key === stepKey);
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mt-8">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                ⚙️ AI 模型與系統設定 (System Settings)
            </h2>

            <div className="space-y-6">
                {DEFAULT_STEPS.map((step) => {
                    const config = getConfigDisplay(step.key);
                    const isEditing = editingKey === step.key;

                    if (isEditing && formData) {
                        return (
                            <div key={step.key} className="bg-slate-50 p-4 rounded-xl border border-blue-500 animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-slate-700">{step.label}</h3>
                                    <button onClick={() => setEditingKey(null)} className="text-slate-400 hover:text-slate-600">
                                        ✕
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Provider (模型來源)</label>
                                        <select
                                            value={formData.provider}
                                            onChange={e => setFormData({ ...formData, provider: e.target.value as any, model_name: PROVIDER_MODELS[e.target.value as any]?.[0] || '' })}
                                            className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                        >
                                            {AVAILABLE_PROVIDERS.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Model Name (模型名稱)</label>
                                        <select
                                            value={PROVIDER_MODELS[formData.provider]?.includes(formData.model_name) ? formData.model_name : 'custom'}
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (val !== 'custom') {
                                                    setFormData({ ...formData, model_name: val });
                                                } else {
                                                    // Keep 'custom' as a placeholder state or handle logic to show input
                                                    // Ideally we switch to custom input mode, but simpler here is just setting a flag or empty
                                                    setFormData({ ...formData, model_name: 'custom' });
                                                }
                                            }}
                                            className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                        >
                                            {PROVIDER_MODELS[formData.provider]?.map(model => (
                                                <option key={model} value={model}>{model}</option>
                                            ))}
                                            <option value="custom">自訂 (Custom)...</option>
                                        </select>

                                        {/* Allow custom input if 'custom' is selected OR if the current value is not in the list (legacy/custom) */}
                                        {(!PROVIDER_MODELS[formData.provider]?.includes(formData.model_name)) && (
                                            <input
                                                type="text"
                                                value={formData.model_name === 'custom' ? '' : formData.model_name}
                                                onChange={e => setFormData({ ...formData, model_name: e.target.value })}
                                                className="w-full mt-2 p-2 border border-slate-300 rounded-lg text-sm bg-yellow-50"
                                                placeholder="輸入自訂模型名稱..."
                                                autoFocus={formData.model_name === 'custom'}
                                            />
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Temperature (創意度 0-1)</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            max="1"
                                            value={formData.temperature}
                                            onChange={e => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                                            className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-xs font-bold text-slate-500">
                                            Prompt Template (提示詞模板)
                                        </label>
                                        {DEFAULT_PROMPTS[step.key] && (
                                            <button
                                                onClick={() => setShowDefaultPrompt(!showDefaultPrompt)}
                                                className="text-xs text-blue-600 hover:text-blue-800 underline"
                                            >
                                                {showDefaultPrompt ? '隱藏系統預設 Prompt' : '查看系統預設 Prompt'}
                                            </button>
                                        )}
                                    </div>
                                    {/* Variable Hints */}
                                    <div className="mb-2 text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-200">
                                        <span className="font-bold">可用變數：</span>
                                        {step.key === 'layer1_news' && <code className="bg-white border px-1 rounded mx-1">{`{{TODAY}}`}</code>}
                                        {step.key === 'layer2_mapping' && <code className="bg-white border px-1 rounded mx-1">{`{{THEMES}}`}</code>}
                                        {step.key === 'layer3_decision' && (
                                            <>
                                                <code className="bg-white border px-1 rounded mx-1">{`{{NEWS_SUMMARY}}`}</code>
                                                <code className="bg-white border px-1 rounded mx-1">{`{{CURRENT_PORTFOLIO}}`}</code>
                                                <code className="bg-white border px-1 rounded mx-1">{`{{CANDIDATES}}`}</code>
                                            </>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <textarea
                                            value={formData.prompt_template || ''}
                                            onChange={e => setFormData({ ...formData, prompt_template: e.target.value })}
                                            className="w-full h-48 p-3 border border-slate-300 rounded-lg text-sm font-mono text-slate-600 leading-relaxed"
                                            placeholder="在此輸入自定義 Prompt (若留空，系統將使用預設邏輯)..."
                                        />
                                        {showDefaultPrompt && DEFAULT_PROMPTS[step.key] && (
                                            <div className="h-48 p-3 bg-slate-100 border border-slate-200 rounded-lg overflow-y-auto">
                                                <div className="text-xs font-bold text-slate-400 mb-2 sticky top-0 bg-slate-100 pb-2 border-b">系統預設參考 (Read Only):</div>
                                                <pre className="text-xs text-slate-500 font-mono whitespace-pre-wrap">
                                                    {DEFAULT_PROMPTS[step.key]}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2">
                                    <button
                                        onClick={() => setEditingKey(null)}
                                        className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm"
                                    >
                                        取消
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={loading}
                                        className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-bold shadow-sm"
                                    >
                                        {loading ? '儲存中...' : '確認儲存'}
                                    </button>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div key={step.key} className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div>
                                <h3 className="font-bold text-slate-700 text-sm mb-1">{step.label}</h3>
                                <div className="flex items-center gap-3 text-xs text-slate-500">
                                    <span className={`px-2 py-0.5 rounded text-white font-bold ${config?.provider === 'qwen' ? 'bg-purple-500' : 'bg-green-500'}`}>
                                        {config?.provider.toUpperCase() || 'DEFAULT'}
                                    </span>
                                    <span className="font-mono bg-slate-200 px-2 py-0.5 rounded text-slate-700">
                                        {config?.model_name || 'System Default'}
                                    </span>
                                    <span>Temp: {config?.temperature ?? 0.7}</span>
                                </div>
                            </div>
                            <button
                                onClick={() => handleEdit(step.key)}
                                className="px-3 py-1.5 text-blue-600 hover:bg-blue-50 font-bold rounded-lg text-sm transition-colors border border-blue-200"
                            >
                                編輯設定
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default SettingsPanel;
