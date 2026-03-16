import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchMarketPage, getBaselineMode } from "./parse-market-page.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const MARKETS_FILE = path.join(ROOT_DIR, "data", "markets.json");
const OUTPUT_FILE = path.join(ROOT_DIR, "docs", "data", "latest.json");
const SNAPSHOT_FILE = path.join(ROOT_DIR, "data", "snapshots", "latest-run.json");
const HISTORY_DIR = path.join(ROOT_DIR, "data", "history");
const HISTORY_INDEX_FILE = path.join(HISTORY_DIR, "index.json");
const BASELINE_STATE_FILE = path.join(
  ROOT_DIR,
  "data",
  "snapshots",
  "baselines.json",
);
const TIME_ZONE = "Asia/Tokyo";

function resolveNow() {
  const raw = process.env.BUILD_NOW;
  if (!raw) {
    return new Date();
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`BUILD_NOW の日時が不正です: ${raw}`);
  }

  return parsed;
}

function round(value, digits = 4) {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function getTokyoDateInfo(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  const isWeekend = parts.weekday === "Sat" || parts.weekday === "Sun";

  return {
    dateKey,
    weekday: parts.weekday,
    isWeekend,
    isFriday: parts.weekday === "Fri",
  };
}

function getDateKeyInfo(dateKey) {
  return getTokyoDateInfo(new Date(`${dateKey}T12:00:00+09:00`));
}

function shiftDateKey(dateKey, days) {
  const base = new Date(`${dateKey}T12:00:00+09:00`);
  base.setDate(base.getDate() + days);
  return getTokyoDateInfo(base).dateKey;
}

function findPreviousWeekdayDateKey(dateKey) {
  let cursor = shiftDateKey(dateKey, -1);
  while (true) {
    const info = getDateKeyInfo(cursor);
    if (!info.isWeekend) {
      return info.dateKey;
    }
    cursor = shiftDateKey(cursor, -1);
  }
}

function findLastFridayDateKey(dateKey) {
  let cursor = shiftDateKey(dateKey, -1);
  while (true) {
    const info = getDateKeyInfo(cursor);
    if (info.isFriday) {
      return info.dateKey;
    }
    cursor = shiftDateKey(cursor, -1);
  }
}

function normalizeSnapshotState(state) {
  return {
    timezone: TIME_ZONE,
    currentDay: state?.currentDay ?? null,
    previousWeekdayClose: state?.previousWeekdayClose ?? null,
    fridayClose: state?.fridayClose ?? null,
  };
}

function startSnapshotDay(nowInfo) {
  return {
    date: nowInfo.dateKey,
    weekday: nowInfo.weekday,
    markets: {},
  };
}

function rollSnapshotState(state, nowInfo) {
  const normalized = normalizeSnapshotState(state);

  if (!normalized.currentDay) {
    normalized.currentDay = startSnapshotDay(nowInfo);
    return normalized;
  }

  if (normalized.currentDay.date === nowInfo.dateKey) {
    normalized.currentDay.weekday = nowInfo.weekday;
    return normalized;
  }

  const completedDay = normalized.currentDay;
  const completedWeekday = completedDay.weekday;
  const isCompletedWeekday =
    completedWeekday !== "Sat" && completedWeekday !== "Sun";

  if (
    isCompletedWeekday &&
    completedDay.markets &&
    Object.keys(completedDay.markets).length > 0
  ) {
    normalized.previousWeekdayClose = completedDay;

    if (completedWeekday === "Fri") {
      normalized.fridayClose = completedDay;
    }
  }

  normalized.currentDay = startSnapshotDay(nowInfo);
  return normalized;
}

function updateCurrentDayCloseCandidates(state, markets, capturedAt) {
  if (!state.currentDay) {
    return state;
  }

  for (const market of markets) {
    if (market.stale || market.currentPrice == null) {
      continue;
    }

    state.currentDay.markets[market.id] = {
      marketId: market.marketId,
      name: market.name,
      url: market.url,
      closePrice: market.currentPrice,
      capturedAt,
    };
  }

  return state;
}

function buildSeededMarkets(markets, capturedAt) {
  const entries = markets
    .filter((market) => !market.stale && market.pageBaselinePrice != null)
    .map((market) => [
      market.id,
      {
        marketId: market.marketId,
        name: market.name,
        url: market.url,
        closePrice: market.pageBaselinePrice,
        capturedAt,
        seeded: true,
      },
    ]);

  return Object.fromEntries(entries);
}

function seedMissingSnapshotBaselines(
  state,
  markets,
  baselineMode,
  nowInfo,
  capturedAt,
) {
  const seededMarkets = buildSeededMarkets(markets, capturedAt);
  if (Object.keys(seededMarkets).length === 0) {
    return state;
  }

  if (!state.previousWeekdayClose) {
    const previousWeekdayDate = findPreviousWeekdayDateKey(nowInfo.dateKey);
    const previousWeekdayInfo = getDateKeyInfo(previousWeekdayDate);
    state.previousWeekdayClose = {
      date: previousWeekdayDate,
      weekday: previousWeekdayInfo.weekday,
      markets: seededMarkets,
    };
  }

  const previousWeekdayDate = state.previousWeekdayClose?.date;
  const fridayDate = findLastFridayDateKey(nowInfo.dateKey);
  const canSeedFriday =
    baselineMode.mode === "friday_close" || previousWeekdayDate === fridayDate;

  if (!state.fridayClose && canSeedFriday) {
    const fridayInfo = getDateKeyInfo(fridayDate);
    state.fridayClose = {
      date: fridayDate,
      weekday: fridayInfo.weekday,
      markets: seededMarkets,
    };
  }

  return state;
}

function selectSnapshotBaseline(state, marketId, baselineMode) {
  const sourceDay =
    baselineMode.mode === "friday_close"
      ? state.fridayClose
      : state.previousWeekdayClose;

  if (!sourceDay?.markets?.[marketId]) {
    return null;
  }

  return {
    date: sourceDay.date,
    weekday: sourceDay.weekday,
    closePrice: sourceDay.markets[marketId].closePrice,
    capturedAt: sourceDay.markets[marketId].capturedAt,
    seeded: Boolean(sourceDay.markets[marketId].seeded),
  };
}

function applyBaseline(record, baselineMode, snapshotBaseline) {
  const baseRecord = {
    id: record.id,
    marketId: record.marketId,
    name: record.name,
    url: record.url,
    bid: record.bid,
    offer: record.offer,
    currentPrice: record.currentPrice,
    high: record.high,
    low: record.low,
    stale: record.stale,
    fetchedAt: record.fetchedAt,
    baselineMode: baselineMode.mode,
    baselineLabelJa: baselineMode.labelJa,
    error: record.error,
  };

  if (snapshotBaseline?.closePrice != null && record.currentPrice != null) {
    const baselinePrice = round(snapshotBaseline.closePrice);
    const change = round(record.currentPrice - baselinePrice);
    const changePercent =
      baselinePrice === 0 ? null : round((change / baselinePrice) * 100);

    return {
      ...baseRecord,
      baselinePrice,
      change,
      changePercent,
      baselineSource: snapshotBaseline.seeded
        ? "snapshot-seeded"
        : "snapshot-close",
      baselineSnapshotDate: snapshotBaseline.date,
      baselineSnapshotCapturedAt: snapshotBaseline.capturedAt,
    };
  }

  return {
    ...baseRecord,
    baselinePrice: record.pageBaselinePrice,
    change: record.pageChange,
    changePercent: record.pageChangePercent,
    baselineSource: "ig-page-change",
    baselineSnapshotDate: null,
    baselineSnapshotCapturedAt: null,
  };
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function loadMarkets() {
  const markets = await readJson(MARKETS_FILE, []);
  if (!Array.isArray(markets) || markets.length === 0) {
    throw new Error("data/markets.json に監視対象がありません。");
  }

  return markets;
}

function createFallbackRecord(market, previousRecord, reason, baselineMode) {
  if (previousRecord) {
    return {
      id: previousRecord.id ?? market.id,
      marketId: previousRecord.marketId ?? market.marketId,
      name: previousRecord.name ?? market.name,
      url: previousRecord.url ?? market.url,
      bid: previousRecord.bid ?? null,
      offer: previousRecord.offer ?? null,
      currentPrice: previousRecord.currentPrice ?? null,
      pageBaselinePrice:
        previousRecord.pageBaselinePrice ?? previousRecord.baselinePrice ?? null,
      pageChange: previousRecord.pageChange ?? previousRecord.change ?? null,
      pageChangePercent:
        previousRecord.pageChangePercent ?? previousRecord.changePercent ?? null,
      high: previousRecord.high ?? null,
      low: previousRecord.low ?? null,
      stale: true,
      error: reason,
      fetchedAt: new Date().toISOString(),
    };
  }

  return {
    id: market.id,
    marketId: market.marketId,
    name: market.name,
    url: market.url,
    bid: null,
    offer: null,
    currentPrice: null,
    pageBaselinePrice: null,
    pageChange: null,
    pageChangePercent: null,
    high: null,
    low: null,
    stale: true,
    error: reason,
    fetchedAt: new Date().toISOString(),
  };
}

async function writeJson(filePath, payload) {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function ensureDirectory(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true });
}

function buildHistoryRun(payload) {
  return {
    updatedAt: payload.updatedAt,
    baselineMode: payload.baselineMode,
    baselineLabelJa: payload.baselineLabelJa,
    source: payload.source,
    marketCount: payload.markets.length,
    markets: payload.markets.map((market) => ({
      id: market.id,
      marketId: market.marketId,
      name: market.name,
      url: market.url,
      bid: market.bid,
      offer: market.offer,
      currentPrice: market.currentPrice,
      baselinePrice: market.baselinePrice,
      change: market.change,
      changePercent: market.changePercent,
      high: market.high,
      low: market.low,
      baselineSource: market.baselineSource,
      baselineSnapshotDate: market.baselineSnapshotDate ?? null,
      stale: Boolean(market.stale),
      fetchedAt: market.fetchedAt,
      error: market.error ?? null,
    })),
  };
}

async function appendHistory(payload, nowInfo) {
  await ensureDirectory(HISTORY_DIR);

  const historyFile = path.join(HISTORY_DIR, `${nowInfo.dateKey}.json`);
  const historyPayload = await readJson(historyFile, {
    date: nowInfo.dateKey,
    timezone: TIME_ZONE,
    runs: [],
  });

  const run = buildHistoryRun(payload);
  const existingRunIndex = historyPayload.runs.findIndex(
    (entry) => entry.updatedAt === run.updatedAt,
  );

  if (existingRunIndex >= 0) {
    historyPayload.runs[existingRunIndex] = run;
  } else {
    historyPayload.runs.push(run);
    historyPayload.runs.sort((left, right) =>
      left.updatedAt.localeCompare(right.updatedAt),
    );
  }

  historyPayload.date = nowInfo.dateKey;
  historyPayload.timezone = TIME_ZONE;
  historyPayload.runCount = historyPayload.runs.length;
  historyPayload.latestUpdatedAt = run.updatedAt;

  await writeJson(historyFile, historyPayload);

  const historyIndex = await readJson(HISTORY_INDEX_FILE, {
    timezone: TIME_ZONE,
    files: [],
  });

  const nextIndexEntry = {
    date: historyPayload.date,
    file: `data/history/${nowInfo.dateKey}.json`,
    runCount: historyPayload.runCount,
    latestUpdatedAt: historyPayload.latestUpdatedAt,
  };

  const existingIndex = historyIndex.files.findIndex(
    (entry) => entry.date === nextIndexEntry.date,
  );

  if (existingIndex >= 0) {
    historyIndex.files[existingIndex] = nextIndexEntry;
  } else {
    historyIndex.files.push(nextIndexEntry);
    historyIndex.files.sort((left, right) => left.date.localeCompare(right.date));
  }

  historyIndex.timezone = TIME_ZONE;
  historyIndex.updatedAt = payload.updatedAt;

  await writeJson(HISTORY_INDEX_FILE, historyIndex);
}

async function main() {
  const now = resolveNow();
  const nowIso = now.toISOString();
  const nowInfo = getTokyoDateInfo(now);
  const markets = await loadMarkets();
  const previous = await readJson(OUTPUT_FILE, { markets: [] });
  const baselineState = normalizeSnapshotState(
    await readJson(BASELINE_STATE_FILE, {}),
  );
  const previousMap = new Map(
    (previous.markets || []).map((market) => [market.id, market]),
  );
  const baselineMode = getBaselineMode(now);

  const settled = await Promise.allSettled(
    markets.map(async (market) => {
      const detail = await fetchMarketPage(market);
      return detail;
    }),
  );

  const rawMarkets = settled.map((result, index) => {
    const market = markets[index];

    if (result.status === "fulfilled") {
      return result.value;
    }

    const reason =
      result.reason instanceof Error ? result.reason.message : String(result.reason);
    return createFallbackRecord(
      market,
      previousMap.get(market.id),
      reason,
      baselineMode,
    );
  });

  const rolledSnapshotState = rollSnapshotState(baselineState, nowInfo);
  seedMissingSnapshotBaselines(
    rolledSnapshotState,
    rawMarkets,
    baselineMode,
    nowInfo,
    nowIso,
  );
  updateCurrentDayCloseCandidates(
    rolledSnapshotState,
    rawMarkets.filter((market) => !market.stale),
    nowIso,
  );

  const normalizedMarkets = rawMarkets.map((market) => {
    const snapshotBaseline = selectSnapshotBaseline(
      rolledSnapshotState,
      market.id,
      baselineMode,
    );
    return applyBaseline(market, baselineMode, snapshotBaseline);
  });

  const payload = {
    updatedAt: nowIso,
    timezone: TIME_ZONE,
    baselineMode: baselineMode.mode,
    baselineLabelJa: baselineMode.labelJa,
    source: "ig.com",
    markets: normalizedMarkets,
  };

  await writeJson(OUTPUT_FILE, payload);
  await writeJson(SNAPSHOT_FILE, payload);
  await writeJson(BASELINE_STATE_FILE, rolledSnapshotState);
  await appendHistory(payload, nowInfo);

  const freshCount = normalizedMarkets.filter((market) => !market.stale).length;
  const staleCount = normalizedMarkets.length - freshCount;
  console.log(`Updated ${freshCount} markets${staleCount ? `, stale ${staleCount}` : ""}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
