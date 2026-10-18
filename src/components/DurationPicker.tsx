import { MAX_YEARS } from '../config';
import { clampYears } from '../lib/names';

const QUICK = [1, 2, 5, 10];

export function DurationPicker({
  years,
  onChange,
  disabled,
}: {
  years: number;
  onChange: (years: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="duration">
      <div className="years">
        <button type="button" aria-label="Fewer years" disabled={disabled || years <= 1} onClick={() => onChange(clampYears(years - 1))}>
          –
        </button>
        <div>
          <strong>{years}</strong>
          <span>{years === 1 ? 'year' : 'years'}</span>
        </div>
        <button
          type="button"
          aria-label="More years"
          disabled={disabled || years >= MAX_YEARS}
          onClick={() => onChange(clampYears(years + 1))}
        >
          +
        </button>
      </div>
      <div className="quick-years">
        {QUICK.map((option) => (
          <button
            key={option}
            type="button"
            className={option === years ? 'on' : ''}
            disabled={disabled}
            onClick={() => onChange(option)}
          >
            {option}y
          </button>
        ))}
      </div>
    </div>
  );
}
