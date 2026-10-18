import { ase1ToHex, isAse1, toAse1 } from '@asentum/connect';
import { ASE, GRACE_SECONDS, MAX_YEARS } from '../config';

export type NameRecord = {
  name: string;
  available: boolean;
  owner?: string;
  expiry?: number;
  addr?: string;
};

export type NameStatus = 'available' | 'active' | 'grace' | 'expired';

export type SearchQuery =
  | { kind: 'name'; name: string }
  | { kind: 'address'; hex: string }
  | { kind: 'invalid'; error: string };

export function canonicalHex(address?: string | null): string | null {
  if (!address) return null;
  const trimmed = address.trim();
  const fromAse = ase1ToHex(trimmed);
  if (fromAse) return fromAse.toLowerCase();
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

export function sameAddress(a?: string | null, b?: string | null): boolean {
  const left = canonicalHex(a);
  const right = canonicalHex(b);
  return !!left && left === right;
}

export function displayAddress(address?: string | null): string {
  if (!address) return '';
  return toAse1(address);
}

/** Controller naming rules: a-z, 0-9, single hyphens, 3–32 characters. */
export function normalizeName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  let name = raw.trim().toLowerCase();
  if (name.endsWith('.ase')) name = name.slice(0, -4);
  if (!name) return { ok: false, error: 'Enter a name.' };
  if (name.length < 3 || name.length > 32) return { ok: false, error: 'Names must be 3–32 characters.' };
  if (!/^[a-z0-9-]+$/.test(name)) return { ok: false, error: 'Use only letters, numbers, and hyphens.' };
  if (name.startsWith('-') || name.endsWith('-')) return { ok: false, error: 'A name can’t start or end with a hyphen.' };
  if (name.includes('--')) return { ok: false, error: 'A name can’t contain a double hyphen.' };
  return { ok: true, name };
}

export function parseSearch(raw: string): SearchQuery {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'invalid', error: 'Enter a name or an address.' };
  if (isAse1(trimmed) || /^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    const hex = canonicalHex(trimmed);
    if (!hex) return { kind: 'invalid', error: 'That address isn’t valid.' };
    return { kind: 'address', hex };
  }
  const name = normalizeName(trimmed);
  if (!name.ok) return { kind: 'invalid', error: name.error };
  return { kind: 'name', name: name.name };
}

export function asNameRecord(raw: unknown): NameRecord {
  const rec = (raw ?? {}) as {
    name?: unknown;
    available?: unknown;
    owner?: unknown;
    expiry?: unknown;
    addr?: unknown;
  };
  const expiry = rec.expiry == null || rec.expiry === '' ? undefined : Number(rec.expiry);
  return {
    name: String(rec.name ?? ''),
    available: Boolean(rec.available),
    owner: rec.owner ? String(rec.owner).toLowerCase() : undefined,
    expiry: expiry && Number.isFinite(expiry) ? expiry : undefined,
    addr: rec.addr ? String(rec.addr).toLowerCase() : undefined,
  };
}

export function nameStatus(rec: NameRecord | null, now = Math.floor(Date.now() / 1000)): NameStatus {
  if (!rec?.owner || !rec.expiry) return 'available';
  if (rec.expiry > now) return 'active';
  if (rec.expiry + GRACE_SECONDS >= now) return 'grace';
  return 'expired';
}

export function canRegister(status: NameStatus): boolean {
  return status === 'available' || status === 'expired';
}

export function canRenew(status: NameStatus): boolean {
  return status === 'active' || status === 'grace';
}

export function tierOf(name: string): number {
  return Math.min(name.length, 7);
}

export function formatAse(wei: string | bigint | number, maxFrac = 4): string {
  const n = typeof wei === 'bigint' ? wei : BigInt(wei);
  const neg = n < 0n;
  const v = neg ? -n : n;
  const whole = v / ASE;
  const frac = v % ASE;
  const sign = neg ? '-' : '';
  if (frac === 0n || maxFrac <= 0) return `${sign}${whole.toString()}`;
  const digits = frac.toString().padStart(18, '0').slice(0, maxFrac).replace(/0+$/, '');
  return digits ? `${sign}${whole.toString()}.${digits}` : `${sign}${whole.toString()}`;
}

/** Matches the controller: 50% burned, the remainder to the treasury. */
export function feeSplit(wei: string): { burned: bigint; treasury: bigint } {
  const amount = BigInt(wei);
  const burned = (amount * 5000n) / 10000n;
  return { burned, treasury: amount - burned };
}

export function formatWhen(unix: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(unix * 1000);
}

export function relativeTime(unix: number, now = Date.now()): string {
  const delta = unix * 1000 - now;
  const past = delta < 0;
  const abs = Math.abs(delta);
  const minutes = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  let span: string;
  if (minutes < 90) span = `${Math.max(minutes, 1)} min`;
  else if (hours < 48) span = `${hours} hours`;
  else if (days < 60) span = `${days} days`;
  else if (days < 730) span = `${Math.round(days / 30.44)} months`;
  else span = `${(days / 365).toFixed(1)} years`;
  return past ? `${span} ago` : `in ${span}`;
}

export function errorMessage(err: unknown): string {
  const msg = (() => {
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object') {
      const e = err as { message?: string; reason?: string };
      return e.reason || e.message || '';
    }
    return '';
  })().replace(/^Error:\s*/, '').trim();
  if (!msg) return 'Something went wrong.';
  if (/reject|denied|cancel|user disapproved|closed/i.test(msg)) return 'You declined the request in the wallet.';
  return msg;
}

export function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
  } catch {
    return null;
  }
  return null;
}

export function clampYears(years: number): number {
  if (!Number.isInteger(years)) return 1;
  return Math.min(MAX_YEARS, Math.max(1, years));
}

const REMEMBER = 'asens.remembered.v1';
const RECENT = 'asens.recent.v1';

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeList(key: string, values: string[]) {
  localStorage.setItem(key, JSON.stringify(values));
}

export function rememberedNames(): string[] {
  return readList(REMEMBER);
}

export function rememberName(name: string) {
  const next = [name, ...rememberedNames().filter((item) => item !== name)].slice(0, 40);
  writeList(REMEMBER, next);
  window.dispatchEvent(new Event('asens:names-changed'));
}

export function recentSearches(): string[] {
  return readList(RECENT);
}

export function rememberSearch(name: string) {
  writeList(RECENT, [name, ...recentSearches().filter((item) => item !== name)].slice(0, 6));
}

export function notifyNamesChanged() {
  window.dispatchEvent(new Event('asens:names-changed'));
}
