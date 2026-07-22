/**
 * @file 标的代码输入组件
 * @description 带自动补全的标的代码输入框，支持本地常用标的及远程搜索建议
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { LOCAL_SUGGESTIONS, type TickerSuggestion } from './tickerInputConstants.js';

/** 标的代码输入框 Props */
interface TickerInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

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
