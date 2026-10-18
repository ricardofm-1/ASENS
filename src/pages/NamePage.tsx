import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAsentum, useBalance, useWallet } from '@asentum/connect';
import { CONTROLLER, EXPLORER, REGISTRY, TEXT_FIELDS } from '../config';
import { AddressLink, TxLink } from '../components/AddressLink';
import { DurationPicker } from '../components/DurationPicker';
import { Suffix } from '../components/Logo';
import { StatusBadge } from '../components/StatusBadge';
import { getName, quote, readTexts, resolveName } from '../lib/chain';
import { syncNameIndex } from '../lib/indexNames';
import {
  canRegister,
  canRenew,
  canonicalHex,
  displayAddress,
  errorMessage,
  feeSplit,
  formatAse,
  formatWhen,
  nameStatus,
  normalizeName,
  notifyNamesChanged,
  relativeTime,
  rememberName,
  safeHttpUrl,
  sameAddress,
  tierOf,
  type NameRecord,
} from '../lib/names';
import { useProtocol } from '../protocol';

export function NamePage() {
  const params = useParams();
  let raw = params.name ?? '';
  try {
    raw = decodeURIComponent(raw);
  } catch {
    raw = params.name ?? '';
  }
  const parsed = normalizeName(raw);
  if (parsed.ok && raw !== parsed.name) return <Navigate to={`/name/${parsed.name}`} replace />;
  if (!parsed.ok) return <InvalidName query={raw} error={parsed.error} />;
  return <NameDetails name={parsed.name} />;
}

function InvalidName({ query, error }: { query: string; error: string }) {
  return (
    <main className="page narrow">
      <p className="eyebrow">Name</p>
      <h1>{query || 'That name'} isn’t available to register.</h1>
      <p className="lede">{error} Names are 3–32 characters: letters, numbers, and single hyphens.</p>
      <Link className="btn" to="/">
        Try another
      </Link>
    </main>
  );
}

