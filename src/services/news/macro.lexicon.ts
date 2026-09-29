import type { MacroDriverId } from "./news.types";

/**
 * Macro lexicon for Iranian financial news.
 *
 * Each driver is a bag of weighted terms. The sign is *depreciation pressure
 * on the rial*: a term like `افزایش قیمت دلار` scores positive because a
 * stronger dollar means a weaker rial, while `رفع تحریم` scores negative
 * because it should strengthen the currency. The lexicon is deliberately
 * bilingual — Tehran Times runs in English while every domestic outlet runs in
 * Persian — and hand tuned rather than learned, so every hit is explainable.
 *
 * Matching is substring based, not word-boundary based: Persian is written
 * without spaces between morphemes (`نرخ دلار`, `نرخِ دلار`, `نرخ‌ دلار` all
 * have to hit) and `\b` is unreliable across the Arabic script.
 */
export type LexiconTerm = {
  /** Lower-cased substring matched against the normalised headline. */
  term: string;
  /** -5..+5 depreciation pressure. */
  weight: number;
};

export type MacroDriverLexicon = {
  id: MacroDriverId;
  terms: LexiconTerm[];
};

export const MACRO_LEXICON: MacroDriverLexicon[] = [
  {
    id: "fx_market",
    terms: [
      { term: "افزایش قیمت دلار", weight: 3 },
      { term: "رشد قیمت دلار", weight: 3 },
      { term: "کاهش قیمت دلار", weight: -3 },
      { term: "تضعیف ریال", weight: 3 },
      { term: "تضعیف واحد پول", weight: 3 },
      { term: "بی ارزشی ریال", weight: 3 },
      { term: "نرخ دلار", weight: 1 },
      { term: "بازار ارز", weight: 1 },
      { term: "بازار مبادله", weight: 1 },
      { term: "مرکز مبادله", weight: 1 },
      { term: "صرافی", weight: 1 },
      { term: "تقاضای ارز", weight: 2 },
      { term: "عرضه ارز", weight: -1 },
      { term: "رفع محدودیت ارزی", weight: -2 },
      { term: "سیاست ارزی", weight: 1 },
      { term: "تک‌نرخی", weight: -2 },
      { term: "تک نرخی", weight: -2 },
      { term: "صعود دلار", weight: 3 },
      { term: "نزول دلار", weight: -3 },
      { term: "dollar rises", weight: 3 },
      { term: "dollar falls", weight: -3 },
      { term: "rial weakens", weight: 3 },
      { term: "rial strengthens", weight: -3 },
      { term: "exchange rate", weight: 1 },
      { term: "currency market", weight: 1 },
      { term: "قیمت دلار", weight: 3 },
      { term: "نرخ دلار", weight: 2 },
      { term: "اسکناس", weight: 2 },
      { term: "دلار آمریکا", weight: 1 },
      { term: "بازار سکه و طلا", weight: 1 },
      { term: "خرید دلار", weight: 2 },
      { term: "فروش دلار", weight: -1 },
      { term: "نرخ ارز", weight: 1 },
      { term: "روند دلار", weight: 2 },
      { term: "اوج دلار", weight: 2 },
      { term: "سقف دلار", weight: 2 },
      { term: "کف دلار", weight: -2 },
      { term: "ارزش ریال", weight: 2 },
      { term: "ریال", weight: 1 },
      { term: "تومان", weight: 1 },
    ],
  },
  {
    id: "inflation",
    terms: [
      { term: "تورم", weight: 2 },
      { term: "نرخ تورم", weight: 2 },
      { term: "تورم ماهانه", weight: 2 },
      { term: "تورم سالانه", weight: 2 },
      { term: "جهش تورم", weight: 3 },
      { term: "گرانی", weight: 2 },
      { term: "افزایش قیمت کالاها", weight: 2 },
      { term: "گران‌تر", weight: 1 },
      { term: "کاهش قدرت خرید", weight: 2 },
      { term: "مانده بدهی", weight: 1 },
      { term: "قیمت کالا", weight: 1 },
      { term: "قیمت تمام شده", weight: 1 },
      { term: "inflation", weight: 2 },
      { term: "price increase", weight: 1 },
      { term: "cost of living", weight: 2 },
      { term: "شاخص قیمت مصرف کننده", weight: 3 },
      { term: "شاخص قیمت مصرف‌کننده", weight: 3 },
      { term: "تورم تولیدکننده", weight: 2 },
      { term: "قیمت خودرو", weight: 1 },
      { term: "بازار مسکن", weight: 1 },
      { term: "اجاره", weight: 1 },
      { term: "افزایش حقوق", weight: 2 },
      { term: "گران شد", weight: 1 },
      { term: "ارزان شد", weight: -1 },
      { term: "افزایش قیمت", weight: 1 },
      { term: "کاهش قیمت", weight: -1 },
      { term: "کالای اساسی", weight: 1 },
      { term: "سوخت", weight: 1 },
      { term: "حمل و نقل", weight: 1 },
    ],
  },
  {
    id: "monetary",
    terms: [
      { term: "بانک مرکزی", weight: 1 },
      { term: "سیاست پولی", weight: 2 },
      { term: "نرخ سود بانکی", weight: 1 },
      { term: "نرخ سود سپرده", weight: 1 },
      { term: "چاپ پول", weight: 3 },
      { term: "پول چاپی", weight: 3 },
      { term: "اضافه چاپ", weight: 3 },
      { term: "کسری نقدینگی", weight: 1 },
      { term: "نقدینگی", weight: 1 },
      { term: "منابع ارزی", weight: -1 },
      { term: "ذخیره ارزی", weight: -1 },
      { term: "واردات", weight: 1 },
      { term: "تسهیلات بانکی", weight: 1 },
      { term: "central bank", weight: 1 },
      { term: "monetary policy", weight: 2 },
      { term: "money supply", weight: 2 },
      { term: "interest rate", weight: 1 },
      { term: "پایان دادن به تحریم", weight: -3 },
      { term: "صادرات غیرنفتی", weight: -2 },
      { term: "درآمد ارزی", weight: -2 },
      { term: "نرخ سود", weight: 1 },
      { term: "سپرده", weight: 1 },
      { term: "تورم بانکی", weight: 1 },
      { term: "رکود", weight: 1 },
      { term: "نقدینگی پول", weight: 2 },
      { term: "اختیار", weight: 0 },
    ],
  },
  {
    id: "sanctions",
    terms: [
      { term: "تحریم", weight: 3 },
      { term: "تحریم‌ها", weight: 3 },
      { term: "تحریم ها", weight: 3 },
      { term: "رفع تحریم", weight: -4 },
      { term: "لغو تحریم", weight: -4 },
      { term: "کاهش تحریم", weight: -2 },
      { term: "تشدید تحریم", weight: 4 },
      { term: "مذاکرات", weight: -1 },
      { term: "برجام", weight: -1 },
      { term: "توافق هسته‌ای", weight: -2 },
      { term: "توافق هسته ای", weight: -2 },
      { term: "فشار خارجی", weight: 2 },
      { term: "محدودیت صادرات", weight: 2 },
      { term: "سازمان ملل", weight: -1 },
      { term: "snapback", weight: 3 },
      { term: "sanction", weight: 3 },
      { term: "nuclear deal", weight: -2 },
      { term: "sanctions relief", weight: -4 },
      { term: "پایان تحریم", weight: -3 },
      { term: "فشار حداکثری", weight: 3 },
      { term: "تحریم بانکی", weight: 3 },
      { term: "محدودیت", weight: 1 },
      { term: "دسترسی به حساب", weight: 1 },
      { term: "میانبر", weight: 1 },
    ],
  },
  {
    id: "oil_energy",
    terms: [
      { term: "صادرات نفت", weight: -2 },
      { term: "فروش نفت", weight: -2 },
      { term: "درآمد ارزی نفت", weight: -2 },
      { term: "قیمت نفت", weight: -1 },
      { term: "اوپک", weight: -1 },
      { term: "صادرات گاز", weight: -2 },
      { term: "گاز صادراتی", weight: -2 },
      { term: "گاز سوختی", weight: 2 },
      { term: "قطع گاز", weight: 3 },
      { term: "قطع برق", weight: 3 },
      { term: "ناترازی", weight: 2 },
      { term: "سهمیه بنزین", weight: 2 },
      { term: "قیمت بنزین", weight: 2 },
      { term: "انرژی", weight: 1 },
      { term: "oil exports", weight: -2 },
      { term: "oil price", weight: -1 },
      { term: "opec", weight: -1 },
      { term: "power outage", weight: 3 },
      { term: "درآمد نفت", weight: -2 },
      { term: "واردات بنزین", weight: 1 },
      { term: "قیمت جهانی نفت", weight: -1 },
      { term: "صادرات نفتی", weight: -2 },
      { term: "نفت خام", weight: -1 },
    ],
  },
  {
    id: "budget",
    terms: [
      { term: "بودجه", weight: 1 },
      { term: "کسری بودجه", weight: 3 },
      { term: "بودجه ۱۴۰۵", weight: 1 },
      { term: "بودجه 1405", weight: 1 },
      { term: "هزینه‌های دولت", weight: 2 },
      { term: "هزینه های دولت", weight: 2 },
      { term: "مالیات", weight: 1 },
      { term: "قیمت نفت در بودجه", weight: -1 },
      { term: "سقف اعتبار", weight: 1 },
      { term: "subsidy", weight: 2 },
      { term: "budget deficit", weight: 3 },
      { term: "government spending", weight: 2 },
      { term: "یارانه", weight: 2 },
      { term: "بودجه بسته", weight: 1 },
      { term: "کسری", weight: 2 },
      { term: "بستانکار", weight: 0 },
      { term: "بودجه دولت", weight: 1 },
      { term: "تخصیص بودجه", weight: 1 },
    ],
  },
  {
    id: "gold_demand",
    terms: [
      { term: "طلا", weight: 1 },
      { term: "سکه", weight: 1 },
      { term: "حباب سکه", weight: 2 },
      { term: "طلای ۱۸ عیار", weight: 1 },
      { term: "اونس", weight: 1 },
      { term: "خرید طلا", weight: 2 },
      { term: "تقاضای طلا", weight: 2 },
      { term: "قیمت طلا", weight: 1 },
      { term: "پس‌انداز", weight: 1 },
      { term: "پس انداز", weight: 1 },
      { term: "صادرات طلا و جواهر", weight: -1 },
      { term: "gold price", weight: 1 },
      { term: "بازار طلا", weight: 1 },
      { term: "قیمت سکه", weight: 1 },
      { term: "سکه امامی", weight: 1 },
      { term: "سکه بهار", weight: 1 },
      { term: "ربع سکه", weight: 1 },
      { term: "نیم سکه", weight: 1 },
      { term: "طلای آبشده", weight: 1 },
      { term: "پس انداز", weight: 1 },
      { term: "خرید سکه", weight: 2 },
      { term: "فروش طلا", weight: -1 },
    ],
  },
  {
    id: "political_risk",
    terms: [
      { term: "بی‌ثباتی", weight: 2 },
      { term: "بی ثباتی", weight: 2 },
      { term: "اعتراض", weight: 2 },
      { term: "تنش", weight: 1 },
      { term: "درگیری", weight: 2 },
      { term: "حمله", weight: 2 },
      { term: "تحرکات", weight: 1 },
      { term: "انقضای مهلت", weight: 2 },
      { term: "قطعنامه", weight: 2 },
      { term: "unrest", weight: 2 },
      { term: "protest", weight: 2 },
      { term: "escalation", weight: 2 },
      { term: "مذاکره هسته ای", weight: -2 },
      { term: "اسنپک", weight: 3 },
      { term: "تنش در", weight: 1 },
      { term: "واکنش", weight: 0 },
      { term: "بیانیه", weight: 0 },
      { term: "تغییر دولت", weight: 1 },
      { term: "انفجار", weight: 2 },
      { term: "زلزله", weight: 1 },
    ],
  },
];

