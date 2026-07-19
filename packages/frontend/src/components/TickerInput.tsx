/**
 * @file 标的代码输入组件
 * @description 带自动补全的标的代码输入框，支持本地常用标的及远程搜索建议
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
  { ticker: 'SPY', name: 'S&P 500 ETF', market: 'components.tickerInput.markets.us' },
  {
    ticker: 'VTI',
    name: 'Vanguard Total Stock Market ETF',
    market: 'components.tickerInput.markets.us',
  },
  { ticker: 'VOO', name: 'Vanguard S&P 500 ETF', market: 'components.tickerInput.markets.us' },
  { ticker: 'QQQ', name: 'Invesco QQQ Trust', market: 'components.tickerInput.markets.us' },
  {
    ticker: 'BND',
    name: 'Vanguard Total Bond Market ETF',
    market: 'components.tickerInput.markets.us',
  },
  {
    ticker: 'AGG',
    name: 'iShares Core US Aggregate Bond',
    market: 'components.tickerInput.markets.us',
  },
  { ticker: 'IWM', name: 'iShares Russell 2000 ETF', market: 'components.tickerInput.markets.us' },
  { ticker: 'EFA', name: 'iShares MSCI EAFE ETF', market: 'components.tickerInput.markets.us' },
  {
    ticker: 'EEM',
    name: 'iShares MSCI Emerging Markets ETF',
    market: 'components.tickerInput.markets.us',
  },
  { ticker: 'GLD', name: 'SPDR Gold Shares', market: 'components.tickerInput.markets.us' },
  {
    ticker: 'TLT',
    name: 'iShares 20+ Year Treasury Bond',
    market: 'components.tickerInput.markets.us',
  },
  { ticker: 'VTV', name: 'Vanguard Value ETF', market: 'components.tickerInput.markets.us' },
  { ticker: 'VUG', name: 'Vanguard Growth ETF', market: 'components.tickerInput.markets.us' },
  {
    ticker: 'SCHD',
    name: 'Schwab US Dividend Equity ETF',
    market: 'components.tickerInput.markets.us',
  },
  {
    ticker: 'DIA',
    name: 'SPDR Dow Jones Industrial Average',
    market: 'components.tickerInput.markets.us',
  },
  { ticker: 'IWB', name: 'iShares Russell 1000 ETF', market: 'components.tickerInput.markets.us' },
  {
    ticker: 'IJH',
    name: 'iShares Core S&P Mid-Cap ETF',
    market: 'components.tickerInput.markets.us',
  },
  {
    ticker: 'IJR',
    name: 'iShares Core S&P Small-Cap ETF',
    market: 'components.tickerInput.markets.us',
  },
  {
    ticker: 'VXUS',
    name: 'Vanguard Total International Stock',
    market: 'components.tickerInput.markets.us',
  },
  {
    ticker: 'BNDX',
    name: 'Vanguard Total International Bond',
    market: 'components.tickerInput.markets.us',
  },
  { ticker: 'TIP', name: 'iShares TIPS Bond ETF', market: 'components.tickerInput.markets.us' },
  {
    ticker: 'HYG',
    name: 'iShares iBoxx $ High Yield Corporate',
    market: 'components.tickerInput.markets.us',
  },
  {
    ticker: 'LQD',
    name: 'iShares iBoxx $ Investment Grade Corporate',
    market: 'components.tickerInput.markets.us',
  },
  {
    ticker: 'MUB',
    name: 'iShares National Muni Bond ETF',
    market: 'components.tickerInput.markets.us',
  },
  { ticker: 'VNQ', name: 'Vanguard Real Estate ETF', market: 'components.tickerInput.markets.us' },
  {
    ticker: 'XLF',
    name: 'Financial Select Sector SPDR',
    market: 'components.tickerInput.markets.us',
  },
  {
    ticker: 'XLK',
    name: 'Technology Select Sector SPDR',
    market: 'components.tickerInput.markets.us',
  },
  {
    ticker: 'XLV',
    name: 'Health Care Select Sector SPDR',
    market: 'components.tickerInput.markets.us',
  },
  { ticker: 'XLE', name: 'Energy Select Sector SPDR', market: 'components.tickerInput.markets.us' },
  {
    ticker: 'XLY',
    name: 'Consumer Discretionary Select SPDR',
    market: 'components.tickerInput.markets.us',
  },
  {
    ticker: 'XLP',
    name: 'Consumer Staples Select SPDR',
    market: 'components.tickerInput.markets.us',
  },
  {
    ticker: 'XLI',
    name: 'Industrial Select Sector SPDR',
    market: 'components.tickerInput.markets.us',
  },
  {
    ticker: 'XLU',
    name: 'Utilities Select Sector SPDR',
    market: 'components.tickerInput.markets.us',
  },
  {
    ticker: 'XLB',
    name: 'Materials Select Sector SPDR',
    market: 'components.tickerInput.markets.us',
  },
  {
    ticker: 'XLC',
    name: 'Communication Services Select SPDR',
    market: 'components.tickerInput.markets.us',
  },
  {
    ticker: 'VGT',
    name: 'Vanguard Information Technology ETF',
    market: 'components.tickerInput.markets.us',
  },
  { ticker: 'VHT', name: 'Vanguard Health Care ETF', market: 'components.tickerInput.markets.us' },
  { ticker: 'VFH', name: 'Vanguard Financials ETF', market: 'components.tickerInput.markets.us' },
  { ticker: 'VDE', name: 'Vanguard Energy ETF', market: 'components.tickerInput.markets.us' },
  { ticker: 'VIS', name: 'Vanguard Industrials ETF', market: 'components.tickerInput.markets.us' },
  {
    ticker: 'VCR',
    name: 'Vanguard Consumer Discretionary ETF',
    market: 'components.tickerInput.markets.us',
  },
  {
    ticker: 'VDC',
    name: 'Vanguard Consumer Staples ETF',
    market: 'components.tickerInput.markets.us',
  },
  { ticker: 'VAW', name: 'Vanguard Materials ETF', market: 'components.tickerInput.markets.us' },
  { ticker: 'VPU', name: 'Vanguard Utilities ETF', market: 'components.tickerInput.markets.us' },
  {
    ticker: 'VOX',
    name: 'Vanguard Communication Services ETF',
    market: 'components.tickerInput.markets.us',
  },
  {
    ticker: 'VNQI',
    name: 'Vanguard Global ex-US Real Estate',
    market: 'components.tickerInput.markets.us',
  },
  // 美股个股
  { ticker: 'AAPL', name: 'Apple Inc.', market: 'components.tickerInput.markets.us' },
  { ticker: 'MSFT', name: 'Microsoft Corporation', market: 'components.tickerInput.markets.us' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.', market: 'components.tickerInput.markets.us' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', market: 'components.tickerInput.markets.us' },
  { ticker: 'NVDA', name: 'NVIDIA Corporation', market: 'components.tickerInput.markets.us' },
  { ticker: 'META', name: 'Meta Platforms Inc.', market: 'components.tickerInput.markets.us' },
  { ticker: 'TSLA', name: 'Tesla Inc.', market: 'components.tickerInput.markets.us' },
  { ticker: 'BRK-B', name: 'Berkshire Hathaway Inc.', market: 'components.tickerInput.markets.us' },
  { ticker: 'JPM', name: 'JPMorgan Chase & Co.', market: 'components.tickerInput.markets.us' },
  { ticker: 'V', name: 'Visa Inc.', market: 'components.tickerInput.markets.us' },
  { ticker: 'JNJ', name: 'Johnson & Johnson', market: 'components.tickerInput.markets.us' },
  { ticker: 'WMT', name: 'Walmart Inc.', market: 'components.tickerInput.markets.us' },
  { ticker: 'PG', name: 'Procter & Gamble Co.', market: 'components.tickerInput.markets.us' },
  { ticker: 'MA', name: 'Mastercard Inc.', market: 'components.tickerInput.markets.us' },
  { ticker: 'HD', name: 'The Home Depot Inc.', market: 'components.tickerInput.markets.us' },
  { ticker: 'UNH', name: 'UnitedHealth Group', market: 'components.tickerInput.markets.us' },
  { ticker: 'DIS', name: 'The Walt Disney Company', market: 'components.tickerInput.markets.us' },
  { ticker: 'NFLX', name: 'Netflix Inc.', market: 'components.tickerInput.markets.us' },
  { ticker: 'AMD', name: 'Advanced Micro Devices', market: 'components.tickerInput.markets.us' },
  { ticker: 'INTC', name: 'Intel Corporation', market: 'components.tickerInput.markets.us' },
  { ticker: 'CRM', name: 'Salesforce Inc.', market: 'components.tickerInput.markets.us' },
  { ticker: 'ORCL', name: 'Oracle Corporation', market: 'components.tickerInput.markets.us' },
  { ticker: 'CSCO', name: 'Cisco Systems Inc.', market: 'components.tickerInput.markets.us' },
  { ticker: 'ADBE', name: 'Adobe Inc.', market: 'components.tickerInput.markets.us' },
  { ticker: 'PYPL', name: 'PayPal Holdings Inc.', market: 'components.tickerInput.markets.us' },
  { ticker: 'KO', name: 'Coca-Cola Company', market: 'components.tickerInput.markets.us' },
  { ticker: 'PEP', name: 'PepsiCo Inc.', market: 'components.tickerInput.markets.us' },
  { ticker: 'NKE', name: 'Nike Inc.', market: 'components.tickerInput.markets.us' },
  { ticker: 'MCD', name: "McDonald's Corporation", market: 'components.tickerInput.markets.us' },
  { ticker: 'SBUX', name: 'Starbucks Corporation', market: 'components.tickerInput.markets.us' },
  // A股
  {
    ticker: '000001.SZ',
    name: 'components.tickerInput.stocks.pinganBank',
    market: 'components.tickerInput.markets.cn',
  },
  {
    ticker: '000002.SZ',
    name: 'components.tickerInput.stocks.vankeA',
    market: 'components.tickerInput.markets.cn',
  },
  {
    ticker: '000858.SZ',
    name: 'components.tickerInput.stocks.wuliangye',
    market: 'components.tickerInput.markets.cn',
  },
  {
    ticker: '600000.SH',
    name: 'components.tickerInput.stocks.spdb',
    market: 'components.tickerInput.markets.cn',
  },
  {
    ticker: '600519.SH',
    name: 'components.tickerInput.stocks.moutai',
    market: 'components.tickerInput.markets.cn',
  },
  {
    ticker: '601318.SH',
    name: 'components.tickerInput.stocks.pinganInsurance',
    market: 'components.tickerInput.markets.cn',
  },
  {
    ticker: '600036.SH',
    name: 'components.tickerInput.stocks.cmb',
    market: 'components.tickerInput.markets.cn',
  },
  {
    ticker: '000333.SZ',
    name: 'components.tickerInput.stocks.midea',
    market: 'components.tickerInput.markets.cn',
  },
  {
    ticker: '600276.SH',
    name: 'components.tickerInput.stocks.hengrui',
    market: 'components.tickerInput.markets.cn',
  },
  {
    ticker: '601012.SH',
    name: 'components.tickerInput.stocks.longi',
    market: 'components.tickerInput.markets.cn',
  },
  {
    ticker: '510300.SH',
    name: 'components.tickerInput.stocks.csi300Etf',
    market: 'components.tickerInput.markets.cn',
  },
  {
    ticker: '510050.SH',
    name: 'components.tickerInput.stocks.sse50Etf',
    market: 'components.tickerInput.markets.cn',
  },
  {
    ticker: '159915.SZ',
    name: 'components.tickerInput.stocks.chinextEtf',
    market: 'components.tickerInput.markets.cn',
  },
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
  ...POPULAR_TICKERS.filter((pt) => !ALL_TICKER_PRESETS.some((pp) => pp.ticker === pt.ticker)),
];

/** 若 name 以 components. 开头则视为 i18n key 翻译，否则原样返回 */
function resolveDisplayName(name: string, t: (key: string) => string): string {
  return name.startsWith('components.') ? t(name) : name;
}

