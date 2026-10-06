'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SubmitEvent } from 'react';
import { hotelClient } from '@/lib/pilot';

type Message = { id: string; author_kind: 'property' | 'support'; body: string; created_at: string };
type Ticket = {
  id: string;
  category: string;
  subject: string;
  details: string;
  status: 'open' | 'in_progress' | 'waiting_on_property' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
  messages: Message[];
};
type TicketPage = { tenant_id: string; property_id: string; tickets: Ticket[] };
type PendingRequest = { request: string; message: string; category: string; subject: string; details: string };

const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);

function ticketPage(value: unknown, tenant: string, property: string): TicketPage {
  const page = value as TicketPage;
  if (!page || page.tenant_id !== tenant || page.property_id !== property || !Array.isArray(page.tickets) || page.tickets.length > 50) {
    throw Error('The support list could not be verified. Refresh and try again.');
  }
  for (const ticket of page.tickets) {
    if (
      !ticket || !uuid(ticket.id) || !['account', 'reservation', 'payments', 'rooms', 'connections', 'other'].includes(ticket.category) ||
      typeof ticket.subject !== 'string' || ticket.subject.length < 4 || ticket.subject.length > 160 ||
      typeof ticket.details !== 'string' || ticket.details.length > 4000 ||
      !['open', 'in_progress', 'waiting_on_property', 'resolved', 'closed'].includes(ticket.status) ||
      !Number.isFinite(Date.parse(ticket.created_at)) || !Number.isFinite(Date.parse(ticket.updated_at)) ||
      !Array.isArray(ticket.messages) || ticket.messages.length > 100
    ) throw Error('A support request could not be verified. Refresh and try again.');
    for (const message of ticket.messages) {
      if (!message || !uuid(message.id) || !['property', 'support'].includes(message.author_kind) ||
        typeof message.body !== 'string' || message.body.length > 4000 || !Number.isFinite(Date.parse(message.created_at))) {
        throw Error('A support response could not be verified. Refresh and try again.');
      }
    }
  }
  return page;
}

const statusLabel = (status: Ticket['status']) => ({
  open: 'Open',
  in_progress: 'In progress',
  waiting_on_property: 'Waiting on you',
  resolved: 'Resolved',
  closed: 'Closed',
}[status]);

