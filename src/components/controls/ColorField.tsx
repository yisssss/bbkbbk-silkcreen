import { useEffect, useState } from 'react';
import { normalizeHex } from '../../core/color';

interface Props {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
}

export function ColorField({ value, onChange, label }: Props) {
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(value);
    setInvalid(false);
  }, [value]);

  const commit = (raw: string) => {
    const hex = normalizeHex(raw);
    if (hex) {
      setInvalid(false);
      onChange(hex);
    } else {
      setInvalid(true);
    }
  };

  return (
    <div className="color-field">
      {label && <span className="color-field-label">{label}</span>}
      <input
        type="color"
        className="swatch-input"
        aria-label={label ? `${label} 색상 선택` : '색상 선택'}
        value={value.toLowerCase()}
        onChange={(e) => onChange(e.currentTarget.value.toUpperCase())}
      />
      <input
        type="text"
        className={`hex-input ${invalid ? 'invalid' : ''}`}
        aria-label="HEX 코드"
        value={draft}
        maxLength={7}
        spellCheck={false}
        onChange={(e) => {
          const v = e.currentTarget.value;
          setDraft(v);
          const hex = normalizeHex(v);
          if (hex && v.replace('#', '').length === 6) onChange(hex);
        }}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </div>
  );
}
