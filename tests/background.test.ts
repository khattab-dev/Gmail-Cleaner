import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyState, type AppState, type Command, type Reply } from '../src/types';
import { ACCOUNT, BASE, pageSnapshot, subscription } from './fixtures';

const mocks = vi.hoisted(() => ({ attachGmail: vi.fn(), probeGmail: vi.fn(), scanStart: vi.fn(), scanNext: vi.fn(), unsubscribeInGmail: vi.fn() }));
vi.mock('../src/lib/gmail-tab', () => mocks);
let saved: Record<string, unknown>;
let receive: (command: unknown, sender: { id: string; url: string }, reply: (value: Reply) => void) => boolean;
const extensionUrl = 'chrome-extension://unclutter-test/index.html';
const sender = { id: 'unclutter-test', url: extensionUrl };
const snapshot = () => structuredClone(saved.unclutter) as { state: AppState; choices?: unknown };
const send = (command: Command): Promise<Reply> => new Promise(resolve => { receive(command, sender, resolve); });
const settings = { ...emptyState().settings, mode: 'inbox' as const };
async function initialize(state: AppState = { ...emptyState(), connected: true, email: ACCOUNT, gmailBase: BASE, gmailTabId: 7 }) {
  saved = { unclutter: { state } };
  vi.stubGlobal('chrome', {
    runtime: { id: sender.id, getURL: () => extensionUrl, onMessage: { addListener: (handler: typeof receive) => { receive = handler; } } },
    storage: { local: { get: async () => structuredClone(saved), set: async (data: Record<string, unknown>) => { saved = { ...saved, ...structuredClone(data) }; }, setAccessLevel: vi.fn() } },
    action: { onClicked: { addListener: vi.fn() } }, tabs: { create: vi.fn(), update: vi.fn(), onRemoved: { addListener: vi.fn() } },
  });
  await import('../src/background'); await send({ type: 'GET_STATE' });
}
beforeEach(() => {
  vi.resetModules();
  mocks.attachGmail.mockResolvedValue({ tabId: 7, page: pageSnapshot() });
  mocks.probeGmail.mockResolvedValue(pageSnapshot());
  mocks.scanStart.mockResolvedValue(pageSnapshot());
  mocks.scanNext.mockResolvedValue(pageSnapshot({ items: [subscription({ messageId: 'def', latest: 1760000000010 })], fingerprint: 'def' }));
  mocks.unsubscribeInGmail.mockResolvedValue({ status: 'sent', detail: 'Gmail reported success.' });
});

