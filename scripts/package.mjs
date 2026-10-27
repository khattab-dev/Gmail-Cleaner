import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { zipSync } from 'fflate';

const files = {};
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else files[relative('dist', path).replaceAll('\\', '/')] = await readFile(path);
  }
}
await collect('dist');
await mkdir('release', { recursive: true });
await writeFile('release/unclutter-gmail.zip', zipSync(files));
console.log('Created release/unclutter-gmail.zip');
