import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { privateStorageCode } from './private-storage-errors.js';

export async function privateDirectory() {
  const directory = resolve('.secrets');
  try { await mkdir(directory, { recursive: true, mode: 0o700 }); }
  catch { throw Object.assign(new Error('PRIVATE_STORAGE_DIRECTORY_FAILED'), {code: 'PRIVATE_STORAGE_DIRECTORY_FAILED'}); }
  if (process.platform === 'win32') {
    const args = ['-NoProfile', '-NonInteractive', '-File',
      fileURLToPath(new URL('./protect-secrets.ps1', import.meta.url)), '-Directory', directory];
    const bundledShell = resolve(dirname(process.execPath), '../../native/powershell/pwsh.exe');
    const shell = process.env.PORTAL_PWSH || (existsSync(bundledShell) ? bundledShell : 'pwsh.exe');
    try {
      try { execFileSync(shell, args, { stdio: 'pipe', windowsHide: true }); }
      catch (error) {
        if (error.code !== 'ENOENT' || process.env.PORTAL_PWSH) throw error;
        execFileSync('powershell.exe', args, { stdio: 'pipe', windowsHide: true });
      }
    } catch (error) {
      const code = privateStorageCode(error);
      throw Object.assign(new Error(code), {code});
    }
  }
  return directory;
}

export async function saveNewPrivateJson(name, data) {
  if (!/^[a-z-]+\.json$/.test(name)) throw new Error('INVALID_PRIVATE_FILENAME');
  const directory = await privateDirectory();
  // Exclusive creation: never overwrite an existing owner token or session key.
  await writeFile(resolve(directory, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