/** 下拉建议列表 */
function TickerDropdown({
  suggestions,
  selectedIndex,
  fetchingRemote,
  onSelect,
  onHover,
}: {
  suggestions: TickerSuggestion[];
  selectedIndex: number;
  fetchingRemote: boolean;
  onSelect: (s: TickerSuggestion) => void;
  onHover: (idx: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="ticker-dropdown">
      {suggestions.map((s, i) => (
        <div
          key={s.ticker}
          className={`ticker-dropdown-item ${i === selectedIndex ? 'selected' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(s);
          }}
          onMouseEnter={() => onHover(i)}
        >
          <span className="ticker-dropdown-code">{s.ticker}</span>
          <span className="ticker-dropdown-name">{resolveDisplayName(s.name, t)}</span>
          <span className="ticker-dropdown-market">{resolveDisplayName(s.market, t)}</span>
        </div>
      ))}
      {fetchingRemote && (
        <div className="ticker-dropdown-item ticker-dropdown-loading">
          {t('components.tickerInput.searching')}
        </div>
      )}
    </div>
  );
}

/** Ticker 搜索逻辑 Hook */
function useTickerSearch() {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<TickerSuggestion[]>([]);
  const [fetchingRemote, setFetchingRemote] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const filterLocal = useCallback(
    (query: string): TickerSuggestion[] => {
      if (!query || query.length < 1) return [];
      const q = query.toUpperCase();
      return LOCAL_SUGGESTIONS.filter(
        (item) =>
          item.ticker.toUpperCase().includes(q) ||
          resolveDisplayName(item.name, t).toLowerCase().includes(query.toLowerCase()),
      ).slice(0, 8);
    },
    [t],
  );

  const updateSuggestions = useCallback(
    (query: string) => {
      const local = filterLocal(query);
      setSuggestions(local);
      setSelectedIndex(-1);
      if (local.length === 0 && query.length >= 2) {
        setFetchingRemote(true);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
          try {
            const res = await fetch(
              `/api/backtest/search?query=${encodeURIComponent(query)}&limit=8`,
            );
            if (res.ok) {
              const json = await res.json();
              const data = json.data ?? json;
              if (Array.isArray(data) && data.length > 0) {
                setSuggestions(data);
                setSelectedIndex(-1);
              }
            }
          } catch {
            /* 远程搜索失败，静默忽略 */
          } finally {
            setFetchingRemote(false);
          }
        }, 300);
      } else {
        setFetchingRemote(false);
        if (debounceRef.current) clearTimeout(debounceRef.current);
      }
    },
    [filterLocal],
  );

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  return {
    suggestions,
    fetchingRemote,
    selectedIndex,
    setSelectedIndex,
    setSuggestions,
    updateSuggestions,
  };
}

export default function TickerInput({ value, onChange, placeholder }: TickerInputProps) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    suggestions,
    fetchingRemote,
    selectedIndex,
    setSelectedIndex,
    setSuggestions,
    updateSuggestions,
  } = useTickerSearch();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setFocused(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      setSelectedIndex((p) => Math.min(p + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((p) => Math.max(p - 1, 0));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setSuggestions([]);
      setSelectedIndex(-1);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          updateSuggestions(e.target.value);
        }}
        onFocus={() => {
          setFocused(true);
          if (value) updateSuggestions(value);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || t('components.tickerInput.placeholder')}
        className="ticker-input"
        autoComplete="off"
        spellCheck={false}
      />
      {focused && suggestions.length > 0 && (
        <TickerDropdown
          suggestions={suggestions}
          selectedIndex={selectedIndex}
          fetchingRemote={fetchingRemote}
          onSelect={handleSelect}
          onHover={setSelectedIndex}
        />
      )}
    </div>
  );
}
