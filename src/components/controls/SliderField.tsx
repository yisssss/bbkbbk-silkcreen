import { NumberInput } from './NumberInput';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  precision?: number;
  defaultValue: number;
  unit?: string;
  hint?: string;
  onChange: (value: number) => void;
}

export function SliderField({ label, value, min, max, step = 1, precision = 0, defaultValue, unit, hint, onChange }: Props) {
  const changed = Math.abs(value - defaultValue) > 1e-9;
  return (
    <div className="field">
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
            onClick={() => onChange(defaultValue)}
          >
            ↺
          </button>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.currentTarget.value))}
        onDoubleClick={() => onChange(defaultValue)}
      />
    </div>
  );
}
