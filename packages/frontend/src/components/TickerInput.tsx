import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/utils/apiClient';
import { LOCAL_SUGGESTIONS, type TickerSuggestion } from './tickerInputConstants.js';
interface TickerInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}
function resolveDisplayName(name: string, t: (key: string) => string): string {
  return name.startsWith('components.') ? t(name) : name;
}
function TickerDropdown({ suggestions, selectedIndex, fetchingRemote, onSelect, onHover }: { suggestions: TickerSuggestion[]; selectedIndex: number; fetchingRemote: boolean; onSelect: (s: TickerSuggestion) => void; onHover: (idx: number) => void }) {
  const { t } = useTranslation();
  return (
    <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-elevated shadow-lg">
      {suggestions.map((s, i) => (
        <div
          key={s.ticker}
          className={cn('flex cursor-default items-center gap-2 px-3 py-1.5 text-caption transition-colors duration-150', i === selectedIndex ? 'bg-hover text-fg' : 'text-fg-secondary')}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(s);
          }}
          onMouseEnter={() => onHover(i)}
        >
          <span className="font-mono font-medium text-fg">{s.ticker}</span>
          {s.ticker.endsWith('SIM') && (
            <span data-testid="synthetic-badge" className="text-micro font-mono px-1 py-0.5 rounded bg-brand-subtle/15 text-brand border border-brand/20">
              SIM
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-fg-tertiary">{resolveDisplayName(s.name, t)}</span>
          <span className="text-fg-tertiary">{resolveDisplayName(s.market, t)}</span>
        </div>
      ))}
      {fetchingRemote && <div className="px-3 py-1.5 text-caption text-fg-tertiary">{t('components.tickerInput.searching')}</div>}
    </div>
  );
}
function useTickerSearch() {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<TickerSuggestion[]>([]);
  const [fetchingRemote, setFetchingRemote] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const filterLocal = useCallback(
    (query: string): TickerSuggestion[] => {
      if (!query || query.length < 1) return [];
      const q = query.toUpperCase();
      return LOCAL_SUGGESTIONS.filter((item) => item.ticker.toUpperCase().includes(q) || resolveDisplayName(item.name, t).toLowerCase().includes(query.toLowerCase())).slice(0, 8);
    },
    [t]
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
            const res = await apiFetch(`/api/backtest/search?query=${encodeURIComponent(query)}&limit=8`, { silent: true });
            if (res.ok) {
              const json = await res.json();
              const data = json.data ?? json;
              if (Array.isArray(data) && data.length > 0) {
                setSuggestions(data);
                setSelectedIndex(-1);
              }
            }
            // eslint-disable-next-line no-empty -- 远程搜索失败，静默忽略，用户可手动输入
          } catch {
          } finally {
            setFetchingRemote(false);
          }
        }, 300);
      } else {
        setFetchingRemote(false);
        if (debounceRef.current) clearTimeout(debounceRef.current);
      }
    },
    [filterLocal]
  );
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );
  return {
    suggestions,
    fetchingRemote,
    selectedIndex,
    setSelectedIndex,
    setSuggestions,
    updateSuggestions
  };
}
export default function TickerInput({ value, onChange, placeholder, className }: TickerInputProps) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { suggestions, fetchingRemote, selectedIndex, setSelectedIndex, setSuggestions, updateSuggestions } = useTickerSearch();
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setFocused(false);
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
    <div ref={containerRef} className="relative">
      <Input
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
        autoComplete="off"
        spellCheck={false}
        className={className}
      />
      {focused && suggestions.length > 0 && <TickerDropdown suggestions={suggestions} selectedIndex={selectedIndex} fetchingRemote={fetchingRemote} onSelect={handleSelect} onHover={setSelectedIndex} />}
    </div>
  );
}
