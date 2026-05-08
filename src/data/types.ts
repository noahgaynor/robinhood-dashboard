// Core data model — matches §4 of the spec

export type TransCode =
  | 'BUY' | 'SELL'
  | 'DIV' | 'DIVTAX' | 'DRIP'
  | 'INT' | 'ACH' | 'WIRE'
  | 'SPLIT' | 'MERGER' | 'SPINOFF'
  | 'FEE' | 'JNL' | 'SLIP'
  | 'OTHER';

export interface Transaction {
  id: string;
  activityDate: Date;
  settleDate: Date | null;
  symbol: string | null;
  description: string;
  code: TransCode;
  quantity: number;   // signed: + shares in, - shares out
  price: number;      // per-share price; 0 for cash events
  amount: number;     // signed cash impact
}

export interface Lot {
  acquiredAt: Date;
  shares: number;
  costPerShare: number;
}

export interface Position {
  symbol: string;
  shares: number;
  avgCost: number;
  costBasis: number;
  marketPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  pctOfPortfolio: number;
  sector?: string;
  industry?: string;
  lots: Lot[];
  isDelisted?: boolean;
  lastKnownPrice?: number;
}

export interface ClosedTrade {
  symbol: string;
  openedAt: Date;
  closedAt: Date;
  shares: number;
  costBasis: number;
  proceeds: number;
  realizedPnl: number;
  realizedPnlPct: number;
  holdDays: number;
  term: 'short' | 'long';
}

export interface PortfolioSnapshot {
  asOf: Date;
  positions: Position[];
  closedTrades: ClosedTrade[];
  cash: number;
  totalValue: number;
  totalCostBasis: number;
  totalDeposits: number;
  totalWithdrawals: number;
  netInvested: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  dividendsReceived: number;
  interestReceived: number;
  firstActivityDate: Date | null;
  warningSymbols: string[];  // symbols with MERGER/SPINOFF events
}

export interface QuoteData {
  symbol: string;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  fetchedAt: number;
  sector?: string;
  industry?: string;
}

export interface BenchmarkData {
  dates: string[];      // YYYY-MM-DD
  spy: number[];
  qqq: number[];
  fetchedAt: number;
}

export interface ParseResult {
  transactions: Transaction[];
  skipped: Array<{ row: number; reason: string; raw: string }>;
  symbols: string[];
  firstDate: Date | null;
  lastDate: Date | null;
}
