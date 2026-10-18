import { decodeLogData } from './logs';

export type ChainLog = {
  data: string;
  blockNumber: string;
  logIndex: string;
};

export type NameIndex = {
  nextBlock: number;
  names: string[];
  owners: Record<string, string>;
  textKeys: Record<string, string[]>;
};

export function applyLog(index: NameIndex, data: string) {
  const obj = decodeLogData(data);
  if (!obj || typeof obj.name !== 'string') return;
  const name = obj.name;
  if (!index.names.includes(name)) index.names.push(name);
  if (typeof obj.to === 'string' && typeof obj.from === 'string') {
    index.owners[name] = obj.to.toLowerCase();
  } else if (typeof obj.owner === 'string') {
    index.owners[name] = obj.owner.toLowerCase();
  }
  if (typeof obj.key === 'string' && obj.key) {
    const keys = new Set(index.textKeys[name] ?? []);
    keys.add(obj.key);
    index.textKeys[name] = [...keys];
  }
}
