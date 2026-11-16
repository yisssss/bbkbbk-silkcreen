import type { LengthUnit } from '../../core/types';
import { mmToUnit, unitToMm } from '../../core/units';
import { NumberInput } from './NumberInput';

interface Props {
  label: string;
  valueMm: number;
  unit: LengthUnit;
  onChange: (mm: number) => void;
  minMm?: number;
  maxMm?: number;
  disabled?: boolean;
}

export function LengthField({ label, valueMm, unit, onChange, minMm = -10000, maxMm = 10000, disabled }: Props) {
  const precision = unit === 'cm' ? 2 : 1;
  return (
    <label className="length-field">
      <span className="length-label">{label}</span>
      <NumberInput
        value={mmToUnit(valueMm, unit)}
        min={mmToUnit(minMm, unit)}
        max={mmToUnit(maxMm, unit)}
        step={unit === 'cm' ? 0.1 : 1}
        precision={precision}
        disabled={disabled}
        ariaLabel={label}
        onChange={(v) => onChange(unitToMm(v, unit))}
      />
      <span className="unit">{unit}</span>
    </label>
  );
}
