import { emptyState, type AppState, type Command, type GmailPage, type Reply, type ScanSettings, type Subscription } from './types';
import { attachGmail, probeGmail, scanNext, scanStart, unsubscribeInGmail } from './lib/gmail-tab';
import { gmailBase, manualUrl, senderSearch } from './lib/urls';

type Choice = Pick<Subscription, 'status' | 'detail' | 'actedAt'>;
interface Store { state: AppState; choices?: Record<string, Choice> }
interface Run { id: string; cancelled: boolean }
const STORE_KEY = 'unclutter';
let lock: Promise<unknown> = Promise.resolve();
let scanRun: Run | undefined;
let batchRun: Run | undefined;
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The Gmail action could not be completed.';
async function readStore(): Promise<Store> {
  const data = await chrome.storage.local.get(STORE_KEY);
  const store = data[STORE_KEY] as Store | undefined;
  return store?.state?.version === 2 ? store : { state: emptyState() };
}
function transaction<T>(change: (store: Store) => T | Promise<T>): Promise<T> {
  const next = lock.then(async () => {
    const store = await readStore(); const result = await change(store);
    await chrome.storage.local.set({ [STORE_KEY]: store }); return result;
  });
  lock = next.catch(() => {}); return next;
}
function busy(store: Store) {
  if (store.state.scan.status === 'running' || store.state.batchRunning) throw new Error('Wait for the current task to finish first.');
}
function attached(state: AppState): asserts state is AppState & { email: string; gmailBase: string; gmailTabId: number } {
  if (!state.connected || !state.email || !state.gmailBase || !state.gmailTabId) throw new Error('Open Gmail and click Attach Gmail tab first.');
}
function saveChoice(store: Store, item: Subscription) {
  (store.choices ??= {})[item.id] = { status: item.status, detail: item.detail, actedAt: item.actedAt };
}
function validateSettings(value: ScanSettings): ScanSettings {
  if (!value || !['subscriptions', 'inbox', 'current'].includes(value.mode) || !Number.isInteger(value.limit)
      || value.limit < 50 || value.limit > 2000 || ![0, 30, 90, 180, 365].includes(value.days) || typeof value.lookInBody !== 'boolean') {
    throw new Error('Choose a supported scan view and a limit from 50 to 2,000 rows.');
  }
  return { mode: value.mode, limit: value.limit, days: value.days, lookInBody: value.lookInBody };
}
function validateIds(ids: unknown): asserts ids is string[] {
  if (!Array.isArray(ids) || !ids.length || ids.length > 2000 || ids.some(id => typeof id !== 'string')) throw new Error('Invalid sender selection.');
}

async function performScan(run: Run, initial: AppState, settings: ScanSettings) {
  attached(initial);
  try {
    let page: GmailPage = await scanStart(initial.gmailTabId, initial.email, initial.gmailBase, settings);
    const seen = new Set<string>();
    while (!run.cancelled) {
      if (page.email !== initial.email || page.base !== initial.gmailBase) throw new Error('The Gmail account changed during the scan.');
      if (page.fingerprint && seen.has(page.fingerprint)) throw new Error('Gmail repeated a page. Partial results were saved; scan again without navigating Gmail.');
      seen.add(page.fingerprint);
      const processed = (await readStore()).state.scan.processed;
      const room = settings.limit - processed;
      const items = page.items.slice(0, room);
      await transaction(store => {
        if (run.cancelled || scanRun?.id !== run.id) return;
        const grouped = new Map(store.state.subscriptions.map(item => [item.id, item]));
        for (const incoming of items) {
          const existing = grouped.get(incoming.id);
          let merged = existing ? { ...(incoming.latest > existing.latest ? incoming : existing),
            count: page.kind === 'subscriptions' ? incoming.count : existing.count + incoming.count,
            countLabel: page.kind === 'subscriptions' ? incoming.countLabel : undefined } : incoming;
          const choice = store.choices?.[incoming.id];
          if (choice?.status === 'kept' || choice?.actedAt) merged = { ...merged, ...choice };
          grouped.set(incoming.id, merged);
        }
        store.state.subscriptions = [...grouped.values()];
        store.state.scan.processed += Math.min(room, page.examined);
        store.state.scan.found = grouped.size;
        store.state.scan.limitReached = page.examined > room || (page.hasNext && store.state.scan.processed >= settings.limit);
      });
      if (run.cancelled || settings.mode === 'current' || !page.hasNext || processed + page.examined >= settings.limit) break;
      page = await scanNext(initial.gmailTabId, initial.email, page.fingerprint);
      if (gmailBase(page.url) !== initial.gmailBase) throw new Error('The attached Gmail view changed.');
    }
    await transaction(store => {
      if (scanRun?.id !== run.id) return;
      store.state.scan.status = run.cancelled ? 'cancelled' : 'complete';
      store.state.scan.finishedAt = Date.now();
    });
  } catch (error) {
    await transaction(store => {
      if (scanRun?.id !== run.id) return;
      store.state.scan.status = run.cancelled ? 'cancelled' : 'error';
      store.state.scan.error = errorText(error); store.state.scan.finishedAt = Date.now();
    });
  } finally { if (scanRun?.id === run.id) scanRun = undefined; }
}

