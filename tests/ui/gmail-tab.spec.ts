import { expect, test } from '@playwright/test';
import { BASE, inboxRow, managerRow } from '../fixtures';
import { loadExtension } from './load-extension';

// This is a synthetic Gmail-shaped page served entirely by Playwright in a new
// test profile. No requests reach Google and no real subscription is changed.
const fixture = `<!doctype html><html><head><title>Inbox - me@gmail.com - Gmail</title></head><body>
<div id="view"></div><div id="notices"></div><script>
const manager = ${JSON.stringify(`<table role="grid" aria-label="subscriptions">${managerRow()}${managerRow('alerts@example.com', 'Example Alerts', '10 or fewer emails recently')}</table>`)};
const inbox = [${JSON.stringify(`<table>${inboxRow()}</table><button aria-label="Older">Older</button>`)}, ${JSON.stringify(`<table>${inboxRow('def456')}</table><button aria-label="Older" disabled>Older</button>`)}];
let pageNumber = 0;
function render() {
  const view = document.getElementById('view');
  view.innerHTML = location.hash.startsWith('#sub') ? manager : inbox[pageNumber];
  const older = document.querySelector('button[aria-label="Older"]');
  if(older) older.onclick = () => {pageNumber = 1; render();};
  for (const control of view.querySelectorAll('button[aria-label="Unsubscribe"], .aKS [role="button"]')) {
    control.onclick = () => {
      const dialog = document.createElement('div'); dialog.setAttribute('role','dialog');
      dialog.innerHTML = 'Unsubscribe from Example News (news@example.com)? <button>Unsubscribe</button><button>Cancel</button>';
      document.body.append(dialog);
      dialog.querySelector('button').onclick = () => {
        dialog.remove(); document.getElementById('notices').innerHTML = '<div role="alert">You have been unsubscribed from Example News.</div>';
      };
    };
  }
}
addEventListener('hashchange', () => {pageNumber=0;render();}); render();
</script></body></html>`;

test('attaches, scans, and completes a native batch through the built content script without cloud access', async ({}, testInfo) => {
  const { context, id } = await loadExtension(testInfo);
  const outbound: string[] = [];
  await context.route('https://**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(BASE)) await route.fulfill({ contentType: 'text/html', body: fixture });
    else { outbound.push(url); await route.abort(); }
  });
  try {
    const gmail = await context.newPage(); await gmail.goto(`${BASE}#sub`);
    const dashboard = await context.newPage(); await dashboard.goto(`chrome-extension://${id}/index.html`);
    await dashboard.getByRole('button', { name: 'Attach Gmail tab', exact: true }).click();
    await expect(dashboard.getByRole('button', { name: 'Scan Gmail', exact: true })).toBeVisible();
    await dashboard.getByRole('button', { name: 'Scan Gmail', exact: true }).click();
    await expect(dashboard.getByRole('checkbox', { name: 'Select Example News', exact: true })).toBeEnabled();
    await expect(dashboard.locator('tbody')).toContainText('20+ emails recently');
    await dashboard.getByRole('checkbox', { name: 'Select Example News', exact: true }).check();
    await dashboard.getByRole('button', { name: 'Review unsubscribe' }).click();
    await dashboard.getByRole('button', { name: 'Process 1 sender', exact: true }).click();
    await expect(gmail.getByRole('alert')).toContainText('You have been unsubscribed', { timeout: 15_000 });
    await dashboard.getByRole('button', { name: 'Activity', exact: true }).click();
    await expect(dashboard.getByText('Request sent', { exact: true })).toBeVisible();
    expect(outbound).toEqual([]);
  } finally { await context.close(); }
});

test('pages through inbox rows without opening messages and groups the same sender', async ({}, testInfo) => {
  const { context, id } = await loadExtension(testInfo);
  await context.route(`${BASE}**`, route => route.fulfill({ contentType: 'text/html', body: fixture }));
  try {
    const gmail = await context.newPage(); await gmail.goto(`${BASE}#inbox`);
    const dashboard = await context.newPage(); await dashboard.goto(`chrome-extension://${id}/index.html`);
    await dashboard.getByRole('button', { name: 'Attach Gmail tab', exact: true }).click();
    await expect(dashboard.getByRole('button', { name: 'Scan Gmail', exact: true })).toBeVisible();
    await dashboard.getByRole('button', { name: 'Settings', exact: true }).click();
    await dashboard.getByRole('combobox', { name: /^Gmail view/ }).selectOption('inbox');
    await dashboard.getByRole('button', { name: 'Start scan' }).click();
    await expect(dashboard.getByRole('button', { name: 'Scan Gmail', exact: true })).toBeVisible({ timeout: 15_000 });
    const rows = dashboard.locator('tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.locator('.email-count')).toHaveText('2');
    await expect(gmail).toHaveURL(/#search/);
    await expect(gmail.getByRole('dialog')).toHaveCount(0);
  } finally { await context.close(); }
});
