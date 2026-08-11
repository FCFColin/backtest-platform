import type { ReactNode } from 'react';
interface SegmentedControlProps<T extends string | number> {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const move = (i: number, delta: number) =>
    onChange(options[(i + delta + options.length) % options.length].value);
  return (
    <div className="mini-tabs" role="radiogroup">
      {options.map((opt, i) => (
        <button
          key={String(opt.value)}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          className={`mini-tab ${value === opt.value ? 'active' : ''}`}
          onClick={() => onChange(opt.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              move(i, 1);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              move(i, -1);
            }
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
