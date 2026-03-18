const DATA_URL = "./data/latest.json";
const CHART_DATA_URL = "./data/chart-series.json";
const SVG_NS = "http://www.w3.org/2000/svg";

const marketGrid = document.querySelector("#market-grid");
const summaryText = document.querySelector("#summary-text");
const updatedAt = document.querySelector("#updated-at");
const template = document.querySelector("#market-card-template");
const chartDialog = document.querySelector("#chart-dialog");
const chartDialogTitle = document.querySelector("#chart-dialog-title");
const chartDialogCaption = document.querySelector("#chart-dialog-caption");
const chartDialogMeta = document.querySelector("#chart-dialog-meta");
const chartDialogSvg = document.querySelector("#chart-dialog-svg");
const chartDialogStart = document.querySelector("#chart-dialog-start");
const chartDialogEnd = document.querySelector("#chart-dialog-end");

const MARKET_GROUPS = [
  {
    key: "stock-indices",
    label: "株価指数",
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
    label: "商品",
    ids: [
      "weekend-gold",
      "weekend-spot-silver",
      "weekend-oil---us-crude",
    ],
  },
  {
    key: "fx",
    label: "為替",
    ids: ["weekend-usdjpy", "weekend-eurusd"],
  },
  {
    key: "crypto",
    label: "暗号資産",
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

function formatChartTime(value, timezone, withDate = true) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: timezone,
    month: withDate ? "2-digit" : undefined,
    day: withDate ? "2-digit" : undefined,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
    parts.push("代替値");
  }

  if (market.stale) {
    parts.push("古い値");
  }

  return parts.join(" / ");
}

function createSvgNode(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);

  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }

  return node;
}

function getChartPoints(chartPayload, marketId, seriesKey) {
  return chartPayload?.markets?.[marketId]?.[seriesKey] ?? [];
}

function summarizeSeries(points) {
  if (!points.length) {
    return null;
  }

  const prices = points.map((point) => point.price);
  const latest = points.at(-1);

  return {
    start: points[0],
    end: latest,
    latest: latest.price,
    high: Math.max(...prices),
    low: Math.min(...prices),
  };
}

