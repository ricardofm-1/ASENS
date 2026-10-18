import { CONTROLLER, INDEX_FLOOR, REGISTRY, RPC } from '../config';
import { applyLog, type ChainLog, type NameIndex } from './logApply';

export type { NameIndex } from './logApply';

export type IndexProgress = {
  scanned: number;
  total: number;
  done: boolean;
};

const STORAGE_KEY = 'asens.index.v2';

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

async function logsFor(
  address: string,
  from: number,
  to: number,
  depth = 0,
  maxDepth = 1,
  timeoutMs = 25000,
): Promise<ChainLog[]> {
  const filter = { fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, address };
  try {
    return await rpc<ChainLog[]>('eth_getLogs', [filter], timeoutMs);
  } catch (err) {
    if (to <= from || depth >= maxDepth) throw err;
    const mid = from + Math.floor((to - from) / 2);
    const left = await logsFor(address, from, mid, depth + 1, maxDepth, timeoutMs);
    const right = await logsFor(address, mid + 1, to, depth + 1, maxDepth, timeoutMs);
    return [...left, ...right];
  }
}

function byOrder(a: ChainLog, b: ChainLog): number {
  const byBlock = parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16);
  if (byBlock) return byBlock;
  return parseInt(a.logIndex, 16) - parseInt(b.logIndex, 16);
}

async function run(): Promise<NameIndex> {
  const head = parseInt(await rpc<string>('eth_blockNumber', []), 16);
  const floor = Math.min(INDEX_FLOOR, head);
  let index = loadIndex();
  if (!index || index.nextBlock > head + 1 || index.nextBlock < floor) index = emptyIndex(floor);
  const start = index.nextBlock;
  if (start > head) {
    progress = { scanned: 1, total: 1, done: true };
    emit();
    return index;
  }

  progress = { scanned: 0, total: head - start + 1, done: false };
  emit();

  // Mints are emitted by the controller. Names are then re-read from the registry,
  // so a later transfer still shows the current owner.
  const minted = await logsFor(CONTROLLER, start, head, 0, 1);
  minted.sort(byOrder).forEach((log) => applyLog(index, log.data));
  progress = { scanned: Math.ceil((head - start + 1) / 2), total: head - start + 1, done: false };
  emit();

  try {
    const registry = await logsFor(REGISTRY, start, head, 0, 0, 8000);
    registry.sort(byOrder).forEach((log) => applyLog(index, log.data));
  } catch {
    // Registry history is optional. Ownership is confirmed with getName.
  }

  index.nextBlock = head + 1;
  saveIndex(index);
  progress = { scanned: head - start + 1, total: head - start + 1, done: true };
  emit();
  return index;
}

export function syncNameIndex(): Promise<NameIndex> {
  if (!inflight) {
    inflight = run().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}
