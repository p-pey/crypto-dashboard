import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    /**
     * CoinMarketCap Pro key.
     *
     * Optional and paid. Unset, the app uses free sources for everything and
     * the CMC panels stay hidden; set, the category, exchange and derivatives
     * panels appear. See `docs/market-data.md`.
     */
    COINMARKETCAP_API_KEY: z.string().optional(),

    /**
     * Pin a specific AI provider instead of using the preference order.
     *
     * One of `local`, `gemini`, `groq`, `openrouter`. Unset, the app prefers a
     * local runtime while one is loaded and falls through to the first
     * configured cloud key otherwise.
     */
    AI_PROVIDER: z.enum(["local", "gemini", "groq", "openrouter"]).optional(),

    /**
     * Status narrative LLM. All three providers have a free tier and are used in
     * this order. Leave them unset to fall back to the deterministic scorer.
     */
    GEMINI_API_KEY: z.string().optional(),
    GOOGLE_API_KEY: z.string().optional(),
    GROQ_API_KEY: z.string().optional(),
    OPENROUTER_API_KEY: z.string().optional(),
    /** Base for Gemini, for anyone fronting it with a proxy. */
    GEMINI_BASE_URL: z.string().optional(),
    STATUSES_GEMINI_MODEL: z.string().optional(),
    STATUSES_GROQ_MODEL: z.string().optional(),
    STATUSES_OPENROUTER_MODEL: z.string().optional(),
    STATUSES_SITE_URL: z.string().optional(),
    /** Guards POST /api/cron/statuses when set. */
    CRON_SECRET: z.string().optional(),

    // ---------------------------------------------------------------- //
    // Local LLM (LM Studio)
    // ---------------------------------------------------------------- //

    /**
     * OpenAI-compatible endpoint of a model running on this machine.
     *
     * The name is deliberately runtime-agnostic, because LM Studio and Ollama are
     * configured identically and most users run both at different times:
     *
     *   LM Studio  http://127.0.0.1:1234   (default)
     *   Ollama     http://127.0.0.1:11434
     *
     * `/v1` is appended when missing, so either a bare host or a full URL works
     * and the value can be pasted straight from the runtime's own UI.
     *
     * Nothing here is ever sent anywhere but loopback. When no runtime is
     * listening the analysis page keeps working and shows the deterministic
     * forecast on its own.
     */
    LOCAL_LLM_BASE_URL: z.string().optional(),
    /**
     * Model id to use.
     *
     * Leave unset to take the first model the runtime lists. That is safe with
     * LM Studio, which only lists what is loaded, but not with Ollama, whose
     * listing includes every model ever pulled - so pin it when using Ollama.
     */
    LOCAL_LLM_MODEL: z.string().optional(),
    /**
     * Only needed if the local server was started with auth enabled. Ollama's
     * local server ignores it; LM Studio has no auth by default at all.
     */
    LOCAL_LLM_API_KEY: z.string().optional(),
    /**
     * How hard to ask for JSON: `off`, `object` or `schema`.
     *
     * Defaults to `off`, because the field is not portable - LM Studio answers
     * 400 to `{"type":"json_object"}` and wants `json_schema`, while Groq and
     * OpenRouter accept `json_object`. With `off` the prompt still asks for one
     * JSON object and the reply is still validated, so every runtime works; this
     * only turns on constrained decoding where you know it is supported.
     */
    LOCAL_LLM_JSON_MODE: z.enum(["off", "object", "schema"]).optional(),

    /**
     * @deprecated Renamed to `LOCAL_LLM_*`. Still read, so an existing `.env`
     * keeps working; the `LOCAL_LLM_*` value wins when both are set.
     */
    LMSTUDIO_BASE_URL: z.string().optional(),
    /** @deprecated Renamed to `LOCAL_LLM_MODEL`. */
    LMSTUDIO_MODEL: z.string().optional(),
    /** @deprecated Renamed to `LOCAL_LLM_API_KEY`. */
    LMSTUDIO_API_KEY: z.string().optional(),

    /**
     * Trading switch.
     *
     * `paper` (the default) simulates every fill against the live order book
     * and never sends an order to an exchange. `live` sends real orders. The
     * two modes share one code path so that bugs surface in paper first.
     *
     * There is deliberately no third value and no way to set this from the UI.
     */
    TRADING_MODE: z.enum(["paper", "live"]).default("paper"),

    /**
     * Guards the trading API.
     *
     * This app has no sign-in flow, so a trading endpoint with no check is an
     * open door to real funds. Trading procedures require this header, which
     * means they only work from a machine that can read `.env` — i.e. the
     * operator's own box, not a browser that merely loaded the page.
     */
    TRADING_API_SECRET: z.string().optional(),

    /** SQLite file for the paper ledger, notification outbox and alert rules. */
    TRADING_DB_PATH: z.string().default("./.data/trading.sqlite"),

    // ---------------------------------------------------------------- //
    // Exchange credentials
    //
    // Every one is optional: an unset credential means that venue reports
    // itself unconfigured and its trade buttons are hidden, rather than the
    // whole app refusing to boot.
    // ---------------------------------------------------------------- //

    /** Nobitex panel token (Settings -> API). Sent as `Authorization: Token`. */
    NOBITEX_TOKEN: z.string().optional(),
    /**
     * Nobitex base URL.
     *
     * Point this at `https://testnetapiv2.nobitex.ir` to develop against the
     * exchange's own testnet instead of production.
     */
    NOBITEX_BASE_URL: z.string().default("https://apiv2.nobitex.ir"),

    /** Wallex API key, sent as `x-api-key`. */
    WALLEX_API_KEY: z.string().optional(),

    /**
     * Bitpin credential pair.
     *
     * Bitpin is the one venue that does not take a ready-made token: these are
     * exchanged for a short-lived JWT at runtime and refreshed on a timer.
     */
    BITPIN_API_KEY: z.string().optional(),
    BITPIN_SECRET_KEY: z.string().optional(),

    /** Tabdeal credential pair; requests are signed with HMAC-SHA256. */
    TABDEAL_API_KEY: z.string().optional(),
    TABDEAL_API_SECRET: z.string().optional(),

    /** BitUnix credential pair; requests are signed with a double SHA-256. */
    BITUNIX_API_KEY: z.string().optional(),
    BITUNIX_SECRET_KEY: z.string().optional(),

    // ---------------------------------------------------------------- //
    // Telegram
    // ---------------------------------------------------------------- //

    /**
     * Bot token from @BotFather, and the chat to notify.
     *
     * The token grants full control of the bot, so it is never logged and the
     * outbound URL is built at call time rather than stored.
     */
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_CHAT_ID: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    GEMINI_BASE_URL: process.env.GEMINI_BASE_URL,
    STATUSES_GEMINI_MODEL: process.env.STATUSES_GEMINI_MODEL,
    STATUSES_GROQ_MODEL: process.env.STATUSES_GROQ_MODEL,
    STATUSES_OPENROUTER_MODEL: process.env.STATUSES_OPENROUTER_MODEL,
    STATUSES_SITE_URL: process.env.STATUSES_SITE_URL,
    CRON_SECRET: process.env.CRON_SECRET,
    COINMARKETCAP_API_KEY: process.env.COINMARKETCAP_API_KEY,
    AI_PROVIDER: process.env.AI_PROVIDER,
    LOCAL_LLM_BASE_URL: process.env.LOCAL_LLM_BASE_URL,
    LOCAL_LLM_MODEL: process.env.LOCAL_LLM_MODEL,
    LOCAL_LLM_API_KEY: process.env.LOCAL_LLM_API_KEY,
    LOCAL_LLM_JSON_MODE: process.env.LOCAL_LLM_JSON_MODE,
    LMSTUDIO_BASE_URL: process.env.LMSTUDIO_BASE_URL,
    LMSTUDIO_MODEL: process.env.LMSTUDIO_MODEL,
    LMSTUDIO_API_KEY: process.env.LMSTUDIO_API_KEY,
    TRADING_MODE: process.env.TRADING_MODE,
    TRADING_API_SECRET: process.env.TRADING_API_SECRET,
    TRADING_DB_PATH: process.env.TRADING_DB_PATH,
    NOBITEX_TOKEN: process.env.NOBITEX_TOKEN,
    NOBITEX_BASE_URL: process.env.NOBITEX_BASE_URL,
    WALLEX_API_KEY: process.env.WALLEX_API_KEY,
    BITPIN_API_KEY: process.env.BITPIN_API_KEY,
    BITPIN_SECRET_KEY: process.env.BITPIN_SECRET_KEY,
    TABDEAL_API_KEY: process.env.TABDEAL_API_KEY,
    TABDEAL_API_SECRET: process.env.TABDEAL_API_SECRET,
    BITUNIX_API_KEY: process.env.BITUNIX_API_KEY,
    BITUNIX_SECRET_KEY: process.env.BITUNIX_SECRET_KEY,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    // NEXT_PUBLIC_CLIENTVAR: process.env.NEXT_PUBLIC_CLIENTVAR,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
