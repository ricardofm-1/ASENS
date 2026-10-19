import { useEffect, useState } from 'react';
import { CONTROLLER, REGISTRY } from '../config';
import { lookupPrimary } from './chain';
import { canonicalHex } from './names';

const BURN = '0x000000000000000000000000000000000000dead';

const LABELS: Record<string, string> = {
  [REGISTRY]: 'ASENS Registry',
  [CONTROLLER]: 'ASENS Controller',
  [BURN]: 'Burn address',
};

export function addressLabel(address: string): string | null {
  const hex = canonicalHex(address);
  return hex ? LABELS[hex] ?? null : null;
}

const cache = new Map<string, Promise<string | null>>();

/** The address's primary .ase name, or null. Cached for the session. */
export function primaryNameOf(address: string): Promise<string | null> {
  const hex = canonicalHex(address);
  if (!hex) return Promise.resolve(null);
  let pending = cache.get(hex);
  if (!pending) {
    pending = lookupPrimary(hex).catch(() => {
      cache.delete(hex);
      return null;
    });
    cache.set(hex, pending);
  }
  return pending;
}

export function usePrimaryName(address: string): string | null | undefined {
  const [name, setName] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancel = false;
    setName(undefined);
    primaryNameOf(address).then((value) => {
      if (!cancel) setName(value);
    });
    return () => {
      cancel = true;
    };
  }, [address]);
  return name;
}
