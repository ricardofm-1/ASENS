import { ase1ArgsToHex, ase1ToHex } from '@asentum/connect';
import { CONTROLLER, REGISTRY, RPC } from '../config';
import { asNameRecord, type NameRecord } from './names';

type ViewBody = {
  ok?: boolean;
  returnValue?: unknown;
  reason?: string;
};

export async function view<T>(contract: string, method: string, args: unknown[] = []): Promise<T> {
  const res = await fetch(`${RPC}/view`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contract: ase1ToHex(contract) ?? contract,
      method,
      args: ase1ArgsToHex(args),
    }),
  });
  if (!res.ok) throw new Error(`Couldn’t read ${method} (HTTP ${res.status}).`);
  const body = (await res.json()) as ViewBody;
  if (!body.ok) throw new Error(body.reason || `${method} failed.`);
  return body.returnValue as T;
}

export function getName(name: string): Promise<NameRecord> {
  return view<unknown>(REGISTRY, 'getName', [name]).then(asNameRecord);
}

export function resolveName(name: string): Promise<string | null> {
  return view<string | null>(REGISTRY, 'resolve', [name]);
}

export function lookupPrimary(address: string): Promise<string | null> {
  return view<string | null>(REGISTRY, 'lookup', [address]);
}

export function quote(name: string, years: number): Promise<string> {
  return view<string | number | bigint>(CONTROLLER, 'quote', [name, years]).then((value) => String(value));
}

export type ProtocolInfo = {
  paused: boolean;
  prices: Record<string, string>;
  treasury: string;
  owner: string;
};

export async function getProtocol(): Promise<ProtocolInfo> {
  const info = await view<{
    paused?: boolean;
    prices?: Record<string, string | number | bigint>;
    treasury?: string;
    owner?: string;
  }>(CONTROLLER, 'info', []);
  const prices: Record<string, string> = {};
  for (const [tier, price] of Object.entries(info.prices ?? {})) prices[tier] = String(price);
  return {
    paused: Boolean(info.paused),
    prices,
    treasury: String(info.treasury ?? ''),
    owner: String(info.owner ?? ''),
  };
}

export async function readTexts(name: string, keys: string[]): Promise<Record<string, string>> {
  const pairs = await Promise.all(
    keys.map(async (key) => {
      const value = await view<string | null>(REGISTRY, 'text', [name, key]);
      return [key, value ? String(value) : ''] as const;
    }),
  );
  return Object.fromEntries(pairs);
}