describe('Gmail-tab background jobs', () => {
  it('attaches an existing Gmail account without OAuth', async () => {
    await initialize();
    expect(await send({ type: 'CONNECT' })).toMatchObject({ ok: true, state: { connected: true, email: ACCOUNT, gmailTabId: 7 } });
    expect(mocks.unsubscribeInGmail).not.toHaveBeenCalled();
  });
  it('scans multiple pages, groups senders, and never acts during discovery', async () => {
    await initialize(); mocks.scanStart.mockResolvedValueOnce(pageSnapshot({ hasNext: true }));
    await send({ type: 'SCAN', settings });
    await vi.waitFor(() => expect(snapshot().state.scan.status).toBe('complete'));
    expect(snapshot().state.scan.processed).toBe(2);
    expect(snapshot().state.subscriptions[0]).toMatchObject({ count: 2, messageId: 'def' });
    expect(mocks.unsubscribeInGmail).not.toHaveBeenCalled();
  });
  it('rejects scanning when the attached account changed', async () => {
    await initialize(); mocks.probeGmail.mockResolvedValueOnce(pageSnapshot({ email: 'different@gmail.com' }));
    expect(await send({ type: 'SCAN', settings })).toMatchObject({ ok: false, error: expect.stringContaining('account changed') });
    expect(mocks.scanStart).not.toHaveBeenCalled();
  });
  it('keeps sender choices across later scans', async () => {
    await initialize({ ...emptyState(), connected: true, email: ACCOUNT, gmailBase: BASE, gmailTabId: 7, subscriptions: [subscription()] });
    await send({ type: 'KEEP', ids: ['news@example.com'], keep: true });
    await send({ type: 'SCAN', settings });
    await vi.waitFor(() => expect(snapshot().state.scan.status).toBe('complete'));
    expect(snapshot().state.subscriptions[0]?.status).toBe('kept');
  });
  it('never queues manual links, unknown IDs, or kept senders', async () => {
    await initialize({ ...emptyState(), connected: true, email: ACCOUNT, gmailBase: BASE, gmailTabId: 7, subscriptions: [subscription({ status: 'kept' }), subscription({ id: 'manual', method: 'link' })] });
    for (const id of ['news@example.com', 'manual', 'missing']) expect((await send({ type: 'BATCH', ids: [id] })).ok).toBe(false);
    expect(mocks.unsubscribeInGmail).not.toHaveBeenCalled();
  });
  it('records a clear native result and sends exactly once', async () => {
    await initialize({ ...emptyState(), connected: true, email: ACCOUNT, gmailBase: BASE, gmailTabId: 7, subscriptions: [subscription()] });
    await send({ type: 'BATCH', ids: ['news@example.com'] });
    await vi.waitFor(() => expect(snapshot().state.batchRunning).toBe(false));
    expect(snapshot().state.subscriptions[0]?.status).toBe('sent');
    expect(mocks.unsubscribeInGmail).toHaveBeenCalledTimes(1);
  });
  it('stops the queue on an uncertain result and never retries it', async () => {
    await initialize({ ...emptyState(), connected: true, email: ACCOUNT, gmailBase: BASE, gmailTabId: 7, subscriptions: [subscription(), subscription({ id: 'second', email: 'second@example.com' })] });
    mocks.unsubscribeInGmail.mockResolvedValueOnce({ status: 'unknown', detail: 'Unfamiliar dialog' });
    await send({ type: 'BATCH', ids: ['news@example.com', 'second'] });
    await vi.waitFor(() => expect(snapshot().state.batchRunning).toBe(false));
    expect(snapshot().state.subscriptions.map(s => s.status)).toEqual(['unknown', 'active']);
    expect(mocks.unsubscribeInGmail).toHaveBeenCalledTimes(1);
  });
  it('moves website-only results to manual review', async () => {
    await initialize({ ...emptyState(), connected: true, email: ACCOUNT, gmailBase: BASE, gmailTabId: 7, subscriptions: [subscription()] });
    mocks.unsubscribeInGmail.mockResolvedValueOnce({ status: 'manual', detail: 'Website confirmation required' });
    await send({ type: 'BATCH', ids: ['news@example.com'] });
    await vi.waitFor(() => expect(snapshot().state.batchRunning).toBe(false));
    expect(snapshot().state.subscriptions[0]).toMatchObject({ method: 'link', status: 'active' });
  });
  it('does not replay interrupted UI actions after a restart', async () => {
    await initialize({ ...emptyState(), connected: true, email: ACCOUNT, gmailBase: BASE, gmailTabId: 7, batchRunning: true, subscriptions: [subscription({ status: 'sending' }), subscription({ id: 'second', status: 'queued' })] });
    expect(snapshot().state.subscriptions.map(s => s.status)).toEqual(['unknown', 'active']);
    expect(snapshot().state.batchRunning).toBe(false);
    expect(mocks.unsubscribeInGmail).not.toHaveBeenCalled();
  });
  it('rejects commands from the Gmail content script or a lookalike dashboard path', async () => {
    await initialize(); const respond = vi.fn();
    expect(receive({ type: 'BATCH', ids: ['news@example.com'] }, { id: sender.id, url: `${BASE}#inbox` }, respond)).toBe(false);
    expect(receive({ type: 'BATCH', ids: ['news@example.com'] }, { id: sender.id, url: `${extensionUrl}.fake` }, respond)).toBe(false);
    expect(respond).not.toHaveBeenCalled();
  });
  it('stops unsent work while allowing an already-started action to finish once', async () => {
    await initialize({ ...emptyState(), connected: true, email: ACCOUNT, gmailBase: BASE, gmailTabId: 7, subscriptions: [subscription(), subscription({ id: 'second', email: 'second@example.com' })] });
    let finish!: (value: unknown) => void;
    mocks.unsubscribeInGmail.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await send({ type: 'BATCH', ids: ['news@example.com', 'second'] });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await send({ type: 'STOP_BATCH' });
    finish({ status: 'sent', detail: 'Gmail confirmed' });
    await vi.waitFor(() => expect(snapshot().state.batchRunning).toBe(false));
    expect(snapshot().state.subscriptions.map(s => s.status)).toEqual(['sent', 'active']);
    expect(mocks.unsubscribeInGmail).toHaveBeenCalledTimes(1);
  });
  it('ignores late page results after a scan was cancelled', async () => {
    await initialize();
    let finish!: (value: unknown) => void;
    mocks.scanStart.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await send({ type: 'SCAN', settings });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await send({ type: 'CANCEL_SCAN' }); finish(pageSnapshot());
    await vi.waitFor(() => expect(snapshot().state.scan.status).toBe('cancelled'));
    expect(snapshot().state.subscriptions).toEqual([]);
  });
  it('discards the old API schema rather than replaying old jobs', async () => {
    await initialize({ ...emptyState(), version: 1, batchRunning: true, subscriptions: [subscription({ status: 'sending' })] } as unknown as AppState);
    expect(snapshot().state).toMatchObject({ version: 2, connected: false, batchRunning: false, subscriptions: [] });
    expect(mocks.unsubscribeInGmail).not.toHaveBeenCalled();
  });
});
