import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ConnectButton, useBalance, useWallet } from '@asentum/connect';
import { EXPLORER } from '../config';
import { lookupPrimary } from '../lib/chain';
import { formatAse } from '../lib/names';
import { Logo } from './Logo';
import { SearchForm } from './SearchForm';

export function Header() {
  const { address, connected } = useWallet();
  const { balance } = useBalance();
  const [primary, setPrimary] = useState<string | null>(null);
  const onHome = useLocation().pathname === '/';

  useEffect(() => {
    if (!address) {
      setPrimary(null);
      return;
    }
    let cancel = false;
    const load = () => {
      lookupPrimary(address)
        .then((name) => {
          if (!cancel) setPrimary(name);
        })
        .catch(() => {
          if (!cancel) setPrimary(null);
        });
    };
    load();
    window.addEventListener('asens:names-changed', load);
    return () => {
      cancel = true;
      window.removeEventListener('asens:names-changed', load);
    };
  }, [address]);

  return (
    <header className="header">
      <NavLink to="/" className="brand" aria-label="ASENS home">
        <Logo className="logo" />
        <span className="word">
          ASENS
          <small>Asentum Name Service</small>
        </span>
      </NavLink>

      <nav className="nav">
        <NavLink to="/" end>
          Search
        </NavLink>
        <NavLink to="/my">My names</NavLink>
      </nav>

      {!onHome && <SearchForm variant="compact" />}

      <div className="header-end">
        <a className="net" href={EXPLORER} target="_blank" rel="noreferrer">
          Testnet
        </a>
        {connected && primary && (
          <NavLink className="primary-chip" to={`/name/${primary}`}>
            {primary}.ase
          </NavLink>
        )}
        {connected && balance && <span className="balance">{formatAse(balance, 2)} ASE</span>}
        <ConnectButton
          text="Connect"
          bg="#4b44e0"
          color="#ffffff"
          radius={12}
          style={{ padding: '10px 18px', fontWeight: 600, fontFamily: 'Outfit, sans-serif', fontSize: 14 }}
        />
      </div>
    </header>
  );
}