function NameDetails({ name }: { name: string }) {
  const client = useAsentum();
  const { address, connected, openConnect } = useWallet();
  const { balance, refresh } = useBalance();
  const { info } = useProtocol();

  const [record, setRecord] = useState<NameRecord | null>(null);
  const [resolved, setResolved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  const [years, setYears] = useState(1);
  const [price, setPrice] = useState<string | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [extraKeys, setExtraKeys] = useState<string[]>([]);
  const [customKey, setCustomKey] = useState('');
  const [addrInput, setAddrInput] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [confirmTransfer, setConfirmTransfer] = useState(false);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${name}.ase — ASENS`;
    setRecord(null);
    setResolved(null);
    setTexts({});
    setDrafts({});
    setExtraKeys([]);
    setYears(1);
    setBanner(null);
    setError(null);
    setTx(null);
    setLoading(true);
  }, [name]);

  useEffect(() => {
    let cancel = false;
    Promise.all([getName(name), resolveName(name)])
      .then(([rec, live]) => {
        if (cancel) return;
        setRecord(rec);
        setResolved(live);
        setAddrInput(rec.addr ? displayAddress(rec.addr) : '');
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancel) setLoadError(errorMessage(err));
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [name, rev]);

  const status = record ? nameStatus(record) : null;
  const registering = status ? canRegister(status) : false;
  const renewing = status ? canRenew(status) : false;

  useEffect(() => {
    if (!registering && !renewing) return;
    let cancel = false;
    setPrice(null);
    quote(name, years)
      .then((value) => {
        if (!cancel) setPrice(value);
      })
      .catch(() => {
        if (!cancel) setPrice(null);
      });
    return () => {
      cancel = true;
    };
  }, [name, years, registering, renewing]);

  useEffect(() => {
    let cancel = false;
    syncNameIndex()
      .then((index) => {
        if (!cancel) setExtraKeys(index.textKeys[name] ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [name, rev]);

  const fieldKeys = [...new Set([...TEXT_FIELDS.map((field) => field.key), ...extraKeys])];

  useEffect(() => {
    if (status !== 'active') return;
    let cancel = false;
    readTexts(name, fieldKeys)
      .then((map) => {
        if (cancel) return;
        setTexts(map);
        setDrafts(map);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
    // fieldKeys is derived from extraKeys; including the joined list keeps the fetch stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, status, extraKeys.join('|')]);

  const mine = sameAddress(record?.owner, address);
  const tier = tierOf(name);
  const yearly = info?.prices[String(tier)];
  const shownPrice = price ?? (yearly ? (BigInt(yearly) * BigInt(years)).toString() : null);

  async function send(success: string, exec: () => Promise<string>, after?: () => void) {
    if (!connected) {
      openConnect();
      return;
    }
    setError(null);
    setBanner(null);
    setTx(null);
    setBusy('Approve the transaction in your Asentum wallet.');
    try {
      const hash = await exec();
      setTx(hash);
      setBusy('Waiting for the transaction to land.');
      const receipt = await client.waitReceipt(hash);
      if (!receipt.success) throw new Error('The transaction reverted.');
      after?.();
      notifyNamesChanged();
      refresh();
      setBanner(success);
      setRev((n) => n + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function pay(kind: 'register' | 'renew') {
    await send(kind === 'register' ? `${name}.ase is yours.` : `${name}.ase was renewed.`, async () => {
      const exact = await quote(name, years);
      if (balance && isWei(balance) && isWei(exact) && BigInt(balance) < BigInt(exact)) {
        throw new Error(`This costs ${formatAse(exact)} ASE. This wallet has ${formatAse(balance)} ASE.`);
      }
      const method = kind === 'register' ? 'register' : 'renew';
      return client.call(CONTROLLER, method, [name, years], exact);
    }, kind === 'register' ? () => rememberName(name) : undefined);
  }

  if (loading && !record) {
    return (
      <main className="page">
        <p className="eyebrow">Name</p>
        <div className="skel title" />
        <div className="skel line" />
      </main>
    );
  }

  if (loadError && !record) {
    return (
      <main className="page narrow">
        <h1>Couldn’t read {name}.ase</h1>
        <p className="error">{loadError}</p>
        <button type="button" className="btn" onClick={() => setRev((n) => n + 1)}>
          Try again
        </button>
      </main>
    );
  }

  if (!record || !status) return null;

  return (
    <main className="page">
      <p className="eyebrow">asens / {name}.ase</p>
      <div className="name-hero">
        <h1>
          {name}
          <Suffix />
        </h1>
        <StatusBadge status={status} />
      </div>
      <p className="name-sub">
        {status === 'available' && 'Nobody has registered this name.'}
        {status === 'expired' && 'The grace period is over, so it can be registered again.'}
        {status === 'grace' && record.expiry && (
          <>
            Expired {relativeTime(record.expiry)}. The previous owner can still renew until {formatWhen(record.expiry + 30 * 86400)}.
          </>
        )}
        {status === 'active' && record.expiry && (
          <>
            Expires {formatWhen(record.expiry)} · {relativeTime(record.expiry)}
            {yearly ? ` · ${formatAse(yearly)} ASE a year` : ''}
          </>
        )}
      </p>

      <div className="split">
        <section className="card profile">
          <h2>Profile</h2>
          {status === 'active' && safeHttpUrl(texts.avatar || '') && (
            <img className="avatar" src={safeHttpUrl(texts.avatar)!} alt="" />
          )}
          {status === 'active' && texts.description && <p className="bio">{texts.description}</p>}
          {status === 'active' && <ProfileLinks texts={texts} />}

          <dl className="facts">
            <div>
              <dt>Resolves to</dt>
              <dd>
                {status === 'grace' && 'Paused until the name is renewed.'}
                {status === 'active' && resolved && <AddressLink address={resolved} />}
                {status === 'active' && !resolved && 'No address yet.'}
                {(status === 'available' || status === 'expired') && '—'}
              </dd>
            </div>
            {record.owner && status !== 'available' && (
              <div>
                <dt>Owner</dt>
                <dd>
                  <AddressLink address={record.owner} short />
                  {mine && <em className="you"> You</em>}
                </dd>
              </div>
            )}
          </dl>
          {status !== 'active' && <p className="muted">Text records show up once the name is actively registered.</p>}
        </section>

        <div className="stack">
          {banner && <p className="banner">{banner}</p>}
          {error && <p className="error">{error}</p>}
          {tx && <TxLink hash={tx} />}
          {busy && <p className="muted">{busy}</p>}

          {registering && (
            <section className="card">
              <h2>{status === 'expired' ? 'Register again' : 'Register'}</h2>
              {info?.paused && <p className="error">New registrations are paused. Try again once they’re open.</p>}
              <DurationPicker years={years} onChange={setYears} disabled={!!busy} />
              <PayNote wei={shownPrice} />
              {shownPrice && balance && isWei(shownPrice) && isWei(balance) && BigInt(balance) < BigInt(shownPrice) && (
                <p className="error">
                  This wallet has {formatAse(balance)} ASE.{' '}
                  <a href={EXPLORER} target="_blank" rel="noreferrer">
                    Get test ASE
                  </a>
                </p>
              )}
              <button
                type="button"
                className="btn primary"
                disabled={!!busy || info?.paused}
                onClick={() => pay('register')}
              >
                {connected ? `Register ${name}.ase` : 'Connect wallet to register'}
              </button>
            </section>
          )}

          {renewing && (
            <section className="card">
              <h2>Renew</h2>
              <p className="muted">Anyone can pay to extend a name. It adds time on top of the current expiry.</p>
              {mine && status === 'grace' && <p className="muted">Renew it to edit the profile and turn resolution back on.</p>}
              <DurationPicker years={years} onChange={setYears} disabled={!!busy} />
              <PayNote wei={shownPrice} />
              <button type="button" className="btn primary" disabled={!!busy} onClick={() => pay('renew')}>
                {connected ? `Renew for ${years} ${years === 1 ? 'year' : 'years'}` : 'Connect wallet to renew'}
              </button>
            </section>
          )}

          {mine && status === 'active' && (
            <section className="card">
              <h2>Manage</h2>
              <label className="field">
                <span>Resolved address</span>
                <input
                  value={addrInput}
                  onChange={(event) => setAddrInput(event.target.value)}
                  placeholder="ase1… or 0x…"
                  spellCheck={false}
                  autoCapitalize="off"
                />
              </label>
              <div className="row-btns">
                <button
                  type="button"
                  className="btn"
                  disabled={!!busy}
                  onClick={() =>
                    send('Address record updated.', async () => {
                      if (!isAddress(addrInput)) throw new Error('Enter a valid ase1 or 0x address.');
                      return client.call(REGISTRY, 'setAddr', [name, addrInput.trim()]);
                    })
                  }
                >
                  Save address
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!!busy || !sameAddress(resolved, address)}
                  onClick={() => send('This is now your primary name.', () => client.call(REGISTRY, 'setPrimary', [name]))}
                >
                  Set as primary
                </button>
              </div>
              {!sameAddress(resolved, address) && (
                <p className="muted">A name can be your primary name only while it resolves to the wallet you’re using.</p>
              )}

              <div className="records">
                {fieldKeys.map((key) => {
                  const meta = TEXT_FIELDS.find((field) => field.key === key);
                  const value = drafts[key] ?? '';
                  const dirty = value !== (texts[key] ?? '');
                  return (
                    <label className="field" key={key}>
                      <span>
                        {meta?.label ?? key}
                        {dirty && <em> unsaved</em>}
                      </span>
                      {meta?.multiline ? (
                        <textarea
                          rows={3}
                          maxLength={256}
                          value={value}
                          placeholder={meta.placeholder}
                          onChange={(event) => setDrafts((prev) => ({ ...prev, [key]: event.target.value }))}
                        />
                      ) : (
                        <input
                          maxLength={256}
                          value={value}
                          placeholder={meta?.placeholder ?? 'Value'}
                          spellCheck={false}
                          onChange={(event) => setDrafts((prev) => ({ ...prev, [key]: event.target.value }))}
                        />
                      )}
                      {dirty && (
                        <button
                          type="button"
                          className="text-btn"
                          disabled={!!busy}
                          onClick={() =>
                            send(value ? 'Record saved.' : 'Record cleared.', () => client.call(REGISTRY, 'setText', [name, key, value]))
                          }
                        >
                          Save {meta?.label ?? key}
                        </button>
                      )}
                    </label>
                  );
                })}
                <div className="add-key">
                  <input
                    value={customKey}
                    onChange={(event) => setCustomKey(event.target.value)}
                    placeholder="Custom key"
                    spellCheck={false}
                    autoCapitalize="off"
                  />
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      const key = customKey.trim().toLowerCase();
                      if (!/^[a-z0-9._-]{1,32}$/.test(key)) {
                        setError('Keys use letters, numbers, and . _ - and are at most 32 characters.');
                        return;
                      }
                      setError(null);
                      setExtraKeys((keys) => (keys.includes(key) ? keys : [...keys, key]));
                      setCustomKey('');
                    }}
                  >
                    Add key
                  </button>
                </div>
              </div>

              <label className="field">
                <span>Transfer to</span>
                <input
                  value={transferTo}
                  onChange={(event) => {
                    setTransferTo(event.target.value);
                    setConfirmTransfer(false);
                  }}
                  placeholder="ase1… or 0x…"
                  spellCheck={false}
                  autoCapitalize="off"
                />
              </label>
              <button
                type="button"
                className="btn danger"
                disabled={!!busy || !transferTo.trim()}
                onClick={() => {
                  if (!confirmTransfer) {
                    if (!isAddress(transferTo)) {
                      setError('Enter the recipient’s ase1 or 0x address.');
                      return;
                    }
                    setConfirmTransfer(true);
                    return;
                  }
                  send('Name transferred.', async () => {
                    if (!isAddress(transferTo)) throw new Error('Enter a valid recipient address.');
                    return client.call(REGISTRY, 'transferName', [name, transferTo.trim()]);
                  }).then(() => setConfirmTransfer(false));
                }}
              >
                {confirmTransfer ? 'Confirm transfer' : 'Transfer name'}
              </button>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

function isAddress(value: string): boolean {
  return canonicalHex(value) !== null;
}

function isWei(value: string): boolean {
  return /^\d+$/.test(value);
}

function PayNote({ wei }: { wei: string | null }) {
  if (!wei) return <p className="muted">Fetching the exact price…</p>;
  const split = feeSplit(wei);
  return (
    <div className="pay">
      <strong>{formatAse(wei)} ASE</strong>
      <span>
        {formatAse(split.burned)} ASE is burned and {formatAse(split.treasury)} ASE goes to the treasury. The wallet asks
        you to approve that exact amount, plus gas.
      </span>
    </div>
  );
}

function ProfileLinks({ texts }: { texts: Record<string, string> }) {
  const links: { label: string; href: string }[] = [];
  const site = texts.url ? safeHttpUrl(texts.url) : null;
  if (site) links.push({ label: 'Website', href: site });
  const handle = (value: string) => value.trim().replace(/^@/, '');
  const x = handle(texts.x || '');
  if (/^[A-Za-z0-9_]{1,32}$/.test(x)) links.push({ label: 'X', href: `https://x.com/${x}` });
  const github = handle(texts.github || '');
  if (/^[A-Za-z0-9-]{1,39}$/.test(github)) links.push({ label: 'GitHub', href: `https://github.com/${github}` });
  const telegram = handle(texts.telegram || '');
  if (/^[A-Za-z0-9_]{1,32}$/.test(telegram)) links.push({ label: 'Telegram', href: `https://t.me/${telegram}` });
  if (texts.email && /^[^\s@]+@[^\s@]+$/.test(texts.email.trim())) {
    links.push({ label: 'Email', href: `mailto:${texts.email.trim()}` });
  }
  if (!links.length && !texts.discord) return null;
  return (
    <ul className="links">
      {links.map((link) =>
        link.href ? (
          <li key={link.label}>
            <a href={link.href} target={link.href.startsWith('mailto:') ? undefined : '_blank'} rel="noreferrer">
              {link.label}
            </a>
          </li>
        ) : null,
      )}
      {texts.discord && <li>Discord · {texts.discord}</li>}
    </ul>
  );
}
