# Unclutter — Gmail Cleaner (no-cloud edition)

A TypeScript Chrome extension that groups subscriptions and runs reviewed unsubscribe queues through your existing Gmail browser tab. **No Google Cloud project, API key, OAuth client, test users, or Gmail API is needed.**

## Install or update

Requirements: Node.js 22+ and [pnpm](https://pnpm.io/installation).

```powershell
pnpm install
pnpm build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this project's **dist** folder. If already installed, click **Reload** instead. Chrome may ask you to approve the changed Gmail site access.
3. Open Gmail in Chrome and sign in normally.
4. Click the Unclutter toolbar icon, then **Attach Gmail tab**. Confirm the account address displayed in the dashboard.
5. Click **Scan Gmail**, select senders, and choose **Review unsubscribe**. The final **Process senders** button starts the queue.

Keep the attached Gmail tab open and let it finish navigating while a scan or batch runs. You can view progress in the dashboard. Do not manually navigate the Gmail tab during a task. The extension does not operate while Chrome is closed.

To choose a different account, focus its Gmail tab, return to Unclutter, and click **Settings → Attach Gmail tab**. The extension chooses the most recently used Gmail tab. Every action checks the signed-in account before proceeding. Switching accounts clears the old account's results.

The stable development extension ID is `cjebadbaconofdmfljkfmoeofildemgj`. The public key in `extension-key.json` keeps it consistent. There is no private key in this project.

## Choose a scan mode

**Subscription manager (default):** reads the loaded sender rows in Gmail's **More → Manage subscriptions** view. This covers subscriptions Gmail detects across your mailbox, including archived mail, rather than only your inbox. Gmail reports recent-volume ranges such as “20+ emails recently”; the extension preserves those ranges instead of inventing precise counts or dates. This view may not be available for every account. [Gmail documentation](https://support.google.com/mail/answer/15621070)

**Inbox conversations:** navigates to a Gmail search for `in:inbox`, with an optional date range, and pages through up to the configured limit (100–2,000 rows). It collects senders for which Gmail displays a native unsubscribe control. Counts represent matching **conversations**, not individual messages or mailbox-wide totals. The scanner does not open conversations, change unread state, delete messages, or archive them.

**Current Gmail view:** scans the loaded list page without navigating. If you already have an email open, the optional footer setting finds explicit unsubscribe links in that rendered message. Footer links always require manual review. The extension does not open unread messages to inspect their bodies.

Senders are grouped by exact email address. Gmail's native sender-wide action may unsubscribe from multiple mailing lists for that sender; review your selection accordingly. Keep choices and previous action outcomes are saved across scans until you clear local results. This prevents repeated unsubscribe actions when the same sender is scanned again.

## Bulk unsubscribe behavior

- Select up to **25 Gmail controls per batch**, then review and confirm.
- The extension finds the exact sender's native Gmail unsubscribe control, clicks it once, and handles only a recognized unsubscribe confirmation for that sender.
- Gmail performs the actual unsubscribe operation and **may send an unsubscribe email on your behalf**. The extension does not call Gmail's public API or undocumented backend endpoints, read cookies, or handle Google access tokens.
- “Request sent” is recorded only after a fresh Gmail success notice appears. It does not independently verify removal from the sender's list. Senders can take a few days to stop emailing.
- Website-only confirmations are placed in **Needs a step**. Use **Review** to finish in Gmail or on the sender's website. The queue never clicks **Block**, **Go to website**, or email-body buttons automatically.
- An unfamiliar confirmation or uncertain result stops the batch. Check the result in Gmail before trying anything again. Unknown outcomes are never automatically retried.
- **Stop queue** cancels remaining senders; an action already started may finish. On worker/browser restart, unsent items return to active and an interrupted action becomes **Check result**. No UI actions are replayed automatically.

## Privacy and permissions

The manifest requests only:

- **`storage`** for sender metadata, account address, displayed volume ranges, message subjects/IDs when available, manual unsubscribe URLs, settings, keep choices, and action outcomes. This is local Chrome profile storage, not encrypted separately and not synced by the extension. Full email bodies are not saved.
- **`scripting`** to inject an isolated content script on the attached Gmail tab.
- **`https://mail.google.com/*`** host access to read Gmail's rendered page and operate its native unsubscribe controls. There is no all-sites permission, identity permission, OAuth manifest entry, or direct access to unsubscribe servers.

There is no backend, telemetry, external font, or third-party inbox service. Gmail may load images as part of its normal rendering; the extension itself makes no fetch requests, downloads no attachments, and does not execute email HTML. Email content and page text are treated as data, never as commands.

**Settings → Clear local data** removes saved scan results and choices. **Detach** also removes the attached account metadata from the extension; it does not sign you out of Gmail. Chrome site access remains controlled from the extension's browser settings.

When upgrading from the API-based 1.x build, the previous app-state schema is discarded and old background jobs are not resumed. Any old `.env` client ID is unused. If you previously granted Google OAuth access, you can revoke that old grant from [Google Account connections](https://myaccount.google.com/connections); this version does not use it.

## Limitations

This version intentionally relies on Gmail's desktop page rather than a cloud integration. Gmail must be open and loaded. Its UI, translations, or selector changes can require an extension update. Current selectors cover inspected English Gmail markup, with some Arabic action labels; other locales may need additions. The subscription manager reads rendered rows, and current-view mode reads one loaded page. It cannot discover unsubscribe links in messages it has not opened or in rows where Gmail exposes no unsubscribe control. Use Current view on an email you open yourself to inspect its footer.

An already-open compose or confirmation dialog prevents automatic action. Close it before starting a batch. If the manager is unavailable, select Inbox conversations or Current Gmail view in Settings. If navigation stalls, stop and scan again; partial results remain available.

## Develop, test, and package

```powershell
pnpm dev                  # Browser demo at the printed local URL
pnpm test                 # DOM, URL, and worker tests
pnpm build                # Type-check + production extension in dist
pnpm exec playwright install chromium
pnpm test:ui              # Dashboard + built extension/content-script flows
pnpm package              # Build + release/unclutter-gmail.zip
```

The browser preview uses clearly labeled sample data; it cannot read Gmail. Demo actions never change actual subscriptions. Browser integration tests use synthetic Gmail-shaped pages in separate test profiles with intercepted requests. They exercise the real built extension, message transport, content-script injection, list pagination, and native confirmation handling without changing a real subscription. They are not evidence that every current Gmail account, UI experiment, or sender has been validated live.

```text
src/background.ts      Account attachment, scan/queue state, and reviewed commands
src/content.ts         Isolated Gmail content-script entry
src/lib/gmail-dom.ts   Gmail DOM readers and native confirmation handling
src/lib/gmail-tab.ts   Chrome tab navigation and content-script transport
src/lib/urls.ts        Gmail route and manual link validation
src/main.tsx           Dashboard, demo, settings, keep list, activity, review
tests/                 Sanitized DOM fixtures, worker tests, Playwright flows
scripts/               Manifest/content-script/icon build and ZIP packaging
```
