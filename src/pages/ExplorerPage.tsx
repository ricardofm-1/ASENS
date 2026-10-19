import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toAse1 } from '@asentum/connect';
import { EXPLORER } from '../config';
import { AddressTag } from '../components/AddressTag';
import { Suffix } from '../components/Logo';
import { StatusBadge } from '../components/StatusBadge';
import { getName, lookupPrimary, resolveName } from '../lib/chain';
import {
  detectQuery,
  getAddressDetails,
  getTxDetails,
  type AddressDetails,
  type ExplorerQuery,
  type TxDetails,
} from '../lib/explorer';
import { syncNameIndex } from '../lib/indexNames';
import {
  canonicalHex,
  errorMessage,
  formatAse,
  formatWhen,
  nameStatus,
  relativeTime,
  rememberedNames,
  sameAddress,
  type NameRecord,
} from '../lib/names';

export function ExplorerPage() {
  const params = useParams();
  const navigate = useNavigate();
  const current = params.query ? safeDecode(params.query) : '';
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(current);
    setError(null);
    document.title = current ? `${current} — ASENS Explorer` : 'Explorer — ASENS';
  }, [current]);

  const query: ExplorerQuery | null = current ? detectQuery(current) : null;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next = detectQuery(value);
    if (next.kind === 'invalid') {
      setError(next.error);
      return;
    }
    setError(null);
    const slug = next.kind === 'tx' ? next.hash : next.kind === 'address' ? toAse1(next.hex) : next.name;
    navigate(`/explorer/${slug}`);
  }

  return (
    <main className="page">
      <p className="eyebrow">Explorer</p>
      <h1 className="explorer-title">Look anything up.</h1>
      <p className="lede">
        Paste a transaction hash, an address, or a <Suffix /> name. Every address in the result shows its <Suffix /> name
        when it has one.
      </p>

      <form className="search hero explorer-search" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="explorer-input">
          Transaction hash, address, or .ase name
        </label>
        <input
          id="explorer-input"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          placeholder="0x… hash, ase1… address, or name.ase"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        <button type="submit">Look up</button>
        {error && <p className="search-error">{error}</p>}
      </form>

      <div className="explorer-result">
        {query?.kind === 'invalid' && <p className="error">{query.error}</p>}
        {query?.kind === 'tx' && <TxView hash={query.hash} />}
        {query?.kind === 'address' && <AddressView hex={query.hex} />}
        {query?.kind === 'name' && <NameView name={query.name} />}
      </div>
    </main>
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function Kind({ children }: { children: ReactNode }) {
  return <span className="kind">{children}</span>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let cancel = false;
    setState({ loading: true });
    load()
      .then((data) => {
        if (!cancel) setState({ data, loading: false });
      })
      .catch((err: unknown) => {
        if (!cancel) setState({ error: errorMessage(err), loading: false });
      });
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function TxView({ hash }: { hash: string }) {
  const { data: tx, error, loading } = useLoad<TxDetails | null>(() => getTxDetails(hash), [hash]);

  if (loading) return <p className="muted">Reading the transaction…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!tx) return <p className="error">No transaction with that hash on the Asentum testnet.</p>;

  return (
    <>
      <section className="card">
        <div className="result-head">
          <Kind>Transaction</Kind>
          {tx.pending ? (
            <span className="badge warn">Pending</span>
          ) : tx.success === false ? (
            <span className="badge bad">Reverted</span>
          ) : (
            <span className="badge live">Success</span>
          )}
        </div>
        <p className="mono-line">{tx.hash}</p>
        <dl className="rows">
          {tx.method && (
            <Row label="Method">
              <code className="method">{tx.method}</code>
            </Row>
          )}
          <Row label="From">
            <AddressTag address={tx.from} full />
          </Row>
          <Row label="To">
            {tx.to ? (
              <AddressTag address={tx.to} full />
            ) : tx.contractCreated ? (
              <>
                Contract created <AddressTag address={tx.contractCreated} full />
              </>
            ) : (
              'Contract creation'
            )}
          </Row>
          <Row label="Value">{formatAse(tx.value)} ASE</Row>
          {tx.fee != null && <Row label="Fee">{formatAse(tx.fee, 8)} ASE</Row>}
          <Row label="Block">
            {tx.block != null ? `#${tx.block.toLocaleString()}` : 'Not yet included'}
            {tx.timestamp && (
              <span className="muted">
                {' '}
                · {formatWhen(tx.timestamp)} · {relativeTime(tx.timestamp)}
              </span>
            )}
          </Row>
          {tx.gasUsed != null && <Row label="Gas used">{tx.gasUsed.toLocaleString()}</Row>}
          {tx.nonce != null && <Row label="Nonce">{tx.nonce}</Row>}
        </dl>
        {tx.args.length > 0 && (
          <div className="sub">
            <h3>Arguments</h3>
            <ol className="args">
              {tx.args.map((arg, i) => (
                <li key={i}>
                  <Value value={arg} />
                </li>
              ))}
            </ol>
          </div>
        )}
        <a className="tx-link" href={`${EXPLORER}/tx/${tx.hash}`} target="_blank" rel="noreferrer">
          Open on Asentum Explorer
        </a>
      </section>

      {tx.events.length > 0 && (
        <section className="card">
          <h2>Events ({tx.events.length})</h2>
          <ul className="events">
            {tx.events.map((event, i) => (
              <li key={i}>
                <code className="method">{event.name}</code>
                <dl className="rows tight">
                  {Object.entries(event.data).map(([key, value]) => (
                    <Row key={key} label={key}>
                      <Value value={value} field={key} />
                    </Row>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tx.addresses.length > 0 && (
        <section className="card">
          <h2>Addresses involved</h2>
          <ul className="involved">
            {tx.addresses.map((address) => (
              <li key={address}>
                <AddressTag address={address} full />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

const AMOUNT_KEYS = /^(paid|value|amount|burned|toTreasury|price)$/i;
const TIME_KEYS = /^(expiry|eta)$/i;

function Value({ value, field }: { value: unknown; field?: string }) {
  if (value == null) return <span className="muted">—</span>;
  if (typeof value === 'string' && canonicalHex(value)) return <AddressTag address={value} full />;
  if (field && AMOUNT_KEYS.test(field) && /^\d+$/.test(String(value))) {
    return <span>{formatAse(String(value))} ASE</span>;
  }
  if (field && TIME_KEYS.test(field) && Number.isFinite(Number(value))) {
    return <span>{formatWhen(Number(value))}</span>;
  }
  if (field === 'name' && typeof value === 'string') {
    return (
      <Link to={`/name/${value}`} className="name-link">
        {value}
        <Suffix />
      </Link>
    );
  }
  if (typeof value === 'object') return <code className="json">{JSON.stringify(value)}</code>;
  return <code className="json">{String(value)}</code>;
}

function AddressView({ hex }: { hex: string }) {
  const { data, error, loading } = useLoad<AddressDetails>(() => getAddressDetails(hex), [hex]);
  const [names, setNames] = useState<NameRecord[] | null>(null);
  const [partial, setPartial] = useState(false);
  const ase = toAse1(hex);

  useEffect(() => {
    let cancel = false;
    setNames(null);
    setPartial(false);
    (async () => {
      const [index, primary] = await Promise.all([
        syncNameIndex().catch(() => null),
        lookupPrimary(hex).catch(() => null),
      ]);
      const candidates = new Set<string>([...rememberedNames(), ...(index?.names ?? [])]);
      if (primary) candidates.add(primary);
      const records = await Promise.all([...candidates].map((name) => getName(name).catch(() => null)));
      if (cancel) return;
      setPartial(!index);
      setNames(
        records.filter(
          (rec): rec is NameRecord => !!rec && sameAddress(rec.owner, hex) && ['active', 'grace'].includes(nameStatus(rec)),
        ),
      );
    })();
    return () => {
      cancel = true;
    };
  }, [hex]);

  return (
    <section className="card">
      <div className="result-head">
        <Kind>{data?.isContract ? 'Contract' : 'Address'}</Kind>
      </div>
      <p className="mono-line">
        <AddressTag address={hex} full />
      </p>
      {loading && <p className="muted">Reading the account…</p>}
      {error && <p className="error">{error}</p>}
      {data && (
        <dl className="rows">
          <Row label="Balance">{formatAse(data.balance)} ASE</Row>
          <Row label="Transactions sent">{data.nonce.toLocaleString()}</Row>
          <Row label="Type">{data.isContract ? 'Contract' : 'Wallet'}</Row>
          <Row label="Hex form">
            <code className="json">{hex}</code>
          </Row>
        </dl>
      )}
      <div className="sub">
        <h3>.ase names owned</h3>
        {names === null && <p className="muted">Looking through registrations…</p>}
        {names && names.length === 0 && <p className="muted">This address doesn’t own any .ase names.</p>}
        {names && names.length > 0 && (
          <ul className="owned">
            {names.map((rec) => (
              <li key={rec.name}>
                <Link to={`/name/${rec.name}`} className="name-link">
                  {rec.name}
                  <Suffix />
                </Link>
                {rec.expiry && <span className="muted"> · expires {formatWhen(rec.expiry)}</span>}
              </li>
            ))}
          </ul>
        )}
        {names && partial && (
          <p className="muted">The registration log couldn’t be fully scanned right now, so this list may be incomplete.</p>
        )}
      </div>
      <a className="tx-link" href={`${EXPLORER}/address/${ase}`} target="_blank" rel="noreferrer">
        Full transaction history on Asentum Explorer
      </a>
    </section>
  );
}

function NameView({ name }: { name: string }) {
  const { data, error, loading } = useLoad<{ record: NameRecord; resolved: string | null }>(
    async () => {
      const [record, resolved] = await Promise.all([getName(name), resolveName(name)]);
      return { record, resolved };
    },
    [name],
  );

  if (loading) return <p className="muted">Reading the registry…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!data) return null;
  const { record, resolved } = data;
  const status = nameStatus(record);

  return (
    <section className="card">
      <div className="result-head">
        <Kind>.ase name</Kind>
        <StatusBadge status={status} />
      </div>
      <p className="name-line">
        {name}
        <Suffix />
      </p>
      {status === 'available' || status === 'expired' ? (
        <p className="muted">
          Nobody holds this name right now. <Link to={`/name/${name}`}>Register it</Link>
        </p>
      ) : (
        <dl className="rows">
          {record.owner && (
            <Row label="Owner">
              <AddressTag address={record.owner} full />
            </Row>
          )}
          <Row label="Resolves to">{resolved ? <AddressTag address={resolved} full /> : 'Not resolving'}</Row>
          {record.expiry && (
            <Row label="Expires">
              {formatWhen(record.expiry)} <span className="muted">· {relativeTime(record.expiry)}</span>
            </Row>
          )}
        </dl>
      )}
      <Link className="tx-link" to={`/name/${name}`}>
        Open the name page
      </Link>
    </section>
  );
}
