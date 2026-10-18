import type { NameStatus } from '../lib/names';

const LABEL: Record<NameStatus, [string, string]> = {
  available: ['Available', 'live'],
  active: ['Registered', 'ok'],
  grace: ['Grace period', 'warn'],
  expired: ['Expired', 'bad'],
};

export function StatusBadge({ status }: { status: NameStatus }) {
  const [label, kind] = LABEL[status];
  return <span className={`badge ${kind}`}>{label}</span>;
}
