import { afterEach, describe, expect, it, vi } from 'vitest';
import { findNativeControl, nativeUnsubscribe, readGmailPage } from '../src/lib/gmail-dom';
import { ACCOUNT, BASE, dom, inboxRow, managerRow, subscription } from './fixtures';

afterEach(() => vi.useRealTimers());
describe('read-only Gmail DOM scanning', () => {
  it('finds native inbox controls without opening a conversation or fetching anything', () => {
    const browser = dom(`<table>${inboxRow()}${inboxRow('id2', 'other@example.com', false)}</table>`);
    const click = vi.fn(); browser.window.document.body.addEventListener('click', click);
    const snapshot = readGmailPage(browser.window.document, `${BASE}#inbox`, ACCOUNT);
    expect(snapshot).toMatchObject({ kind: 'inbox', examined: 2, email: ACCOUNT });
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]).toMatchObject({ email: 'news@example.com', method: 'gmail', source: 'gmail-inbox', messageId: 'abc123' });
    expect(click).not.toHaveBeenCalled();
  });
  it('reads manager rows and retains approximate volume labels without inventing totals', () => {
    const browser = dom(`<table role="grid" aria-label="subscriptions">${managerRow()}</table>`, '#sub');
    const snapshot = readGmailPage(browser.window.document, `${BASE}#sub`, ACCOUNT);
    expect(snapshot.items[0]).toMatchObject({ name: 'Example News', count: 0, countLabel: '20+ emails recently', source: 'gmail-subscriptions' });
    expect(snapshot.hasNext).toBe(false);
  });
  it('ignores cached hidden inboxes and forged message-body controls', () => {
    const browser = dom(`<div style="display:none"><table>${inboxRow()}</table></div><div class="a3s"><table>${inboxRow('evil', 'evil@example.com')}</table><button>Unsubscribe</button></div>`);
    expect(readGmailPage(browser.window.document, `${BASE}#inbox`, ACCOUNT).items).toEqual([]);
    expect(findNativeControl(browser.window.document, subscription({ email: 'evil@example.com' }))).toBeUndefined();
  });
  it('requires exact sender matching for actions', () => {
    const browser = dom(`<table>${inboxRow('id', 'other@example.com')}</table>`);
    expect(findNativeControl(browser.window.document, subscription())).toBeUndefined();
  });
  it('rejects account changes and pages without a signed-in account', () => {
    const browser = dom(`<table>${inboxRow()}</table>`);
    expect(() => readGmailPage(browser.window.document, `${BASE}#inbox`, 'someone@gmail.com')).toThrow('account changed');
    browser.window.document.title = 'Gmail';
    expect(() => readGmailPage(browser.window.document, `${BASE}#inbox`)).toThrow('Sign in');
  });
  it('finds an explicit footer link only in an already-open email, always manually', () => {
    const browser = dom('<div data-message-id="1"><span email="news@example.com" name="Example News"></span><div class="a3s"><a href="https://example.com/leave">Unsubscribe</a></div></div>');
    expect(readGmailPage(browser.window.document, `${BASE}#inbox/123`, ACCOUNT, false).items).toEqual([]);
    expect(readGmailPage(browser.window.document, `${BASE}#inbox/123`, ACCOUNT, true).items[0]).toMatchObject({ source: 'body', method: 'link', url: 'https://example.com/leave' });
  });
});

describe('Gmail native unsubscribe execution', () => {
  it('confirms only the expected sender and requires a fresh Gmail success notice', async () => {
    vi.useFakeTimers();
    const browser = dom(`<table role="grid" aria-label="subscriptions">${managerRow()}</table>`, '#sub');
    const document = browser.window.document;
    const native = document.querySelector('button')!;
    const confirmClick = vi.fn();
    native.addEventListener('click', () => {
      document.body.insertAdjacentHTML('beforeend', '<div role="dialog">Unsubscribe from Example News?<button>Unsubscribe</button><button>Cancel</button></div>');
      document.querySelector('[role="dialog"] button')!.addEventListener('click', () => {
        confirmClick(); document.querySelector('[role="dialog"]')!.remove();
        document.body.insertAdjacentHTML('beforeend', '<div role="alert">You have been unsubscribed from Example News.</div>');
      });
    });
    const pending = nativeUnsubscribe(document, ACCOUNT, subscription());
    await vi.advanceTimersByTimeAsync(200);
    expect(await pending).toMatchObject({ status: 'sent' });
    expect(confirmClick).toHaveBeenCalledTimes(1);
  });
  it('leaves website actions manual and never clicks Go to website or Block', async () => {
    const browser = dom(`<table role="grid" aria-label="subscriptions">${managerRow()}</table>`, '#sub');
    const document = browser.window.document;
    const external = vi.fn();
    document.querySelector('button')!.addEventListener('click', () => {
      document.body.insertAdjacentHTML('beforeend', '<div role="dialog">Unsubscribe from Example News on their website?<button>Go to website</button><button>Block</button><button>Cancel</button></div>');
      for (const button of document.querySelectorAll('[role="dialog"] button')) if (button.textContent !== 'Cancel') button.addEventListener('click', external);
    });
    expect(await nativeUnsubscribe(document, ACCOUNT, subscription())).toMatchObject({ status: 'manual' });
    expect(external).not.toHaveBeenCalled();
  });
  it('never confirms a dialog for a different sender', async () => {
    const browser = dom(`<table>${inboxRow()}</table>`);
    const document = browser.window.document;
    const confirm = vi.fn();
    document.querySelector('[role="button"]')!.addEventListener('click', () => {
      document.body.insertAdjacentHTML('beforeend', '<div role="dialog">Unsubscribe from Unrelated Company?<button>Unsubscribe</button></div>');
      document.querySelector('[role="dialog"] button')!.addEventListener('click', confirm);
    });
    expect((await nativeUnsubscribe(document, ACCOUNT, subscription())).status).toBe('unknown');
    expect(confirm).not.toHaveBeenCalled();
  });
  it('does not act while a pre-existing Gmail dialog is open', async () => {
    const browser = dom(`<table>${inboxRow()}</table><div role="dialog">Compose something</div>`);
    const click = vi.fn(); browser.window.document.body.addEventListener('click', click);
    expect((await nativeUnsubscribe(browser.window.document, ACCOUNT, subscription())).status).toBe('failed');
    expect(click).not.toHaveBeenCalled();
  });
  it('does not treat stale success or message-body success text as evidence', async () => {
    vi.useFakeTimers();
    const browser = dom(`<table>${inboxRow()}</table><div role="alert">You have been unsubscribed.</div><div class="a3s"><div role="alert">You have been unsubscribed from Example News.</div></div>`);
    const pending = nativeUnsubscribe(browser.window.document, ACCOUNT, subscription());
    await vi.advanceTimersByTimeAsync(10_100);
    expect((await pending).status).toBe('unknown');
  });
  it('accepts a newly refreshed success toast even if Gmail reuses its node and wording', async () => {
    vi.useFakeTimers();
    const browser = dom(`<table>${inboxRow()}</table><div role="alert">You have been unsubscribed.</div>`);
    const document = browser.window.document;
    document.querySelector('[role="button"]')!.addEventListener('click', () => {
      document.querySelector('[role="alert"]')!.innerHTML = '<span>You have been unsubscribed.</span>';
    });
    const pending = nativeUnsubscribe(document, ACCOUNT, subscription());
    await vi.advanceTimersByTimeAsync(200);
    expect((await pending).status).toBe('sent');
  });
});
