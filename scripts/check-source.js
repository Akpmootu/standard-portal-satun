import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for (const directory of ['src', 'api', 'scripts', 'test', 'public']) {
  for (const file of await readdir(directory)) {
    if (!file.endsWith('.js')) continue;
    const result = spawnSync(process.execPath, ['--check', `${directory}/${file}`], { encoding: 'utf8' });
    if (result.status !== 0) { console.error(`${directory}/${file}: syntax check failed`); process.exit(1); }
  }
}
JSON.parse(await readFile('src/schema.json', 'utf8'));
JSON.parse(await readFile('vercel.json', 'utf8'));
console.log('Source syntax and configuration JSON verified.');
