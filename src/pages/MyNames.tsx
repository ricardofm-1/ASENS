import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '@asentum/connect';
import { Suffix } from '../components/Logo';
import { StatusBadge } from '../components/StatusBadge';
import { getName, lookupPrimary } from '../lib/chain';
import { syncNameIndex, subscribeIndex, type IndexProgress, type NameIndex } from '../lib/indexNames';
import {
  canRenew,
  errorMessage,
  formatWhen,
  nameStatus,
  rememberedNames,
  relativeTime,
  sameAddress,
  type NameRecord,
  type NameStatus,
} from '../lib/names';

type Row = NameRecord & { status: NameStatus };

export function MyNames() {
  const { address, connected, openConnect } = useWallet();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [primary, setPrimary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const [progress, setProgress] = useState<IndexProgress>({ scanned: 0, total: 0, done: false });

  useEffect(() => {
    document.title = 'My names — ASENS';
    const stop = subscribeIndex(setProgress);
    const onChange = () => setRev((n) => n + 1);
    window.addEventListener('asens:names-changed', onChange);
    return () => {
      stop();
      window.removeEventListener('asens:names-changed', onChange);
    };
  }, []);

  useEffect(() => {
    if (!address) {
      setRows(null);
      setPrimary(null);
      return;
    }
    let cancel = false;
    setRows(null);
    setError(null);

    (async () => {
      let index: NameIndex = { nextBlock: 0, names: [], owners: {}, textKeys: {} };
      try {
        index = await syncNameIndex();
      } catch (err) {
        if (!cancel) setError(errorMessage(err));
      }
      if (cancel) return;

      const discovered = index.names.length ? index.names : Object.keys(index.owners);
      const candidates = new Set<string>([...rememberedNames(), ...discovered]);

      let primaryName: string | null = null;
      try {
        primaryName = await lookupPrimary(address);
        if (primaryName) candidates.add(primaryName);
      } catch {
        primaryName = null;
      }
      if (cancel) return;
      setPrimary(primaryName);

      const records = await Promise.all(
        [...candidates].map(async (name) => {
          try {
            return await getName(name);
          } catch {
            return null;
          }
        }),
      );
      if (cancel) return;

      const mine = records
        .filter((rec): rec is NameRecord => !!rec && sameAddress(rec.owner, address))
        .map((rec) => ({ ...rec, status: nameStatus(rec) }))
        .filter((rec) => rec.status === 'active' || rec.status === 'grace')
        .sort((a, b) => (a.expiry ?? 0) - (b.expiry ?? 0));

      if (primaryName) {
        mine.sort((a, b) => Number(b.name === primaryName) - Number(a.name === primaryName));
      }
      setRows(mine);
    })().catch((err: unknown) => {
      if (!cancel) setError(errorMessage(err));
    });

    return () => {
      cancel = true;
    };
  }, [address, rev]);

  if (!connected) {
    return (
      <main className="page narrow">
        <p className="eyebrow">Your names</p>
        <h1>Connect a wallet to see what you’ve registered.</h1>
        <p className="lede">ASENS reads the registry. The wallet only has to sign when you register, renew, or edit a name.</p>
        <button type="button" className="btn primary" onClick={openConnect}>
          Connect wallet
        </button>
      </main>
    );
  }

  const pct = progress.total ? Math.min(100, Math.round((progress.scanned / progress.total) * 100)) : 0;

  return (
    <main className="page">
      <p className="eyebrow">Your names</p>
      <h1>Names this wallet owns.</h1>
      {primary && (
        <p className="lede">
          Primary name <Link to={`/name/${primary}`}>{primary}.ase</Link>
        </p>
      )}

      {!progress.done && (
        <div className="progress" aria-label="Reading chain history">
          <span>Reading registrations… {pct}%</span>
          <i style={{ width: `${pct}%` }} />
        </div>
      )}
      {error && <p className="error">{error}</p>}

      {rows === null && <p className="muted">Checking the registry…</p>}
      {rows && rows.length === 0 && (
        <div className="empty">
          <p>No names are registered to this wallet yet.</p>
          <Link className="btn" to="/">
            Search for one
          </Link>
        </div>
      )}
      {rows && rows.length > 0 && (
        <ul className="name-list">
          {rows.map((row) => (
            <li key={row.name}>
              <Link to={`/name/${row.name}`}>
                <span className="name-list-title">
                  {row.name}
                  <Suffix />
                  {row.name === primary && <small>Primary</small>}
                </span>
                <StatusBadge status={row.status} />
                <span className="name-list-meta">
                  {row.expiry
                    ? canRenew(row.status)
                      ? `Expires ${formatWhen(row.expiry)} · ${relativeTime(row.expiry)}`
                      : formatWhen(row.expiry)
                    : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
