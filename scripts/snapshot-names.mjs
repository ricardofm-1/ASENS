// Builds public/names.json from the Asentum explorer indexer, which browsers can't
// call directly (no CORS). The site loads the file and only scans newer blocks itself.
import { mkdir, writeFile } from 'node:fs/promises';

const RPC = 'https://testnet.asentum.com';
const INDEXER = 'https://explorer.asentum.com/api/indexer';
const REGISTRY = '0x81f34ec12752ea464ec5bc6d879ac134ec481857';
const CONTROLLER = '0xc11320f6b10bb91a5ab00da54da6c35be39bbfab';
const OUT = new URL('../public/names.json', import.meta.url);

async function getJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);
  return res.json();
}

async function rpc(method, params) {
  const body = await getJson(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

async function txsTo(address) {
  const rows = [];
  for (let page = 1; ; page += 1) {
    const data = await getJson(`${INDEXER}/address/${address}/txs?page=${page}&size=100`);
    rows.push(...data.rows);
    if (!data.rows.length || rows.length >= data.total) break;
  }
  return rows.filter((row) => row.status === 1 && row.to_addr?.toLowerCase() === address);
}

async function callArgs(hash) {
  const tx = await rpc('eth_getTransactionByHash', [hash]);
  const hex = tx?.input?.replace(/^0x/, '') ?? '';
  try {
    const call = JSON.parse(Buffer.from(hex, 'hex').toString('utf8'));
    return Array.isArray(call.args) ? call.args : [];
  } catch {
    return [];
  }
}

const normalize = (raw) => (typeof raw === 'string' ? raw.trim().toLowerCase().replace(/\.ase$/, '') : '');

const { lastIndexedBlock } = await getJson(`${INDEXER}/health`);
if (!Number.isInteger(lastIndexedBlock)) throw new Error('The indexer did not report its last indexed block.');

const [registers, registryTxs] = await Promise.all([txsTo(CONTROLLER), txsTo(REGISTRY)]);
const names = new Set();
const textKeys = {};

for (const row of registers.filter((row) => row.method === 'register')) {
  const name = normalize((await callArgs(row.hash))[0]);
  if (name) names.add(name);
}
for (const row of registryTxs.filter((row) => row.method === 'setText')) {
  const [rawName, key] = await callArgs(row.hash);
  const name = normalize(rawName);
  if (!name || typeof key !== 'string' || !key) continue;
  textKeys[name] = [...new Set([...(textKeys[name] ?? []), key])];
}

const snapshot = { block: lastIndexedBlock, names: [...names].sort(), textKeys };
await mkdir(new URL('.', OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`names.json: ${snapshot.names.length} names up to block ${snapshot.block}`);
