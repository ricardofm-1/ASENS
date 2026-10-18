import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AsentumProvider } from '@asentum/connect';
import App from './App';
import { RPC } from './config';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AsentumProvider rpc={RPC} dappName="ASENS" telegramBot="AsentumBot">
        <App />
      </AsentumProvider>
    </BrowserRouter>
  </StrictMode>,
);
