/**
 * OHLCV + optional fields for indices (close, high, low, change; open/volume optional).
 */
export interface IndexOHLCV {
  symbol: string;
  name?: string;
  open?: number | null;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
  change?: number | null;
  changePercent?: number | null;
}

/**
 * OHLCV for stocks (volume typically present).
 */
export interface StockOHLCV {
  symbol: string;
  name?: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close: number;
  volume?: number | null;
  change?: number | null;
  changePercent?: number | null;
}
