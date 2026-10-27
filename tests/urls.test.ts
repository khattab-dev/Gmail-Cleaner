import { describe, expect, it } from 'vitest';
import { gmailBase, manualUrl, safeHttpsUrl, safeMailto, senderSearch } from '../src/lib/urls';
import { subscription } from './fixtures';

describe('Gmail and manual link validation', () => {
  it.each(['http://example.com/leave', 'javascript:alert(1)', 'https://127.0.0.1/x', 'https://0x7f000001/x', 'https://[::1]/x', 'https://localhost/x', 'https://thing.local/x', 'https://name:password@example.com/x', 'https://example.com:123/x'])('blocks %s', url => expect(safeHttpsUrl(url)).toBeUndefined());
  it('preserves recipient tokens and strips fragments', () => expect(safeHttpsUrl('https://example.com/leave?token=abc#x')).toBe('https://example.com/leave?token=abc'));
  it('rejects lookalike Gmail hosts and preserves account slots', () => {
    expect(gmailBase('https://mail.google.com.evil.com/mail/u/0/')).toBeUndefined();
    expect(gmailBase('https://mail.google.com/mail/u/2/#inbox')).toBe('https://mail.google.com/mail/u/2/');
  });
  it('encodes sender search terms rather than allowing search injection', () => {
    expect(() => senderSearch('https://mail.google.com/mail/', 'other@example.com) OR label:all')).toThrow();
    expect(senderSearch('https://mail.google.com/mail/u/1/', 'news@example.com')).toContain('from%3A(news%40example.com)');
  });
  it('strips bcc/cc and blocks mail header injection', () => {
    expect(safeMailto('mailto:leave@example.com?bcc=other@example.com')).not.toContain('bcc');
    expect(safeMailto('mailto:leave@example.com?subject=Leave%0d%0aBcc:test@example.com')).toBeUndefined();
  });
  it('opens a review compose URL without a send endpoint', () => {
    expect(manualUrl(subscription({ method: 'mailto', url: 'mailto:leave@example.com' }), 'me@gmail.com')).toContain('view=cm');
    expect(manualUrl(subscription(), 'me@gmail.com')).toBeUndefined();
  });
});
