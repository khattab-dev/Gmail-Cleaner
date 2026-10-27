import { expect, test } from '@playwright/test';

test('searches, filters, keeps senders, and simulates a reviewed bulk unsubscribe', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make room for what matters.' })).toBeVisible();
  await expect(page.getByText('You’re exploring a sample inbox.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Search senders' }).fill('figma');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await page.getByRole('button', { name: /Keep list/ }).click();
  await expect(page.locator('tbody')).toContainText('Figma');
  await page.getByRole('button', { name: /Subscriptions/ }).first().click();
  await page.getByRole('button', { name: 'Gmail control', exact: true }).click();
  await expect(page.locator('tbody')).not.toContainText('Airbnb');
  await page.getByRole('checkbox', { name: 'Select Product Hunt' }).check();
  await page.getByRole('checkbox', { name: 'Select Medium' }).check();
  await page.getByRole('button', { name: 'Review unsubscribe' }).click();
  await expect(page.getByRole('dialog')).toContainText('No real requests will be sent');
  await page.getByRole('button', { name: 'Simulate 2 senders' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(page.getByText('Request sent', { exact: true })).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('offers manual review and explains no-cloud setup without making network requests', async ({ page }) => {
  const external: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1')) external.push(request.url()); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Needs a step' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await page.getByRole('checkbox', { name: 'Select all visible senders' }).check();
  await page.getByRole('button', { name: 'Review unsubscribe' }).click();
  await expect(page.getByRole('button', { name: 'Show manual steps' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('4 senders');
  await page.getByRole('button', { name: 'Show manual steps' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No-cloud setup' })).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('GOOGLE_CLIENT_ID');
  expect(external).toEqual([]);
});

test('fits on a phone and supports keyboard search', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.keyboard.press('/');
  await expect(page.getByRole('textbox', { name: 'Search senders' })).toBeFocused();
  await page.keyboard.type('Notion');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
