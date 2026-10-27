export type Method = 'gmail' | 'link' | 'mailto';
export type SubscriptionStatus = 'active' | 'kept' | 'queued' | 'sending' | 'sent' | 'failed' | 'unknown' | 'opened';
export interface Subscription {
  id: string;
  name: string;
  email: string;
  domain: string;
  listId?: string;
  subject: string;
  messageId: string;
  count: number;
  countLabel?: string;
  latest: number;
  method: Method;
  source: 'gmail-inbox' | 'gmail-subscriptions' | 'body';
  url: string;
  status: SubscriptionStatus;
  detail?: string;
  actedAt?: number;
}
export interface ScanSettings {
  mode: 'subscriptions' | 'inbox' | 'current';
  limit: number;
  days: number;
  lookInBody: boolean;
}
export interface ScanProgress {
  status: 'idle' | 'running' | 'complete' | 'cancelled' | 'error';
  processed: number;
  failed: number;
  found: number;
  limitReached: boolean;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}
export interface AppState {
  version: 2;
  email?: string;
  connected: boolean;
  subscriptions: Subscription[];
  scan: ScanProgress;
  settings: ScanSettings;
  batchRunning: boolean;
  gmailTabId?: number;
  gmailBase?: string;
}
export type Command =
  | { type: 'GET_STATE' }
  | { type: 'CONNECT' }
  | { type: 'OPEN_GMAIL' }
  | { type: 'DISCONNECT' }
  | { type: 'SCAN'; settings: ScanSettings }
  | { type: 'CANCEL_SCAN' }
  | { type: 'KEEP'; ids: string[]; keep: boolean }
  | { type: 'BATCH'; ids: string[] }
  | { type: 'STOP_BATCH' }
  | { type: 'OPEN_MANUAL'; id: string }
  | { type: 'CLEAR' };
export type Reply = { ok: true; state: AppState } | { ok: false; error: string };
export const DEFAULT_SETTINGS: ScanSettings = { mode: 'subscriptions', limit: 500, days: 90, lookInBody: true };
export const emptyState = (): AppState => ({
  version: 2,
  connected: false,
  subscriptions: [],
  scan: { status: 'idle', processed: 0, failed: 0, found: 0, limitReached: false },
  settings: { ...DEFAULT_SETTINGS },
  batchRunning: false,
});

export interface GmailPage {
  email: string;
  base: string;
  url: string;
  kind: 'subscriptions' | 'inbox' | 'message' | 'unsupported';
  items: Subscription[];
  examined: number;
  fingerprint: string;
  hasNext: boolean;
}
export type PageCommand =
  | { type: 'UNCLUTTER_PROBE' }
  | { type: 'UNCLUTTER_PAGE'; email: string; lookInBody: boolean; kind?: GmailPage['kind']; route?: string }
  | { type: 'UNCLUTTER_NEXT'; email: string; fingerprint: string }
  | { type: 'UNCLUTTER_UNSUBSCRIBE'; email: string; item: Subscription };
export interface NativeResult { status: 'sent' | 'failed' | 'unknown' | 'manual'; detail: string }
export type PageReply = { ok: true; page?: GmailPage; result?: NativeResult } | { ok: false; error: string };
