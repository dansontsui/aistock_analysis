import React from 'react';
import { Stock, PortfolioItem } from '../types';

interface StockCardProps {
  stock: Stock | PortfolioItem;
  type: 'candidate' | 'finalist';
  onUpdatePrice?: (code: string, newPrice: number) => void;
}

const StockCard: React.FC<StockCardProps> = ({ stock, type, onUpdatePrice }) => {
  const isFinalist = type === 'finalist';
  // Ensure we have a PortfolioItem shape when finalist
  const item = stock as PortfolioItem;

  // Safe accessors to avoid undefined crashes
  const entryPrice = item?.entryPrice ?? 0;
  // Use currentPrice if available, otherwise fall back to stock.price
  const currentPrice = item?.currentPrice ?? stock?.price ?? 0;
  const roi = item?.roi ?? 0;
  const reason = stock?.reason ?? '';
  const industry = stock?.industry ?? '';
  const code = stock?.code ?? '';
  const name = stock?.name ?? '';

  // Color for ROI
  const getRoiColor = (roiVal: number) => {
    if (roiVal > 0) return 'text-red-500'; // Taiwan Red is up
    if (roiVal < 0) return 'text-green-500'; // Taiwan Green is down
    return 'text-gray-500';
  };

  // State for Editing
  const [isEditing, setIsEditing] = React.useState(false);
  const [editPrice, setEditPrice] = React.useState('');

  const handleStartEdit = () => {
    setEditPrice(String(entryPrice));
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const val = parseFloat(editPrice);
    if (!isNaN(val) && onUpdatePrice) {
      onUpdatePrice(code, val);
    }
    setIsEditing(false);
  };

  return (
    <div className={`p-4 rounded-xl border transition-all duration-200 ${isFinalist
      ? 'bg-white border-blue-200 shadow-md hover:shadow-lg'
      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
      }`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-slate-200 text-slate-700 mb-1">
            {code}
          </span>
          <h3 className="font-bold text-lg text-slate-800">{name}</h3>
          {industry && <p className="text-xs text-slate-500">{industry}</p>}
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-500">現價</div>
          <div className="font-mono font-medium">
            {currentPrice}
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-600 mb-3 whitespace-pre-line leading-relaxed">
        {reason}
      </p>

      {isFinalist && (
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-slate-400 text-xs flex items-center gap-1">
              進場價
              {onUpdatePrice && !isEditing && (
                <button onClick={handleStartEdit} className="text-slate-400 hover:text-indigo-600" title="修改進場價">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
              )}
            </span>

            {isEditing ? (
              <div className="flex items-center gap-1 mt-1">
                <input
                  type="number"
                  value={editPrice}
                  onChange={e => setEditPrice(e.target.value)}
                  className="w-20 px-1 py-0.5 text-sm border rounded"
                />
                <button onClick={handleSaveEdit} className="text-green-600 hover:bg-green-100 rounded p-0.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </button>
                <button onClick={() => setIsEditing(false)} className="text-red-500 hover:bg-red-100 rounded p-0.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <button onClick={() => setIsEditing(false)} className="text-red-500 hover:bg-red-100 rounded p-0.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <div className="flex flex-col">
                <div className="font-mono">{entryPrice}</div>
                {isFinalist && item.entryDate && (
                  <span className="text-[10px] text-slate-400 mt-0.5">
                    {(() => {
                      const start = new Date(item.entryDate);
                      const end = new Date(); // Active stock -> held until now
                      const diff = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                      return `持股 ${diff} 天`;
                    })()}
                  </span>
                )}
              </div>
            )}

          </div>
          <div className="text-right">
            <span className="text-slate-400 text-xs">報酬率</span>
            <div className={`font-mono font-bold ${getRoiColor(roi)}`}>
              {roi > 0 ? '+' : ''}{roi.toFixed(2)}%
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockCard;