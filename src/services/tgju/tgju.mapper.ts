import type { TgjuExchangeRow, TgjuKey, TgjuQuote } from "./tgju.types";

/**
 * Pure HTML parsers for the TGJU boards.
 *
 * TGJU renders its market tables server-side (`<tr data-market-row="...">`
 * with a `data-price` attribute), so a regex pass is enough — no browser, no
 * JS execution. Every extractor is defensive: a malformed row is skipped
 * rather than poisoning the whole snapshot.
 */

function parseNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  // TGJU prints Latin digits with thousands separators; strip everything else.
  // Persian/Arabic digits never appear in the numeric cells, only in labels.
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  if (cleaned.length === 0 || cleaned === "-" || cleaned === ".") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseChangePercent(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /\(([-\d.,]+)%\)/.exec(value);
  return match ? parseNumber(match[1]) : null;
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cellTexts(rowHtml: string): string[] {
  const cells: string[] = [];
  const pattern = /<td[^>]*>(.*?)<\/td>/gis;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(rowHtml)) !== null) {
    cells.push(stripTags(match[1] ?? ""));
  }
  return cells;
}

/**
 * Parses one `<tr data-market-row="KEY" ... data-price="...">` board row.
 *
 * Expected cells after the leading `<th>`: live, change, low, high, time.
 */
function parseBoardRow(
  key: TgjuKey,
  tagAttrs: string,
  rowHtml: string,
): TgjuQuote | null {
  const priceAttr = /data-price="([^"]*)"/i.exec(tagAttrs)?.[1];
  const cells = cellTexts(rowHtml);

  const price = parseNumber(priceAttr ?? cells[0]);
  if (price === null || price <= 0) return null;

  return {
    key,
    price,
    low: parseNumber(cells[2]),
    high: parseNumber(cells[3]),
    changePercent: parseChangePercent(cells[1]),
    updatedLabel: cells[4] ?? "",
  };
}

/**
 * Extracts the wanted instruments from a `/currency`, `/gold-chart` or
 * `/coin` board page. `wanted` maps the page's `data-market-row` id onto the
 * canonical key, e.g. `{ price_dollar_rl: "USD" }`.
 */
export function parseBoardPage(
  html: string,
  wanted: Record<string, TgjuKey>,
): TgjuQuote[] {
  const quotes: TgjuQuote[] = [];
  const rowPattern =
    /<tr\b([^>]*\bdata-market-row="([^"]+)"[^>]*)>(.*?)<\/tr>/gis;
  let match: RegExpExecArray | null;

  while ((match = rowPattern.exec(html)) !== null) {
    const rowId = match[2] ?? "";
    const key = wanted[rowId];
    if (!key) continue;
    // One row per instrument; the first hit wins.
    if (quotes.some((quote) => quote.key === key)) continue;
    const quote = parseBoardRow(key, match[1] ?? "", match[3] ?? "");
    if (quote) quotes.push(quote);
  }

  return quotes;
}

/**
 * The `/crypto` board uses a different row layout; the Rial quote of Tether
 * sits in `<div data-market-p="crypto-tether-irr">2,639,000</div>`.
 */
export function parseCryptoUsdt(html: string): TgjuQuote | null {
  const match = /data-market-p="crypto-tether-irr"[^>]*>([^<]*)</i.exec(html);
  const price = parseNumber(match?.[1]);
  if (price === null || price <= 0) return null;
  return {
    key: "USDT",
    price,
    low: null,
    high: null,
    changePercent: null,
    updatedLabel: "",
  };
}

/**
 * Parses the `profile/crypto-tether/markets-local` exchange table.
 *
 * Columns: exchange | pair | sell (فروش) | buy (خرید) | change | high | low
 * | time. A row whose sell side is missing or zero is still kept when the buy
 * side is usable, and dropped only when both are absent.
 */
export function parseMarketsLocal(html: string): TgjuExchangeRow[] {
  const body = /<tbody[^>]*id="table-list"[^>]*>(.*?)<\/tbody>/is.exec(
    html,
  )?.[1];
  if (!body) return [];

  const rows: TgjuExchangeRow[] = [];
  const rowPattern = /<tr[^>]*>(.*?)<\/tr>/gis;
  let match: RegExpExecArray | null;

  while ((match = rowPattern.exec(body)) !== null) {
    const rowHtml = match[1] ?? "";
    const cells = cellTexts(rowHtml);
    // Raw cells are needed for the exchange link slug.
    const rawCells: string[] = [];
    const rawPattern = /<td[^>]*>(.*?)<\/td>/gis;
    let raw: RegExpExecArray | null;
    while ((raw = rawPattern.exec(rowHtml)) !== null) {
      rawCells.push(raw[1] ?? "");
    }
    if (cells.length < 8) continue;

    const link = /local\/(\d+)\/([^\"]+?)-exchange/.exec(rawCells[0] ?? "");
    const exchangeFa = cells[0] ?? "";
    if (!exchangeFa) continue;

    const sell = parseNumber(cells[2]);
    const buyRaw = parseNumber(cells[3]);
    // TGJU prints `0` for a missing buy side; that is "no quote", not free stables.
    const buy = buyRaw === 0 ? null : buyRaw;
    const sellClean = sell === 0 ? null : sell;
    if (sellClean === null && buy === null) continue;

    rows.push({
      exchangeFa,
      exchangeSlug: link ? `${link[1]}-${link[2]}` : exchangeFa,
      pair: cells[1] ?? "USDT / IRR",
      sell: sellClean,
      buy,
      high: parseNumber(cells[5]),
      low: parseNumber(cells[6]),
      changePercent: parseChangePercent(cells[4]),
      updatedLabel: cells[7] ?? "",
    });
  }

  return rows;
}

export const __testables = { parseNumber, parseChangePercent, stripTags };
