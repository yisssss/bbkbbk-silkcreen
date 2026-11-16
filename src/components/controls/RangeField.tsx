import { useRef, useState } from 'react';
import { clamp } from '../../core/units';
import { NumberInput } from './NumberInput';

interface Props {
  loLabel: string;
  hiLabel: string;
  lo: number;
  hi: number;
  min: number;
  max: number;
  /** Low thumb cannot pass this, even if the high thumb is further right. */
  loCap?: number;
  /** High thumb cannot pass this, even if the low thumb is further left. */
  hiFloor?: number;
  step?: number;
  precision?: number;
  unit?: string;
  loDefault: number;
  hiDefault: number;
  loHint?: string;
  hiHint?: string;
  onLo: (value: number) => void;
  onHi: (value: number) => void;
}

const THUMB = 14;

/** Two values on one track. The span between the thumbs is filled. */
export function RangeField({
  loLabel,
  hiLabel,
  lo,
  hi,
  min,
  max,
  loCap,
  hiFloor,
  step = 1,
  precision = 0,
  unit,
  loDefault,
  hiDefault,
  loHint,
  hiHint,
  onLo,
  onHi,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<'lo' | 'hi' | null>(null);
  const [top, setTop] = useState<'lo' | 'hi'>('hi');

  const loMax = Math.min(hi, loCap ?? max);
  const hiMin = Math.max(lo, hiFloor ?? min);
  const span = max - min;
  const tOf = (v: number) => (span === 0 ? 0 : clamp((v - min) / span, 0, 1));
  const loT = tOf(lo);
  const hiT = tOf(hi);

  const snap = (raw: number, floor: number, ceiling: number) => {
    const steps = Math.round((clamp(raw, floor, ceiling) - min) / step);
    const snapped = min + steps * step;
    const p = 10 ** precision;
    return clamp(Math.round(snapped * p) / p, floor, ceiling);
  };

  const read = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    const inner = Math.max(1, rect.width - THUMB);
    const t = clamp((clientX - rect.left - THUMB / 2) / inner, 0, 1);
    return min + t * span;
  };

  const apply = (which: 'lo' | 'hi', clientX: number) => {
    const raw = read(clientX);
    if (which === 'lo') onLo(snap(raw, min, loMax));
    else onHi(snap(raw, hiMin, max));
  };

  const begin = (which: 'lo' | 'hi', e: React.PointerEvent, jump: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = which;
    setTop(which);
    trackRef.current?.setPointerCapture(e.pointerId);
    if (jump) apply(which, e.clientX);
  };

  const onMove = (e: React.PointerEvent) => {
    if (drag.current) apply(drag.current, e.clientX);
  };

  const end = () => {
    drag.current = null;
  };

  const nudge = (which: 'lo' | 'hi', dir: number, shift: boolean) => {
    const delta = step * (shift ? 10 : 1) * dir;
    if (which === 'lo') onLo(snap(lo + delta, min, loMax));
    else onHi(snap(hi + delta, hiMin, max));
  };

  const onKey = (which: 'lo' | 'hi') => (e: React.KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    setTop(which);
    nudge(which, dir, e.shiftKey);
  };

  return (
    <div className="field">
      <ValueRow
        label={loLabel}
        hint={loHint}
        value={lo}
        min={min}
        max={loMax}
        step={step}
        precision={precision}
        unit={unit}
        defaultValue={loDefault}
        onChange={(v) => onLo(clamp(v, min, loMax))}
      />
      <ValueRow
        label={hiLabel}
        hint={hiHint}
        value={hi}
        min={hiMin}
        max={max}
        step={step}
        precision={precision}
        unit={unit}
        defaultValue={hiDefault}
        onChange={(v) => onHi(clamp(v, hiMin, max))}
      />
      <div
        ref={trackRef}
        className="dual-range"
        onPointerDown={(e) => {
          const rect = trackRef.current!.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const loX = THUMB / 2 + loT * (rect.width - THUMB);
          const hiX = THUMB / 2 + hiT * (rect.width - THUMB);
          begin(Math.abs(x - loX) <= Math.abs(x - hiX) ? 'lo' : 'hi', e, true);
        }}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div className="dual-range-rail" aria-hidden>
          <div className="dual-range-fill" style={{ left: `${loT * 100}%`, width: `${Math.max(0, hiT - loT) * 100}%` }} />
        </div>
        <Thumb
          label={loLabel}
          value={lo}
          min={min}
          max={loMax}
          precision={precision}
          unit={unit}
          t={loT}
          z={top === 'lo' ? 2 : 1}
          onKeyDown={onKey('lo')}
          onPointerDown={(e) => begin('lo', e, false)}
        />
        <Thumb
          label={hiLabel}
          value={hi}
          min={hiMin}
          max={max}
          precision={precision}
          unit={unit}
          t={hiT}
          z={top === 'hi' ? 2 : 1}
          onKeyDown={onKey('hi')}
          onPointerDown={(e) => begin('hi', e, false)}
        />
      </div>
    </div>
  );
}

function ValueRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  precision,
  unit,
  defaultValue,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  precision: number;
  unit?: string;
  defaultValue: number;
  onChange: (value: number) => void;
}) {
  const changed = Math.abs(value - defaultValue) > 1e-9;
  return (
    <div className="field-head">
      <label title={hint}>{label}</label>
      <div className="field-value">
        <NumberInput value={value} onChange={onChange} min={min} max={max} step={step} precision={precision} ariaLabel={label} />
        {unit && <span className="unit">{unit}</span>}
        <button
          className="icon-btn reset"
          title="초기화"
          aria-label={`${label} 초기화`}
          disabled={!changed}
          onClick={() => onChange(clamp(defaultValue, min, max))}
        >
          ↺
        </button>
      </div>
    </div>
  );
}

function Thumb({
  label,
  value,
  min,
  max,
  precision,
  unit,
  t,
  z,
  onKeyDown,
  onPointerDown,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  precision: number;
  unit?: string;
  t: number;
  z: number;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <button
      type="button"
      className="dual-thumb"
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${value.toFixed(precision)}${unit ?? ''}`}
      style={{ left: `calc(${t} * (100% - ${THUMB}px) + ${THUMB / 2}px)`, zIndex: z }}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
    />
  );
}
