import type { NewsAspect, NewsStance } from "./news.types";

/**
 * Aspect lexicon: what a headline is about, and which way it pushes the rial and
 * global risk appetite.
 *
 * Two signed weights per term rather than one:
 *
 * - `rial`  −5..+5, *depreciation pressure on the rial*. A Fed rate cut is +3
 *   (weaker rial against a firmer dollar) while a Fed pause is −2.
 * - `risk`  −5..+5, *global risk appetite*. Rate cuts are risk-on (+3), war
 *   escalation is risk-off (−4).
 *
 * Keeping them separate is what lets the dashboard say "risk-on but rial
 * negative" instead of collapsing everything into one misleading number.
 *
 * Matching is substring based, not word-boundary based: Persian is written
 * without spaces between morphemes and `\b` is unreliable across the Arabic
 * script.
 */
export type AspectTerm = {
  term: string;
  rial: number;
  risk: number;
};

export type AspectLexicon = {
  aspect: NewsAspect;
  terms: AspectTerm[];
};

/** Bilingual by necessity: Tehran Times, the wires and Tehran all differ. */
export const ASPECT_LEXICON: AspectLexicon[] = [
  {
    aspect: "fx",
    terms: [
      { term: "قیمت دلار", rial: 3, risk: -1 },
      { term: "نرخ دلار", rial: 2, risk: -1 },
      { term: "افزایش قیمت دلار", rial: 3, risk: -1 },
      { term: "کاهش قیمت دلار", rial: -3, risk: 1 },
      { term: "صعود دلار", rial: 3, risk: -1 },
      { term: "نزول دلار", rial: -3, risk: 1 },
      { term: "تضعیف ریال", rial: 3, risk: -2 },
      { term: "تضعیف واحد پول", rial: 3, risk: -2 },
      { term: "بی ارزشی ریال", rial: 3, risk: -2 },
      { term: "ریال", rial: 1, risk: -1 },
      { term: "بازار ارز", rial: 1, risk: -1 },
      { term: "بازار مبادله", rial: 1, risk: -1 },
      { term: "مرکز مبادله", rial: 1, risk: -1 },
      { term: "صرافی", rial: 1, risk: 0 },
      { term: "تقاضای ارز", rial: 2, risk: -1 },
      { term: "عرضه ارز", rial: -1, risk: 0 },
      { term: "سیاست ارزی", rial: 1, risk: 0 },
      { term: "تک نرخی", rial: -2, risk: 0 },
      { term: "تک‌نرخی", rial: -2, risk: 0 },
      { term: "رفع محدودیت ارزی", rial: -2, risk: 1 },
      { term: "اسکناس", rial: 2, risk: -1 },
      { term: "دلار آمریکا", rial: 1, risk: 0 },
      { term: "dollar rises", rial: 2, risk: -1 },
      { term: "dollar falls", rial: -2, risk: 1 },
      { term: "rial weakens", rial: 3, risk: -2 },
      { term: "rial strengthens", rial: -3, risk: 1 },
      { term: "exchange rate", rial: 1, risk: 0 },
      { term: "currency", rial: 1, risk: 0 },
      { term: "forex", rial: 1, risk: 0 },
    ],
  },
  {
    aspect: "gold",
    terms: [
      { term: "طلا", rial: 1, risk: 1 },
      { term: "سکه", rial: 1, risk: 0 },
      { term: "حباب سکه", rial: 1, risk: 0 },
      { term: "قیمت طلا", rial: 1, risk: 1 },
      { term: "قیمت سکه", rial: 1, risk: 0 },
      { term: "اونس", rial: 1, risk: 1 },
      { term: "خرید طلا", rial: 2, risk: 1 },
      { term: "تقاضای طلا", rial: 2, risk: 1 },
      { term: "gold price", rial: 1, risk: 1 },
      { term: "gold record", rial: 1, risk: 1 },
      { term: "safe haven", rial: 0, risk: 1 },
      { term: "پناهگاه امن", rial: 0, risk: 1 },
    ],
  },
  {
    aspect: "oil",
    terms: [
      { term: "نفت", rial: -1, risk: 1 },
      { term: "صادرات نفت", rial: -2, risk: 1 },
      { term: "فروش نفت", rial: -2, risk: 1 },
      { term: "درآمد ارزی نفت", rial: -2, risk: 1 },
      { term: "قیمت نفت", rial: -1, risk: -1 },
      { term: "اوپک", rial: -1, risk: -1 },
      { term: "گاز", rial: -1, risk: 0 },
      { term: "صادرات گاز", rial: -2, risk: 1 },
      { term: "قطع گاز", rial: 3, risk: -3 },
      { term: "قطع برق", rial: 3, risk: -3 },
      { term: "ناترازی", rial: 2, risk: -2 },
      { term: "بنزین", rial: 1, risk: -1 },
      { term: "oil price", rial: -1, risk: -1 },
      { term: "oil exports", rial: -2, risk: 1 },
      { term: "opec", rial: -1, risk: -1 },
      { term: "crude", rial: -1, risk: -1 },
    ],
  },
  {
    aspect: "inflation",
    terms: [
      { term: "تورم", rial: 2, risk: -2 },
      { term: "نرخ تورم", rial: 2, risk: -2 },
      { term: "تورم ماهانه", rial: 2, risk: -2 },
      { term: "تورم سالانه", rial: 2, risk: -2 },
      { term: "جهش تورم", rial: 3, risk: -3 },
      { term: "گرانی", rial: 2, risk: -1 },
      { term: "کاهش قدرت خرید", rial: 2, risk: -2 },
      { term: "شاخص قیمت مصرف کننده", rial: 2, risk: -2 },
      { term: "شاخص قیمت مصرف‌کننده", rial: 2, risk: -2 },
      { term: "افزایش حقوق", rial: 2, risk: 1 },
      { term: "inflation", rial: 2, risk: -2 },
      { term: "cpi", rial: 2, risk: -2 },
      { term: "cost of living", rial: 2, risk: -2 },
      { term: "price pressures", rial: 1, risk: -1 },
    ],
  },
  {
    aspect: "monetary",
    terms: [
      { term: "بانک مرکزی", rial: 1, risk: 0 },
      { term: "سیاست پولی", rial: 2, risk: 1 },
      { term: "چاپ پول", rial: 3, risk: -2 },
      { term: "پول چاپی", rial: 3, risk: -2 },
      { term: "اضافه چاپ", rial: 3, risk: -2 },
      { term: "نقدینگی", rial: 1, risk: 0 },
      { term: "نرخ سود", rial: 1, risk: -1 },
      { term: "ذخیره ارزی", rial: -1, risk: 0 },
      { term: "منابع ارزی", rial: -1, risk: 0 },
      { term: "کاهش نرخ بهره", rial: 3, risk: 2 },
      { term: "افزایش نرخ بهره", rial: -1, risk: -2 },
      { term: "central bank", rial: 1, risk: 0 },
      { term: "monetary policy", rial: 2, risk: 1 },
      { term: "interest rate", rial: 1, risk: -1 },
      { term: "rate cut", rial: 3, risk: 2 },
      { term: "rate hike", rial: -1, risk: -2 },
      { term: "fed cuts", rial: 3, risk: 2 },
      { term: "fed raises", rial: -1, risk: -2 },
      { term: "quantitative easing", rial: 2, risk: 2 },
      { term: "fomc", rial: 1, risk: 0 },
      { term: "jerome powell", rial: 1, risk: 0 },
    ],
  },
  {
    aspect: "sanctions",
    terms: [
      { term: "تحریم", rial: 3, risk: -3 },
      { term: "تحریم‌ها", rial: 3, risk: -3 },
      { term: "تحریم ها", rial: 3, risk: -3 },
      { term: "رفع تحریم", rial: -4, risk: 4 },
      { term: "لغو تحریم", rial: -4, risk: 4 },
      { term: "کاهش تحریم", rial: -2, risk: 2 },
      { term: "تشدید تحریم", rial: 4, risk: -4 },
      { term: "پایان دادن به تحریم", rial: -4, risk: 4 },
      { term: "پایان تحریم", rial: -4, risk: 4 },
      { term: "تحریم بانکی", rial: 3, risk: -3 },
      { term: "فشار حداکثری", rial: 4, risk: -4 },
      { term: "مذاکرات", rial: -1, risk: 1 },
      { term: "برجام", rial: -1, risk: 1 },
      { term: "توافق هسته‌ای", rial: -2, risk: 3 },
      { term: "توافق هسته ای", rial: -2, risk: 3 },
      { term: "فشار خارجی", rial: 2, risk: -2 },
      { term: "محدودیت صادرات", rial: 2, risk: -2 },
      { term: "snapback", rial: 3, risk: -3 },
      { term: "sanction", rial: 3, risk: -3 },
      { term: "sanctions relief", rial: -4, risk: 4 },
      { term: "nuclear deal", rial: -2, risk: 3 },
      { term: "oil embargo", rial: 3, risk: -3 },
    ],
  },
  {
    aspect: "budget",
    terms: [
      { term: "بودجه", rial: 1, risk: 0 },
      { term: "کسری بودجه", rial: 3, risk: -2 },
      { term: "هزینه‌های دولت", rial: 2, risk: -1 },
      { term: "هزینه های دولت", rial: 2, risk: -1 },
      { term: "یارانه", rial: 2, risk: 0 },
      { term: "مالیات", rial: 1, risk: -1 },
      { term: "سقف اعتبار", rial: 1, risk: -1 },
      { term: "قیمت نفت در بودجه", rial: -1, risk: 0 },
      { term: "subsidy", rial: 2, risk: -1 },
      { term: "budget deficit", rial: 3, risk: -2 },
      { term: "government spending", rial: 2, risk: 1 },
      { term: "fiscal", rial: 1, risk: -1 },
    ],
  },
  {
    aspect: "war",
    terms: [
      { term: "جنگ", rial: 3, risk: -4 },
      { term: "درگیری", rial: 3, risk: -4 },
      { term: "حمله", rial: 3, risk: -4 },
      { term: "انفجار", rial: 3, risk: -4 },
      { term: "موشک", rial: 3, risk: -4 },
      { term: "پرنده‌های جنگنده", rial: 3, risk: -4 },
      { term: "توهین", rial: 2, risk: -3 },
      { term: "اسنپک", rial: 4, risk: -4 },
      { term: "قطعنامه", rial: 2, risk: -3 },
      { term: "تنش", rial: 1, risk: -2 },
      { term: "محاصره", rial: 3, risk: -3 },
      { term: "آتش‌بس", rial: -3, risk: 4 },
      { term: "آتش بس", rial: -3, risk: 4 },
      { term: "صلح", rial: -2, risk: 3 },
      { term: "war", rial: 3, risk: -4 },
      { term: "strike", rial: 3, risk: -4 },
      { term: "airstrike", rial: 3, risk: -4 },
      { term: "missile", rial: 3, risk: -4 },
      { term: "ceasefire", rial: -3, risk: 4 },
      { term: "peace deal", rial: -2, risk: 3 },
      { term: "invasion", rial: 4, risk: -5 },
      { term: "retaliation", rial: 3, risk: -4 },
      { term: "escalation", rial: 3, risk: -4 },
      { term: "de-escalation", rial: -2, risk: 3 },
    ],
  },
  {
    aspect: "politics",
    terms: [
      { term: "انتخاب", rial: 1, risk: -1 },
      { term: "بی‌ثباتی", rial: 2, risk: -2 },
      { term: "بی ثباتی", rial: 2, risk: -2 },
      { term: "اعتراض", rial: 2, risk: -2 },
      { term: "تغییر دولت", rial: 1, risk: -2 },
      { term: "تحرکات", rial: 1, risk: -1 },
      { term: "درگیری داخلی", rial: 2, risk: -2 },
      { term: "unrest", rial: 2, risk: -2 },
      { term: "protest", rial: 2, risk: -2 },
      { term: "coup", rial: 3, risk: -4 },
      { term: "resignation", rial: 1, risk: -2 },
      { term: "impeachment", rial: 1, risk: -2 },
      { term: "shutdown", rial: 1, risk: -2 },
    ],
  },
  {
    aspect: "credit",
    terms: [
      { term: "ورشکستگی", rial: 2, risk: -4 },
      { term: "ورشکسته", rial: 2, risk: -4 },
      { term: "بدهی", rial: 1, risk: -2 },
      { term: "رکود", rial: 1, risk: -3 },
      { term: "default", rial: 2, risk: -4 },
      { term: "bankruptcy", rial: 2, risk: -4 },
      { term: "credit", rial: 1, risk: -1 },
      { term: "recession", rial: 1, risk: -4 },
      { term: "unemployment", rial: 1, risk: -3 },
      { term: "jobs report", rial: 1, risk: -1 },
    ],
  },
  {
    aspect: "equities",
    terms: [
      { term: "بورس", rial: 0, risk: 1 },
      { term: "فرابورس", rial: 0, risk: 1 },
      { term: "شاخص", rial: 0, risk: 1 },
      { term: "سهام", rial: 0, risk: 1 },
      { term: "بازار سرمایه", rial: 0, risk: 1 },
      { term: "صندوق", rial: 0, risk: 0 },
      { term: "etf", rial: 0, risk: 1 },
      { term: "s&p", rial: 0, risk: 1 },
      { term: "nasdaq", rial: 0, risk: 1 },
      { term: "dow", rial: 0, risk: 1 },
      { term: "stocks", rial: 0, risk: 1 },
      { term: "wall street", rial: 0, risk: 1 },
    ],
  },
  {
    aspect: "crypto",
    terms: [
      { term: "بیت کوین", rial: 0, risk: 2 },
      { term: "بیت‌کوین", rial: 0, risk: 2 },
      { term: "رمزارز", rial: 0, risk: 2 },
      { term: "کریپتو", rial: 0, risk: 2 },
      { term: "همت پذیره", rial: 0, risk: 1 },
      { term: "تپسی", rial: 0, risk: 1 },
      { term: "صرافی دیجیتال", rial: 1, risk: 0 },
      { term: "bitcoin", rial: 0, risk: 2 },
      { term: "crypto", rial: 0, risk: 2 },
      { term: "ethereum", rial: 0, risk: 2 },
      { term: "stablecoin", rial: 1, risk: 1 },
      { term: "blockchain", rial: 0, risk: 1 },
    ],
  },
];

