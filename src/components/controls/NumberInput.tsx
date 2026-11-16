import { useEffect, useState } from 'react';
import { clamp } from '../../core/units';

interface Props {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

/** Numeric text field that commits on Enter / blur and supports arrow-key stepping. */
export function NumberInput({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  precision = 0,
  className,
  disabled,
  ariaLabel,
}: Props) {
  const format = (v: number) => (Number.isFinite(v) ? v.toFixed(precision) : '');
  const [draft, setDraft] = useState(format(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(format(value));
  }, [value, focused, precision]);

  const commit = (raw: string) => {
    const v = parseFloat(raw);
    if (Number.isFinite(v)) onChange(clamp(v, min, max));
    else setDraft(format(value));
  };

  return (
    <input
      className={`num-input ${className ?? ''}`}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      disabled={disabled}
      value={draft}
      onFocus={(e) => {
        setFocused(true);
        e.currentTarget.select();
      }}
      onBlur={(e) => {
        setFocused(false);
        commit(e.currentTarget.value);
      }}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(format(value));
          e.currentTarget.blur();
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const mult = e.shiftKey ? 10 : 1;
          const next = clamp(value + (e.key === 'ArrowUp' ? step : -step) * mult, min, max);
          onChange(next);
          setDraft(format(next));
        }
      }}
    />
  );
}
