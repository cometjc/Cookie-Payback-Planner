import process from "node:process";

const debugOrigin = process.env.MCP_CHROME_BROWSER_URL || "http://127.0.0.1:9333";

async function getJson(pathname) {
  const res = await fetch(`${debugOrigin}${pathname}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${pathname}`);
  return res.json();
}

async function main() {
  const version = await getJson("/json/version");
  const list = await getJson("/json/list");
  const pages = list.filter((item) => item?.type === "page");
  process.stdout.write(`debugOrigin: ${debugOrigin}\n`);
  process.stdout.write(`browser: ${version.Browser || "(unknown)"}\n`);
  process.stdout.write(`pages: ${pages.length}\n`);
  for (const p of pages.slice(0, 5)) {
    process.stdout.write(`- ${p.title || "(no title)"}\n`);
    process.stdout.write(`  url: ${p.url || "(no url)"}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`[probe-mcp-chrome] failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

