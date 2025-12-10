const API_URL = import.meta.env.VITE_API_URL || '';

export interface SystemConfig {
    step_key: string;
    provider: 'gemini' | 'qwen';
    model_name: string;
    temperature: number;
    prompt_template?: string; // Optional custom prompt
    updated_at?: string;
}

export const getSettings = async (): Promise<SystemConfig[]> => {
    const res = await fetch(`${API_URL}/api/settings`);
    if (!res.ok) throw new Error("Failed to fetch settings");
    return res.json();
};

export const saveSetting = async (config: SystemConfig): Promise<void> => {
    const res = await fetch(`${API_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error("Failed to save setting");
};
