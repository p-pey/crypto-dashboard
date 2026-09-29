/**
 * Keyword sentiment for news headlines.
 *
 * Deliberately small and hand tuned rather than ML: it has to run with zero
 * dependencies and produce an explainable number next to each headline. Every
 * term is weighted so that "crash"/"hack" dominate a generic "high".
 */

const BULLISH: Record<string, number> = {
  surge: 2,
  soar: 3,
  rally: 3,
  skyrocket: 3,
  jump: 2,
  gain: 2,
  gains: 2,
  rise: 1,
  climbs: 2,
  bullish: 3,
  breakout: 3,
  record: 2,
  high: 1,
  adoption: 2,
  approval: 3,
  approved: 3,
  partnership: 2,
  upgrade: 2,
  bullishness: 3,
  "buy rating": 3,
  accumulation: 2,
  inflow: 2,
  inflows: 2,
  institutional: 2,
  etf: 2,
  halving: 2,
  outperform: 2,
  optimistic: 2,
  opportunity: 1,
  momentum: 2,
  rebound: 2,
  recovery: 2,
  milestone: 1,
};

const BEARISH: Record<string, number> = {
  crash: -4,
  plunge: -4,
  plummet: -4,
  tumble: -3,
  slump: -3,
  drop: -2,
  drops: -2,
  fall: -2,
  falls: -2,
  decline: -2,
  bearish: -3,
  hack: -4,
  hacked: -4,
  exploit: -4,
  scam: -4,
  fraud: -4,
  lawsuit: -3,
  sue: -3,
  sued: -3,
  ban: -3,
  banned: -3,
  crackdown: -3,
  probe: -2,
  investigation: -2,
  liquidation: -3,
  liquidations: -3,
  bankruptcy: -4,
  bankrupt: -4,
  selloff: -3,
  "sell-off": -3,
  outflow: -2,
  outflows: -2,
  warning: -2,
  risk: -1,
  risky: -2,
  volatility: -1,
  correction: -2,
  loss: -2,
  losses: -2,
  halt: -3,
  delisted: -4,
  downgraded: -3,
};

function escapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

/**
 * Returns -1..1. Matching is on word boundaries so "high" does not fire inside
 * "highway" and negated forms ("not bullish") are treated as bearish.
 */
export function headlineSentiment(text: string): number {
  const lower = text.toLowerCase();
  const negated = /\b(not|no longer|isn't|isnt|never)\b/.test(lower);

  let score = 0;
  for (const [term, weight] of Object.entries(BULLISH)) {
    if (new RegExp(`\\b${escapeForRegex(term)}\\b`).test(lower))
      score += weight;
  }
  for (const [term, weight] of Object.entries(BEARISH)) {
    if (new RegExp(`\\b${escapeForRegex(term)}\\b`).test(lower))
      score += weight;
  }

  if (negated && score > 0) score = -Math.abs(score);

  // Squash so a headline full of keywords cannot dominate the composite.
  return Math.tanh(score / 4);
}

function escapeForRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Minimal RSS item extractor so the project keeps its zero-dependency rule. */
export function parseRssItems(xml: string, limit: number) {
  const items: { title: string; link: string; publishedAt: number }[] = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  for (const block of blocks) {
    if (items.length >= limit) break;

    const title = pick(block, "title");
    if (!title) continue;

    const link = pick(block, "link");
    const pubDate = pick(block, "pubDate");
    const parsed = pubDate ? Date.parse(pubDate) : Number.NaN;

    items.push({
      title: stripHtml(escapeXml(title)).trim(),
      link: escapeXml(link ?? "").trim(),
      publishedAt: Number.isFinite(parsed) ? parsed : Date.now(),
    });
  }

  return items;
}

function pick(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(block);
  return match?.[1] ?? null;
}