async function performBatch(run: Run, initial: AppState, ids: string[]) {
  attached(initial);
  try {
    for (const id of ids) {
      if (run.cancelled) break;
      let selected: Subscription | undefined;
      await transaction(store => {
        if (run.cancelled) return;
        const item = store.state.subscriptions.find(item => item.id === id && item.status === 'queued');
        if (item) { item.status = 'sending'; selected = { ...item }; }
      });
      if (!selected || run.cancelled) continue;
      const result = await unsubscribeInGmail(initial.gmailTabId, initial.email, initial.gmailBase, selected);
      await transaction(store => {
        if (store.state.email !== initial.email) return;
        const item = store.state.subscriptions.find(item => item.id === id);
        if (!item || item.status !== 'sending') return;
        item.status = result.status === 'manual' ? 'active' : result.status;
        if (result.status === 'manual') { item.method = 'link'; item.url = senderSearch(initial.gmailBase, item.email); }
        item.detail = result.detail; item.actedAt = result.status === 'manual' ? undefined : Date.now();
        saveChoice(store, item);
      });
      if (result.status === 'unknown') { run.cancelled = true; break; }
    }
  } catch (error) {
    await transaction(store => {
      for (const item of store.state.subscriptions) if (item.status === 'sending') {
        item.status = 'unknown'; item.detail = errorText(error); item.actedAt = Date.now(); saveChoice(store, item);
      }
    });
  } finally {
    await transaction(store => {
      for (const item of store.state.subscriptions) if (item.status === 'queued') item.status = 'active';
      store.state.batchRunning = false;
    });
    if (batchRun?.id === run.id) batchRun = undefined;
  }
}

async function initialize() {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await transaction(store => {
    if (store.state.scan.status === 'running') {
      store.state.scan.status = 'error'; store.state.scan.error = 'The extension restarted. Attach Gmail and scan again to continue.';
    }
    for (const item of store.state.subscriptions) {
      if (item.status === 'queued') item.status = 'active';
      if (item.status === 'sending') {
        item.status = 'unknown'; item.detail = 'The extension restarted during a Gmail action. Check the result; it will not be repeated automatically.';
        item.actedAt = Date.now(); saveChoice(store, item);
      }
    }
    store.state.batchRunning = false;
    // Every action rechecks the tab's account before using a persisted tab ID.
  });
}
const ready = initialize();

