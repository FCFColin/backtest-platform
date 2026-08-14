import { useRef, type ReactNode } from 'react';
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
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusAt = (i: number) =>
    refs.current[((i % options.length) + options.length) % options.length]?.focus();
  const move = (i: number, delta: number) => {
    const next = (i + delta + options.length) % options.length;
    onChange(options[next].value);
    focusAt(next);
  };
  return (
    <div className="mini-tabs" role="radiogroup">
      {options.map((opt, i) => (
        <button
          key={String(opt.value)}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          tabIndex={value === opt.value ? 0 : -1}
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
