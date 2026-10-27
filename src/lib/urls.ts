/** Untrusted email links are opened only for explicit manual review. */
export function safeHttpsUrl(value: string): string | undefined {
  if (value.length > 8192 || /[\u0000-\u0020\u007f]/.test(value)) return;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return;
    if (!host.includes('.') || host.includes(':') || /^[\d.]+$/.test(host)) return;
    if (/\.(localhost|local|internal|test|invalid|example|home|lan)$/.test(host)) return;
    url.hash = '';
    return url.href;
  } catch { return; }
}
export function safeMailto(value: string): string | undefined {
  try {
    if (value.length > 8192 || /[\r\n]/.test(value)) return;
    const url = new URL(value);
    const address = decodeURIComponent(url.pathname);
    if (url.protocol !== 'mailto:' || !/^[^\s<>@,;?&#]+@[^\s<>@,;?&#]+\.[^\s<>@,;?&#]+$/.test(address)) return;
    const subject = url.searchParams.get('subject') || 'Unsubscribe';
    if (/[\r\n]/.test(subject)) return;
    const clean = new URL(`mailto:${address}`);
    clean.searchParams.set('subject', subject);
    clean.searchParams.set('body', (url.searchParams.get('body') || 'Please unsubscribe me from this mailing list.').slice(0, 4000));
    return clean.href;
  } catch { return; }
}
export function gmailBase(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.origin !== 'https://mail.google.com') return;
    const path = url.pathname.match(/^\/mail\/(?:u\/\d+\/)?/)?.[0];
    return path ? `${url.origin}${path}` : undefined;
  } catch { return; }
}
export function senderSearch(base: string, email: string): string {
  const safe = gmailBase(base);
  if (!safe || !/^[^\s<>@()]+@[^\s<>@()]+\.[^\s<>@()]+$/.test(email)) throw new Error('Invalid Gmail sender.');
  return `${safe}#search/${encodeURIComponent(`in:anywhere from:(${email})`)}`;
}
export function manualUrl(item: { method: string; url: string }, account: string): string | undefined {
  if (item.method === 'gmail') return;
  if (item.method === 'link') return safeHttpsUrl(item.url);
  const safe = safeMailto(item.url);
  if (!safe) return;
  const mailto = new URL(safe);
  const gmail = new URL('https://mail.google.com/mail/');
  gmail.searchParams.set('authuser', account);
  gmail.searchParams.set('view', 'cm');
  gmail.searchParams.set('fs', '1');
  gmail.searchParams.set('to', decodeURIComponent(mailto.pathname));
  gmail.searchParams.set('su', mailto.searchParams.get('subject') ?? 'Unsubscribe');
  gmail.searchParams.set('body', mailto.searchParams.get('body') ?? '');
  return gmail.href;
}
