import { chromium, type TestInfo } from '@playwright/test';
import { resolve } from 'node:path';

export async function loadExtension(testInfo: TestInfo) {
  const extensionPath = resolve('dist');
  let context;
  try {
    context = await chromium.launchPersistentContext(testInfo.outputPath('extension-profile'), {
      channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
  } catch (error) {
    if (process.platform !== 'win32' || !(error instanceof Error) || !error.message.includes('spawn UNKNOWN')) throw error;
    context = await chromium.launchPersistentContext(testInfo.outputPath('chrome-profile'), {
      channel: 'chrome', headless: true, ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--enable-unsafe-extension-debugging'],
    });
    const session = await context.browser()!.newBrowserCDPSession();
    await session.send('Extensions.loadUnpacked', { path: extensionPath });
  }
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  return { context, id: new URL(worker.url()).host };
}
