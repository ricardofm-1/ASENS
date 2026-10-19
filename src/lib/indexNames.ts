import { CONTROLLER, INDEX_FLOOR, RPC } from '../config';
import { applyLog, type ChainLog, type NameIndex } from './logApply';

export type { NameIndex } from './logApply';

export type IndexProgress = {
  scanned: number;
  total: number;
  done: boolean;
};

const STORAGE_KEY = 'asens.index.v3';

const listeners = new Set<(progress: IndexProgress) => void>();
let progress: IndexProgress = { scanned: 0, total: 0, done: false };
let inflight: Promise<NameIndex> | null = null;

function emit() {
  for (const listener of listeners) listener(progress);
}

export function subscribeIndex(listener: (progress: IndexProgress) => void): () => void {
  listeners.add(listener);
  listener(progress);
  return () => listeners.delete(listener);
}

function emptyIndex(start: number): NameIndex {
  return { nextBlock: start, names: [], owners: {}, textKeys: {} };
}

function loadIndex(): NameIndex | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NameIndex;
    if (!parsed || typeof parsed.nextBlock !== 'number') return null;
    parsed.owners ??= {};
    parsed.textKeys ??= {};
    parsed.names ??= Object.keys(parsed.owners);
    return parsed;
  } catch {
    return null;
  }
}

function saveIndex(index: NameIndex) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(index));
  } catch {
    // The in-memory index still works for this visit.
  }
}

async function rpc<T>(method: string, params: unknown[], timeoutMs = 25000): Promise<T> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`The chain didn’t answer (HTTP ${res.status}).`);
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || 'The chain rejected the request.');
  return body.result as T;
}

// The node's eth_getLogs costs about 0.1s per block, so only short ranges after
// the published snapshot are scanned here, in chunks that are saved as they finish.
const CHUNK = 100;
const MAX_TAIL = 1500;

type Snapshot = { block: number; names: string[]; textKeys?: Record<string, string[]> };

function byOrder(a: ChainLog, b: ChainLog): number {
  const byBlock = parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16);
  if (byBlock) return byBlock;
  return parseInt(a.logIndex, 16) - parseInt(b.logIndex, 16);
}

async function fetchSnapshot(): Promise<Snapshot | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}names.json`, { cache: 'no-cache', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const snap = (await res.json()) as Snapshot;
    return Number.isInteger(snap.block) && Array.isArray(snap.names) ? snap : null;
  } catch {
    return null;
  }
}

function merge(index: NameIndex, snap: Snapshot) {
  for (const name of snap.names) if (!index.names.includes(name)) index.names.push(name);
  for (const [name, keys] of Object.entries(snap.textKeys ?? {})) {
    index.textKeys[name] = [...new Set([...(index.textKeys[name] ?? []), ...keys])];
  }
  index.nextBlock = Math.max(index.nextBlock, snap.block + 1);
}

let base: Promise<NameIndex> | null = null;

/** Cached names plus the published snapshot. Fast; never scans the chain. */
export function baseNameIndex(): Promise<NameIndex> {
  base ??= (async () => {
    const index = loadIndex() ?? emptyIndex(INDEX_FLOOR);
    const snap = await fetchSnapshot();
    if (snap) merge(index, snap);
    saveIndex(index);
    return index;
  })();
  return base;
}

async function run(): Promise<NameIndex> {
  const index = await baseNameIndex();
  let head: number;
  try {
    head = parseInt(await rpc<string>('eth_blockNumber', [], 10000), 16);
  } catch {
    progress = { scanned: 0, total: 0, done: true };
    emit();
    return index;
  }
  const start = index.nextBlock;
  const total = head - start + 1;
  if (total <= 0 || total > MAX_TAIL) {
    progress = { scanned: 0, total: 0, done: true };
    emit();
    return index;
  }

  progress = { scanned: 0, total, done: false };
  emit();
  for (let from = start; from <= head; from += CHUNK) {
    const to = Math.min(head, from + CHUNK - 1);
    const filter = { fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, address: CONTROLLER };
    try {
      const logs = await rpc<ChainLog[]>('eth_getLogs', [filter], 25000);
      logs.sort(byOrder).forEach((log) => applyLog(index, log.data));
    } catch {
      break;
    }
    index.nextBlock = to + 1;
    saveIndex(index);
    progress = { scanned: to - start + 1, total, done: false };
    emit();
  }
  progress = { scanned: total, total, done: true };
  emit();
  return index;
}

/** The base index, then any names minted in blocks newer than it. Never rejects. */
export function syncNameIndex(): Promise<NameIndex> {
  if (!inflight) {
    inflight = run().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Calls back with the fast base names, then again if the chain scan found more. */
export function watchNameIndex(callback: (names: string[]) => void): () => void {
  let cancel = false;
  let seen = -1;
  const deliver = (index: NameIndex) => {
    if (cancel || index.names.length === seen) return;
    seen = index.names.length;
    callback([...index.names]);
  };
  baseNameIndex().then(deliver, () => deliver(emptyIndex(0)));
  syncNameIndex().then(deliver, () => undefined);
  return () => {
    cancel = true;
  };
}
