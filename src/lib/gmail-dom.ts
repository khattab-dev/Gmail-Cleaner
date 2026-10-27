import type { GmailPage, NativeResult, Subscription } from '../types';
import { gmailBase, safeHttpsUrl, safeMailto, senderSearch } from './urls';

const EMAIL = /^[^\s<>@(),;]+@[^\s<>@(),;]+\.[^\s<>@(),;]+$/;
const UNSUBSCRIBE = /^(?:unsubscribe|إلغاء الاشتراك|الغاء الاشتراك|إلغاء الإشتراك)$/i;
const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
export const inMessageBody = (element: Element) => !!element.closest('.a3s,.gmail_quote,[data-unclutter-email-body]');

export function visible(element: Element): boolean {
  for (let parent: Element | null = element; parent; parent = parent.parentElement) {
    const style = element.ownerDocument.defaultView?.getComputedStyle(parent);
    if (parent.getAttribute('aria-hidden') === 'true' || parent.hasAttribute('hidden') || style?.display === 'none' || style?.visibility === 'hidden') return false;
  }
  return element.getClientRects().length > 0;
}
function buttons(root: ParentNode) {
  return [...root.querySelectorAll<HTMLElement>('button,[role="button"]')].filter(element => !inMessageBody(element));
}
function unsubscribeButton(root: ParentNode, allowHidden = false) {
  return buttons(root).find(element => UNSUBSCRIBE.test(clean(element.getAttribute('aria-label')) || clean(element.textContent))
    && (allowHidden || visible(element)) && element.getAttribute('aria-disabled') !== 'true' && !element.hasAttribute('disabled'));
}
export function accountEmail(document: Document): string {
  const title = document.title.match(/ - ([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+) - Gmail$/i)?.[1];
  const label = document.querySelector('[aria-label^="Google Account:"],[aria-label^="حساب Google:"]')?.getAttribute('aria-label');
  const email = title ?? label?.match(/\(([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)\)/)?.[1];
  if (!email || !EMAIL.test(email)) throw new Error('Sign in to Gmail and wait for your inbox to load, then attach the Gmail tab again.');
  return email.toLowerCase();
}
function assertAccount(document: Document, expected?: string): string {
  const email = accountEmail(document);
  if (expected && expected.toLowerCase() !== email) throw new Error('The Gmail account changed. Attach the correct tab again before continuing.');
  return email;
}
function subscriptionGrid(document: Document) {
  return [...document.querySelectorAll('table[aria-label="subscriptions"],table[aria-label="الاشتراكات"]')].find(visible);
}
function inboxRows(document: Document) {
  return [...document.querySelectorAll<HTMLElement>('tr[role="row"]')].filter(row =>
    visible(row) && !!row.querySelector('[data-legacy-thread-id]') && !!row.querySelector('[email]') && !inMessageBody(row));
}
function subscriptionRows(document: Document) {
  return [...(subscriptionGrid(document)?.querySelectorAll<HTMLElement>('tr[data-row-id]') ?? [])]
    .filter(row => EMAIL.test(row.getAttribute('data-row-id') ?? '') && visible(row));
}
export function olderButton(document: Document): HTMLElement | undefined {
  return buttons(document).find(element => /^(?:Older|أقدم)$/i.test(clean(element.getAttribute('aria-label')) || clean(element.getAttribute('data-tooltip')))
    && visible(element) && element.getAttribute('aria-disabled') !== 'true' && !element.hasAttribute('disabled'));
}
function baseItem(email: string, name: string, base: string): Subscription {
  return { id: email.toLowerCase(), email: email.toLowerCase(), name: name || email, domain: email.split('@')[1]!,
    subject: '', messageId: '', count: 1, latest: 0, method: 'gmail', source: 'gmail-inbox',
    url: senderSearch(base, email), status: 'active' };
}

export function readGmailPage(document: Document, href: string, expected?: string, lookInBody = false): GmailPage {
  const base = gmailBase(href);
  if (!base) throw new Error('This tab is not a supported Gmail page.');
  const email = assertAccount(document, expected);
  const grid = subscriptionGrid(document);
  const nativeRows = grid ? subscriptionRows(document) : inboxRows(document);
  const items: Subscription[] = [];
  const fingerprints: string[] = [];
  for (const row of nativeRows) {
    if (grid) {
      const sender = row.getAttribute('data-row-id')!.toLowerCase();
      fingerprints.push(sender);
      if (!unsubscribeButton(row)) continue;
      const cells = row.querySelectorAll('td');
      const item = baseItem(sender, clean(cells[1]?.textContent), base);
      item.source = 'gmail-subscriptions';
      item.countLabel = clean(cells[3]?.textContent) || 'Recent volume unavailable';
      // Gmail shows ranges, so do not invent a numeric email count.
      item.count = 0;
      items.push(item);
    } else {
      const id = row.querySelector('[data-legacy-thread-id]')!.getAttribute('data-legacy-thread-id')!;
      const senderNode = row.querySelector('.yW [email]') ?? row.querySelector('[email]')!;
      const sender = senderNode.getAttribute('email')?.toLowerCase() ?? '';
      fingerprints.push(id);
      // Gmail owns .aKS. Never take an action from the email body or arbitrary links.
      const native = row.querySelector('.aKS');
      if (!EMAIL.test(sender) || !native || !unsubscribeButton(native, true)) continue;
      const item = baseItem(sender, clean(senderNode.getAttribute('name')) || clean(senderNode.textContent), base);
      item.messageId = id;
      item.subject = clean(row.querySelector('.bog')?.textContent);
      item.latest = Date.parse(row.querySelector('.xW [title]')?.getAttribute('title')?.replace(/[\u202f\u00a0]/g, ' ') ?? '') || 0;
      item.countLabel = '1 matching conversation';
      items.push(item);
    }
  }
  const body = [...document.querySelectorAll<HTMLElement>('.a3s')].find(visible);
  if (!nativeRows.length && body && lookInBody) {
    const message = body.closest('[data-message-id],.adn') ?? body.parentElement;
    const senderNode = message?.querySelector('[email]');
    const sender = senderNode?.getAttribute('email')?.toLowerCase() ?? '';
    if (EMAIL.test(sender)) {
      for (const link of body.querySelectorAll<HTMLAnchorElement>('a[href]')) {
        if (!/\bunsubscribe\b|opt[ -]?out|إلغاء الاشتراك/i.test(clean(link.textContent))) continue;
        const url = safeHttpsUrl(link.getAttribute('href') ?? '') ?? safeMailto(link.getAttribute('href') ?? '');
        if (!url) continue;
        const item = baseItem(sender, clean(senderNode?.getAttribute('name')) || clean(senderNode?.textContent), base);
        item.url = url; item.method = url.startsWith('mailto:') ? 'mailto' : 'link'; item.source = 'body';
        item.subject = clean(document.querySelector('h2.hP')?.textContent);
        items.push(item); break;
      }
    }
  }
  return { email, base, url: href, items, examined: nativeRows.length || (body ? 1 : 0),
    kind: grid ? 'subscriptions' : nativeRows.length ? 'inbox' : body ? 'message' : 'unsupported',
    fingerprint: fingerprints.join('|'), hasNext: !grid && !!nativeRows.length && !!olderButton(document) };
}

export function findNativeControl(document: Document, item: Subscription): HTMLElement | undefined {
  if (item.method !== 'gmail') return;
  const row = subscriptionRows(document).find(row => row.getAttribute('data-row-id')?.toLowerCase() === item.email.toLowerCase());
  if (row) return unsubscribeButton(row);
  const inbox = inboxRows(document).find(row =>
    (row.querySelector('.yW [email]') ?? row.querySelector('[email]'))?.getAttribute('email')?.toLowerCase() === item.email.toLowerCase());
  const native = inbox?.querySelector('.aKS');
  return native ? unsubscribeButton(native, true) : undefined;
}
export function nativeDialogs(document: Document): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"],[role="alertdialog"],.Kj-JD')]
    .filter(element => visible(element) && !inMessageBody(element) && !element.closest('[data-message-id]'));
}
function notices(document: Document): { element: Element; text: string }[] {
  return [...document.querySelectorAll('[role="alert"],[role="status"]')]
    .filter(element => visible(element) && !inMessageBody(element) && !element.closest('[data-message-id],[role="dialog"],[role="alertdialog"],.Kj-JD'))
    .map(element => ({ element, text: clean(element.textContent) })).filter(notice => !!notice.text);
}
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export async function waitForPage(document: Document, href: () => string, expected: string): Promise<GmailPage> {
  const start = Date.now();
  do {
    try {
      const page = readGmailPage(document, href(), expected);
      if (page.kind !== 'unsupported') return page;
      // An empty Gmail results page is still a supported list view.
      const text = clean(document.body.textContent);
      if (/No (?:conversations|messages)|Your (?:Primary tab|inbox) is empty|لم يتم العثور على|لا توجد محادثات/i.test(text)) return { ...page, kind: 'inbox' };
    } catch (error) {
      if (error instanceof Error && /account changed/.test(error.message)) throw error;
    }
    await pause(200);
  } while (Date.now() - start < 12_000);
  throw new Error('Gmail’s list did not load. Open Gmail in its standard desktop view, wait for loading to finish, and try again.');
}

export async function nativeUnsubscribe(document: Document, expected: string, item: Subscription): Promise<NativeResult> {
  assertAccount(document, expected);
  if (nativeDialogs(document).length) return { status: 'failed', detail: 'Close the open Gmail dialog before starting a batch.' };
  const control = findNativeControl(document, item);
  if (!control) return { status: 'failed', detail: 'Gmail’s unsubscribe control was not found for this sender. Scan again or review the sender in Gmail.' };
  const previous = new Map(notices(document).map(notice => [notice.element, notice.text]));
  const refreshed = new Set<Element>();
  const Observer = document.defaultView!.MutationObserver;
  const observer = new Observer(records => {
    for (const record of records) {
      const element = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
      const notice = element?.closest('[role="alert"],[role="status"]');
      if (notice) refreshed.add(notice);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  let confirmed = false;
  try {
  control.click();
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    try { assertAccount(document, expected); }
    catch { return { status: 'unknown', detail: 'The Gmail account changed during the action. Check the result in Gmail.' }; }
    for (const { text: notice } of notices(document).filter(({ element, text }) => previous.get(element) !== text || refreshed.has(element))) {
      if (/could(?:n['’]t| not)|unable|failed|not unsubscribed|تعذّر|تعذر|فشل/i.test(notice)) return { status: 'failed', detail: notice.slice(0, 500) };
      if (/\bunsubscribed\b|unsubscribe request (?:has been )?sent|تم إلغاء الاشتراك|تم إرسال طلب/i.test(notice)) {
        return { status: 'sent', detail: `Gmail reported: ${notice.slice(0, 400)}. The sender may take a few days to stop emailing.` };
      }
    }
    const dialogs = nativeDialogs(document);
    if (dialogs.length) {
      const dialog = dialogs[0]!;
      const text = clean(dialog.textContent);
      const matchesSender = text.toLowerCase().includes(item.email.toLowerCase()) || (item.name.length >= 3 && text.toLowerCase().includes(item.name.toLowerCase()));
      if (!matchesSender || !/unsubscribe|إلغاء الاشتراك/i.test(text)) {
        return { status: 'unknown', detail: 'Gmail displayed an unfamiliar confirmation. Review the open dialog yourself.' };
      }
      if (/go to (?:the )?website|visit (?:the )?website|الانتقال إلى الموقع/i.test(text)) {
        const cancel = buttons(dialog).find(button => /^(?:Cancel|إلغاء)$/i.test(clean(button.textContent)) && visible(button));
        cancel?.click();
        return { status: 'manual', detail: 'This sender requires a website confirmation. Use Review to finish in Gmail.' };
      }
      if (!confirmed) {
        const confirm = unsubscribeButton(dialog);
        if (!confirm) return { status: 'unknown', detail: 'Gmail needs your input. Review the dialog in the Gmail tab.' };
        confirmed = true;
        confirm.click();
      }
    }
    await pause(150);
  }
  return { status: 'unknown', detail: 'Gmail did not show a clear success message. The request may have been sent; check the result before retrying.' };
  } finally { observer.disconnect(); }
}
