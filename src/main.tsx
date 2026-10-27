import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDown, ArrowDownLeft, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown,
  CircleHelp, Inbox, Leaf, Link2, LoaderCircle, LockKeyhole, Mail,
  RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Sprout,
  Unplug, X, Zap,
} from 'lucide-react';
import { emptyState, type AppState, type Command, type ScanSettings, type Subscription } from './types';
import { command, isExtension, subscribe } from './lib/client';
import { demoState } from './lib/demo';
import { senderSearch } from './lib/urls';
import './styles.css';

type View = 'subscriptions' | 'kept' | 'activity' | 'settings';
type Filter = 'all' | 'gmail' | 'manual';
const eligible = (item: Subscription) => ['active', 'failed'].includes(item.status);
const number = (value: number) => new Intl.NumberFormat().format(value);
const plural = (value: number, singular: string, multiple = `${singular}s`) => `${number(value)} ${value === 1 ? singular : multiple}`;
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
const date = (value: number) => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(value) : '—';

function Brand({ small = false }: { small?: boolean }) {
  return <div className={`brand ${small ? 'brand-small' : ''}`}><img src="./icon.svg" alt=""/><span>unclutter<span className="brand-dot">.</span></span></div>;
}

function Avatar({ item }: { item: Subscription }) {
  const colors: Record<string, string> = { Notion: 'neutral', Figma: 'figma', 'Product Hunt': 'orange', Medium: 'neutral', Airbnb: 'coral', Linear: 'purple', Spotify: 'green', Pinterest: 'red', GitHub: 'neutral', 'Read.cv': 'blue' };
  return <span className={`sender-avatar ${colors[item.name] ?? ['purple', 'blue', 'green', 'orange'][item.name.length % 4]}`} aria-hidden="true">
    {item.name === 'Figma' ? <span className="figma-symbol"><i/><i/><i/><i/><i/></span> : item.name === 'Medium' ? '●' : item.name === 'Airbnb' ? 'A' : item.name === 'Product Hunt' ? 'P' : item.name.slice(0, 1).toUpperCase()}
  </span>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => { dialog.close(); }; }, []);
  return <dialog ref={ref} className="modal" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20}/></button></div>
    {children}
  </dialog>;
}