/**
 * Normalises a headline for matching: lower-cases, folds Arabic letter
 * variants and Persian/Arabic digits to Latin, drops the tatweel, and turns the
 * ZWNJ (U+200C) Persian writers use between morphemes into a space so
 * `نرخ‌ دلار` and `نرخ دلار` hit the same term.
 */
export function normaliseText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[يى]/g, "ی")
    .replace(/[كک]/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/[أإآ]/g, "ا")
    .replace(/[ؤئ]/g, "ی")
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/ـ/g, "")
    .replace(/[‌‏‎]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type CompiledTerm = {
  aspect: NewsAspect;
  term: string;
  rial: number;
  risk: number;
};

/** Pre-computed normalised term list, built once at module load. */
const COMPILED: CompiledTerm[] = ASPECT_LEXICON.flatMap((entry) =>
  entry.terms
    .filter((t) => t.rial !== 0 || t.risk !== 0)
    .map((t) => ({
      aspect: entry.aspect,
      term: normaliseText(t.term),
      rial: t.rial,
      risk: t.risk,
    })),
);

export type AspectMatch = {
  aspect: NewsAspect;
  /** Average rial push across the matched terms, −5..+5. */
  rial: number;
  /** Average risk push across the matched terms, −5..+5. */
  risk: number;
  terms: string[];
};

export function matchAspects(headline: string): AspectMatch[] {
  const text = normaliseText(headline);
  if (text.length === 0) return [];

  const buckets = new Map<
    NewsAspect,
    { rial: number; risk: number; hits: number; terms: string[] }
  >();

  for (const entry of COMPILED) {
    if (!text.includes(entry.term)) continue;
    const bucket = buckets.get(entry.aspect) ?? {
      rial: 0,
      risk: 0,
      hits: 0,
      terms: [],
    };
    bucket.rial += entry.rial;
    bucket.risk += entry.risk;
    bucket.hits += 1;
    bucket.terms.push(entry.term);
    buckets.set(entry.aspect, bucket);
  }

  const matches: AspectMatch[] = [];
  for (const [aspect, bucket] of buckets) {
    // Averaged, so a headline repeating one idea cannot outvote a short dense
    // one, and scaled by breadth so a single weak word is a weak signal.
    const breadth = Math.min(1, bucket.hits / 2);
    matches.push({
      aspect,
      rial: (bucket.rial / bucket.hits) * breadth,
      risk: (bucket.risk / bucket.hits) * breadth,
      terms: bucket.terms,
    });
  }

  return matches.sort(
    (a, b) =>
      Math.abs(b.rial) +
      Math.abs(b.risk) -
      (Math.abs(a.rial) + Math.abs(a.risk)),
  );
}

export function stanceOf(riskScore: number): NewsStance {
  if (riskScore >= 12) return "risk_on";
  if (riskScore <= -12) return "risk_off";
  return "neutral";
}

/**
 * Reduces a match set to a single headline verdict: the dominant aspect, the
 * direction it pushes the rial, and the resulting stance.
 *
 * The two outputs are squashed to −1..+1. `stance` reads `risk` alone, because
 * "risk-on" describes the world, not the currency: a rate cut is risk-on even
 * though it also weakens the rial.
 */
export function summariseMatches(matches: AspectMatch[]): {
  aspect: NewsAspect | null;
  rial: number;
  risk: number;
  stance: NewsStance;
} {
  if (matches.length === 0) {
    return { aspect: null, rial: 0, risk: 0, stance: "neutral" };
  }

  // The aspect carrying the most total force is the headline's subject.
  const dominant = matches.reduce((best, m) =>
    Math.abs(m.rial) + Math.abs(m.risk) >
    Math.abs(best.rial) + Math.abs(best.risk)
      ? m
      : best,
  );

  const rial = tanh(matches.reduce((sum, m) => sum + m.rial, 0) / 3);
  const risk = tanh(matches.reduce((sum, m) => sum + m.risk, 0) / 3);

  return {
    aspect: dominant.aspect,
    rial,
    risk,
    stance: stanceOf(risk * 100),
  };
}

/** Signed direction, used for the `result` line. */
export function directionOf(value: number): "up" | "down" | "flat" {
  if (value > 0.05) return "up";
  if (value < -0.05) return "down";
  return "flat";
}

function tanh(value: number): number {
  return Math.tanh(value);
}
