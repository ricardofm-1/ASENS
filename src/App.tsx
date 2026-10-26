import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { hexToAse1, shortAse1 } from '@asentum/connect';
import { CONTROLLER, EXPLORER, REGISTRY } from './config';
import { Header } from './components/Header';
import { ContractsPage } from './pages/ContractsPage';
import { ExplorerPage } from './pages/ExplorerPage';
import { Home } from './pages/Home';
import { MyNames } from './pages/MyNames';
import { NamePage } from './pages/NamePage';
import { syncNameIndex } from './lib/indexNames';
import { ProtocolProvider } from './protocol';

export default function App() {
  useEffect(() => {
    syncNameIndex().catch(() => undefined);
  }, []);

  return (
    <ProtocolProvider>
      <div className="app">
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/name/:name" element={<NamePage />} />
          <Route path="/explorer" element={<ExplorerPage />} />
          <Route path="/explorer/:query" element={<ExplorerPage />} />
          <Route path="/address/:addr" element={<AddressRedirect />} />
          <Route path="/my" element={<MyNames />} />
          <Route path="/contracts" element={<ContractsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Footer />
      </div>
    </ProtocolProvider>
  );
}

function Footer() {
  const registry = hexToAse1(REGISTRY);
  const controller = hexToAse1(CONTROLLER);
  return (
    <footer className="footer">
      <p>
        ASENS is the Asentum Name Service. Names live in the registry contract. Every registration payment is split on
        chain, half burned and half sent to the treasury.
      </p>
      <p>Built on Asentum, an independent community project, not official Asentum software.</p>
      <p className="footer-links">
        <Link to="/contracts">Contracts</Link>
        <a href={`${EXPLORER}/address/${registry}`} target="_blank" rel="noreferrer">
          Registry {shortAse1(registry)}
        </a>
        <a href={`${EXPLORER}/address/${controller}`} target="_blank" rel="noreferrer">
          Controller {shortAse1(controller)}
        </a>
        <a href={EXPLORER} target="_blank" rel="noreferrer">
          Explorer & faucet
        </a>
        <Link to="/my">My names</Link>
      </p>
    </footer>
  );
}

function AddressRedirect() {
  const { addr = '' } = useParams();
  return <Navigate to={`/explorer/${addr}`} replace />;
}

function NotFound() {
  return (
    <main className="page narrow">
      <h1>That page isn’t here.</h1>
      <Link className="btn" to="/">
        Search names
      </Link>
    </main>
  );
}
