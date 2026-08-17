import { useRef, type ReactNode } from 'react';
interface SegmentedControlProps<T extends string | number> {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  'aria-label'?: string;
}
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusAt = (i: number) =>
    refs.current[((i % options.length) + options.length) % options.length]?.focus();
  const move = (i: number, delta: number) => {
    const next = (i + delta + options.length) % options.length;
    onChange(options[next].value);
    focusAt(next);
  };
  const tabClass = (isActive: boolean) =>
    `text-caption font-medium cursor-pointer rounded bg-transparent border-none px-3.5 py-[5px] transition-all hover:text-fg-secondary ${
      isActive
        ? 'bg-surface text-fg shadow-[0_1px_2px_rgba(0,0,0,0.12)] dark:bg-brand/16 dark:text-brand dark:shadow-none'
        : 'text-fg-tertiary'
    }`;
  return (
    <div className="inline-flex bg-hover rounded-md p-0.5 gap-0.5" role="radiogroup" aria-label={ariaLabel}>
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
          className={tabClass(value === opt.value)}
          onClick={() => onChange(opt.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              move(i, 1);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              move(i, -1);
            } else if (e.key === 'Home' || e.key === 'End') {
              e.preventDefault();
              const next = e.key === 'Home' ? 0 : options.length - 1;
              onChange(options[next].value);
              focusAt(next);
            }
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
