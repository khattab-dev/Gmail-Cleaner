import type { PageCommand, PageReply } from './types';
import { nativeUnsubscribe, olderButton, readGmailPage, waitForPage } from './lib/gmail-dom';

// Programmatic injection is idempotent and stays in Chrome's isolated world.
const scope = globalThis as typeof globalThis & { __unclutterV2?: boolean };
if (!scope.__unclutterV2) {
  scope.__unclutterV2 = true;
  let acting = false;
  chrome.runtime.onMessage.addListener((message: PageCommand, sender, reply: (value: PageReply) => void) => {
    if (sender.id !== chrome.runtime.id || !message?.type?.startsWith('UNCLUTTER_')) return false;
    const handle = async (): Promise<PageReply> => {
      if (message.type === 'UNCLUTTER_PROBE') return { ok: true, page: readGmailPage(document, location.href) };
      if (message.type === 'UNCLUTTER_PAGE') {
        const start = Date.now();
        while (message.route && !decodeURIComponent(location.hash).startsWith(decodeURIComponent(message.route))) {
          if (Date.now() - start > 12_000) throw new Error('The Gmail view changed. Reattach the Gmail tab and try again.');
          await new Promise(resolve => setTimeout(resolve, 150));
        }
        if (message.route) await new Promise(resolve => setTimeout(resolve, 700));
        let page = await waitForPage(document, () => location.href, message.email);
        while (message.kind && page.kind !== message.kind) {
          if (Date.now() - start > 12_000) throw new Error('This Gmail view is not available. Choose Current view or Inbox in Settings.');
          await new Promise(resolve => setTimeout(resolve, 200));
          page = await waitForPage(document, () => location.href, message.email);
        }
        return { ok: true, page: readGmailPage(document, location.href, message.email, message.lookInBody) };
      }
      if (message.type === 'UNCLUTTER_NEXT') {
        const page = readGmailPage(document, location.href, message.email);
        if (page.fingerprint !== message.fingerprint) throw new Error('The Gmail view changed. Scan again without navigating the attached tab.');
        const next = olderButton(document);
        if (!next) return { ok: true, page };
        next.click();
        const started = Date.now();
        while (Date.now() - started < 12_000) {
          await new Promise(resolve => setTimeout(resolve, 200));
          const updated = readGmailPage(document, location.href, message.email);
          if (updated.fingerprint && updated.fingerprint !== page.fingerprint) return { ok: true, page: updated };
        }
        throw new Error('The next Gmail page did not load. Partial results have been saved.');
      }
      if (message.type === 'UNCLUTTER_UNSUBSCRIBE') {
        if (acting) throw new Error('A Gmail unsubscribe action is already in progress.');
        acting = true;
        try { return { ok: true, result: await nativeUnsubscribe(document, message.email, message.item) }; }
        finally { acting = false; }
      }
      throw new Error('Unsupported Gmail page command.');
    };
    void handle().then(reply).catch(error => reply({ ok: false, error: error instanceof Error ? error.message : 'The Gmail page could not be read.' }));
    return true;
  });
}
