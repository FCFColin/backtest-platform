/**
 * @file 标的代码输入组件
 * @description 带自动补全的标的代码输入框，支持本地常用标的及远程搜索建议
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { ALL_TICKER_PRESETS } from '@/utils/tickerPresets';

interface TickerSuggestion {
  ticker: string;
  name: string;
  market: string;
}

/** 标的代码输入框 Props */
interface TickerInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** 本地静态常用标的列表，用于即时补全（无需网络请求） */
const POPULAR_TICKERS: TickerSuggestion[] = [
  // 美股 ETF
  { ticker: 'SPY', name: 'S&P 500 ETF', market: '美股' },
  { ticker: 'VTI', name: 'Vanguard Total Stock Market ETF', market: '美股' },
  { ticker: 'VOO', name: 'Vanguard S&P 500 ETF', market: '美股' },
  { ticker: 'QQQ', name: 'Invesco QQQ Trust', market: '美股' },
  { ticker: 'BND', name: 'Vanguard Total Bond Market ETF', market: '美股' },
  { ticker: 'AGG', name: 'iShares Core US Aggregate Bond', market: '美股' },
  { ticker: 'IWM', name: 'iShares Russell 2000 ETF', market: '美股' },
  { ticker: 'EFA', name: 'iShares MSCI EAFE ETF', market: '美股' },
  { ticker: 'EEM', name: 'iShares MSCI Emerging Markets ETF', market: '美股' },
  { ticker: 'GLD', name: 'SPDR Gold Shares', market: '美股' },
  { ticker: 'TLT', name: 'iShares 20+ Year Treasury Bond', market: '美股' },
  { ticker: 'VTV', name: 'Vanguard Value ETF', market: '美股' },
  { ticker: 'VUG', name: 'Vanguard Growth ETF', market: '美股' },
  { ticker: 'SCHD', name: 'Schwab US Dividend Equity ETF', market: '美股' },
  { ticker: 'DIA', name: 'SPDR Dow Jones Industrial Average', market: '美股' },
  { ticker: 'IWB', name: 'iShares Russell 1000 ETF', market: '美股' },
  { ticker: 'IJH', name: 'iShares Core S&P Mid-Cap ETF', market: '美股' },
  { ticker: 'IJR', name: 'iShares Core S&P Small-Cap ETF', market: '美股' },
  { ticker: 'VXUS', name: 'Vanguard Total International Stock', market: '美股' },
  { ticker: 'BNDX', name: 'Vanguard Total International Bond', market: '美股' },
  { ticker: 'TIP', name: 'iShares TIPS Bond ETF', market: '美股' },
  { ticker: 'HYG', name: 'iShares iBoxx $ High Yield Corporate', market: '美股' },
  { ticker: 'LQD', name: 'iShares iBoxx $ Investment Grade Corporate', market: '美股' },
  { ticker: 'MUB', name: 'iShares National Muni Bond ETF', market: '美股' },
  { ticker: 'VNQ', name: 'Vanguard Real Estate ETF', market: '美股' },
  { ticker: 'XLF', name: 'Financial Select Sector SPDR', market: '美股' },
  { ticker: 'XLK', name: 'Technology Select Sector SPDR', market: '美股' },
  { ticker: 'XLV', name: 'Health Care Select Sector SPDR', market: '美股' },
  { ticker: 'XLE', name: 'Energy Select Sector SPDR', market: '美股' },
  { ticker: 'XLY', name: 'Consumer Discretionary Select SPDR', market: '美股' },
  { ticker: 'XLP', name: 'Consumer Staples Select SPDR', market: '美股' },
  { ticker: 'XLI', name: 'Industrial Select Sector SPDR', market: '美股' },
  { ticker: 'XLU', name: 'Utilities Select Sector SPDR', market: '美股' },
  { ticker: 'XLB', name: 'Materials Select Sector SPDR', market: '美股' },
  { ticker: 'XLC', name: 'Communication Services Select SPDR', market: '美股' },
  { ticker: 'VGT', name: 'Vanguard Information Technology ETF', market: '美股' },
  { ticker: 'VHT', name: 'Vanguard Health Care ETF', market: '美股' },
  { ticker: 'VFH', name: 'Vanguard Financials ETF', market: '美股' },
  { ticker: 'VDE', name: 'Vanguard Energy ETF', market: '美股' },
  { ticker: 'VIS', name: 'Vanguard Industrials ETF', market: '美股' },
  { ticker: 'VCR', name: 'Vanguard Consumer Discretionary ETF', market: '美股' },
  { ticker: 'VDC', name: 'Vanguard Consumer Staples ETF', market: '美股' },
  { ticker: 'VAW', name: 'Vanguard Materials ETF', market: '美股' },
  { ticker: 'VPU', name: 'Vanguard Utilities ETF', market: '美股' },
  { ticker: 'VOX', name: 'Vanguard Communication Services ETF', market: '美股' },
  { ticker: 'VNQI', name: 'Vanguard Global ex-US Real Estate', market: '美股' },
  // 美股个股
  { ticker: 'AAPL', name: 'Apple Inc.', market: '美股' },
  { ticker: 'MSFT', name: 'Microsoft Corporation', market: '美股' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.', market: '美股' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', market: '美股' },
  { ticker: 'NVDA', name: 'NVIDIA Corporation', market: '美股' },
  { ticker: 'META', name: 'Meta Platforms Inc.', market: '美股' },
  { ticker: 'TSLA', name: 'Tesla Inc.', market: '美股' },
  { ticker: 'BRK-B', name: 'Berkshire Hathaway Inc.', market: '美股' },
  { ticker: 'JPM', name: 'JPMorgan Chase & Co.', market: '美股' },
  { ticker: 'V', name: 'Visa Inc.', market: '美股' },
  { ticker: 'JNJ', name: 'Johnson & Johnson', market: '美股' },
  { ticker: 'WMT', name: 'Walmart Inc.', market: '美股' },
  { ticker: 'PG', name: 'Procter & Gamble Co.', market: '美股' },
  { ticker: 'MA', name: 'Mastercard Inc.', market: '美股' },
  { ticker: 'HD', name: 'The Home Depot Inc.', market: '美股' },
  { ticker: 'UNH', name: 'UnitedHealth Group', market: '美股' },
  { ticker: 'DIS', name: 'The Walt Disney Company', market: '美股' },
  { ticker: 'NFLX', name: 'Netflix Inc.', market: '美股' },
  { ticker: 'AMD', name: 'Advanced Micro Devices', market: '美股' },
  { ticker: 'INTC', name: 'Intel Corporation', market: '美股' },
  { ticker: 'CRM', name: 'Salesforce Inc.', market: '美股' },
  { ticker: 'ORCL', name: 'Oracle Corporation', market: '美股' },
  { ticker: 'CSCO', name: 'Cisco Systems Inc.', market: '美股' },
  { ticker: 'ADBE', name: 'Adobe Inc.', market: '美股' },
  { ticker: 'PYPL', name: 'PayPal Holdings Inc.', market: '美股' },
  { ticker: 'KO', name: 'Coca-Cola Company', market: '美股' },
  { ticker: 'PEP', name: 'PepsiCo Inc.', market: '美股' },
  { ticker: 'NKE', name: 'Nike Inc.', market: '美股' },
  { ticker: 'MCD', name: "McDonald's Corporation", market: '美股' },
  { ticker: 'SBUX', name: 'Starbucks Corporation', market: '美股' },
  // A股
  { ticker: '000001.SZ', name: '平安银行', market: 'A股' },
  { ticker: '000002.SZ', name: '万科A', market: 'A股' },
  { ticker: '000858.SZ', name: '五粮液', market: 'A股' },
  { ticker: '600000.SH', name: '浦发银行', market: 'A股' },
  { ticker: '600519.SH', name: '贵州茅台', market: 'A股' },
  { ticker: '601318.SH', name: '中国平安', market: 'A股' },
  { ticker: '600036.SH', name: '招商银行', market: 'A股' },
  { ticker: '000333.SZ', name: '美的集团', market: 'A股' },
  { ticker: '600276.SH', name: '恒瑞医药', market: 'A股' },
  { ticker: '601012.SH', name: '隆基绿能', market: 'A股' },
  { ticker: '510300.SH', name: '沪深300ETF', market: 'A股' },
  { ticker: '510050.SH', name: '上证50ETF', market: 'A股' },
  { ticker: '159915.SZ', name: '创业板ETF', market: 'A股' },
];