/**
 * Normalises a headline for matching: lower-cases, folds the Arabic
 * letter variants and the Persian/Arabic digits down to Latin, and collapses
 * the ZWNJ (U+200C) that Persian writers use between morphemes so
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
    .replace(/[ـ]/g, "")
    .replace(/[‌‏‎]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pre-computed normalised term list, built once at module load. */
const COMPILED: Array<{ driver: MacroDriverId; term: string; weight: number }> =
  MACRO_LEXICON.flatMap((driver) =>
    driver.terms
      .filter((entry) => entry.weight !== 0)
      .map((entry) => ({
        driver: driver.id,
        term: normaliseText(entry.term),
        weight: entry.weight,
      })),
  );

export type HeadlineMatch = {
  driver: MacroDriverId;
  score: number;
  terms: string[];
};

/**
 * Scores one headline against the whole lexicon.
 *
 * Per driver the raw term weights are averaged rather than summed, so a long
 * headline that repeats the same idea cannot outvote a short, dense one. The
 * result is squashed into -1..1.
 */
export function matchDrivers(headline: string): HeadlineMatch[] {
  const text = normaliseText(headline);
  if (text.length === 0) return [];

  const buckets = new Map<
    MacroDriverId,
    { sum: number; hits: number; terms: string[] }
  >();

  for (const entry of COMPILED) {
    if (!text.includes(entry.term)) continue;

    const bucket = buckets.get(entry.driver) ?? { sum: 0, hits: 0, terms: [] };
    bucket.sum += entry.weight;
    bucket.hits += 1;
    bucket.terms.push(entry.term);
    buckets.set(entry.driver, bucket);
  }

  const matches: HeadlineMatch[] = [];

  for (const [driver, bucket] of buckets) {
    const average = bucket.sum / bucket.hits;
    // A single very heavy term should still land near the top of the range.
    const score = Math.tanh(average / 3);
    if (Math.abs(score) < 0.08) continue;
    matches.push({ driver, score, terms: bucket.terms });
  }

  return matches.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
}

/** Words that make a headline political rather than economic. */
const POLITICS_MARKERS = [
  "انعقاد",
  "دیدار",
  "سخنرانی",
  "بازدید",
  "توهین",
  "حکم دادگاه",
  "بازداشت",
  "انتصاب",
  "استعفا",
  "سفر به",
  "telephone",
  "call with",
];

const MARKET_MARKERS = [
  "بورس",
  "فرابورس",
  "شاخص",
  "سهام",
  "بازار سرمایه",
  "صندوق",
  "ETF",
  "بیت کوین",
  "بیت‌کوین",
  "رمزارز",
  "کریپتو",
  "همت پذیره",
  "تپسی",
  "صرافی دیجیتال",
  "stock",
  "shares",
  "bitcoin",
  "crypto",
];

/** Classifies a headline so the UI can group the feed. */
export function classifyHeadline(
  headline: string,
): "macro" | "markets" | "politics" | "other" {
  const text = normaliseText(headline);
  if (MARKET_MARKERS.some((marker) => text.includes(normaliseText(marker)))) {
    return "markets";
  }
  if (POLITICS_MARKERS.some((marker) => text.includes(normaliseText(marker)))) {
    return "politics";
  }
  return "macro";
}