function buildPolyline(points, width, height, paddingX, paddingY) {
  if (!points.length) {
    return "";
  }

  const timestamps = points.map((point) => Date.parse(point.t));
  const prices = points.map((point) => point.price);
  const minX = Math.min(...timestamps);
  const maxX = Math.max(...timestamps);
  const minY = Math.min(...prices);
  const maxY = Math.max(...prices);
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;
  const xSpan = Math.max(maxX - minX, 1);
  const ySpan = maxY - minY;

  return points
    .map((point, index) => {
      const xValue = timestamps[index];
      const yValue = prices[index];
      const x = paddingX + ((xValue - minX) / xSpan) * usableWidth;
      const normalizedY = ySpan === 0 ? 0.5 : (yValue - minY) / ySpan;
      const y = paddingY + usableHeight - normalizedY * usableHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function renderChart(svg, points, options = {}) {
  const width = options.width ?? 160;
  const height = options.height ?? 40;
  const paddingX = options.paddingX ?? 3;
  const paddingY = options.paddingY ?? 3;

  svg.replaceChildren();
  svg.classList.toggle("is-empty", points.length < 2);

  if (!points.length) {
    svg.append(
      createSvgNode("text", {
        x: width / 2,
        y: height / 2,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        class: "chart-empty-text",
      }),
    );
    svg.lastChild.textContent = "履歴なし";
    return;
  }

  if (options.showGuide) {
    svg.append(
      createSvgNode("line", {
        x1: paddingX,
        y1: height / 2,
        x2: width - paddingX,
        y2: height / 2,
        class: "chart-guide-line",
      }),
    );
  }

  const polylinePoints = buildPolyline(points, width, height, paddingX, paddingY);
  const trendUp = points.at(-1).price >= points[0].price;

  svg.append(
    createSvgNode("polyline", {
      points: polylinePoints,
      class: `chart-line ${trendUp ? "is-positive" : "is-negative"}`,
    }),
  );

  const [lastPoint] = polylinePoints.split(" ").slice(-1);
  if (lastPoint) {
    const [cx, cy] = lastPoint.split(",");
    svg.append(
      createSvgNode("circle", {
        cx,
        cy,
        r: options.pointRadius ?? 2.5,
        class: `chart-endpoint ${trendUp ? "is-positive" : "is-negative"}`,
      }),
    );
  }
}

function openChartDialog(market, chartPayload, timezone) {
  if (!chartDialog) {
    return;
  }

  const points = getChartPoints(chartPayload, market.id, "points72h");
  const summary = summarizeSeries(points);

  chartDialogTitle.textContent = market.name;
  chartDialogCaption.textContent = `過去${chartPayload?.detailWindowHours ?? 72}時間`;

  if (!summary) {
    chartDialogMeta.textContent = "72時間分の履歴がまだありません。";
    chartDialogStart.textContent = "";
    chartDialogEnd.textContent = "";
    renderChart(chartDialogSvg, [], {
      width: 720,
      height: 280,
      paddingX: 18,
      paddingY: 24,
    });
  } else {
    chartDialogMeta.textContent =
      `最新 ${formatNumber(summary.latest, 4)} / 高値 ${formatNumber(summary.high, 4)} / 安値 ${formatNumber(summary.low, 4)}`;
    chartDialogStart.textContent = formatChartTime(summary.start.t, timezone);
    chartDialogEnd.textContent = formatChartTime(summary.end.t, timezone);
    renderChart(chartDialogSvg, points, {
      width: 720,
      height: 280,
      paddingX: 18,
      paddingY: 24,
      pointRadius: 3,
      showGuide: true,
    });
  }

  if (typeof chartDialog.showModal === "function") {
    chartDialog.showModal();
    return;
  }

  chartDialog.setAttribute("open", "");
  chartDialog.dataset.open = "true";
}

function renderMarket(market, chartPayload, timezone) {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".market-card");
  const marketName = fragment.querySelector(".market-name");
  const marketBaseline = fragment.querySelector(".market-baseline");
  const currentPrice = fragment.querySelector(".current-price");
  const baselinePrice = fragment.querySelector(".baseline-price");
  const changeValue = fragment.querySelector(".change-value");
  const changePercent = fragment.querySelector(".change-percent");
  const marketLink = fragment.querySelector(".market-link");
  const chartTrigger = fragment.querySelector(".chart-trigger");
  const sparklineSvg = fragment.querySelector(".chart-sparkline");
  const sparklinePoints = getChartPoints(chartPayload, market.id, "points24h");
  const detailPoints = getChartPoints(chartPayload, market.id, "points72h");

  marketName.textContent = market.name;
  marketBaseline.textContent = buildBaselineText(market);
  currentPrice.textContent = formatNumber(market.currentPrice, 4);
  baselinePrice.textContent = formatNumber(market.baselinePrice, 4);
  changeValue.textContent = formatSigned(market.change, 4);
  changePercent.textContent = formatSigned(market.changePercent, 2, "%");
  marketLink.href = market.url;

  chartTrigger.setAttribute("aria-label", `${market.name} の過去72時間チャートを開く`);
  chartTrigger.disabled = detailPoints.length === 0;
  chartTrigger.classList.toggle("is-disabled", detailPoints.length === 0);

  renderChart(sparklineSvg, sparklinePoints, {
    width: 160,
    height: 40,
    paddingX: 2,
    paddingY: 4,
    pointRadius: 2.2,
  });

  chartTrigger.addEventListener("click", () => {
    openChartDialog(market, chartPayload, timezone);
  });

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
    <span class="market-group-count">${count}銘柄</span>
  `;
  return heading;
}

function groupMarkets(markets) {
  const byId = new Map(markets.map((market) => [market.id, market]));
  const groups = [];
  const seen = new Set();

  for (const group of MARKET_GROUPS) {
    const items = group.ids.map((id) => byId.get(id)).filter(Boolean);

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
      label: "その他",
      markets: remaining,
    });
  }

  return groups;
}

function renderEmpty(message) {
  marketGrid.innerHTML = `<p class="empty-state">${message}</p>`;
}

async function fetchJson(url, fallback = null) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    if (fallback !== null) {
      return fallback;
    }

    throw new Error(`データ取得失敗: ${response.status}`);
  }

  return response.json();
}

async function loadData() {
  const [latestPayload, chartPayload] = await Promise.all([
    fetchJson(DATA_URL),
    fetchJson(CHART_DATA_URL, {
      updatedAt: null,
      timezone: "Asia/Tokyo",
      sparklineWindowHours: 24,
      detailWindowHours: 72,
      markets: {},
    }),
  ]);

  return { latestPayload, chartPayload };
}

function bindDialogEvents() {
  if (!chartDialog) {
    return;
  }

  chartDialog.addEventListener("click", (event) => {
    const bounds = chartDialog.getBoundingClientRect();
    const clickedOutside =
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom;

    if (clickedOutside) {
      chartDialog.close();
    }
  });
}

async function main() {
  bindDialogEvents();

  try {
    const { latestPayload, chartPayload } = await loadData();
    const markets = Array.isArray(latestPayload.markets) ? latestPayload.markets : [];
    const timezone = latestPayload.timezone || chartPayload.timezone || "Asia/Tokyo";

    summaryText.textContent =
      `${markets.length}銘柄 / ${latestPayload.baselineLabelJa || "前日終値"}`;
    updatedAt.textContent = `最終更新 ${formatUpdatedAt(latestPayload.updatedAt, timezone)}`;

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
        fragment.append(renderMarket(market, chartPayload, timezone));
      }
    }
    marketGrid.append(fragment);
  } catch (error) {
    summaryText.textContent = "データ取得不可";
    updatedAt.textContent = "更新に失敗しました";
    renderEmpty(error instanceof Error ? error.message : "読み込みエラー");
  }
}

main();
