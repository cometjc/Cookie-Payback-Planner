import fs from "node:fs/promises";

const INFO_PATH = "info.txt";

function bumpModVersion(content) {
  const modVersionPattern = /("ModVersion"\s*:\s*)(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=\s*[,}])/;
  const match = content.match(modVersionPattern);

  if (!match) {
    throw new Error("ModVersion not found in info.txt");
  }

  const version = JSON.parse(content).ModVersion;
  const ticks = Math.round(version * 100);
  if (typeof version !== "number" || !Number.isFinite(version) || version < 0
    || !Number.isSafeInteger(ticks) || !Number.isSafeInteger(ticks + 1)) {
    throw new Error(`Invalid ModVersion value: ${match[0]}`);
  }
  const next = (ticks + 1) / 100;
  const updated = content.replace(modVersionPattern, `${match[1]}${next.toFixed(2)}`);
  if (next <= version || JSON.parse(updated).ModVersion !== next) throw new Error("ModVersion must increase numerically");
  return updated;
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
