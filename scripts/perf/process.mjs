import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, realpath, unlink } from 'node:fs/promises';
const exec = promisify(execFile);
const normalize = value => path.resolve(value).replaceAll('\\', '/').toLowerCase();

export async function acquireGameLaunchLock(executable, { lockRoot = path.join(os.tmpdir(), 'cpp-locks') } = {}) {
  const canonicalExecutable = normalize(await realpath(executable));
  const key = createHash('sha256').update(canonicalExecutable).digest('hex');
  await mkdir(lockRoot, { recursive: true });
  const filename = path.join(lockRoot, `${key}.lock`);
  const token = randomUUID();
  let handle;
  try { handle = await open(filename, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`啟動鎖已存在，拒絕重複啟動；請先人工確認程序後再清理：${filename}`);
    throw error;
  }
  try { await handle.writeFile(JSON.stringify({ token, canonicalExecutable, pid: process.pid, createdAt: new Date().toISOString() })); }
  finally { await handle.close(); }
  return { filename, canonicalExecutable, async release() {
    const owner = JSON.parse(await readFile(filename, 'utf8'));
    if (owner.token !== token || owner.canonicalExecutable !== canonicalExecutable) throw new Error(`啟動鎖 ownership 不符，未刪除：${filename}`);
    await unlink(filename);
  } };
}

export async function withGameLaunchGuard(profile, launch, {
  inspect = inspectInstance, inventory = gameProcesses, lockRoot,
  waitMs = 15000, pollMs = 250,
} = {}) {
  const lock = await acquireGameLaunchLock(profile.executable, { lockRoot });
  let launchAttempted = false, verified = false;
  try {
    // Both process and endpoint evidence are refreshed while holding the per-executable mutex.
    const current = await inspect(profile, 'start');
    if (current.processes.length) throw new Error('遊戲已執行，請使用 attach。');
    launchAttempted = true;
    const result = await launch();
    const deadline = Date.now() + waitMs;
    let observationError;
    do {
      let rows = [];
      try { rows = await inventory(profile.executable); observationError = undefined; }
      catch (error) { observationError = error; }
      if (rows.length > 1) throw new Error('啟動後偵測到多個遊戲主程序，停止自動操作。');
      const row = rows.find(item => !result?.expectedPid || item.ProcessId === result.expectedPid);
      if (row) { verified = true; return { result, process: row }; }
      await new Promise(resolve => setTimeout(resolve, pollMs));
    } while (Date.now() < deadline);
    throw new Error(`啟動狀態不明，保留啟動鎖且不重試：${lock.filename}`, { cause: observationError });
  } finally {
    // An ambiguous launch or crash intentionally leaves a fail-closed lock for manual inspection.
    if (!launchAttempted || verified) await lock.release();
  }
}

export function matchingMainProcesses(rows, executable) {
  return rows.filter(row => row.ExecutablePath && normalize(row.ExecutablePath) === normalize(executable)
    && !/(?:^|\s)--type(?:=|\s)/.test(row.CommandLine || ''));
}

export async function gameProcesses(executable) {
  if (process.platform !== 'win32') throw new Error('遊戲程序盤點目前僅支援 Windows。');
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "@(Get-CimInstance Win32_Process -Filter \"Name='Cookie Clicker.exe'\" | Select-Object ProcessId,ParentProcessId,CreationDate,ExecutablePath,CommandLine) | ConvertTo-Json -Compress"],
  { windowsHide: true, timeout: 15000 });
  const rows = JSON.parse(stdout.trim() || '[]');
  const inventory = Array.isArray(rows) ? rows : [rows];
  if (inventory.some(row => !row.ExecutablePath || !row.CommandLine)) throw new Error('遊戲程序資訊不完整，拒絕猜測是否可啟動。');
  return matchingMainProcesses(inventory, executable);
}

export function assertProcessState(rows, endpointReady, mode = 'attach') {
  if (rows.length > 1) throw new Error('偵測到多個遊戲主程序，拒絕啟動或量測。');
  if (rows.length && !endpointReady) throw new Error('遊戲已執行但 CDP 不可用；拒絕重複啟動。');
  if (mode === 'attach' && rows.length !== 1) throw new Error('找不到唯一既有遊戲主程序。');
  if (!rows.length && endpointReady) throw new Error('CDP 存在但未對應指定遊戲程序。');
}

export async function endpointTargets(origin) {
  const url = new URL(origin);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('僅允許本機 CDP。');
  const response = await fetch(new URL('/json/list', url), { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`CDP HTTP ${response.status}`);
  return response.json();
}

export async function inspectInstance(profile, mode = 'attach') {
  const processes = await gameProcesses(profile.executable);
  let targets = [];
  let endpointReady = false;
  try { targets = await endpointTargets(profile.debugOrigin); endpointReady = true; } catch { /* Checked against process evidence below. */ }
  assertProcessState(processes, endpointReady, mode);
  const root = normalize(path.dirname(profile.executable));
  const matching = targets.filter(target => {
    try { return target.type === 'page' && decodeURIComponent(new URL(target.url).pathname).replace(/^\//, '').toLowerCase().startsWith(`${root}/resources/app/`); }
    catch { return false; }
  });
  if (endpointReady && matching.length !== 1) throw new Error('CDP 未提供指定安裝目錄的唯一遊戲頁面。');
  return { processes, target: matching[0] || null };
}

export async function startOwned(profile, ownerFile) {
  await mkdir(path.dirname(ownerFile), { recursive: true });
  const launched = await withGameLaunchGuard(profile, async () => {
    const child = spawn(profile.executable, [`--remote-debugging-port=${new URL(profile.debugOrigin).port}`, ...(profile.launchArgs || [])], {
      cwd: path.dirname(profile.executable), detached: true, stdio: 'ignore', windowsHide: true,
    });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    child.unref();
    return { expectedPid: child.pid };
  });
  await import('node:fs/promises').then(fs => fs.writeFile(ownerFile, JSON.stringify({ ...launched.process, executable: profile.executable }, null, 2)));
  return launched.process;
}

export async function stopOwned(profile, ownerFile) {
  const owner = JSON.parse(await readFile(ownerFile, 'utf8'));
  const rows = await gameProcesses(profile.executable);
  const row = rows.find(item => item.ProcessId === owner.ProcessId && item.CreationDate === owner.CreationDate);
  if (!row || normalize(owner.executable) !== normalize(profile.executable)) throw new Error('程序 ownership 不符，拒絕關閉。');
  const pid = Number(row.ProcessId);
  await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$p=Get-Process -Id ${pid} -ErrorAction Stop; if(-not $p.CloseMainWindow()){throw '無法正常關閉'}; if(-not $p.WaitForExit(10000)){throw '正常關閉逾時，未強制終止'}`],
  { windowsHide: true, timeout: 15000 });
  await unlink(ownerFile);
}