export function SupportTickets({ actor, tenant, property }: { actor: string; tenant: string; property: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [category, setCategory] = useState('other');
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const pending = useRef<PendingRequest | null>(null);
  const active = useRef(true);
  const working = useRef(false);

  const verifyActor = useCallback(async () => {
    const { data, error: authError } = await hotelClient().auth.getSession();
    if (authError || data.session?.user?.id !== actor) {
      throw Error('Your sign-in changed. Reopen Help & manual before continuing.');
    }
  }, [actor]);

  const load = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await verifyActor();
      const { data, error: rpcError } = await hotelClient().rpc('irp_pms_pilot_support_ticket_list', {
        p_tenant: tenant,
        p_property: property,
      });
      if (rpcError) throw Error(rpcError.message);
      const page = ticketPage(data, tenant, property);
      if (active.current) setTickets(page.tickets);
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : 'Could not load support requests.');
    } finally {
      working.current = false;
      if (active.current) {
        setReady(true);
        setBusy(false);
      }
    }
  }, [property, tenant, verifyActor]);

  useEffect(() => {
    active.current = true;
    const timer = window.setTimeout(() => { void load(); }, 0);
    const { data: { subscription } } = hotelClient().auth.onAuthStateChange((event) => {
      if (event !== 'INITIAL_SESSION') {
        active.current = false;
        pending.current = null;
        setHasPendingRequest(false);
        setTickets([]);
        setSubject('');
        setDetails('');
        setError('Your sign-in changed. Reopen Help & manual to verify property access.');
      }
    });
    return () => {
      window.clearTimeout(timer);
      active.current = false;
      subscription.unsubscribe();
    };
  }, [load]);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working.current) return;
    const cleanSubject = subject.trim();
    const cleanDetails = details.trim();
    if (cleanSubject.length < 4 || cleanDetails.length < 10) {
      setError('Add a short subject and at least ten characters describing the issue.');
      return;
    }
    if (!pending.current) {
      pending.current = {
        request: crypto.randomUUID(),
        message: crypto.randomUUID(),
        category,
        subject: cleanSubject,
        details: cleanDetails,
      };
      setHasPendingRequest(true);
    }
    const command = pending.current;
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await verifyActor();
      const { data, error: rpcError } = await hotelClient().rpc('irp_pms_pilot_support_ticket_create', {
        p_tenant: tenant,
        p_property: property,
        p_request: command.request,
        p_message_request: command.message,
        p_category: command.category,
        p_subject: command.subject,
        p_details: command.details,
      });
      if (rpcError) throw Error(rpcError.message);
      if (!data || !uuid(data.id) || data.request_id !== command.request ||
        !['open', 'in_progress', 'waiting_on_property', 'resolved', 'closed'].includes(data.status)) {
        throw Error('The save result could not be verified. Retry the same request.');
      }
      pending.current = null;
      setHasPendingRequest(false);
      setSubject('');
      setDetails('');
      setNotice('Support request saved. You can follow its status below.');
      try {
        const page = await hotelClient().rpc('irp_pms_pilot_support_ticket_list', { p_tenant: tenant, p_property: property });
        if (page.error) throw Error(page.error.message);
        setTickets(ticketPage(page.data, tenant, property).tickets);
      } catch {
        setNotice('Support request saved. Refresh this section to verify its latest status.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Support request result is uncertain. Retry to check the same saved request.');
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
    }
  }

  return (
    <section className="card" aria-label="Support requests">
      <h2>Contact iRatePilot support</h2>
      <p>Submit a support request for this property and follow replies here. Do not include guest names, ID numbers, payment-card data, passwords or other sensitive details.</p>
      {error && <p className="pilot-error" role="alert">{error}</p>}
      {notice && <output>{notice}</output>}
      <form onSubmit={submit}>
        <label className="field">Topic
          <select value={category} disabled={busy || hasPendingRequest} onChange={(event) => setCategory(event.target.value)}>
            <option value="account">Account and staff access</option><option value="reservation">Reservations and check-in</option>
            <option value="payments">Payments and folios</option><option value="rooms">Rooms and housekeeping</option>
            <option value="connections">Connections and integrations</option><option value="other">Other</option>
          </select>
        </label>
        <label className="field">Subject
          <input value={subject} minLength={4} maxLength={160} required disabled={busy || hasPendingRequest} onChange={(event) => setSubject(event.target.value)} />
        </label>
        <label className="field">What do you need help with?
          <textarea value={details} minLength={10} maxLength={4000} required disabled={busy || hasPendingRequest} onChange={(event) => setDetails(event.target.value)} />
        </label>
        <button className="primary" disabled={busy || !ready}>
          {busy ? 'Saving support request…' : hasPendingRequest ? 'Retry / check saved request' : 'Send support request'}
        </button>
      </form>
      <div>
        <div className="section-top">
          <h3>Your property requests</h3>
          <button className="secondary" disabled={busy} onClick={() => void load()}>{busy ? 'Refreshing…' : 'Refresh requests'}</button>
        </div>
        {!ready ? <p>Loading support requests…</p> : tickets.length === 0 ? <p>No support requests have been submitted for this property.</p> : tickets.map((ticket) => (
          <article className="pilot-list-row" key={ticket.id}>
            <div>
              <strong>{ticket.subject}</strong>
              <small>{ticket.category} · {statusLabel(ticket.status)} · Opened {new Date(ticket.created_at).toLocaleString()}</small>
              <p>{ticket.details}</p>
              {ticket.messages.map((message) => (
                <div key={message.id}><small>{message.author_kind === 'support' ? 'iRatePilot support' : 'Property team'} · {new Date(message.created_at).toLocaleString()}</small><p>{message.body}</p></div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

type AdminTicket = {
  id: string;
  tenant_id: string;
  property_id: string;
  opened_by: string;
  category: string;
  subject: string;
  details: string;
  status: Ticket['status'];
  created_at: string;
  updated_at: string;
};
type SelectedTicket = AdminTicket & { messages: Array<Message & { author_id: string }> };
type SupportAuditEntry = { actor_id: string; action: string; created_at: string };

export function PlatformSupportTickets() {
  const [items, setItems] = useState<AdminTicket[]>([]);
  const [selected, setSelected] = useState<SelectedTicket | null>(null);
  const [audit, setAudit] = useState<SupportAuditEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState<Ticket['status']>('waiting_on_property');
  const [hasRequest, setHasRequest] = useState(false);
  const actor = useRef<string>('');
  const request = useRef<string | null>(null);
  const working = useRef(false);
  const active = useRef(true);

  const identity = useCallback(async () => {
    const { data, error: authError } = await hotelClient().auth.getSession();
    if (authError || !data.session?.user?.id) throw Error('Sign in with the designated platform administrator account.');
    actor.current = data.session.user.id;
  }, []);

  const load = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await identity();
      const { data, error: rpcError } = await hotelClient().rpc('irp_pms_platform_support_ticket_queue', { p_after: null, p_limit: 25 });
      if (rpcError) throw Error(rpcError.message);
      if (!data || !Array.isArray(data.tickets) || data.tickets.length > 25 || data.tickets.some((ticket: AdminTicket) =>
        !ticket || !uuid(ticket.id) || !uuid(ticket.tenant_id) || !uuid(ticket.property_id) || !uuid(ticket.opened_by) ||
        typeof ticket.subject !== 'string' || ticket.subject.length > 160 || typeof ticket.details !== 'string' || ticket.details.length > 4000 ||
        !['open', 'in_progress', 'waiting_on_property', 'resolved', 'closed'].includes(ticket.status))) {
        throw Error('Support queue could not be verified.');
      }
      if (active.current) setItems(data.tickets);
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : 'Unable to load support requests.');
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
    }
  }, [identity]);

  useEffect(() => {
    active.current = true;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => {
      window.clearTimeout(timer);
      active.current = false;
    };
  }, [load]);

  async function open(ticket: AdminTicket) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    setAudit(null);
    try {
      await identity();
      const { data, error: rpcError } = await hotelClient().rpc('irp_pms_platform_support_ticket_read', {
        p_tenant: ticket.tenant_id,
        p_property: ticket.property_id,
        p_ticket: ticket.id,
      });
      if (rpcError) throw Error(rpcError.message);
      if (!data || data.id !== ticket.id || data.tenant_id !== ticket.tenant_id || data.property_id !== ticket.property_id ||
        !Array.isArray(data.messages) || data.messages.length > 100) throw Error('Support thread could not be verified.');
      setSelected(data);
      setStatus(data.status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to open support thread.');
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function loadAudit() {
    if (!selected || working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await identity();
      const { data, error: rpcError } = await hotelClient().rpc('irp_pms_platform_support_ticket_audit', {
        p_tenant: selected.tenant_id,
        p_property: selected.property_id,
        p_ticket: selected.id,
      });
      if (rpcError) throw Error(rpcError.message);
      if (!data || data.ticket_id !== selected.id || data.tenant_id !== selected.tenant_id || data.property_id !== selected.property_id ||
        !Array.isArray(data.entries) || data.entries.length > 100 || data.entries.some((entry: SupportAuditEntry) =>
          !uuid(entry.actor_id) || !['ticket_listed', 'ticket_read', 'reply_sent', 'status_changed', 'audit_read'].includes(entry.action) ||
          !Number.isFinite(Date.parse(entry.created_at)))) throw Error('Support-access audit could not be verified.');
      setAudit(data.entries);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load the support-access audit.');
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || working.current) return;
    const body = reply.trim();
    if (!body) {
      setError('Enter a support reply.');
      return;
    }
    request.current ??= crypto.randomUUID();
    setHasRequest(true);
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await identity();
      const { data, error: rpcError } = await hotelClient().rpc('irp_pms_platform_support_ticket_reply', {
        p_tenant: selected.tenant_id,
        p_property: selected.property_id,
        p_ticket: selected.id,
        p_request: request.current,
        p_body: body,
        p_status: status,
      });
      if (rpcError) throw Error(rpcError.message);
      if (!data || data.ticket_id !== selected.id || data.status !== status) {
        throw Error('Reply result could not be verified. Retry the unchanged response to check its saved status.');
      }
      request.current = null;
      setHasRequest(false);
      setReply('');
      const [thread, queue] = await Promise.all([
        hotelClient().rpc('irp_pms_platform_support_ticket_read', { p_tenant: selected.tenant_id, p_property: selected.property_id, p_ticket: selected.id }),
        hotelClient().rpc('irp_pms_platform_support_ticket_queue', { p_after: null, p_limit: 25 }),
      ]);
      if (thread.error || queue.error || thread.data?.id !== selected.id || !Array.isArray(thread.data.messages) || !Array.isArray(queue.data?.tickets)) {
        throw Error('Reply saved, but the refreshed thread could not be verified. Refresh the queue before another response.');
      }
      setSelected(thread.data);
      setItems(queue.data.tickets);
      setStatus(thread.data.status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Support reply result is uncertain. Retry the same response to check its saved status.');
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-label="Platform support ticket queue">
      <h2>Support ticket queue</h2>
      <p>Property ticket details are access-controlled. Opening a ticket and sending a reply are recorded in the support-access audit.</p>
      {error && <p role="alert" className="pilot-error">{error}</p>}
      <button className="secondary" disabled={busy} onClick={() => void load()}>{busy ? 'Loading…' : 'Refresh queue'}</button>
      {items.map((ticket) => (
        <article className="pilot-list-row" key={ticket.id}>
          <div><strong>{ticket.subject}</strong><small>{ticket.category} · {ticket.status} · {ticket.tenant_id}/{ticket.property_id}</small></div>
          <button className="secondary" disabled={busy || hasRequest} onClick={() => void open(ticket)}>Open audited ticket</button>
        </article>
      ))}
      {selected && (
        <section aria-label="Selected support thread">
          <h3>{selected.subject}</h3>
          <p>{selected.details}</p>
          {selected.messages.map((message) => (
            <article key={message.id}><small>{message.author_kind} · {message.author_id} · {new Date(message.created_at).toLocaleString()}</small><p>{message.body}</p></article>
          ))}
          <button type="button" className="secondary" disabled={busy} onClick={() => void loadAudit()}>{busy ? 'Loading…' : 'Review support-access audit'}</button>
          {audit && <ol aria-label="Support-access audit records">{audit.map((entry, index) => <li key={index}>{entry.action.replaceAll('_', ' ')} · {entry.actor_id} · {new Date(entry.created_at).toLocaleString()}</li>)}</ol>}
          <form onSubmit={send}>
            <label className="field">Support reply<textarea value={reply} maxLength={4000} disabled={busy || hasRequest} onChange={(event) => setReply(event.target.value)} /></label>
            <label className="field">Ticket status
              <select value={status} disabled={busy || hasRequest} onChange={(event) => setStatus(event.target.value as Ticket['status'])}>
                <option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting_on_property">Waiting on property</option>
                <option value="resolved">Resolved</option><option value="closed">Closed</option>
              </select>
            </label>
            <button className="primary" disabled={busy}>{busy ? 'Saving…' : hasRequest ? 'Retry unchanged response' : 'Send reply and update status'}</button>
          </form>
        </section>
      )}
    </section>
  );
}