/** 预设 Ticker（SIM 系列 + 常用 ETF）映射为建议项 */
const PRESET_SUGGESTIONS: TickerSuggestion[] = ALL_TICKER_PRESETS.map((p) => ({
  ticker: p.ticker,
  name: p.name,
  market: p.category,
}));

/** 合并后的本地建议池：预设优先，再补充 POPULAR_TICKERS 中未重复的标的 */
const LOCAL_SUGGESTIONS: TickerSuggestion[] = [
  ...PRESET_SUGGESTIONS,
  ...POPULAR_TICKERS.filter(
    (pt) => !ALL_TICKER_PRESETS.some((pp) => pp.ticker === pt.ticker)
  ),
];

export default function TickerInput({ value, onChange, placeholder }: TickerInputProps) {
  const [focused, setFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<TickerSuggestion[]>([]);
  const [fetchingRemote, setFetchingRemote] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // 过滤本地建议
  const filterLocal = useCallback((query: string): TickerSuggestion[] => {
    if (!query || query.length < 1) return [];
    const q = query.toUpperCase();
    return LOCAL_SUGGESTIONS.filter(
      (t) =>
        t.ticker.toUpperCase().includes(q) ||
        t.name.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 8);
  }, []);

  // 更新建议列表
  const updateSuggestions = useCallback((query: string) => {
    const local = filterLocal(query);
    setSuggestions(local);
    setSelectedIndex(-1);

    // 如果本地没结果且输入>=2字符，尝试远程搜索
    if (local.length === 0 && query.length >= 2) {
      setFetchingRemote(true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/backtest/search?query=${encodeURIComponent(query)}&limit=8`);
          if (res.ok) {
            const json = await res.json();
            const data = json.data ?? json;
            if (Array.isArray(data) && data.length > 0) {
              setSuggestions(data);
              setSelectedIndex(-1);
            }
          }
        } catch {
          // 远程搜索失败，静默忽略
        } finally {
          setFetchingRemote(false);
        }
      }, 300);
    } else {
      setFetchingRemote(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
  }, [filterLocal]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 清理 debounce
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    updateSuggestions(val);
  };

  const handleSelect = (suggestion: TickerSuggestion) => {
    onChange(suggestion.ticker);
    setSuggestions([]);
    setSelectedIndex(-1);
    setFocused(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setSuggestions([]);
      setSelectedIndex(-1);
    }
  };

  const showDropdown = focused && suggestions.length > 0;

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={() => {
          setFocused(true);
          if (value) updateSuggestions(value);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || '输入代码'}
        className="ticker-input"
        autoComplete="off"
        spellCheck={false}
      />
      {showDropdown && (
        <div className="ticker-dropdown">
          {suggestions.map((s, i) => (
            <div
              key={s.ticker}
              className={`ticker-dropdown-item ${i === selectedIndex ? 'selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(s);
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="ticker-dropdown-code">{s.ticker}</span>
              <span className="ticker-dropdown-name">{s.name}</span>
              <span className="ticker-dropdown-market">{s.market}</span>
            </div>
          ))}
          {fetchingRemote && (
            <div className="ticker-dropdown-item ticker-dropdown-loading">
              搜索中...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
