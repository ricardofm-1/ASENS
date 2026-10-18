import { useState } from 'react';
import { shortAse1, toAse1 } from '@asentum/connect';
import { EXPLORER } from '../config';

export function AddressLink({ address, short = false }: { address: string; short?: boolean }) {
  const ase = toAse1(address);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(ase);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className="addr-line">
      <a href={`${EXPLORER}/address/${ase}`} target="_blank" rel="noreferrer">
        {short ? shortAse1(ase) : ase}
      </a>
      <button type="button" className="text-btn" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}

export function TxLink({ hash }: { hash: string }) {
  return (
    <a className="tx-link" href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">
      View transaction
    </a>
  );
}
