# Free cloud AI providers

Everything below has a free tier. None of them needs a credit card.

They are already implemented — nothing to build. Set a key, restart the dev
server, and the analysis page and the coin-status narrative will use it.

---

## Which one to pick

|                | Get a key                                                        | Notes                                             |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| **Gemini**     | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Most generous free tier of the three. Start here. |
| **Groq**       | [console.groq.com/keys](https://console.groq.com/keys)           | Fastest replies, tightest quota.                  |
| **OpenRouter** | [openrouter.ai/keys](https://openrouter.ai/keys)                 | Routes to many models, `:free` ones by default.   |

**Rate limits change often**, and none of them is documented here on purpose —
a stale quota in a README is worse than a link. Check the live page:

- Gemini: <https://ai.google.dev/gemini-api/docs/rate-limits>
- Groq: <https://console.groq.com/keys>
- OpenRouter: <https://openrouter.ai/docs/api-reference/limits>

---

## Setting it up

Put the key in `.env`:

```bash
# One of these is enough.
GEMINI_API_KEY="..."
GROQ_API_KEY="..."
OPENROUTER_API_KEY="..."
```

Restart `npm run dev`. The panel on the Analyze page lists every provider and
whether it is answering, so you can confirm without running anything.

---

## Which provider gets used

Order of preference:

1. **`local`** — LM Studio or Ollama, while a model is actually loaded
2. **`gemini`**
3. **`groq`**
4. **`openrouter`**

The first one that can answer wins. A local runtime is preferred because the
point of the page is that a read need not leave the machine; the cloud providers
take over automatically when nothing local is loaded, so you do not have to
remember to switch.

### Overriding the order

**In the UI** — the panel has a **Runtime** dropdown. "Auto" follows the order
above; pick a specific one to force it for that run. Useful when you have two
keys and want to compare them.

**In `.env`** — pin it for every request:

```bash
AI_PROVIDER="gemini"
```

Pinning to a provider with no key fails loudly rather than silently falling
through, so a typo is visible immediately.

---

## What you will see

The panel lists all four providers with their state:

```
        local      online=True   LM Studio (local) · qwen/qwen3.5-9b
    *   gemini     online=True   Gemini (free tier) · gemini-2.0-flash
        groq       online=False  Groq (free tier)  — the API key was refused
        openrouter online=False  OpenRouter (free model) is not configured
```

`*` marks the one that will answer.

A provider reports `online` only after the key is actually accepted. That is a
deliberate change from the obvious implementation: Gemini's generation endpoint
is per-model, so the naive probe would report `online: true` for any non-empty
key and you would find out your key was wrong by pressing the button. It now
validates against the model listing first.

---

## Speed, honestly

A free cloud key answers in **2–10 seconds**. The same prompt on a 9B model
running on CPU takes **2–4 minutes** — that box generates at roughly 4 tokens a
second.

Cloud is fast and free within its quota. Local is slower and unlimited, and your
data never moves. Both give the same shape of answer.

---

## Privacy

A local runtime sees nothing leave your machine. A cloud provider receives the
data block, which contains:

- country name, horizon, and the scorecard indices
- macro channel names with their pressure and share
- the deterministic price forecast for the dollar and gold
- **the headlines themselves**, with their outlet, scores and age

The headlines are included deliberately — a model asked to judge economic news
needs to know what the news says. If that matters for your use, use the local
runtime and keep the cloud keys unset.

---

## Troubleshooting

| Message                                                             | Cause                    | Fix                                                           |
| ------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------- |
| `is not configured`                                                 | No key for that provider | Add the key and restart                                       |
| `the API key was refused`                                           | Key rejected (403)       | Re-copy it; check the provider's dashboard                    |
| `the API key was rejected`                                          | Key invalid (401)        | Usually a truncated or wrong-vendor key                       |
| `the free tier rate limit was hit`                                  | Quota exhausted          | Wait, or switch Runtime in the panel                          |
| `cannot reach ... — check GROQ_API_KEY and outbound network access` | Network or key           | Works only with outbound internet; the local runtime does not |
| Panel shows the wrong provider                                      | `AI_PROVIDER` is pinned  | Unset it, or change it                                        |

---

## Overriding the model

Each provider defaults to a free model chosen for availability:

| Provider   | Default                                  |
| ---------- | ---------------------------------------- |
| Gemini     | `gemini-2.0-flash`                       |
| Groq       | `llama-3.3-70b-versatile`                |
| OpenRouter | `meta-llama/llama-3.3-70b-instruct:free` |

To use another:

```bash
STATUSES_GEMINI_MODEL="gemini-2.5-flash"
STATUSES_GROQ_MODEL="llama-3.1-8b-instant"
STATUSES_OPENROUTER_MODEL="qwen/qwen3-8b:free"
```

These are shared with the coin-status narrative. Note that Gemini's provider
prefers its configured model but falls back to whatever the account can actually
run, so a model your key cannot access will not report as available.
