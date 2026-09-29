import type { Dictionary } from "./types";

/**
 * German dictionary. Typed against the English reference, so a key that is
 * missing, misspelled or of the wrong type is a build error rather than a
 * runtime `undefined`. Structural parity with the Persian file is machine checked by
 * generating all three from one skeleton.
 */
const de: Dictionary = {
  meta: {
    title: "Obsidian · Kryptomärkte",
    titleTemplate: "%s · Obsidian",
    description:
      "Live-Krypto-, ETF- und Iran-Marktpreise mit Echtzeit-Streams, dem vollständigen Board der iranischen Börsen, Nerkh-Goldkursen und Makroanalyse der iranischen Wirtschaft.",
  },

  brand: {
    name: "Obsidian",
    tagline: "Marktterminal",
  },

  nav: {
    section: "Navigation",
    markets: { label: "Märkte", hint: "Binance-Spot-Stream" },
    etfs: { label: "ETFs", hint: "Tägliche Fondflüsse" },
    irPrice: { label: "Iran-Preise", hint: "Iranische Preistafel" },
    analyze: { label: "Analyse", hint: "Iranischer Makro-Ausblick" },
    charts: { label: "Charts", hint: "Live-Kerzen" },
  },

  header: {
    realtime: "Echtzeit-Marktdaten",
    utc: "UTC",
    clockLabel: "Koordinierte Weltzeit",
  },

  common: {
    language: "Sprache",
    theme: "Design",
    switchTo: "Zu %s-Design wechseln",
    light: "Hell",
    dark: "Dunkel",
    systemsNominal: "Systeme betriebsbereit",
    feedActive: "WebSocket-Feed aktiv",
    all: "Alle",
    none: "Keine",
    loading: "Wird geladen…",
    retry: "Erneut versuchen",
    refresh: "Aktualisieren",
    source: "Quelle",
    sources: "Quellen",
    updated: "Aktualisiert",
    unavailable: "nicht verfügbar",
    live: "live",
    stale: "veraltet",
    connecting: "verbinde",
    error: "Fehler",
    yes: "Ja",
    no: "Nein",
    percent: "Prozent",
    change: "Änderung",
    trend: "Trend",
    price: "Preis",
    symbol: "Symbol",
    status: "Status",
    window1h: "1 Std.",
    window12h: "12 Std.",
    lastUpdated: "Zuletzt aktualisiert",
    articles: "Meldungen",
    sourcesOk: "Quellen antworteten",
  },

  footer: {
    terminal: "Obsidian Terminal",
    change24h: "24 Std.",
  },

  markets: {
    spotMarkets: "Spot-Märkte",
    spotMarketsHint: "Live-Binance-Ticker · aktualisiert sich fortlaufend",
    syncing: "Synchronisiert",
    pairs: "%s Paare",
    waitingFirstTick: "Warte auf den ersten Tick…",
    columns: {
      order: "#",
      symbol: "Symbol",
      price: "Preis (USDT)",
      trend: "Trend",
      trendHint:
        "Aus der 7-Tage-Serie von CoinGecko initialisiert, dann mit Live-Binance-Ticks fortgeführt",
      changeUsd: "Änderung USD (24 Std.)",
      change: "Änderung (24 Std.)",
    },
    expand: {
      show: "Status anzeigen",
      hide: "Status ausblenden",
      tooltip: "Status-Score %s — für die vollständige Analyse auf + klicken",
    },
    verdict: {
      strong_buy: "Starker Kauf",
      buy: "Kaufen",
      neutral: "Halten",
      reduce: "Reduzieren",
      avoid: "Meiden",
    },
    verdictAdvice: {
      strong_buy:
        "Die Signale sprechen dafür. Positioniere dennoch so, als könnte die Einschätzung falsch liegen.",
      buy: "Leicht günstiges Setup.",
      neutral:
        "In keine Richtung ist etwas Entscheidendes zu sehen. Abwarten kostet hier nichts.",
      reduce:
        "Einige Signale haben gedreht. Eine Risikoreduzierung ist sinnvoll.",
      avoid:
        "Die Signale sprechen dagegen. Abseits zu stehen ist die Position.",
    },
    panel: {
      noCoinIdTitle: "Keine CoinGecko-ID für diese Zeile",
      noCoinIdBody:
        "Die Statusanalyse benötigt die CoinGecko-ID und kann für diesen Coin nicht laufen.",
      failedTitle: "Analyse fehlgeschlagen",
      unexpectedError: "unerwarteter Fehler",
      empty: "Kein Status verfügbar",
      composite: "Gesamtscore %s von 100",
      updating: "aktualisiert…",
      reanalyse: "Neu analysieren",
      signals: "Signale",
      technicals: "Technik",
      market: "Markt & Community",
      headlines: "Aktuelle Schlagzeilen",
      unavailableLabel: "nicht verfügbar",
      weightSuffix: "Gewicht %s",
      labels: {
        rsi: "RSI14",
        sma20: "SMA20",
        sma50: "SMA50",
        sma200: "SMA200",
        macd: "MACD-Hist.",
        atr: "ATR",
        change7d: "7-Tage-Änderung",
        marketCapRank: "MCap-Rang",
        votesUp: "Bullische Stimmen",
        watchlist: "Watchlist-Nutzer",
        fromAth: "Vom ATH",
        fearGreed: "Fear & Greed",
      },
      writtenBy: "erstellt von %s",
      deterministic: "deterministischer Scorer",
      cachedUntil: "zwischengespeichert bis %s",
      llmUnavailableTitle:
        "Sprachmodell nicht verfügbar, deterministische Darstellung verwendet",
      sourcesDownTitle: "Einige Datenquellen waren nicht erreichbar",
    },
  },

  etfs: {
    title: "Täglicher ETF-Fluss",
    subtitle: "Intraday-Kursbewegung über Spot-ETF-Produkte",
    error:
      "Der Marktdatenanbieter war nicht erreichbar. Bitte in Kürze erneut versuchen.",
    stats: {
      dayHigh: "Tageshoch",
      dayLow: "Tagestief",
      volume: "Volumen",
    },
    assets: {
      BTC: "Bitcoin",
      ETH: "Ethereum",
      SOL: "Solana",
      XRP: "XRP",
      DOGE: "Dogecoin",
    },
  },

  irPrice: {
    title: "Iranische Preistafel",
    description:
      "Alle iranischen Börsen und Kursquellen auf einem Board: Orderbücher von Nobitex, Wallex, Bitpin und Tabdeal, live über deren eigene WebSockets, Wallex' vollständige Toman-Marktliste sowie die Gold-, Münz-, Währungs- und Kryptokurse von nerkh.io. Nach Quelle filtern, nach Kategorie gruppieren und zwischen Rial und Toman wechseln.",
    websocketLive: "WebSocket live",
    restOnly: "nur REST-Aktualisierung",
    errorTitle: "REST-Ausgangswert der Börsen konnte nicht geladen werden",
    errorFallback:
      "Alle Börsen haben die Anfrage abgelehnt. Sie antworten nur aus iranischen Netzen, die Anfrage muss also von dort kommen.",
    boardErrorTitle: "Wallex-Marktliste konnte nicht geladen werden",
    boardError:
      "Wallex ist die einzige iranische Börse, die ihre komplette Marktliste veröffentlicht, das breite Board ist derzeit daher leer.",
    nerkhErrorTitle: "Nerkh.io-Kurse konnten nicht geladen werden",
    nerkhError:
      "Der Nerkh.io-Live-Endpunkt hat nicht geantwortet, seine Zeilen fehlen daher im Board.",
    empty: "Keine Quelle hat Preise zurückgegeben.",
    noMatch:
      "Kein Instrument passt zu den aktuellen Quellen- und Kategoriefiltern.",
    unitHint:
      "Alle Preise werden in %s angezeigt. Jede Quelle rechnet in ihrer eigenen Einheit und wird vor der Anzeige vereinheitlicht.",
    sourceTag: {
      aggregator: "Kurs",
    },
    categories: {
      fiat: "Fiat",
      stablecoin: "Stablecoins",
      gold: "Gold",
      coin: "Münzen",
      crypto: "Krypto",
    },
    filter: {
      allSources: "Alle Quellen",
      allCategories: "Alle Kategorien",
    },
    assets: {
      usdt: "Tether",
      xaut: "Tether Gold (XAUT)",
      digitalGold: "Digitales 18 kt Gold",
      other: "Instrument",
    },
    table: {
      category: "Kategorie",
      source: "Quelle",
      instrument: "Instrument",
      price: "Preis",
      bid: "Tief / Kauf",
      ask: "Hoch / Verkauf",
      window24h: "24-Std.-Fenster",
      window12h: "12-Std.-Fenster",
      observed: "seit der letzten Aktualisierung",
      stream: "Stream",
      lastUpdate: "letzte Aktualisierung %s",
      noUpdateYet: "noch keine Aktualisierung",
    },
    stats: {
      instruments: "Instrumente",
      sources: "Quellen",
      transport: "Transport",
      socket: "Socket",
      poll: "Abfrage",
      bestUsdt: "Bestes USDT",
      gold18k: "18 kt Gold",
    },
  },

  nerkh: {
    title: "Nerkh.io Live-Kurse",
    description:
      "Aus dem öffentlichen Live-Endpunkt von nerkh.io ausgelesen. Iranische Marktkurse in Toman, samt der 1-Stunden- und 12-Stunden-Hoch- und Tiefwerte.",
    staleWarning:
      "Zwischengespeicherter Stand — der Live-Endpunkt hat zuletzt nicht geantwortet.",
    empty: "Nerkh.io hat keine Kurse zurückgegeben.",
    lastSync: "Synchronisiert %s",
    tab: "Nerkh.io",
    groups: {
      gold: "Gold & Münzen",
      currency: "Währungen",
      crypto: "Kryptowährungen",
    },
    stats: {
      items: "Instrumente",
      spread: "1-Std.-Spanne",
      high: "Hoch",
      low: "Tief",
      age: "Aktualität",
    },
    units: {
      toman: "Toman",
      rial: "Rial",
    },
    unitToggle: "Einheit",
    table: {
      instrument: "Instrument",
      price: "Preis",
      change1h: "1 Std.",
      change12h: "12 Std.",
      low: "Tief",
      high: "Hoch",
      source: "Quelle",
    },
    instruments: {
      GOLD18K: "18 kt Gold (Gramm)",
      GOLD24K: "24 kt Gold (Gramm)",
      GOLD18K_STOCK: "18 kt Gold, gebraucht",
      GOLD_FUTURES: "Gussgold",
      OUNCE: "Goldunze",
      OUNCE_PLATINUM: "Platinunze",
      OUNCE_SILVER: "Silberunze",
      MAZANEH: "Mazaneh",
      MESGHAL: "Mesghal",
      MILLI_GOLD18K: "Milligold 18 kt",
      TA_GOLD_18K: "Online-Gold (Talebi)",
      T_GOLD_18K: "Online-Gold (Takano)",
      SEKE_EMAMI: "Imami-Münze",
      SEKE_BAHAR: "Bahare-Azadi-Münze",
      SEKE_NIM: "Halbmünze",
      SEKE_ROB: "Viertelmünze",
      SEKE_1G: "1-Gramm-Münze",
      SEKE_PRS100: "Persian 100 mg",
      SEKE_PRS200: "Persian 200 mg",
      SEKE_PRS400: "Persian 400 mg",
      SEKE_PRS500: "Persian 500 mg",
      SEKE_PRS700: "Persian 700 mg",
      USD: "US-Dollar",
      EUR: "Euro",
      GBP: "Pfund Sterling",
      AED: "VAE-Dirham",
      TRY: "Türkische Lira",
      CHF: "Schweizer Franken",
      CAD: "Kanadischer Dollar",
      CNY: "Chinesischer Yuan",
      QAR: "Katarischer Riyal",
      BTC: "Bitcoin",
      ETH: "Ethereum",
      USDT: "Tether",
      XRP: "XRP",
      BNB: "BNB",
      DOGE: "Dogecoin",
      LTC: "Litecoin",
      TRX: "TRON",
      ADA: "Cardano",
      DOT: "Polkadot",
      DASH: "Dash",
    },
  },

  analyze: {
    title: "Makroanalyse Iran",
    description:
      "Schlagzeilen iranischer Nachrichtenagenturen werden auf Makrostimmung bewertet und mit der aktuellen Nerkh.io-Bewegung zu Prognosen für Dollar und Gold über fünf Horizonte kombiniert.",
    asset: {
      usd: "US-Dollar",
      gold: "Gold",
    },
    assetToggle: "Asset",
    horizonToggle: "Horizont",
    horizons: {
      hourly: "Stündlich",
      daily: "Täglich",
      weekly: "Wöchentlich",
      monthly: "Monatlich",
      yearly: "Jährlich",
    },
    horizonNote: {
      hourly: "Verfolgt die Intraday-Bewegung des Live-Kurses.",
      daily:
        "Mischt die 12-Stunden-Extremwerte mit dem heutigen Nachrichtenfluss.",
      weekly:
        "Gewichtet die Beständigkeit des Nachrichtensignals der letzten Woche.",
      monthly: "Ergänzt den mittelfristigen Trend und den Makrodruck.",
      yearly:
        "Ein struktureller Ausblick mit geringer Sicherheit, kein Handelssignal.",
    },
    verdict: {
      bullish: "Bullisch",
      bearish: "Bärisch",
      neutral: "Neutral",
    },
    direction: {
      up: "Aufwärts",
      down: "Abwärts",
      flat: "Seitwärts",
    },
    stats: {
      spot: "Spotkurs",
      target: "Prognose",
      drift: "Erwartete Drift",
      confidence: "Sicherheit",
      horizon: "Horizont",
    },
    signals: {
      newsSentiment: "Nachrichtenstimmung",
      sourceCoverage: "Quellenabdeckung",
      momentum1h: "1-Std.-Momentum",
      momentum12h: "12-Std.-Momentum",
      intradayRange: "Intraday-Spanne",
      macroPressure: "Makrodruck",
      newsRecency: "Aktualität der Nachrichten",
      goldPremium: "Goldaufschlag",
    },
    drivers: {
      fxMarket: "Devisenmarkt",
      inflation: "Inflation",
      monetary: "Geldpolitik & Liquidität",
      sanctions: "Sanktionen",
      oilEnergy: "Öl & Energie",
      budget: "Haushalt",
      goldDemand: "Goldnachfrage",
      politicalRisk: "Politisches Risiko",
    },
    newsTitle: "Wirtschaftsschlagzeilen",
    newsSubtitle:
      "Neuestes aus iranischen Nachrichtenagenturen, auf Makrotemperatur bewertet",
    newsEmpty:
      "Im letzten Aktualisierungsfenster wurden keine Schlagzeilen abgerufen.",
    newsSentimentScale: "−1 bärisch · 0 neutral · +1 bullisch",
    sourcesTitle: "Abgerufene Quellen",
    disclaimer:
      "Die Prognosen entstehen aus einem deterministischen Bewertungsmodell über öffentliche Nachrichten- und Preisdaten. Sie sind Schätzungen und keine Finanzberatung.",
    table: {
      instrument: "Instrument",
      spot: "Spot",
      forecast: "Prognose",
      change: "Änderung",
      confidence: "Sicherheit",
    },
    errors: {
      newsFailed: "Die iranischen Nachrichtenfeeds waren nicht erreichbar.",
      priceFailed: "Der Nerkh.io-Preisendpunkt war nicht erreichbar.",
    },
  },

  news: {
    source: {
      mehr: "Mehr News",
      irna: "IRNA",
      isna: "ISNA",
      khabaronline: "Khabar Online",
      tehrantimes: "Tehran Times",
      fed: "US Federal Reserve",
      cnbc: "CNBC",
      marketwatch: "MarketWatch",
      wsj: "WSJ Markets",
      aljazeera: "Al Jazeera",
      france24: "France 24",
      scmp: "South China Morning Post",
    },
    tier: {
      iran: "Iran",
      usOfficial: "US-Behörden",
      usWires: "US-Finanzmedien",
      regional: "Regional",
    },
    macro: "Makro",
    markets: "Märkte",
    politics: "Politik",
    other: "Sonstiges",
    aspect: {
      fx: "Devisenmarkt",
      gold: "Gold",
      oil: "Öl & Energie",
      inflation: "Inflation",
      monetary: "Geldpolitik",
      sanctions: "Sanktionen",
      budget: "Haushalt",
      war: "Krieg",
      politics: "Politik",
      credit: "Kredit",
      equities: "Aktien",
      crypto: "Krypto",
    },
    stance: {
      risk_on: "Risk-on",
      risk_off: "Risk-off",
      neutral: "Neutral",
    },
    result: {
      rialUp: "schwächerer Rial",
      rialDown: "stärkerer Rial",
      rialFlat: "kein klarer Währungseffekt",
      noAspect: "Kein Makro-Aspekt erkannt",
    },
    panel: {
      title: "News-Intelligenz",
      subtitle:
        "Jede Schlagzeile wird live nach Aspekt, Rial-Wirkung und globaler Risikohaltung bewertet.",
      aspectLegend: "Aspekt",
      resultLegend: "Ergebnis",
      stanceLegend: "Risikohaltung",
      tierFilter: "Ebene",
      allTiers: "Alle Ebenen",
      riskGauge: "Globale Risikobereitschaft",
      riskOn: "Risk-on",
      riskOff: "Risk-off",
      rialGauge: "Druck auf den Rial",
      rialWeaker: "Rial schwächer",
      rialStronger: "Rial stärker",
      sourceCount: "%s von %s Feeds antworten",
      tierCount: "%s Feeds",
      liveTag: "live",
      empty:
        "Im letzten Aktualisierungsfenster wurden keine Schlagzeilen abgerufen.",
    },
  },

  charts: {
    title: "Live-Kerzenchart",
    subtitle:
      "Kerzencharts für Krypto, Spot-Gold und die iranischen Rial-Paare, mit Volumen und 20-Perioden-Durchschnitt.",
    symbols: {
      btcusdt: "Bitcoin / USDT",
      ethusdt: "Ethereum / USDT",
      solusdt: "Solana / USDT",
      xautusd: "Gold (XAUT/USD)",
      usdirt: "Dollar / Rial",
      eurirt: "Euro / Rial",
      gold18irt: "18 kt Gold / Rial",
    },
    intervals: {
      "1m": "1m",
      "5m": "5m",
      "15m": "15m",
      "1h": "1H",
      "4h": "4H",
      "1d": "1D",
    },
    candles: "Kerzen",
    legend: "Grün ist steigend, rot ist fallend",
    maNote: "die orange Linie ist der 20-Perioden-Durchschnitt",
    aggregatedNote:
      "Keine iranische Börse veröffentlicht Kerzenhistorie, diese Serie entsteht aus Live-Ticks von nerkh.io. Historientiefe:",
    empty: "Für diesen Markt wurden noch keine Kerzen gesammelt.",
    error: "Die Kerzenquelle war nicht erreichbar.",
  },

  notFound: {
    code: "404",
    title: "Diese Seite existiert nicht",
    description:
      "Die aufgerufene Adresse gehört nicht zu diesem Terminal oder zu einer nicht aktivierten Sprache.",
    backHome: "Zurück zu den Märkten",
  },
};

export default de;
