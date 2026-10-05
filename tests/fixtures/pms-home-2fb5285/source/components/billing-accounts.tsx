'use client';

export type BillingAccountSummary = {
  id: string;
  name: string;
  kind: 'company' | 'group';
  balance_minor: string;
  open_invoice_minor: string;
  unbilled_charges_minor: string;
  unallocated_receipts_minor: string;
  unposted_payment_count: number;
};

export function billingDollars(value: string): string {
  if (!/^-?\d+$/.test(value)) return 'Unavailable';
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? '-' : ''}$${(absolute / 100n).toLocaleString('en-US')}.${String(absolute % 100n).padStart(2, '0')}`;
}

type Props = {
  accounts: BillingAccountSummary[];
  busy: boolean;
  error?: string;
  hasMore: boolean;
  onRefresh: () => void;
  onMore: () => void;
  onOpen: (id: string) => void;
};

// Data and commands are supplied by the authorized property container.
// Not mounted in production until the billing rollout is complete.
export function BillingAccounts({accounts, busy, error, hasMore, onRefresh, onMore, onOpen}: Props) {
  return <section className="card" aria-busy={busy}>
    <div className="section-top">
      <h2>Company &amp; group billing</h2>
      <button className="secondary" disabled={busy} onClick={onRefresh}>Refresh accounts</button>
    </div>
    <p>Review balances and open invoices. A negative balance is an account credit.</p>
    {error && <p className="pilot-error" role="alert">{error}</p>}
    {busy && <p role="status">Loading billing accounts…</p>}
    {!busy && !error && accounts.length === 0 && <p>No billing accounts for this property.</p>}
    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem'}}>
      {accounts.map(account => <article className="pilot-settings" key={account.id}>
        <h3><button className="text-button" disabled={busy} onClick={() => onOpen(account.id)}>{account.name}</button></h3>
        <p>{account.kind === 'company' ? 'Company account' : 'Group account'}</p>
        <dl>
          <dt>Account balance</dt><dd><strong>{billingDollars(account.balance_minor)}</strong></dd>
          <dt>Open invoices</dt><dd>{billingDollars(account.open_invoice_minor)}</dd>
          <dt>Charges to invoice</dt><dd>{billingDollars(account.unbilled_charges_minor)}</dd>
          <dt>Payments to match</dt><dd>{billingDollars(account.unallocated_receipts_minor)}</dd>
        </dl>
        <p>{account.unposted_payment_count === 0 ? 'All recorded payments posted to ledger' : `${account.unposted_payment_count} payment entries need ledger posting`}</p>
      </article>)}
    </div>
    {hasMore && <button className="secondary" disabled={busy} onClick={onMore}>Load more accounts</button>}
  </section>;
}