function App() {
  const [live, setLive] = useState<AppState>(emptyState);
  const [demo, setDemo] = useState(!isExtension || new URLSearchParams(location.search).get('demo') === '1');
  const [sample, setSample] = useState<AppState>(demoState);
  const [ready, setReady] = useState(!isExtension);
  const [view, setView] = useState<View>('subscriptions');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('volume');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [review, setReview] = useState(false);
  const [help, setHelp] = useState(false);
  const [clear, setClear] = useState(false);
  const [inspect, setInspect] = useState<Subscription>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const [scanSettings, setScanSettings] = useState<ScanSettings>(emptyState().settings);
  const searchRef = useRef<HTMLInputElement>(null);
  const state = demo ? sample : live;
  const working = state.scan.status === 'running' || state.batchRunning;

  useEffect(() => {
    if (!isExtension) return;
    let cancelled = false;
    const off = subscribe(value => { if (!cancelled) setLive(value); });
    void command({ type: 'GET_STATE' }).then(value => {
      if (!cancelled) { setLive(value); setScanSettings(value.settings); }
    }).catch(error => { if (!cancelled) setNotice({ text: errorText(error), error: true }); }).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; off(); };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(undefined), notice.error ? 14_000 : 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName) && !document.querySelector('dialog[open]')) {
        event.preventDefault(); searchRef.current?.focus();
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);
  useEffect(() => { setSelected(new Set()); }, [view, demo]);

  const active = state.subscriptions.filter(item => eligible(item) || ['queued', 'sending', 'unknown'].includes(item.status));
  const kept = state.subscriptions.filter(item => item.status === 'kept');
  const activity = state.subscriptions.filter(item => ['sent', 'failed', 'unknown', 'opened'].includes(item.status));
  const sent = state.subscriptions.filter(item => item.status === 'sent');
  const visible = useMemo(() => {
    let items = state.subscriptions.filter(item => view === 'kept' ? item.status === 'kept'
      : view === 'activity' ? ['sent', 'failed', 'unknown', 'opened'].includes(item.status)
        : !['kept', 'sent', 'opened'].includes(item.status));
    if (filter === 'gmail') items = items.filter(item => item.method === 'gmail');
    if (filter === 'manual') items = items.filter(item => item.method !== 'gmail');
    const needle = query.toLowerCase().trim();
    if (needle) items = items.filter(item => `${item.name} ${item.email} ${item.subject} ${item.listId ?? ''}`.toLowerCase().includes(needle));
    return items.sort((a, b) => sort === 'volume' ? b.count - a.count : sort === 'name' ? a.name.localeCompare(b.name) : b.latest - a.latest);
  }, [state.subscriptions, view, filter, query, sort]);
  const selectedItems = state.subscriptions.filter(item => selected.has(item.id) && eligible(item));
  const automatic = selectedItems.filter(item => item.method === 'gmail');
  const manual = selectedItems.filter(item => item.method !== 'gmail');
  const selectable = visible.filter(item => eligible(item));
  const allChecked = !!selectable.length && selectable.every(item => selected.has(item.id));
  const selectionRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (selectionRef.current) selectionRef.current.indeterminate = !allChecked && selectable.some(item => selected.has(item.id)); }, [allChecked, selectable, selected]);

  function toggle(id: string) { setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  async function run(message: Command, success?: string) {
    setBusy(true);
    try {
      if (demo) {
        setSample(previous => {
          const next = structuredClone(previous);
          if (message.type === 'KEEP') next.subscriptions.forEach(item => { if (message.ids.includes(item.id)) item.status = message.keep ? 'kept' : 'active'; });
          if (message.type === 'BATCH') next.subscriptions.forEach(item => { if (message.ids.includes(item.id)) { item.status = 'sent'; item.actedAt = Date.now(); item.detail = 'Demo result. No unsubscribe request was sent.'; } });
          if (message.type === 'OPEN_MANUAL') next.subscriptions.forEach(item => { if (message.id === item.id) { item.status = 'opened'; item.actedAt = Date.now(); item.detail = 'Demo result. No website was opened.'; } });
          if (message.type === 'CLEAR') return { ...emptyState(), connected: true, email: 'alex@example.com' };
          if (message.type === 'SCAN') return demoState();
          return next;
        });
        if (message.type === 'DISCONNECT') { setDemo(false); setView('subscriptions'); }
        if (success) setNotice({ text: `Demo: ${success}` });
      } else {
        const value = await command(message);
        setLive(value);
        if (success) setNotice({ text: success });
      }
      setSelected(new Set());
      return true;
    } catch (error) { setNotice({ text: errorText(error), error: true }); return false; }
    finally { setBusy(false); }
  }
  async function connect() {
    if (!isExtension) { setView('settings'); setNotice({ text: 'Load the extension in Chrome, open Gmail, then click Attach Gmail tab.' }); return; }
    setBusy(true);
    try {
      const value = await command({ type: 'CONNECT' });
      setLive(value);
      setDemo(false);
      setNotice({ text: 'Gmail tab attached. Your existing sign-in is ready to use.' });
    } catch (error) { setNotice({ text: errorText(error), error: true }); }
    finally { setBusy(false); }
  }
  async function confirmBatch() {
    try {
      setBusy(true);
      if (automatic.length > 25) { setNotice({ text: 'Choose up to 25 Gmail senders per batch.', error: true }); return; }
      const success = await run({ type: 'BATCH', ids: automatic.map(item => item.id) }, `${plural(automatic.length, 'request')} added to the queue.`);
      if (success) { setReview(false); if (manual.length) setFilter('manual'); }
    } catch (error) { setNotice({ text: errorText(error), error: true }); }
    finally { setBusy(false); }
  }

  const changeView = (next: View) => { setView(next); setFilter('all'); setQuery(''); };
  return <div className="app-shell">
    <aside className="sidebar">
      <Brand/>
      <div className="workspace-label">YOUR WORKSPACE</div>
      <nav aria-label="Main navigation">
        <button className={view === 'subscriptions' ? 'nav-item active' : 'nav-item'} onClick={() => changeView('subscriptions')}><Inbox size={19}/><span>Subscriptions</span><span className="nav-count">{active.length}</span></button>
        <button className={view === 'kept' ? 'nav-item active' : 'nav-item'} onClick={() => changeView('kept')}><ShieldCheck size={19}/><span>Keep list</span>{!!kept.length && <span className="nav-count">{kept.length}</span>}</button>
        <button className={view === 'activity' ? 'nav-item active' : 'nav-item'} onClick={() => changeView('activity')}><CheckCheck size={19}/><span>Activity</span></button>
      </nav>
      <div className="sidebar-note"><span className="little-leaf"><Leaf size={19}/></span><h3>A little less noise.</h3><p>A little more room for the emails that matter.</p><span className="note-line"/></div>
      <div className="sidebar-bottom">
        <button className={view === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => changeView('settings')}><Settings2 size={18}/><span>Settings</span></button>
        <button className="nav-item" onClick={() => setHelp(true)}><CircleHelp size={18}/><span>How it works</span><ArrowUpRight size={15}/></button>
        <div className="account"><span className={`account-avatar ${state.connected ? '' : 'offline'}`}>{state.email?.slice(0, 1).toUpperCase() ?? <Mail size={17}/>}</span><div><strong>{demo ? 'Demo workspace' : state.connected ? 'Personal workspace' : 'Your workspace'}</strong><span title={state.email}>{state.email ?? 'Gmail not connected'}</span></div><span className={`connection-dot ${state.connected ? 'online' : ''}`}/></div>
      </div>
    </aside>

    <div className="main-wrap">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span><strong>{view === 'kept' ? 'Keep list' : view[0]!.toUpperCase() + view.slice(1)}</strong></div><div className="topbar-right"><span className="privacy-label"><LockKeyhole size={13}/> Private by design</span><span className="top-divider"/><span className="version">v2.0</span></div></header>
      <main>
        {demo && <div className="demo-banner"><span><span className="demo-pill">DEMO</span> You’re exploring a sample inbox. No emails are read or requests sent.</span><button onClick={() => { setDemo(false); if (!isExtension) setView('settings'); }}>Use my inbox <ArrowRight size={14}/></button></div>}

        {view !== 'settings' && <>
          <section className="page-heading"><div><div className="eyebrow"><span/> A CALMER INBOX STARTS HERE</div><h1>{view === 'kept' ? 'The ones worth keeping.' : view === 'activity' ? 'A little progress feels good.' : 'Make room for what matters.'}</h1><p>{view === 'kept' ? 'Your favorites stay on the list. Keep choices are remembered when a list is scanned again.' : view === 'activity' ? 'Follow your unsubscribe requests and finish any steps that need you.' : 'Less inbox noise. More of the good stuff. Take back control of your subscriptions.'}</p></div><div className="heading-action">
            {state.connected ? <button className="button primary" disabled={busy || state.batchRunning || !ready} onClick={() => { if (state.scan.status === 'running') void run({ type: 'CANCEL_SCAN' }); else void run({ type: 'SCAN', settings: scanSettings }); }}>{state.scan.status === 'running' ? <><X size={16}/> Stop scan</> : <><RefreshCw size={16}/> Scan Gmail</>}</button>
              : <button className="button primary" disabled={busy || !ready} onClick={() => void connect()}>{busy ? <LoaderCircle size={16} className="spin"/> : <Mail size={17}/>} Attach Gmail tab</button>}
            <span>{state.scan.status === 'running' ? 'Keep the Gmail tab open' : state.scan.finishedAt ? `Last scanned ${date(state.scan.finishedAt)}` : 'No Google Cloud setup'}</span>
          </div></section>

          {!state.connected && <section className="connect-card"><div className="connect-art"><Mail size={28}/><Sparkles size={16}/></div><div><h2>Your inbox, with a little breathing room.</h2><p>Open Gmail and sign in, then attach its tab. No API keys or Google Cloud project needed.</p><button className="text-button" onClick={() => { setSample(demoState()); setDemo(true); }}>Explore the demo first <ArrowRight size={15}/></button></div><span className="read-only"><ShieldCheck size={15}/> Uses your Gmail tab</span></section>}

          <section className="stats-grid" aria-label="Inbox overview">
            <div className="stat-card"><div className="stat-label">Subscriptions found <Inbox size={17}/></div><div className="stat-value">{number(state.subscriptions.length)}<span className="stat-tag">in this scan</span></div><p>Across {plural(state.scan.processed, 'scanned row')}</p></div>
            <div className="stat-card"><div className="stat-label">{state.settings.mode === 'subscriptions' ? 'Recent email volume' : 'Matching conversations'} <Mail size={17}/></div><div className="stat-value">{state.settings.mode === 'subscriptions' ? '—' : number(state.subscriptions.reduce((sum, item) => sum + item.count, 0))}<span className="tiny-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/></span></div><p>{state.settings.mode === 'subscriptions' ? 'Gmail’s volume ranges appear below' : 'From conversations found in this scan'}</p></div>
            <div className="stat-card success-stat"><div className="stat-label">Requests sent <CheckCheck size={17}/></div><div className="stat-value">{number(sent.length)}<span className="stat-spark"><Sprout size={28}/></span></div><p>{sent.length ? 'A little more breathing room' : 'Your next fresh start is one click away'}</p></div>
          </section>

          {state.scan.status === 'running' && <div className="progress-card" role="status"><LoaderCircle className="spin" size={19}/><div><strong>Looking for a little less noise…</strong><span>{plural(state.scan.processed, 'row')} checked · {plural(state.subscriptions.length, 'subscription')} found</span></div><span className="progress-note">Keep Gmail open; let it finish navigating.</span></div>}
          {state.scan.status === 'error' && <div className="inline-notice error" role="alert">{state.scan.error} Partial results are shown below.</div>}
          {!!state.scan.failed && <div className="inline-notice">{plural(state.scan.failed, 'email')} could not be read. Counts reflect successfully scanned messages.</div>}
          {state.scan.status === 'cancelled' && <div className="inline-notice">Scan stopped. Results checked so far are saved.</div>}
          {state.batchRunning && <div className="progress-card" role="status"><LoaderCircle className="spin" size={19}/><div><strong>Processing Gmail’s unsubscribe controls</strong><span>{plural(state.subscriptions.filter(item => ['queued', 'sending'].includes(item.status)).length, 'request')} remaining. Keep Gmail open and let the queue finish.</span></div><button className="button secondary compact" onClick={() => void run({ type: 'STOP_BATCH' })}>Stop queue</button></div>}

          <section className="subscriptions-panel" aria-labelledby="list-heading">
            <div className="panel-heading"><div><h2 id="list-heading">{view === 'kept' ? 'Your keep list' : view === 'activity' ? 'Recent activity' : 'Your subscriptions'}<span>{view === 'kept' ? kept.length : view === 'activity' ? activity.length : active.length}</span></h2><p>{view === 'kept' ? 'Good emails deserve a place in your inbox.' : view === 'activity' ? '“Request sent” means Gmail displayed a success message. Senders may need a few days.' : 'Pick the senders you’re ready to say goodbye to.'}</p></div><span className="local-label"><span/> Stored on this device</span></div>
            <div className="table-controls"><div className="filter-tabs" role="group" aria-label="Filter subscriptions">{([['all', 'All subscriptions'], ['gmail', 'Gmail control'], ['manual', 'Needs a step']] as const).map(([key, label]) => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{key === 'gmail' && <Zap size={13}/>} {label}</button>)}</div><label className="search-box"><Search size={16}/><input ref={searchRef} aria-label="Search senders" placeholder="Search senders…" value={query} onChange={event => setQuery(event.target.value)}/><kbd>/</kbd></label></div>
            <div className="table-scroll"><table><thead><tr><th className="checkbox-cell">{view === 'subscriptions' && <input ref={selectionRef} type="checkbox" aria-label="Select all visible senders" disabled={working || !selectable.length} checked={allChecked} onChange={() => setSelected(previous => { const next = new Set(previous); selectable.forEach(item => { if (allChecked) next.delete(item.id); else next.add(item.id); }); return next; })}/>}</th><th>Sender</th><th className="volume-column"><button className="sort-button" onClick={() => setSort(sort === 'volume' ? 'name' : 'volume')}>Emails {sort === 'volume' && <ArrowDown size={12}/>}</button></th><th>Last received</th><th>Unsubscribe method</th><th className="action-cell">{view === 'activity' ? 'Result' : 'Action'}</th></tr></thead><tbody>
              {visible.map(item => <tr key={item.id} className={selected.has(item.id) ? 'row-selected' : ''}>
                <td className="checkbox-cell">{view === 'subscriptions' && eligible(item) && <input type="checkbox" aria-label={`Select ${item.name}`} checked={selected.has(item.id)} disabled={working} onChange={() => toggle(item.id)}/>}</td>
                <td><div className="sender"><Avatar item={item}/><div><button className="sender-name" onClick={() => setInspect(item)} aria-label={`View ${item.name} details`}>{item.name}</button><span title={item.email}>{item.email}</span>{item.listId && <span className="list-id" title={item.listId}>{item.listId}</span>}</div></div></td>
                <td className="volume-column">{item.source === 'gmail-subscriptions' ? <span className="volume-range">{item.countLabel}</span> : <><span className="email-count">{number(item.count)}</span><span className="volume-track"><span style={{ width: `${Math.max(8, item.count / Math.max(...state.subscriptions.map(s => s.count), 1) * 100)}%` }}/></span></>}</td>
                <td className="date-cell">{date(item.latest)}</td>
                <td><span className={`method-badge ${item.method === 'gmail' ? 'automatic' : ''}`}>{item.method === 'gmail' ? <Zap size={12}/> : item.method === 'mailto' ? <Mail size={12}/> : <Link2 size={12}/>}{item.method === 'gmail' ? 'Gmail control' : item.source !== 'body' ? 'Review in Gmail' : item.method === 'mailto' ? 'Email request' : 'Visit website'}</span>{item.source === 'body' && <span className="source-label">Found in open email</span>}</td>
                <td className="action-cell">{view === 'kept' ? <button className="row-button" disabled={working || busy} onClick={() => void run({ type: 'KEEP', ids: [item.id], keep: false }, 'Sender removed from your keep list.')}>Remove <X size={13}/></button>
                  : view === 'activity' || ['unknown', 'queued', 'sending'].includes(item.status) ? <span className={`status-badge ${item.status}`} title={item.detail}>{item.status === 'sent' ? <Check size={13}/> : item.status === 'sending' ? <LoaderCircle size={13} className="spin"/> : null}{({ sent: 'Request sent', failed: 'Failed', unknown: 'Check result', opened: 'Needs confirmation', queued: 'Queued', sending: 'Sending…', active: 'Ready', kept: 'Kept' })[item.status]}</span>
                    : item.method !== 'gmail' ? <button className="row-button" disabled={working || busy} onClick={() => void run({ type: 'OPEN_MANUAL', id: item.id }, 'Review the opened page or draft to finish unsubscribing.')}>Review <ArrowUpRight size={14}/></button>
                      : <button className="row-button keep-button" disabled={working || busy} onClick={() => void run({ type: 'KEEP', ids: [item.id], keep: true }, 'Sender added to your keep list.')}>Keep <ShieldCheck size={14}/></button>}</td>
              </tr>)}
            </tbody></table></div>
            {!visible.length && <div className="empty-state"><span><Inbox size={27}/></span><h3>{query ? 'No senders match your search.' : view === 'kept' ? 'A home for your favorites.' : view === 'activity' ? 'Your fresh start begins here.' : state.scan.status === 'running' ? 'Your subscriptions will appear here.' : !state.connected ? 'A quieter inbox is waiting.' : 'Nothing to show here.'}</h3><p>{query ? 'Try another name or email address.' : view === 'kept' ? 'Choose Keep on a sender, or select senders and add them to your keep list.' : view === 'activity' ? 'Your unsubscribe requests will show up here.' : !state.connected ? 'Attach Gmail tab to find the subscriptions in your inbox.' : 'Scan your inbox or try another filter to find subscriptions.'}</p></div>}
            <div className="table-footer"><span>Showing {plural(visible.length, 'subscription')}{query || filter !== 'all' ? ' matching your filters' : ''}</span><label className="sort-select">Sort by <select aria-label="Sort subscriptions" value={sort} onChange={event => setSort(event.target.value)}><option value="volume">Most emails</option><option value="recent">Most recent</option><option value="name">Sender name</option></select><ChevronDown size={13}/></label></div>
          </section>
          <div className="below-table"><ShieldCheck size={15}/><p>Works through your signed-in Gmail tab. No API keys, cloud project, or third-party inbox access.</p></div>
          {state.scan.limitReached && <p className="scan-limit">This scan reached the {number(state.settings.limit)}-row limit. Adjust the scan range in Settings to check more.</p>}
        </>}

        {view === 'settings' && <>
          <section className="page-heading"><div><div className="eyebrow"><span/> JUST THE WAY YOU LIKE IT</div><h1>A little fine-tuning.</h1><p>Choose a Gmail tab and the view you want to scan.</p></div></section>
          <section className="settings-card"><div className="settings-title"><Mail size={20}/><div><h2>Gmail tab connection</h2><p>{!demo && live.connected ? `Attached to ${live.email}` : 'Works with your existing Gmail sign-in. No Google Cloud setup.'}</p></div></div>
            <div className="setup-guide"><h3>No-cloud setup</h3><ol><li>Load this extension’s <code>dist</code> folder at <code>chrome://extensions</code>.</li><li>Open Gmail in Chrome and sign in normally.</li><li>Return here and click <strong>Attach Gmail tab</strong>, then start a scan.</li></ol><p>To choose another account, focus that account’s Gmail tab before attaching. The account address is shown here before you scan.</p></div>
            <div className="settings-row"><span><strong>{!demo && live.connected ? 'Gmail tab attached' : 'Ready for a calmer inbox?'}</strong><small>Keep Gmail open while work runs. Scans navigate Gmail’s lists without opening unread messages.</small></span><button className="button primary" onClick={() => void connect()} disabled={!isExtension || busy || working}><Mail size={15}/> Attach Gmail tab</button></div>
            {!demo && live.connected && <div className="settings-row"><span><strong>Open the attached tab</strong><small>Let scans and batches finish before navigating it yourself.</small></span><button className="button secondary" disabled={busy} onClick={() => void run({ type: 'OPEN_GMAIL' })}>Show Gmail <ArrowUpRight size={14}/></button><button className="button secondary" disabled={working || busy} onClick={() => void run({ type: 'DISCONNECT' }, 'Gmail detached and local results cleared.')}><Unplug size={15}/> Detach</button></div>}
          </section>
          <section className="settings-card"><div className="settings-title"><Search size={20}/><div><h2>Scan preferences</h2><p>Preferences are saved when you start a scan.</p></div></div>
            <div className="settings-row"><label htmlFor="mode"><strong>Gmail view</strong><small>Subscription manager covers Gmail’s detected subscriptions across your mailbox. Inbox scans only inbox conversations. Current view reads what is already loaded.</small></label><select id="mode" disabled={working} value={scanSettings.mode} onChange={event => setScanSettings(s => ({ ...s, mode: event.target.value as ScanSettings['mode'] }))}><option value="subscriptions">Subscription manager</option><option value="inbox">Inbox conversations</option><option value="current">Current Gmail view</option></select></div>
            <div className="settings-row"><label htmlFor="days"><strong>Inbox look-back</strong><small>Applies only to Inbox conversations. Gmail’s subscription manager has its own recent-volume ranges.</small></label><select id="days" disabled={working || scanSettings.mode !== 'inbox'} value={scanSettings.days} onChange={event => setScanSettings(s => ({ ...s, days: Number(event.target.value) }))}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="180">Last 6 months</option><option value="365">Last year</option><option value="0">All time</option></select></div>
            <div className="settings-row"><label htmlFor="limit"><strong>Rows per scan</strong><small>Inbox mode pages through conversations. Current view scans the loaded page only.</small></label><select id="limit" disabled={working} value={scanSettings.limit} onChange={event => setScanSettings(s => ({ ...s, limit: Number(event.target.value) }))}><option value="100">100 rows</option><option value="500">500 rows</option><option value="1000">1,000 rows</option><option value="2000">2,000 rows</option></select></div>
            <div className="settings-row"><label htmlFor="body"><strong>Check an already-open email</strong><small>In Current view mode, find explicit unsubscribe links in the email you already opened. These links always need manual review.</small></label><input id="body" className="switch" type="checkbox" disabled={working || scanSettings.mode !== 'current'} checked={scanSettings.lookInBody} onChange={event => setScanSettings(s => ({ ...s, lookInBody: event.target.checked }))}/></div>
            <div className="settings-card-footer"><span>Gmail must remain open.</span><button className="button primary" disabled={working || busy || !state.connected} onClick={() => { changeView('subscriptions'); void run({ type: 'SCAN', settings: scanSettings }); }}><RefreshCw size={15}/> Start scan</button></div>
          </section>
          <section className="settings-card"><div className="settings-title"><LockKeyhole size={20}/><div><h2>Your data, your device</h2><p>No backend, analytics, trackers, or remote image loading.</p></div></div><div className="settings-row"><span><strong>Clear saved results</strong><small>Remove sender details, unsubscribe addresses, and keep choices from this device.</small></span><button className="button secondary" disabled={working || busy} onClick={() => setClear(true)}>Clear local data</button></div><div className="settings-row"><span><strong>Try a sample inbox</strong><small>Explore the complete workflow without reading or changing any real email.</small></span><button className="button secondary" onClick={() => { setSample(demoState()); setDemo(true); changeView('subscriptions'); }}>Open demo <ArrowUpRight size={14}/></button></div></section>
        </>}
        <footer className="page-footer"><span><Leaf size={13}/> A calmer inbox. A clearer head.</span><span>Made for a little less.</span></footer>
      </main>
    </div>

    {!!selectedItems.length && view === 'subscriptions' && !working && <div className="selection-bar"><button className="clear-selection" aria-label="Clear selection" onClick={() => setSelected(new Set())}><X size={17}/></button><strong>{selectedItems.length} selected</strong><span className="selection-divider"/><button className="selection-keep" disabled={busy} onClick={() => void run({ type: 'KEEP', ids: selectedItems.map(item => item.id), keep: true }, 'Selected senders added to your keep list.')}><ShieldCheck size={15}/> Keep selected</button><button className="button lime" onClick={() => setReview(true)} disabled={busy}>Review unsubscribe <ArrowRight size={15}/></button></div>}
    {notice && <div className={`toast ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}><span>{notice.error ? <CircleHelp size={18}/> : <Check size={18}/>}</span><p>{notice.text}</p><button aria-label="Dismiss notification" onClick={() => setNotice(undefined)}><X size={16}/></button></div>}

    {review && <Modal title="A little less in your inbox." onClose={() => !busy && setReview(false)}>
      <div className="review-intro"><span className="review-icon"><ArrowDownLeft size={27}/></span><p>Review {plural(selectedItems.length, 'subscription')} before you unsubscribe. Your existing emails will stay in Gmail.</p></div>
      <div className="review-list">{selectedItems.map(item => <div key={item.id}><Avatar item={item}/><span><strong>{item.name}</strong><small>{item.method === 'gmail' ? 'Through Gmail’s native control' : item.method === 'mailto' ? 'Email request · review yourself' : new URL(item.url).hostname}</small></span><span className={`method-badge ${item.method === 'gmail' ? 'automatic' : ''}`}>{item.method === 'gmail' ? 'Gmail control' : 'Manual step'}</span></div>)}</div>
      {!!automatic.length && <p className="review-detail">We’ll process {plural(automatic.length, 'sender')} through Gmail’s unsubscribe controls and confirmations. Gmail may send unsubscribe emails on your behalf. Keep Gmail open and let the queue finish. Website-only steps need your review.</p>}
      {!!manual.length && <div className="inline-notice">{plural(manual.length, 'sender')} needs a website confirmation or an email. Use <strong>Review</strong> on each sender to finish those steps yourself.</div>}
      {automatic.length > 25 && <div className="inline-notice">Choose up to 25 Gmail senders per batch.</div>}
      {demo && <p className="demo-modal-note">This is a demo. No real requests will be sent.</p>}
      <div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => setReview(false)}>Go back</button>{automatic.length ? <button className="button primary" disabled={busy || automatic.length > 25} onClick={() => void confirmBatch()}>{busy ? <LoaderCircle size={16} className="spin"/> : <Zap size={15}/>} {demo ? 'Simulate' : 'Process'} {plural(automatic.length, 'sender')}</button> : <button className="button primary" onClick={() => { setReview(false); setFilter('manual'); setSelected(new Set()); }}>Show manual steps <ArrowRight size={15}/></button>}</div>
    </Modal>}
    {help && <Modal title="A calmer inbox, in three steps." onClose={() => setHelp(false)}><div className="how-step"><span>1</span><div><h3>Attach your Gmail tab</h3><p>Sign in to Gmail normally. No API key, OAuth client, or cloud project is needed. Keep Gmail open while the extension works.</p></div></div><div className="how-step"><span>2</span><div><h3>Scan and choose what stays</h3><p>Read Gmail’s subscription manager or page through inbox conversations. Senders are grouped by email address; keep your favorites and select the rest.</p></div></div><div className="how-step"><span>3</span><div><h3>Review your queue</h3><p>Process up to 25 senders using Gmail’s native unsubscribe controls. Some senders need a website step. Unfamiliar confirmations stop the queue for you to review.</p></div></div><div className="privacy-box"><ShieldCheck size={22}/><p>All extension data stays on this device. Gmail handles unsubscribe requests and may send an unsubscribe email on your behalf. The extension does not delete or archive messages.</p></div><div className="modal-actions"><button className="button primary" onClick={() => setHelp(false)}>Got it <Check size={15}/></button></div></Modal>}
    {clear && <Modal title="Clear your saved results?" onClose={() => setClear(false)}><p className="review-detail">This removes locally saved sender details, unsubscribe addresses, activity, and keep choices. Your Gmail emails stay in place. You can scan again at any time.</p><div className="modal-actions"><button className="button secondary" onClick={() => setClear(false)}>Keep results</button><button className="button primary" onClick={() => { setClear(false); void run({ type: 'CLEAR' }, 'Saved results cleared.'); }}>Clear local data</button></div></Modal>}
    {inspect && <Modal title={inspect.name} onClose={() => setInspect(undefined)}>
      <div className="sender-detail"><Avatar item={inspect}/><div><strong>{inspect.email}</strong><small>Grouped by sender email address</small></div></div>
      <dl className="detail-list"><div><dt>Latest subject</dt><dd>{inspect.subject || 'Not available in this Gmail view'}</dd></div><div><dt>Last received</dt><dd>{date(inspect.latest)}</dd></div><div><dt>Unsubscribe destination</dt><dd>{inspect.method === 'gmail' ? 'Handled by Gmail' : inspect.method === 'mailto' ? new URL(inspect.url).pathname : new URL(inspect.url).hostname}</dd></div><div><dt>Discovered in</dt><dd>{inspect.source === 'gmail-subscriptions' ? 'Gmail subscription manager' : inspect.source === 'gmail-inbox' ? 'Gmail conversation list' : 'Open email body · requires manual review'}</dd></div></dl>
      {inspect.detail && <div className="inline-notice">{inspect.detail}</div>}
      {inspect.method === 'gmail' && <p className="review-detail">Gmail displays a native unsubscribe control for this sender. The queue uses that control and its confirmation. A clear Gmail success message is required before we mark the request sent.</p>}
      <div className="modal-actions"><button className="button secondary" onClick={() => setInspect(undefined)}>Close</button>{!demo && <a className="button primary" target="_blank" rel="noreferrer" href={senderSearch(state.gmailBase ?? 'https://mail.google.com/mail/', inspect.email)}>View sender in Gmail <ArrowUpRight size={15}/></a>}</div>
    </Modal>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
