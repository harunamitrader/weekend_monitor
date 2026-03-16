import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "https://www.ig.com";
const SEARCH_URL = "https://www.ig.com/en/ig-search?query=weekend";
const REQUEST_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const MARKETS_FILE = path.join(ROOT_DIR, "data", "markets.json");

function extractSearchResultsJson(html) {
  const match = html.match(/marketAnalysis\.deobfuscateJson\((\{.*?\})\),/s);
  if (!match) {
    throw new Error("検索結果ページの埋め込み JSON を見つけられませんでした。");
  }

  return JSON.parse(match[1]);
}

function normalizeMarketEntry(entry) {
  const rawPath = entry.url.replaceAll("|", "/");
  const id = rawPath.split("/").filter(Boolean).at(-1);
  const href = new URL(`/en/indices/markets-indices/${id}`, BASE_URL).toString();

  return {
    id,
    marketId: entry.marketId,
    name: entry.name,
    url: href,
  };
}

async function fetchWeekendMarkets() {
  const response = await fetch(SEARCH_URL, {
    headers: REQUEST_HEADERS,
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`検索結果の取得に失敗しました: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const payload = extractSearchResultsJson(html);
  const results = payload?.searchResults?.searchResults;

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("監視対象の検索結果が見つかりませんでした。");
  }

  return results.map(normalizeMarketEntry);
}

async function main() {
  const markets = await fetchWeekendMarkets();
  await fs.writeFile(MARKETS_FILE, `${JSON.stringify(markets, null, 2)}\n`, "utf8");
  console.log(`Saved ${markets.length} markets to ${MARKETS_FILE}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
