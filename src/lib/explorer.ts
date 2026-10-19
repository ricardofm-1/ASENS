import { isAse1 } from '@asentum/connect';
import { RPC } from '../config';
import { canonicalHex, normalizeName } from './names';

export type ExplorerQuery =
  | { kind: 'tx'; hash: string }
  | { kind: 'address'; hex: string }
  | { kind: 'name'; name: string }
  | { kind: 'invalid'; error: string };

export function detectQuery(raw: string): ExplorerQuery {
  const value = raw.trim();
  if (!value) return { kind: 'invalid', error: 'Enter a transaction hash, an address, or a .ase name.' };
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) return { kind: 'tx', hash: value.toLowerCase() };
  if (isAse1(value) || /^0x[0-9a-fA-F]{40}$/.test(value)) {
    const hex = canonicalHex(value);
    if (hex) return { kind: 'address', hex };
  }
  if (/^0x[0-9a-fA-F]*$/i.test(value)) {
    return { kind: 'invalid', error: 'Transaction hashes are 0x plus 64 hex characters; addresses are 0x plus 40.' };
  }
  const name = normalizeName(value);
  if (name.ok) return { kind: 'name', name: name.name };
  return { kind: 'invalid', error: 'That isn’t a transaction hash, an ase1 or 0x address, or a valid .ase name.' };
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`The chain didn’t answer (HTTP ${res.status}).`);
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || 'The chain rejected the request.');
  return body.result as T;
}

type RpcTx = {
  hash: string;
  blockNumber: string | null;
  from: string;
  to: string | null;
  value: string;
  gas?: string;
  gasPrice?: string;
  nonce?: string;
  input?: string;
};

type NodeReceipt = {
  success?: boolean;
  gasUsed?: string;
  kind?: string;
  recipient?: string | null;
  contractAddress?: string | null;
  events?: { name: string; data: Record<string, unknown> }[];
  returnValue?: unknown;
};

export type TxEvent = { name: string; contract?: string; data: Record<string, unknown> };

export type TxDetails = {
  hash: string;
  pending: boolean;
  success: boolean | null;
  block: number | null;
  timestamp: number | null;
  from: string;
  to: string | null;
  contractCreated: string | null;
  value: bigint;
  fee: bigint | null;
  gasUsed: number | null;
  nonce: number | null;
  method: string | null;
  args: unknown[];
  events: TxEvent[];
  addresses: string[];
};

function hexNum(value?: string | null): number | null {
  if (value == null) return null;
  const n = Number.parseInt(value, 16);
  return Number.isFinite(n) ? n : null;
}

/** Block timestamps come back in milliseconds on Asentum testnet; normalise to seconds. */
function toSeconds(raw: number): number {
  return raw > 1e12 ? Math.floor(raw / 1000) : raw;
}

function decodeJsonHex(hex?: string): unknown {
  if (!hex || hex === '0x') return null;
  try {
    const clean = hex.slice(2);
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** Every 20-byte address mentioned anywhere in a value, as lowercase hex. */
export function collectAddresses(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    const hex = canonicalHex(value);
    if (hex) into.add(hex);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectAddresses(item, into));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectAddresses(item, into));
  }
  return into;
}

export async function getTxDetails(hash: string): Promise<TxDetails | null> {
  const tx = await rpc<RpcTx | null>('eth_getTransactionByHash', [hash]);
  if (!tx) return null;

  const [receipt, block] = await Promise.all([
    fetch(`${RPC}/receipts/${hash}`)
      .then((res) => (res.ok ? (res.json() as Promise<NodeReceipt>) : null))
      .catch(() => null),
    tx.blockNumber
      ? rpc<{ timestamp?: string } | null>('eth_getBlockByNumber', [tx.blockNumber, false]).catch(() => null)
      : Promise.resolve(null),
  ]);

  const call = decodeJsonHex(tx.input) as { method?: unknown; args?: unknown } | null;
  const method = call && typeof call.method === 'string' ? call.method : null;
  const args = call && Array.isArray(call.args) ? call.args : [];
  const gasUsed = receipt?.gasUsed != null ? Number(receipt.gasUsed) : null;
  const gasPrice = tx.gasPrice ? BigInt(tx.gasPrice) : null;
  const events: TxEvent[] = (receipt?.events ?? []).map((event) => ({ name: event.name, data: event.data ?? {} }));
  const to = tx.to ? canonicalHex(tx.to) ?? tx.to : null;
  const from = canonicalHex(tx.from) ?? tx.from;
  const contractCreated = receipt?.contractAddress ? canonicalHex(receipt.contractAddress) : null;
  const ts = block?.timestamp ? hexNum(block.timestamp) : null;

  const addresses = new Set<string>();
  [from, to, contractCreated].forEach((addr) => addr && collectAddresses(addr, addresses));
  collectAddresses(args, addresses);
  events.forEach((event) => collectAddresses(event.data, addresses));

  return {
    hash: tx.hash,
    pending: !tx.blockNumber,
    success: receipt ? receipt.success !== false : null,
    block: hexNum(tx.blockNumber),
    timestamp: ts ? toSeconds(ts) : null,
    from,
    to,
    contractCreated,
    value: BigInt(tx.value || '0x0'),
    fee: gasUsed != null && gasPrice != null ? BigInt(gasUsed) * gasPrice : null,
    gasUsed,
    nonce: hexNum(tx.nonce),
    method,
    args,
    events,
    addresses: [...addresses],
  };
}

export type AddressDetails = {
  hex: string;
  balance: bigint;
  nonce: number;
  isContract: boolean;
};

export async function getAddressDetails(hex: string): Promise<AddressDetails> {
  const [balance, code] = await Promise.all([
    fetch(`${RPC}/balance/${hex}`).then(async (res) => {
      if (!res.ok) throw new Error(`Couldn’t read the balance (HTTP ${res.status}).`);
      return (await res.json()) as { balance?: string; nonce?: string };
    }),
    rpc<string | null>('eth_getCode', [hex, 'latest']).catch(() => null),
  ]);
  return {
    hex,
    balance: BigInt(balance.balance ?? '0'),
    nonce: Number(balance.nonce ?? 0),
    isContract: !!code && code !== '0x' && code !== '0x0',
  };
}
