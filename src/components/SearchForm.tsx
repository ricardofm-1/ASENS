import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toAse1 } from '@asentum/connect';
import { formatAse, parseSearch, rememberSearch, tierOf } from '../lib/names';
import { useProtocol } from '../protocol';
import { Suffix } from './Logo';

export function SearchForm({ variant = 'hero' }: { variant?: 'hero' | 'compact' }) {
  const navigate = useNavigate();
  const { info } = useProtocol();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const parsed = parseSearch(value);
  const hint = (() => {
    if (variant !== 'hero' || !value.trim() || parsed.kind === 'invalid' || parsed.kind === 'address') return null;
    const tier = String(tierOf(parsed.name));
    const price = info?.prices[tier];
    const label = tier === '7' ? '7 or more characters' : `${parsed.name.length} characters`;
    return price ? `${label} · ${formatAse(price)} ASE a year` : label;
  })();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (/^0x[0-9a-fA-F]{64}$/.test(value.trim())) {
      setError(null);
      navigate(`/explorer/${value.trim().toLowerCase()}`);
      setValue('');
      return;
    }
    const query = parseSearch(value);
    if (query.kind === 'invalid') {
      setError(query.error);
      return;
    }
    setError(null);
    if (query.kind === 'name') {
      rememberSearch(query.name);
      navigate(`/name/${query.name}`);
    } else {
      navigate(`/explorer/${toAse1(query.hex)}`);
    }
    setValue('');
  }

  return (
    <form className={`search ${variant}`} onSubmit={onSubmit}>
      <label className="sr-only" htmlFor={`search-${variant}`}>
        Search names or addresses
      </label>
      <input
        id={`search-${variant}`}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        placeholder={variant === 'hero' ? 'find a name' : 'Search names or addresses'}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      {variant === 'hero' && (
        <span className="suffix">
          <Suffix />
        </span>
      )}
      <button type="submit">Search</button>
      {variant === 'hero' && (error || hint) && <p className={error ? 'search-error' : 'search-hint'}>{error || hint}</p>}
      {variant === 'compact' && error && <p className="search-error">{error}</p>}
    </form>
  );
}
