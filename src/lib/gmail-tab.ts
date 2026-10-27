import type { GmailPage, NativeResult, PageCommand, PageReply, ScanSettings, Subscription } from '../types';
import { gmailBase, senderSearch } from './urls';

async function inject(tabId: number) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'], world: 'ISOLATED' });
}
async function request(tabId: number, message: PageCommand): Promise<PageReply> {
  const tab = await chrome.tabs.get(tabId).catch(() => { throw new Error('The attached Gmail tab was closed. Open Gmail and attach its tab again.'); });
  if (!tab.url || !gmailBase(tab.url)) throw new Error('The attached tab left Gmail. Open Gmail and attach its tab again.');
  // Only read commands may be retried after reinjection. Never repeat a native action.
  let reply: PageReply;
  try { reply = await chrome.tabs.sendMessage<PageCommand, PageReply>(tabId, message); }
  catch (error) {
    if (message.type === 'UNCLUTTER_UNSUBSCRIBE') throw error;
    await inject(tabId);
    reply = await chrome.tabs.sendMessage<PageCommand, PageReply>(tabId, message);
  }
  if (!reply?.ok) throw new Error(reply && !reply.ok ? reply.error : 'Gmail did not respond. Reload Gmail and attach its tab again.');
  return reply;
}
async function pageRequest(tabId: number, message: PageCommand): Promise<GmailPage> {
  const reply = await request(tabId, message);
  if (!reply.ok || !reply.page) throw new Error('Gmail did not return a page snapshot.');
  return reply.page;
}
export async function attachGmail(preferred?: number): Promise<{ tabId: number; page: GmailPage }> {
  const tabs = (await chrome.tabs.query({ url: 'https://mail.google.com/*' }))
    .filter(tab => tab.id && tab.url && gmailBase(tab.url))
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0) || Number(b.id === preferred) - Number(a.id === preferred));
  const tab = tabs[0];
  if (!tab?.id) {
    await chrome.tabs.create({ url: 'https://mail.google.com/mail/' });
    throw new Error('Gmail was opened. Sign in there, then return and click Attach Gmail tab.');
  }
  await inject(tab.id);
  return { tabId: tab.id, page: await pageRequest(tab.id, { type: 'UNCLUTTER_PROBE' }) };
}
export const probeGmail = (tabId: number) => pageRequest(tabId, { type: 'UNCLUTTER_PROBE' });
export async function scanStart(tabId: number, email: string, base: string, settings: ScanSettings): Promise<GmailPage> {
  if (!gmailBase(base)) throw new Error('Attach a supported Gmail tab first.');
  if (settings.mode === 'current') return pageRequest(tabId, { type: 'UNCLUTTER_PAGE', email, lookInBody: settings.lookInBody });
  const query = `in:inbox${settings.days ? ` newer_than:${settings.days}d` : ''}`;
  const route = settings.mode === 'subscriptions' ? '#sub' : `#search/${encodeURIComponent(query)}`;
  await chrome.tabs.update(tabId, { url: `${base}${route}` });
  return pageRequest(tabId, { type: 'UNCLUTTER_PAGE', email, lookInBody: false, route, kind: settings.mode });
}
export const scanNext = (tabId: number, email: string, fingerprint: string) =>
  pageRequest(tabId, { type: 'UNCLUTTER_NEXT', email, fingerprint });

export async function unsubscribeInGmail(tabId: number, email: string, base: string, item: Subscription): Promise<NativeResult> {
  try {
    const probe = await probeGmail(tabId);
    if (probe.email !== email || probe.base !== base) throw new Error('The Gmail account changed. Reattach the correct tab.');
    const route = item.source === 'gmail-subscriptions' ? '#sub' : new URL(senderSearch(base, item.email)).hash;
    await chrome.tabs.update(tabId, { url: `${base}${route}` });
    await pageRequest(tabId, { type: 'UNCLUTTER_PAGE', email, lookInBody: false, route,
      kind: item.source === 'gmail-subscriptions' ? 'subscriptions' : 'inbox' });
  } catch (error) {
    return { status: 'failed', detail: error instanceof Error ? error.message : 'The sender could not be located in Gmail.' };
  }
  try {
    const reply = await request(tabId, { type: 'UNCLUTTER_UNSUBSCRIBE', email, item });
    if (!reply.ok || !reply.result) throw new Error('No action result');
    return reply.result;
  } catch {
    return { status: 'unknown', detail: 'The Gmail tab stopped responding during the action. Check the result in Gmail; this sender will not be retried automatically.' };
  }
}
