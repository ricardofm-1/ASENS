import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TIERS } from '../config';
import { recentSearches, formatAse } from '../lib/names';
import { useProtocol } from '../protocol';
import { Suffix } from '../components/Logo';
import { SearchForm } from '../components/SearchForm';

export function Home() {
  const { info, loading, error } = useProtocol();
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    document.title = 'ASENS — Asentum Name Service';
    setRecent(recentSearches());
  }, []);

  return (
    <main className="home">
      <p className="eyebrow">Asentum testnet</p>
      <h1>
        Your address,
        <br />
        <span className="accent">under a name.</span>
      </h1>
      <p className="lede">
        Register a <Suffix /> name that points at your Asentum wallet. It can carry a public profile, and you can set it
        as the name people see when you connect.
      </p>

      <SearchForm />

      {recent.length > 0 && (
        <div className="recent">
          <span>Recent</span>
          {recent.map((name) => (
            <Link key={name} to={`/name/${name}`}>
              {name}.ase
            </Link>
          ))}
        </div>
      )}

      <section className="tiers" aria-label="Yearly prices">
        {TIERS.map(({ tier, label }) => {
          const price = info?.prices[tier];
          return (
            <div key={tier} className="tier">
              <span>{label}</span>
              <b>{price ? `${formatAse(price)} ASE` : loading ? '…' : '—'}</b>
              <small>per year</small>
            </div>
          );
        })}
      </section>
      <p className="fine">
        {info?.paused
          ? 'New registrations are paused. Renewals still go through.'
          : 'Payment is exact, and it is split on chain: half is burned, half goes to the treasury. The longest term is 10 years.'}
        {error && !info ? ` ${error}` : ''}
      </p>
    </main>
  );
}
