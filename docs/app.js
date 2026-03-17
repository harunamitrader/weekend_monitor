const DATA_URL = "./data/latest.json";

const marketGrid = document.querySelector("#market-grid");
const summaryText = document.querySelector("#summary-text");
const updatedAt = document.querySelector("#updated-at");
const template = document.querySelector("#market-card-template");
const MARKET_GROUPS = [
  {
    key: "stock-indices",
    label: "Stock Indices",
    ids: [
      "weekend-us-tech-100-e1",
      "weekend-wall-street",
      "weekend-uk-100",
      "weekend-germany-40",
      "weekend-hongkong-hs50",
      "weekend-australia-200",
    ],
  },
  {
    key: "commodities",
    label: "Commodities",
    ids: [
      "weekend-gold",
      "weekend-spot-silver",
      "weekend-oil---us-crude",
    ],
  },
  {
    key: "fx",
    label: "FX",
    ids: ["weekend-usdjpy", "weekend-eurusd"],
  },
  {
    key: "crypto",
    label: "Crypto",
    ids: ["bitcoin-usd", "ether-usd", "crypto-10-index"],
  },
];

function formatNumber(value, digits = 2) {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatSigned(value, digits = 2, suffix = "") {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }

  const formatted = formatNumber(Math.abs(value), digits);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatted}${suffix}`;
}

function formatUpdatedAt(value, timezone) {
  if (!value) {
    return "更新時刻なし";
  }

  const formatted = new Intl.DateTimeFormat("ja-JP", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

  return `${formatted} JST`;
}

function applyMoveClass(node, value) {
  node.classList.remove("is-positive", "is-negative");

  if (value > 0) {
    node.classList.add("is-positive");
  } else if (value < 0) {
    node.classList.add("is-negative");
  }
}

function buildBaselineText(market) {
  const parts = [market.baselineLabelJa || "前日終値"];

  if (market.baselineCutoverLabelJa) {
    parts.push(market.baselineCutoverLabelJa);
  }

  if (!String(market.baselineSource || "").startsWith("snapshot")) {
    parts.push("fallback");
  }

  if (market.stale) {
    parts.push("stale");
  }

  return parts.join(" / ");
}

function renderMarket(market) {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".market-card");
  const marketName = fragment.querySelector(".market-name");
  const marketBaseline = fragment.querySelector(".market-baseline");
  const currentPrice = fragment.querySelector(".current-price");
  const baselinePrice = fragment.querySelector(".baseline-price");
  const changeValue = fragment.querySelector(".change-value");
  const changePercent = fragment.querySelector(".change-percent");
  const marketLink = fragment.querySelector(".market-link");

  marketName.textContent = market.name;
  marketBaseline.textContent = buildBaselineText(market);
  currentPrice.textContent = formatNumber(market.currentPrice, 4);
  baselinePrice.textContent = formatNumber(market.baselinePrice, 4);
  changeValue.textContent = formatSigned(market.change, 4);
  changePercent.textContent = formatSigned(market.changePercent, 2, "%");
  marketLink.href = market.url;

  applyMoveClass(changeValue, market.change);
  applyMoveClass(changePercent, market.changePercent);

  if (market.stale) {
    card.classList.add("is-stale");
  }

  return fragment;
}

function renderGroupHeading(label, count) {
  const heading = document.createElement("div");
  heading.className = "market-group-heading";
  heading.innerHTML = `
    <span class="market-group-label">${label}</span>
    <span class="market-group-count">${count} markets</span>
  `;
  return heading;
}

function groupMarkets(markets) {
  const byId = new Map(markets.map((market) => [market.id, market]));
  const groups = [];
  const seen = new Set();

  for (const group of MARKET_GROUPS) {
    const items = group.ids
      .map((id) => byId.get(id))
      .filter(Boolean);

    for (const market of items) {
      seen.add(market.id);
    }

    if (items.length > 0) {
      groups.push({
        label: group.label,
        markets: items,
      });
    }
  }

  const remaining = markets.filter((market) => !seen.has(market.id));
  if (remaining.length > 0) {
    groups.push({
      label: "Other Markets",
      markets: remaining,
    });
  }

  return groups;
}

function renderEmpty(message) {
  marketGrid.innerHTML = `<p class="empty-state">${message}</p>`;
}

async function loadData() {
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`データ取得失敗: ${response.status}`);
  }

  return response.json();
}

async function main() {
  try {
    const payload = await loadData();
    const markets = Array.isArray(payload.markets) ? payload.markets : [];

    summaryText.textContent = `${markets.length} markets / ${payload.baselineLabelJa || "前日終値"}`;
    updatedAt.textContent = `最終更新 ${formatUpdatedAt(payload.updatedAt, payload.timezone || "Asia/Tokyo")}`;

    if (markets.length === 0) {
      renderEmpty("まだ監視データがありません。");
      return;
    }

    const groups = groupMarkets(markets);

    marketGrid.innerHTML = "";
    const fragment = document.createDocumentFragment();
    for (const group of groups) {
      fragment.append(renderGroupHeading(group.label, group.markets.length));
      for (const market of group.markets) {
        fragment.append(renderMarket(market));
      }
    }
    marketGrid.append(fragment);
  } catch (error) {
    summaryText.textContent = "data unavailable";
    updatedAt.textContent = "更新に失敗しました";
    renderEmpty(error instanceof Error ? error.message : "読み込みエラー");
  }
}

main();
