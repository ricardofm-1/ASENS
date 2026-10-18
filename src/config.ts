/** Asentum testnet. Writes are signed by the Asentum wallet, not MetaMask. */
export const RPC = 'https://testnet.asentum.com';

export const EXPLORER = 'https://explorer.asentum.com';

export const REGISTRY = '0x81f34ec12752ea464ec5bc6d879ac134ec481857';
export const CONTROLLER = '0xc11320f6b10bb91a5ab00da54da6c35be39bbfab';

/** First block worth scanning. Both contracts were deployed after this on testnet. */
export const INDEX_FLOOR = 535_400;

export const GRACE_SECONDS = 30 * 24 * 60 * 60;
export const MAX_YEARS = 10;
export const ASE = 10n ** 18n;

export const TEXT_FIELDS: { key: string; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: 'description', label: 'Description', placeholder: 'A line about you', multiline: true },
  { key: 'url', label: 'Website', placeholder: 'https://' },
  { key: 'avatar', label: 'Avatar URL', placeholder: 'https://…/photo.png' },
  { key: 'email', label: 'Email', placeholder: 'you@example.com' },
  { key: 'x', label: 'X', placeholder: 'handle' },
  { key: 'github', label: 'GitHub', placeholder: 'username' },
  { key: 'telegram', label: 'Telegram', placeholder: 'username' },
  { key: 'discord', label: 'Discord', placeholder: 'name' },
];

export const TIERS: { tier: string; label: string }[] = [
  { tier: '3', label: '3 letters' },
  { tier: '4', label: '4 letters' },
  { tier: '5', label: '5 letters' },
  { tier: '6', label: '6 letters' },
  { tier: '7', label: '7+ letters' },
];
