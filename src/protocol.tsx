import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getProtocol, type ProtocolInfo } from './lib/chain';

type ProtocolState = {
  info: ProtocolInfo | null;
  loading: boolean;
  error: string | null;
};

const ProtocolContext = createContext<ProtocolState>({ info: null, loading: true, error: null });

export function ProtocolProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProtocolState>({ info: null, loading: true, error: null });

  useEffect(() => {
    let cancel = false;
    getProtocol()
      .then((info) => {
        if (!cancel) setState({ info, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancel) setState({ info: null, loading: false, error: err instanceof Error ? err.message : 'Couldn’t load prices.' });
      });
    return () => {
      cancel = true;
    };
  }, []);

  return <ProtocolContext.Provider value={state}>{children}</ProtocolContext.Provider>;
}

export function useProtocol(): ProtocolState {
  return useContext(ProtocolContext);
}
