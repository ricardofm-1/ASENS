import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toAse1 } from '@asentum/connect';
import { AddressLink } from '../components/AddressLink';
import { lookupPrimary } from '../lib/chain';
import { canonicalHex, errorMessage } from '../lib/names';

export function AddressPage() {
  const { addr = '' } = useParams();
  const hex = canonicalHex(decodeURIComponent(addr));
  const [primary, setPrimary] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Address — ASENS';
    if (!hex) return;
    let cancel = false;
    lookupPrimary(hex)
      .then((name) => {
        if (!cancel) setPrimary(name);
      })
      .catch((err: unknown) => {
        if (!cancel) setError(errorMessage(err));
      });
    return () => {
      cancel = true;
    };
  }, [hex]);

  if (!hex) {
    return (
      <main className="page narrow">
        <h1>That isn’t an Asentum address.</h1>
        <Link to="/">Back to search</Link>
      </main>
    );
  }

  const ase = toAse1(hex);

  return (
    <main className="page narrow">
      <p className="eyebrow">Address</p>
      <h1 className="address-title">
        <AddressLink address={ase} />
      </h1>
      {error && <p className="error">{error}</p>}
      {primary === undefined && !error && <p className="muted">Looking up the primary name…</p>}
      {primary === null && <p className="lede">This address has no primary name. Register one, then set it as primary.</p>}
      {primary && (
        <p className="lede">
          Primary name <Link to={`/name/${primary}`}>{primary}.ase</Link>
        </p>
      )}
      <Link className="btn" to="/">
        Search a name
      </Link>
    </main>
  );
}
