import { expect, test } from '@playwright/test';
import { loadExtension } from './load-extension';

test('loads the real MV3 extension and exchanges messages with its service worker', async ({}, testInfo) => {
  const { context, id } = await loadExtension(testInfo);
  try {
    expect(id).toBe('cjebadbaconofdmfljkfmoeofildemgj');
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`chrome-extension://${id}/index.html`);
    await expect(page.getByRole('button', { name: 'Attach Gmail tab', exact: true })).toBeEnabled();
    const manifest = await page.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.permissions).toEqual(['storage', 'scripting']);
    expect(manifest.host_permissions).toEqual(['https://mail.google.com/*']);
    expect(manifest.oauth2).toBeUndefined();
    const reply = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_STATE' }));
    expect(reply).toMatchObject({ ok: true, state: { connected: false, subscriptions: [] } });
    await page.getByRole('button', { name: 'Explore the demo first' }).click();
    await expect(page.getByRole('checkbox', { name: 'Select Notion' })).toBeVisible();
    await page.getByRole('button', { name: 'View Notion details' }).click();
    await expect(page.getByRole('dialog')).toContainText('Your weekly dose of inspiration');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    const state = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_STATE' }));
    expect(state.state.subscriptions).toEqual([]);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
