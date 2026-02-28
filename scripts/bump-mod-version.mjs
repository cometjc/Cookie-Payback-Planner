import fs from "node:fs/promises";

const INFO_PATH = "info.txt";

function bumpModVersion(content) {
  const modVersionPattern = /("ModVersion"\s*:\s*)(\d+)(?:\.(\d+))?(\s*,?)/;
  const match = content.match(modVersionPattern);

  if (!match) {
    throw new Error("ModVersion not found in info.txt");
  }

  const [, prefix, majorRaw, patchRaw, suffix] = match;
  const major = Number.parseInt(majorRaw, 10);
  const patch = patchRaw ? Number.parseInt(patchRaw, 10) : 0;

  if (!Number.isFinite(major) || !Number.isFinite(patch)) {
    throw new Error(`Invalid ModVersion value: ${match[0]}`);
  }

  const next = `${major}.${patch + 1}`;
  return content.replace(modVersionPattern, `${prefix}${next}${suffix}`);
}

async function main() {
  const content = await fs.readFile(INFO_PATH, "utf8");
  const updated = bumpModVersion(content);

  if (updated === content) {
    return;
  }

  await fs.writeFile(INFO_PATH, updated, "utf8");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
