import { build } from 'vite';
import { build as bundle } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const { key } = JSON.parse(await readFile(new URL('../extension-key.json', import.meta.url), 'utf8'));
await build();
await bundle({ entryPoints: ['src/content.ts'], outfile: 'dist/content.js', bundle: true, format: 'iife', target: 'chrome120', minify: true });
const manifest = {
  manifest_version: 3,
  name: 'Unclutter — Gmail Cleaner',
  version: '2.0.0',
  description: 'Clean up subscriptions through your signed-in Gmail tab. No API keys or Google Cloud setup.',
  minimum_chrome_version: '120',
  key,
  permissions: ['storage', 'scripting'],
  host_permissions: ['https://mail.google.com/*'],
  background: { service_worker: 'background.js', type: 'module' },
  action: { default_title: 'Open Unclutter', default_icon: { 16: 'icon16.png', 32: 'icon32.png' } },
  icons: { 16: 'icon16.png', 32: 'icon32.png', 48: 'icon48.png', 128: 'icon128.png' },
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'; base-uri 'none'" },
};
await writeFile('dist/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
await Promise.all([16, 32, 48, 128].map(size => sharp('public/icon.svg').resize(size, size).png().toFile(`dist/icon${size}.png`)));
const extensionId = [...createHash('sha256').update(Buffer.from(key, 'base64')).digest().subarray(0, 16)]
  .flatMap(byte => [byte >> 4, byte & 15]).map(n => String.fromCharCode(97 + n)).join('');
console.log(`\nExtension ID: ${extensionId}\nLoad unpacked: ${process.cwd()}\\dist\nGmail connection: signed-in browser tab. No Google Cloud or OAuth setup.\n`);
