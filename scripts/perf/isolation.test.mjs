import assert from "node:assert/strict";
import { link, mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareIsolation, resetIsolationSave, verifyIsolation } from "./isolation.mjs";

const seam = "greenworks=require(path.join(__dirname,'/greenworks/greenworks'));";
async function fixture(t, bootstrap = seam) {
  const root = await mkdtemp(path.join(os.tmpdir(), "cpp-isolation-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "original");
  const targetRoot = path.join(root, "isolated");
  await mkdir(path.join(sourceRoot, "resources/app/save"), { recursive: true });
  await mkdir(path.join(sourceRoot, "resources/app/mods/workshop/example"), { recursive: true });
  await writeFile(path.join(sourceRoot, "Cookie Clicker.exe"), "fixture-executable");
  await writeFile(path.join(sourceRoot, "resources/app/start.js"), bootstrap);
  await writeFile(path.join(sourceRoot, "resources/app/save/save.cki"), "fixture-save");
  await writeFile(path.join(sourceRoot, "resources/app/mods/workshop/example/main.js"), "fixture-mod");
  return { root, sourceRoot, targetRoot };
}

test("preparation copies independently, disables only the copied Steam seam, and supplies separate profile args", async (t) => {
  const input = await fixture(t, `before\n${seam}\nafter\n`);
  const result = await prepareIsolation(input);
  assert.equal(result.steamDisabled, true);
  assert.deepEqual(result.requiredLaunchArgs, [`--user-data-dir=${path.join(input.targetRoot, ".cpp-user-data")}`]);
  assert.equal(await readFile(path.join(input.sourceRoot, "resources/app/start.js"), "utf8"), `before\n${seam}\nafter\n`);
  assert.match(await readFile(path.join(input.targetRoot, "resources/app/start.js"), "utf8"), /before\ngreenworks=false;.*\nafter\n/);
  const copiedMod = path.join(input.targetRoot, "resources/app/mods/workshop/example/main.js");
  await writeFile(copiedMod, "changed copy");
  assert.equal(await readFile(path.join(input.sourceRoot, "resources/app/mods/workshop/example/main.js"), "utf8"), "fixture-mod");
  await assert.rejects(readFile(path.join(input.targetRoot, ".cpp-benchmark/INCOMPLETE")), { code: "ENOENT" });
});

test("reset restores only verified snapshot into the stopped isolated copy", async (t) => {
  const input = await fixture(t);
  const result = await prepareIsolation(input);
  const copiedSave = path.join(input.targetRoot, "resources/app/save/save.cki");
  await writeFile(copiedSave, "trial progress");
  await assert.rejects(resetIsolationSave(input.targetRoot), /confirm.*stopped/);
  const reset = await resetIsolationSave(input.targetRoot, { stopped: true });
  assert.equal(reset.snapshotSha256, result.snapshotSha256);
  assert.equal(await readFile(copiedSave, "utf8"), "fixture-save");
  assert.equal(await readFile(path.join(input.sourceRoot, "resources/app/save/save.cki"), "utf8"), "fixture-save");
});

test("preparation rejects existing and overlapping targets", async (t) => {
  const input = await fixture(t);
  await assert.rejects(prepareIsolation({ ...input, targetRoot: input.sourceRoot }), /non-overlapping/);
  await assert.rejects(prepareIsolation({ ...input, targetRoot: path.join(input.sourceRoot, "nested") }), /non-overlapping/);
  await assert.rejects(prepareIsolation({ ...input, targetRoot: input.root }), /non-overlapping/);
  await mkdir(input.targetRoot);
  await assert.rejects(prepareIsolation(input), /must not already exist/);
});

test("unknown or duplicate Steam seams fail closed before copying", async (t) => {
  const input = await fixture(t, `${seam}\n${seam}`);
  await assert.rejects(prepareIsolation(input), /exactly one/);
  await assert.rejects(readFile(path.join(input.targetRoot, "Cookie Clicker.exe")), { code: "ENOENT" });
});

test("snapshot and bootstrap tampering prevent reset", async (t) => {
  const input = await fixture(t);
  await prepareIsolation(input);
  const snapshot = path.join(input.targetRoot, ".cpp-benchmark/snapshot/save/save.cki");
  await writeFile(snapshot, "tampered");
  await assert.rejects(resetIsolationSave(input.targetRoot, { stopped: true }), /checksum mismatch/);
  await writeFile(snapshot, "fixture-save");
  await writeFile(path.join(input.targetRoot, "resources/app/start.js"), seam);
  await assert.rejects(verifyIsolation(input.targetRoot), /Steam isolation/);
});

test("source and destination junctions are rejected", async (t) => {
  const input = await fixture(t);
  const linkedSource = path.join(input.root, "linked-original");
  try { await symlink(input.sourceRoot, linkedSource, "junction"); }
  catch (error) { if (error.code === "EPERM") return t.skip("junction creation requires privilege"); throw error; }
  await assert.rejects(prepareIsolation({ ...input, sourceRoot: linkedSource }), /links and junctions/);
  const link = path.join(input.sourceRoot, "resources/app/mods/escape");
  await symlink(os.tmpdir(), link, "junction");
  await assert.rejects(prepareIsolation(input), /links and junctions/);
});

test("an incomplete target cannot be verified or reset", async (t) => {
  const input = await fixture(t);
  await prepareIsolation(input);
  await writeFile(path.join(input.targetRoot, ".cpp-benchmark/INCOMPLETE"), "incomplete");
  await assert.rejects(verifyIsolation(input.targetRoot), /incomplete/);
  await assert.rejects(resetIsolationSave(input.targetRoot, { stopped: true }), /incomplete/);
});

test("a hard-linked destination cannot overwrite the original save", async (t) => {
  const input = await fixture(t);
  await prepareIsolation(input);
  const destination = path.join(input.targetRoot, "resources/app/save/save.cki");
  const original = path.join(input.sourceRoot, "resources/app/save/save.cki");
  await unlink(destination);
  await link(original, destination);
  await assert.rejects(resetIsolationSave(input.targetRoot, { stopped: true }), /Hard-linked/);
  assert.equal(await readFile(original, "utf8"), "fixture-save");
});
