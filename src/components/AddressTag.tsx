import { Link } from 'react-router-dom';
import { shortAse1, toAse1 } from '@asentum/connect';
import { addressLabel, usePrimaryName } from '../lib/addressNames';
import { Suffix } from './Logo';

/** An address with its primary .ase name (or a known label) next to it. Links into the explorer. */
export function AddressTag({ address, full = false }: { address: string; full?: boolean }) {
  const ase = toAse1(address);
  const name = usePrimaryName(address);
  const label = addressLabel(address);

  return (
    <span className="addr-tag">
      <Link className="addr-tag-addr" to={`/explorer/${ase}`} title={ase}>
        {full ? ase : shortAse1(ase)}
      </Link>
      {name && (
        <Link className="addr-tag-name" to={`/name/${name}`}>
          {name}
          <Suffix />
        </Link>
      )}
      {label && <span className="addr-tag-label">{label}</span>}
    </span>
  );
}
