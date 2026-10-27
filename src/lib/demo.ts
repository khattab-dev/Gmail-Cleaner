import { emptyState, type AppState, type Subscription } from '../types';

const samples = [
  ['Notion', 'team@email.notion.so', 'Your weekly dose of inspiration', 42, 'gmail', 'notion.so'],
  ['Figma', 'hello@figma.com', 'A little inspiration for your next big idea', 36, 'gmail', 'figma.com'],
  ['Product Hunt', 'hello@producthunt.com', 'The best new products, every day', 89, 'gmail', 'producthunt.com'],
  ['Medium', 'noreply@medium.com', 'Stories for your curious mind', 67, 'gmail', 'medium.com'],
  ['Airbnb', 'hello@airbnb.com', 'Your next adventure is waiting', 18, 'link', 'airbnb.com'],
  ['Linear', 'updates@linear.app', 'What’s new at Linear', 12, 'gmail', 'linear.app'],
  ['The Sunday Dispatch', 'letters@sundaydispatch.com', 'A slower kind of Sunday', 24, 'mailto', 'sundaydispatch.com'],
  ['Spotify', 'no-reply@spotify.com', 'A fresh mix, just for you', 21, 'link', 'spotify.com'],
  ['Read.cv', 'hello@read.cv', 'Good people. Great work.', 16, 'gmail', 'read.cv'],
  ['Pinterest', 'inspiration@pinterest.com', 'A few ideas we think you’ll love', 55, 'gmail', 'pinterest.com'],
  ['GitHub', 'noreply@github.com', 'The latest from the developer community', 14, 'gmail', 'github.com'],
  ['Headspace', 'hello@headspace.com', 'A little more space for you', 9, 'link', 'headspace.com'],
] as const;

export function demoState(): AppState {
  const now = Date.now();
  const subscriptions: Subscription[] = samples.map(([name, email, subject, count, method, domain], index) => ({
    id: `demo-${index}`, name, email, subject, count, method, domain,
    latest: now - (index * 13 + 2) * 3_600_000,
    messageId: `demo-message-${index}`,
    source: 'gmail-inbox',
    status: index === 5 ? 'kept' : 'active',
    url: method === 'mailto' ? `mailto:unsubscribe@${domain}?subject=Unsubscribe` : `https://${domain}/unsubscribe/demo`,
  }));
  return {
    ...emptyState(), connected: true, email: 'alex@example.com', subscriptions,
    settings: { ...emptyState().settings, mode: 'inbox' },
    scan: { status: 'complete', processed: 500, failed: 0, found: subscriptions.length, limitReached: true, finishedAt: now },
  };
}
