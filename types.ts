export interface Stock {
  code: string;
  name: string;
  price: number;
  reason: string;
  industry?: string;
  dailyChange?: number; // percentage
}

export interface StockCandidate extends Stock {
  score?: number;
}

export interface PortfolioItem extends Stock {
  entryPrice: number;
  entryDate: string;
  currentPrice: number;
  roi: number;
}

export interface WebSource {
  title: string;
  uri: string;
}
// ... existing types
export interface Subscriber {
  id: number;
  email: string;
  created_at: string;
}

export interface DailyReport {
  id?: string; // Firebase ID
  date: string;
  newsSummary: string;
  candidates: StockCandidate[];
  finalists: PortfolioItem[];
  sources?: WebSource[];
  timestamp: number;
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  ANALYZING_NEWS = 'ANALYZING_NEWS',
  PICKING_CANDIDATES = 'PICKING_CANDIDATES',
  FILTERING_FINALISTS = 'FILTERING_FINALISTS',
  SAVING = 'SAVING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}