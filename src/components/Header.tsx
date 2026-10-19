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
  const { pathname } = useLocation();
  const showSearch = pathname !== '/' && !pathname.startsWith('/explorer');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    const wide = window.matchMedia('(min-width: 761px)');
    const onWide = () => wide.matches && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    wide.addEventListener('change', onWide);
    document.body.classList.add('menu-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      wide.removeEventListener('change', onWide);
      document.body.classList.remove('menu-open');
    };
  }, [menuOpen]);

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

  const links = (
    <>
      <NavLink to="/" end>
        Search
      </NavLink>
      <NavLink to="/my">My names</NavLink>
      <NavLink to="/explorer">Explorer</NavLink>
    </>
  );

  return (
    <header className="header">
      <NavLink to="/" className="brand" aria-label="ASENS home">
        <Logo className="logo" />
        <span className="word">
          ASENS
          <small>Asentum Name Service</small>
        </span>
      </NavLink>

      <nav className="nav">{links}</nav>

      {showSearch && <SearchForm variant="compact" />}

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
        <button
          type="button"
          className={`burger${menuOpen ? ' open' : ''}`}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {menuOpen && <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />}
      <div id="mobile-menu" className={`mobile-menu${menuOpen ? ' open' : ''}`} hidden={!menuOpen}>
        {pathname !== '/' && <SearchForm variant="compact" onSearch={() => setMenuOpen(false)} />}
        <nav className="mobile-nav">{links}</nav>
        {connected && (primary || balance) && (
          <div className="mobile-account">
            {primary && (
              <NavLink className="primary-chip" to={`/name/${primary}`}>
                {primary}.ase
              </NavLink>
            )}
            {balance && <span className="mobile-balance">{formatAse(balance, 2)} ASE</span>}
          </div>
        )}
        <a className="net" href={EXPLORER} target="_blank" rel="noreferrer">
          Asentum testnet · Explorer & faucet
        </a>
      </div>
    </header>
  );
}
