import { JSDOM } from 'jsdom';
import type { GmailPage, Subscription } from '../src/types';

export const ACCOUNT = 'me@gmail.com';
export const BASE = 'https://mail.google.com/mail/u/0/';
export function subscription(changes: Partial<Subscription> = {}): Subscription {
  return { id: 'news@example.com', name: 'Example News', email: 'news@example.com', domain: 'example.com', subject: 'The weekly edition', messageId: 'abc123', count: 1, latest: 1760000000000, method: 'gmail', source: 'gmail-inbox', url: `${BASE}#search/from%3Anews%40example.com`, status: 'active', ...changes };
}
export function inboxRow(id = 'abc123', email = 'news@example.com', control = true) {
  return `<tr role="row" class="zA"><td class="yW"><span email="${email}" name="Example News">Example News</span></td><td><span class="bog"><span data-legacy-thread-id="${id}">The weekly edition</span></span><span class="aKS">${control ? '<div role="button">Unsubscribe</div>' : ''}</span></td><td class="xW"><span title="Mon, Oct 26, 2026, 11:29 AM">Oct 26</span></td></tr>`;
}
export function managerRow(email = 'news@example.com', name = 'Example News', count = '20+ emails recently') {
  return `<tr role="row" data-row-id="${email}" aria-label="Sender details"><td>E</td><td>${name}</td><td>${email}</td><td>${count}</td><td><div data-email="${email}"><button aria-label="Unsubscribe">Unsubscribe</button></div></td></tr>`;
}
export function dom(markup: string, hash = '#inbox') {
  const instance = new JSDOM(`<!doctype html><title>Inbox - ${ACCOUNT} - Gmail</title><body>${markup}</body>`, { url: `${BASE}${hash}` });
  // jsdom has no layout. Rendered fixture nodes have a rectangle, hidden CSS still wins.
  instance.window.Element.prototype.getClientRects = function () {
    return [{ width: 100, height: 20 }] as unknown as DOMRectList;
  };
  return instance;
}
export const pageSnapshot = (changes: Partial<GmailPage> = {}): GmailPage => ({ email: ACCOUNT, base: BASE, url: `${BASE}#inbox`, kind: 'inbox', items: [subscription()], examined: 1, fingerprint: 'abc123', hasNext: false, ...changes });
