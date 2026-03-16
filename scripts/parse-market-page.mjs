const REQUEST_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function extractField(html, fieldName) {
  const pattern = new RegExp(`data-field="${fieldName}">([^<]+)<`, "i");
  const match = html.match(pattern);
  return match ? match[1].trim() : null;
}

function extractCanonicalUrl(html) {
  const match = html.match(/<link rel="canonical" href="([^"]+)"/i);
  return match ? match[1].trim() : null;
}

function parseNumber(value) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).replaceAll(",", "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

export function parseMarketPage(html, market, resolvedUrl = market.url) {
  const bid = parseNumber(extractField(html, "BID"));
  const offer = parseNumber(extractField(html, "OFR"));
  const changePoints = parseNumber(extractField(html, "CPT"));
  const changePercent = parseNumber(extractField(html, "CPC"));
  const high = parseNumber(extractField(html, "HIG"));
  const low = parseNumber(extractField(html, "LOW"));
  const canonicalUrl = extractCanonicalUrl(html) || resolvedUrl;

  const currentPrice =
    bid != null && offer != null ? round((bid + offer) / 2, 4) : bid ?? offer;

  let baselinePrice = null;

  if (currentPrice != null && changePoints != null) {
    baselinePrice = round(currentPrice - changePoints, 4);
  } else if (
    currentPrice != null &&
    changePercent != null &&
    changePercent !== -100
  ) {
    baselinePrice = round(currentPrice / (1 + changePercent / 100), 4);
  }

  const computedChange =
    currentPrice != null && baselinePrice != null
      ? round(currentPrice - baselinePrice, 4)
      : changePoints;

  const computedChangePercent =
    changePercent != null
      ? round(changePercent, 4)
      : currentPrice != null && baselinePrice
        ? round((computedChange / baselinePrice) * 100, 4)
        : null;

  if (currentPrice == null) {
    throw new Error(`現在価格フィールドを取得できませんでした: ${market.name}`);
  }

  return {
    id: market.id,
    marketId: market.marketId,
    name: market.name,
    url: canonicalUrl,
    bid: round(bid, 4),
    offer: round(offer, 4),
    currentPrice: round(currentPrice, 4),
    pageBaselinePrice: baselinePrice,
    pageChange: computedChange,
    pageChangePercent: computedChangePercent,
    high: round(high, 4),
    low: round(low, 4),
    stale: false,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchMarketPage(market) {
  const response = await fetch(market.url, {
    headers: REQUEST_HEADERS,
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`取得失敗 ${response.status} ${response.statusText}: ${market.url}`);
  }

  const html = await response.text();
  return parseMarketPage(html, market, response.url);
}
