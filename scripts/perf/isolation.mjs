import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const marker = ".cpp-benchmark";
const manifestName = "manifest.json";
const bootstrapRelative = "resources/app/start.js";
const saveRelative = "resources/app/save";
const steamRequire = "greenworks=require(path.join(__dirname,'/greenworks/greenworks'));";
const steamDisabled = "greenworks=false;/* CPP_BENCHMARK_STEAM_DISABLED */";
const hash = (data) => createHash("sha256").update(data).digest("hex");
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const contains = (root, target) => {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
};

async function statOrNull(file) {
  try { return await lstat(file); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function rejectLinks(file) {
  let current = path.resolve(file);
  for (;;) {
    const stat = await statOrNull(current);
    if (stat?.isSymbolicLink()) throw new Error(`Symbolic links and junctions are not allowed: ${current}`);
    const parent = path.dirname(current);
    if (same(parent, current)) return;
    current = parent;
  }
}

async function inventory(root, relative = "") {
  const directory = path.join(root, relative);
  await rejectLinks(directory);
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symbolic link in isolation input: ${child}`);
    if (entry.isDirectory()) result.push(...await inventory(root, child));
    else if (entry.isFile()) {
      const data = await readFile(path.join(root, child));
      result.push({ file: child.replaceAll(path.sep, "/"), sha256: hash(data), bytes: data.length });
    } else throw new Error(`Unsupported isolation input: ${child}`);
  }
  return result.sort((a, b) => a.file.localeCompare(b.file));
}

async function copyTree(source, destination, filter = () => true) {
  await cp(source, destination, {
    recursive: true,
    dereference: false,
    force: false,
    errorOnExist: true,
    filter: async (file) => {
      const stat = await lstat(file);
      if (stat.isSymbolicLink()) throw new Error(`Symbolic links and junctions are not copied: ${file}`);
      return filter(file);
    },
  });
}

/** Build a fresh, independent game installation. This function never launches a process. */
export async function prepareIsolation({ sourceRoot, targetRoot, profilePath } = {}) {
  if (!sourceRoot || !targetRoot) throw new Error("sourceRoot and targetRoot are required");
  sourceRoot = path.resolve(sourceRoot);
  targetRoot = path.resolve(targetRoot);
  await rejectLinks(sourceRoot);
  await rejectLinks(targetRoot);
  sourceRoot = await realpath(sourceRoot);
  if (contains(sourceRoot, targetRoot) || contains(targetRoot, sourceRoot)) {
    throw new Error("Source and target must be separate, non-overlapping directories");
  }
  if (await statOrNull(targetRoot)) throw new Error("Isolation target must not already exist");
  const sourceBootstrap = await readFile(path.join(sourceRoot, bootstrapRelative), "utf8");
  if (sourceBootstrap.split(steamRequire).length !== 2) throw new Error("Expected exactly one known Steam initialization seam");
  await readFile(path.join(sourceRoot, "Cookie Clicker.exe"));
  const sourceSave = path.join(sourceRoot, saveRelative);
  const saves = await inventory(sourceSave);
  if (!saves.some((entry) => entry.file === "save.cki" && entry.bytes > 0)) throw new Error("A non-empty save.cki snapshot is required");
  let profile;
  if (profilePath) {
    profile = JSON.parse(await readFile(profilePath, "utf8"));
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) throw new Error("Profile must be a JSON object");
  }
  await mkdir(targetRoot, { recursive: false });
  const benchmarkRoot = path.join(targetRoot, marker);
  await mkdir(benchmarkRoot);
  await writeFile(path.join(benchmarkRoot, "INCOMPLETE"), "Not yet verified. Do not launch.\n", { flag: "wx" });
  const snapshotRoot = path.join(benchmarkRoot, "snapshot", "save");
  await copyTree(sourceSave, snapshotRoot);
  for (const entry of await readdir(sourceRoot)) {
    if (entry === marker || entry === ".cpp-user-data") throw new Error("Source is already an isolation environment");
    await copyTree(path.join(sourceRoot, entry), path.join(targetRoot, entry), (file) => !contains(sourceSave, file));
  }
  await writeFile(path.join(targetRoot, bootstrapRelative), sourceBootstrap.replace(steamRequire, steamDisabled));
  // save/ is intentionally an independent copy, not a link to the snapshot or original.
  await copyTree(snapshotRoot, path.join(targetRoot, saveRelative));
  if (profile) await writeFile(path.join(benchmarkRoot, "profile.json"), `${JSON.stringify(profile, null, 2)}\n`, { flag: "wx" });
  const snapshotFiles = await inventory(snapshotRoot);
  const finalSourceSaves = await inventory(sourceSave);
  if (JSON.stringify(saves) !== JSON.stringify(snapshotFiles) || JSON.stringify(saves) !== JSON.stringify(finalSourceSaves)) {
    throw new Error("Source save changed during preparation; target is incomplete and must not be launched");
  }
  const bootstrapSha256 = hash(await readFile(path.join(targetRoot, bootstrapRelative)));
  const manifest = {
    format: "cpp-isolation-v1",
    preparedAt: new Date().toISOString(),
    sourceRoot,
    targetRoot,
    steamDisabled: true,
    bootstrapSha256,
    sourceBootstrapSha256: hash(sourceBootstrap),
    saves,
    snapshotSha256: hash(JSON.stringify(saves)),
    userDataDir: path.join(targetRoot, ".cpp-user-data"),
    gameExe: path.join(targetRoot, "Cookie Clicker.exe"),
    requiredLaunchArgs: [`--user-data-dir=${path.join(targetRoot, ".cpp-user-data")}`],
    ...(profile ? { profileSha256: hash(JSON.stringify(profile)) } : {}),
    comparisonNote: "Identical save bytes do not prove identical runtime state; compare runtime fingerprints and offline progression separately.",
  };
  await writeFile(path.join(benchmarkRoot, manifestName), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  const verified = await verifyContents(targetRoot);
  await unlink(path.join(benchmarkRoot, "INCOMPLETE"));
  return verified;
}

/** Verify the copied bootstrap and immutable snapshot before any isolated save reset. */
export async function verifyIsolation(targetRoot) {
  if (await statOrNull(path.join(path.resolve(targetRoot), marker, "INCOMPLETE"))) throw new Error("Isolation preparation is incomplete");
  return verifyContents(targetRoot);
}

async function verifyContents(targetRoot) {
  targetRoot = path.resolve(targetRoot);
  await rejectLinks(targetRoot);
  const manifestFile = path.join(targetRoot, marker, manifestName);
  await rejectLinks(manifestFile);
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  if (manifest.format !== "cpp-isolation-v1" || !same(manifest.targetRoot, targetRoot) || manifest.steamDisabled !== true) {
    throw new Error("Invalid isolation manifest or target identity");
  }
  if (contains(manifest.sourceRoot, targetRoot) || contains(targetRoot, manifest.sourceRoot)) throw new Error("Isolation source/target overlap");
  if (!same(manifest.gameExe, path.join(targetRoot, "Cookie Clicker.exe")) || !same(manifest.userDataDir, path.join(targetRoot, ".cpp-user-data"))) {
    throw new Error("Isolation manifest contains an escaped runtime path");
  }
  const bootstrapFile = path.join(targetRoot, bootstrapRelative);
  await rejectLinks(bootstrapFile);
  const bootstrap = await readFile(bootstrapFile);
  if (hash(bootstrap) !== manifest.bootstrapSha256 || !bootstrap.toString().includes(steamDisabled) || bootstrap.toString().includes(steamRequire)) {
    throw new Error("Steam isolation bootstrap no longer matches its verified manifest");
  }
  const snapshotRoot = path.join(targetRoot, marker, "snapshot", "save");
  const snapshotFiles = await inventory(snapshotRoot);
  if (JSON.stringify(snapshotFiles) !== JSON.stringify(manifest.saves) || hash(JSON.stringify(snapshotFiles)) !== manifest.snapshotSha256) {
    throw new Error("Isolation snapshot checksum mismatch");
  }
  return manifest;
}

/** Call only after the controller has confirmed the isolated game has stopped. */
export async function resetIsolationSave(targetRoot, { stopped = false } = {}) {
  if (stopped !== true) throw new Error("Controller must confirm the isolated game is stopped before reset");
  const manifest = await verifyIsolation(targetRoot);
  const saveRoot = path.join(manifest.targetRoot, saveRelative);
  await rejectLinks(saveRoot);
  // Reject unexpected files rather than deleting data the controller did not own.
  const existing = await inventory(saveRoot);
  const known = new Set(manifest.saves.map((entry) => entry.file));
  for (const entry of existing) {
    if (!known.has(entry.file) && entry.file !== "OLDsave.cki") throw new Error(`Unexpected isolated save file: ${entry.file}`);
  }
  for (const entry of manifest.saves) {
    const destination = path.join(saveRoot, entry.file);
    await rejectLinks(destination);
    const destinationStat = await statOrNull(destination);
    if (destinationStat && destinationStat.nlink > 1) throw new Error("Hard-linked isolated save files are not writable");
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(path.join(manifest.targetRoot, marker, "snapshot", "save", entry.file)));
  }
  return { snapshotSha256: manifest.snapshotSha256, restoredFiles: manifest.saves.map((entry) => entry.file) };
}

if (process.argv[1] && same(fileURLToPath(import.meta.url), process.argv[1])) {
  const [command, sourceRoot, targetRoot, profilePath] = process.argv.slice(2);
  try {
    if (command !== "prepare" || !sourceRoot || !targetRoot) throw new Error("Usage: node isolation.mjs prepare <sourceRoot> <freshTargetRoot> [profile.json]");
    console.log(JSON.stringify(await prepareIsolation({ sourceRoot, targetRoot, profilePath }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
