import { useEffect, useState } from 'react';
import { hexToAse1 } from '@asentum/connect';
import { AddressLink } from '../components/AddressLink';
import { CONTROLLER, EXPLORER, REGISTRY } from '../config';
import { useProtocol } from '../protocol';

const CONTRACTS: { name: string; summary: string; hex: string }[] = [
  {
    name: 'ASENS Registry',
    summary:
      'Stores names, owners, expiries, and profile records. This is the contract the site reads when it looks a name up.',
    hex: REGISTRY,
  },
  {
    name: 'ASENS Controller',
    summary:
      'Takes registration and renewal payments, holds the price list, and is the only address the registry accepts those updates from.',
    hex: CONTROLLER,
  },
];

export function ContractsPage() {
  const { info } = useProtocol();

  useEffect(() => {
    document.title = 'Contracts — ASENS';
  }, []);

  return (
    <main className="page">
      <p className="eyebrow">Contracts</p>
      <h1 className="explorer-title">Addresses you can check.</h1>
      <p className="lede">
        These are the Asentum testnet contracts this site uses. Each one is listed in full, in ase1 form and in 0x form.
        Either form opens on the testnet explorer.
      </p>
      <p className="disclaimer">Built on Asentum, an independent community project, not official Asentum software.</p>

      <div className="contract-list">
        {CONTRACTS.map((contract) => (
          <ContractCard key={contract.hex} name={contract.name} summary={contract.summary} hex={contract.hex} />
        ))}

        <section className="card" aria-labelledby="admin-powers">
          <h2 id="admin-powers">What the owner can and can’t do</h2>
          <p>
            The registry has no owner of its own. The address it treats as its controller may register a name that is
            free, and may extend an expiry. It cannot shorten an expiry. Only the wallet that owns a name can transfer
            it, change the address it points to, or edit its profile.
          </p>
          <p>The controller contract is that controller today, and it does have an owner. That owner can:</p>
          <ul className="powers">
            <li>
              Change the yearly price for each name length. The price has to stay above zero. The new price applies to
              registrations and renewals from then on.
            </li>
            <li>
              Change the treasury address. Half of each later payment is sent there. The burn address is fixed at
              0x000000000000000000000000000000000000dead, so the burned half cannot be redirected.
            </li>
            <li>
              Pause new registrations, and turn them back on. Renewals keep working during a pause. A pause does not
              freeze names or wallet balances.
            </li>
            <li>
              Hand control of the registry to another contract or wallet. The owner announces it first, can cancel it,
              and cannot complete it until 48 hours have passed. After the handover, this controller can no longer
              register or renew names. The registry still will not let the new controller transfer a name or edit its
              records. The payment rules live in this controller, so an address that receives control can register a
              free name or extend an expiry without paying.
            </li>
            <li>
              Pass ownership of this controller to another wallet. The new wallet has to accept. The current owner stays
              in place until then. There is no extra wait once the new wallet accepts.
            </li>
          </ul>
          <p>
            Every registration and renewal payment is split on chain in the same transaction: half is burned and half is
            sent to the treasury. Any wei left over from that split goes to the treasury. The controller has no withdraw
            function, and those payments do not stay in the contract.
          </p>
          <p>
            The owner cannot seize a name that is still registered, reassign it, or move ASE out of someone else’s
            wallet. A name can still be registered by someone else after it expires. The previous owner has 30 days to
            renew, and once that grace period ends the name is free for anyone who pays the current price.
          </p>
          {info && (
            <div className="sub">
              <h3>Owner and treasury right now</h3>
              <p className="muted">Read from the controller. Either address can change if the owner uses the powers above.</p>
              <dl className="rows">
                <div className="row">
                  <dt>Owner</dt>
                  <dd>
                    <AddressLink address={info.owner} />
                  </dd>
                </div>
                <div className="row">
                  <dt>Treasury</dt>
                  <dd>
                    <AddressLink address={info.treasury} />
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ContractCard({ name, summary, hex }: { name: string; summary: string; hex: string }) {
  const ase = hexToAse1(hex);
  return (
    <article className="card">
      <h2>{name}</h2>
      <p className="muted">{summary}</p>
      <dl className="rows">
        <div className="row">
          <dt>ase1</dt>
          <dd>
            <AddressValue href={`${EXPLORER}/address/${ase}`} value={ase} label={`${name} ase1 address`} />
          </dd>
        </div>
        <div className="row">
          <dt>0x</dt>
          <dd>
            <AddressValue href={`${EXPLORER}/address/${hex}`} value={hex} label={`${name} 0x address`} />
          </dd>
        </div>
      </dl>
    </article>
  );
}

async function writeClipboard(value: string): Promise<boolean> {
  try {
    window.focus();
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.focus();
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function AddressValue({ href, value, label }: { href: string; value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const ok = await writeClipboard(value);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <span className="addr-line">
      <a href={href} target="_blank" rel="noreferrer">
        {value}
      </a>
      <button type="button" className="text-btn" aria-label={`Copy ${label}`} onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}
