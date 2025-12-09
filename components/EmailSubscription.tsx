import React, { useState, useEffect } from 'react';
import { getSubscribers, addSubscriber, deleteSubscriber } from '../services/apiService';
import { Subscriber } from '../types';

const EmailSubscription: React.FC = () => {
    const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
    const [newEmail, setNewEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const fetchList = async () => {
        const list = await getSubscribers();
        setSubscribers(list);
    };

    useEffect(() => {
        fetchList();
    }, []);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEmail) return;
        setLoading(true);
        setError('');
        try {
            await addSubscriber(newEmail);
            setNewEmail('');
            fetchList();
        } catch (err: any) {
            setError(err.message || '新增失敗');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('確定要移除此 Email 嗎?')) return;
        try {
            await deleteSubscriber(id);
            fetchList();
        } catch (e) { alert('移除失敗'); }
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Email 訂閱管理
            </h3>

            <p className="text-sm text-slate-500 mb-4">
                新增 Email 至下方列表，每日分析完成後將自動發送報告至這些信箱。
            </p>

            {/* Add Form */}
            <form onSubmit={handleAdd} className="flex gap-2 mb-6">
                <input
                    type="email"
                    placeholder="輸入 Email..."
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    required
                />
                <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
                >
                    {loading ? '新增中...' : '新增'}
                </button>
            </form>

            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

            {/* List */}
            <div className="space-y-2">
                {subscribers.length === 0 ? (
                    <p className="text-center text-slate-400 py-4 text-sm">目前無訂閱者</p>
                ) : (
                    subscribers.map(sub => (
                        <div key={sub.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg group">
                            <span className="text-slate-700">{sub.email}</span>
                            <button
                                onClick={() => handleDelete(sub.id)}
                                className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors"
                                title="移除"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default EmailSubscription;