async function handle(command: Command): Promise<AppState> {
  await ready;
  if (command.type === 'GET_STATE') return (await readStore()).state;
  if (command.type === 'CONNECT') {
    const previous = (await readStore()).state; busy({ state: previous });
    const { tabId, page } = await attachGmail(previous.gmailTabId);
    await transaction(store => {
      busy(store);
      if (store.state.email && store.state.email !== page.email) { store.state = emptyState(); delete store.choices; }
      Object.assign(store.state, { connected: true, email: page.email, gmailTabId: tabId, gmailBase: page.base });
    });
  } else if (command.type === 'OPEN_GMAIL') {
    const state = (await readStore()).state;
    if (state.gmailTabId) await chrome.tabs.update(state.gmailTabId, { active: true }).catch(() => chrome.tabs.create({ url: 'https://mail.google.com/mail/' }));
    else await chrome.tabs.create({ url: 'https://mail.google.com/mail/' });
  } else if (command.type === 'DISCONNECT') {
    await transaction(store => { busy(store); store.state = emptyState(); delete store.choices; });
  } else if (command.type === 'SCAN') {
    const settings = validateSettings(command.settings);
    const initial = (await readStore()).state;
    attached(initial); busy({ state: initial });
    const page = await probeGmail(initial.gmailTabId);
    if (page.email !== initial.email || page.base !== initial.gmailBase) throw new Error('The Gmail account changed. Attach the correct tab again.');
    const run: Run = { id: crypto.randomUUID(), cancelled: false };
    await transaction(store => {
      busy(store); scanRun = run; store.state.settings = settings;
      store.state.subscriptions = [];
      store.state.scan = { status: 'running', processed: 0, failed: 0, found: 0, limitReached: false, startedAt: Date.now() };
    });
    void performScan(run, initial, settings);
  } else if (command.type === 'CANCEL_SCAN') {
    if (scanRun) scanRun.cancelled = true;
    await transaction(store => { if (store.state.scan.status === 'running') { store.state.scan.status = 'cancelled'; store.state.scan.finishedAt = Date.now(); } });
  } else if (command.type === 'KEEP') {
    validateIds(command.ids);
    await transaction(store => {
      busy(store);
      for (const item of store.state.subscriptions) if (command.ids.includes(item.id) && ['active', 'failed', 'kept'].includes(item.status)) {
        item.status = command.keep ? 'kept' : 'active'; saveChoice(store, item);
      }
    });
  } else if (command.type === 'BATCH') {
    validateIds(command.ids);
    if (command.ids.length > 25) throw new Error('Choose up to 25 senders per batch so you can review the results as you go.');
    const initial = (await readStore()).state; attached(initial);
    const run: Run = { id: crypto.randomUUID(), cancelled: false };
    await transaction(store => {
      busy(store);
      const selected = store.state.subscriptions.filter(item => command.ids.includes(item.id));
      if (selected.length !== new Set(command.ids).size || selected.some(item => item.method !== 'gmail' || !['active', 'failed'].includes(item.status))) {
        throw new Error('Only active Gmail unsubscribe controls can be queued.');
      }
      for (const item of selected) item.status = 'queued';
      store.state.batchRunning = true; batchRun = run;
    });
    void performBatch(run, initial, command.ids);
  } else if (command.type === 'STOP_BATCH') {
    if (batchRun) batchRun.cancelled = true;
    await transaction(store => { for (const item of store.state.subscriptions) if (item.status === 'queued') item.status = 'active'; });
  } else if (command.type === 'OPEN_MANUAL') {
    const state = (await readStore()).state; busy({ state }); attached(state);
    const item = state.subscriptions.find(item => item.id === command.id && item.status !== 'kept');
    if (!item) throw new Error('This sender is no longer available.');
    const url = item.source !== 'body' ? senderSearch(state.gmailBase, item.email) : manualUrl(item, state.email);
    if (!url) throw new Error('This manual unsubscribe address is not supported.');
    if (gmailBase(url) === state.gmailBase && item.source !== 'body') await chrome.tabs.update(state.gmailTabId, { url, active: true });
    else await chrome.tabs.create({ url });
    await transaction(store => {
      const saved = store.state.subscriptions.find(s => s.id === item.id);
      if (saved) { saved.status = 'opened'; saved.detail = 'Opened for manual review. Finish the unsubscribe step in Gmail or on the sender’s website.'; saved.actedAt = Date.now(); saveChoice(store, saved); }
    });
  } else if (command.type === 'CLEAR') {
    await transaction(store => {
      busy(store); const { connected, email, settings, gmailTabId, gmailBase } = store.state;
      store.state = { ...emptyState(), connected, email, settings, gmailTabId, gmailBase }; delete store.choices;
    });
  } else throw new Error('Unsupported extension command.');
  return (await readStore()).state;
}
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (reply: Reply) => void) => {
  if (sender.id !== chrome.runtime.id || !sender.url || new URL(sender.url).pathname !== '/index.html'
      || !sender.url.startsWith(chrome.runtime.getURL('index.html'))) return false;
  if (!message || typeof message !== 'object' || !('type' in message)) return false;
  void handle(message as Command).then(state => sendResponse({ ok: true, state })).catch(error => sendResponse({ ok: false, error: errorText(error) }));
  return true;
});
chrome.action.onClicked.addListener(() => { void chrome.tabs.create({ url: chrome.runtime.getURL('index.html') }); });
chrome.tabs.onRemoved.addListener(tabId => {
  void ready.then(async () => {
    if ((await readStore()).state.gmailTabId !== tabId) return;
    if (scanRun) scanRun.cancelled = true;
    if (batchRun) batchRun.cancelled = true;
    await transaction(store => { store.state.connected = false; delete store.state.gmailTabId; });
  });
});
