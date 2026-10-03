# Connecting a local LLM

The analysis page can hand its country scorecard to a model running on your own
machine and render the answer — verdict, confidence, direction odds and the
channels it weights.

Nothing in this path leaves your machine. There is no cloud provider and no
fallback, so if no runtime is listening the panel says so and the deterministic
forecast stands on its own.

Both supported runtimes — **LM Studio** and **Ollama** — speak the same
OpenAI-compatible dialect, so they are configured identically. Only the port
differs.

---

## Configuration

Three variables, all optional. With none of them set the app assumes LM Studio's
default address.

| Variable             | Purpose                                  | Example                  |
| -------------------- | ---------------------------------------- | ------------------------ |
| `LOCAL_LLM_BASE_URL` | Where the runtime is listening           | `http://127.0.0.1:11434` |
| `LOCAL_LLM_MODEL`    | Which model to use                       | `qwen3:8b`               |
| `LOCAL_LLM_API_KEY`  | Only if you started the server with auth | usually empty            |

`/v1` is appended when missing, so a bare host works. Put this in `.env`:

```bash
# ---- LM Studio ----
LOCAL_LLM_BASE_URL="http://127.0.0.1:1234"
LOCAL_LLM_MODEL="qwen3-8b-instruct"

# ---- or Ollama ----
LOCAL_LLM_BASE_URL="http://127.0.0.1:11434"
LOCAL_LLM_MODEL="qwen3:8b"
```

Restart the dev server afterwards — the base URL is read once at boot.

### Runtime preference

The registry tries **local first**, then Gemini, Groq and OpenRouter, and uses
the first one that is _configured_. A cloud key is only reached when no local
model is loaded, which is a state you reach by deliberately closing your runtime.
The status chip on the page shows which one is active.

---

## LM Studio

1. Install and open [LM Studio](https://lmstudio.ai).
2. **Discover / My Models** tab → search for a model → **Download**.
3. **Developer → Local Server** tab.
4. Load the model into memory (**Select a model to load**). This matters — see
   the note below.
5. Click **Start Server**.

It listens on `http://127.0.0.1:1234` by default. No API key is needed.

```bash
curl http://127.0.0.1:1234/v1/models
```

**LM Studio's `/models` lists only what is currently loaded**, so leaving
`LOCAL_LLM_MODEL` unset is safe here — there is usually only one choice.

### Suggested models

The analysis panel asks for a JSON object with a fixed shape. A model in the
7B–14B range with instruction tuning handles it; smaller models produce answers
that are valid but thin.

| Model                      | Size    | Notes                            |
| -------------------------- | ------- | -------------------------------- |
| `qwen3-8b-instruct`        | ~5 GB   | Good default; strong at JSON     |
| `qwen2.5-7b-instruct`      | ~4.5 GB | Very reliable JSON output        |
| `llama-3.1-8b-instruct`    | ~4.5 GB | Fast, slightly looser formatting |
| `mistral-7b-instruct-v0.3` | ~4 GB   | Fine, needs JSON mode on         |

Anything below ~3B will mostly return prose where JSON was expected. It will
still render — the panel falls back to showing the raw reply — but the answer
will not be worth much.

---

## Ollama

1. Install [Ollama](https://ollama.com) (Linux: the install script; macOS/Windows:
   the desktop app).
2. Pull a model:

   ```bash
   ollama pull qwen3:8b
   ```

3. Make sure the server is running:

   ```bash
   ollama serve
   ```

   The macOS and Windows apps start it automatically. On Linux it may not be
   running after a reboot.

It listens on `http://127.0.0.1:11434`. The local server **ignores an API key**,
so leave `LOCAL_LLM_API_KEY` empty.

```bash
curl http://127.0.0.1:11434/v1/models
```

### Always pin `LOCAL_LLM_MODEL` with Ollama

This is the one real difference between the two runtimes, and it bites.

LM Studio's model list contains only what is loaded, so "the first model" is a
sensible default. **Ollama's list contains every model you have ever pulled** —
they load lazily, on first use, and it returns them in no useful order.

So with `LOCAL_LLM_MODEL` unset, the app may answer as:

- a 1B parameter model you pulled once and forgot about, sitting first in the list
- an embedding model, which cannot produce prose at all
- a vision model, which works but wastes your context window

Set it explicitly to the model you actually want:

```bash
LOCAL_LLM_MODEL="qwen3:8b"
```

If you pin a model that is not available, the panel reports
`qwen3:8b is pinned but not available; pull or load it, or unset LOCAL_LLM_MODEL`
rather than silently substituting another one.

### Context size

Ollama's default context window can truncate a long prompt. The analysis prompt
is a few thousand tokens once the data block is included. If you see truncated or
empty answers, create a model with a larger window:

```
# Modelfile
FROM qwen3:8b
PARAMETER num_ctx 16384
```

```bash
ollama create qwen3-long -f Modelfile
```

Then set `LOCAL_LLM_MODEL="qwen3-long"`.

---

## When the runtime is on another machine

This is the single most common reason "it says it cannot reach the model
runtime" on a setup that looks correct. If the app is served from a container, a
remote box, a VM or a dev server, and LM Studio is running on your laptop,
`127.0.0.1` is **the app's own machine, not yours**. Loopback will never work.

Two things have to change.

**1. Let the runtime serve beyond loopback.** In LM Studio, open
**Developer → Local Server** and turn on **Serve on Local Network**. That flips
the bind address from `127.0.0.1` to `0.0.0.0`.

For Ollama, bind explicitly when you start it:

```bash
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

**2. Point the app at that machine's address** in `.env`:

```bash
LOCAL_LLM_BASE_URL="http://192.168.1.42:1234"
```

Find the address on the machine running LM Studio:

```bash
# macOS / Linux
ip route get 1.1.1.1 | awk '{print $7; exit}'
hostname -I
```

Then confirm from the machine running the app:

```bash
curl http://192.168.1.42:1234/v1/models
```

If that fails, the cause is the firewall, not the app:

```bash
sudo ufw allow 1234/tcp     # or firewalld: --add-port=1234/tcp
```

### A note on doing this over the open internet

Binding a model server to `0.0.0.0` and then exposing that port to the internet
publishes an unauthenticated inference endpoint. LM Studio's server has no auth
by default and `LOCAL_LLM_API_KEY` is only useful if you started it with one.

Prefer, in order:

1. Keep it on the LAN only, and reach it over a VPN or an SSH tunnel.
2. Bind to a specific private interface rather than `0.0.0.0`.
3. Never expose a model server directly to the internet.

An SSH tunnel is usually the simplest of these and needs nothing configured on
either end beyond the tunnel itself:

```bash
ssh -L 1234:127.0.0.1:1234 you@your-desktop
```

Then leave `LOCAL_LLM_BASE_URL` at its default and it works.

---

## Verifying

From the app:

- Open **Analyze** and scroll to **Local AI read**.
- The chip should read **Runtime online** with the model name beside it.
- Press **Run local analysis**.

From the terminal:

```bash
# Is anything listening?
curl http://127.0.0.1:1234/v1/models   # LM Studio
curl http://127.0.0.1:11434/v1/models  # Ollama

# Does it actually complete?
curl http://127.0.0.1:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-8b-instruct",
    "messages": [{"role": "user", "content": "Reply with {\"ok\":true}"}],
    "response_format": {"type": "json_object"}
  }'
```

If the `curl` works but the panel does not, the base URL or the pinned model in
`.env` is wrong — restart the dev server after editing it.

---

## Troubleshooting

| Symptom                                        | Cause                                                   | Fix                                                           |
| ---------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| `cannot reach the model runtime`               | Server not started, or wrong port                       | Start it; 1234 for LM Studio, 11434 for Ollama                |
| `is pinned but not available`                  | Model not pulled / not loaded                           | `ollama pull`, or load it in LM Studio                        |
| `the runtime is up but has no model loaded`    | Ollama has nothing pulled, LM Studio has nothing loaded | Load or pull one                                              |
| `the model runtime timed out`                  | Model too slow for the deadline                         | Use a smaller model, or a GPU                                 |
| `unusable answer: expected number, received …` | Model did not follow the schema                         | Use an instruct model; the raw reply is shown below the error |
| Answers as an odd model                        | Ollama, `LOCAL_LLM_MODEL` unset                         | Pin the model                                                 |
| Empty or truncated answers                     | Ollama context window too small                         | Raise `num_ctx`                                               |

---

## How it behaves

**It is slow, and that is the runtime.** A 7B model writing a structured answer
on CPU takes tens of seconds. The button commits to the wait, and the status chip
tells you whether anything is listening before you spend it. The analysis
section allows three minutes; the coin-status narrative allows twenty seconds,
because it runs on a cron and must not hold a slot.

**Answers are validated before they are shown.** The model is asked for one JSON
object; the reply is checked against a schema, then clamped into range —
probabilities forced to total 100, drifts bounded, lists truncated. A model that
quotes its numbers (`"84%"`), fences the output or returns too many factors still
produces a usable panel. A reply that cannot be parsed at all is shown verbatim
rather than discarded, so you can see what the model actually said.

**The prompt contains no headline text.** Only aspects, magnitudes and ages go
over the wire. Sending the sentences would let one dramatic headline anchor the
whole answer.

**It is a read, not a forecast.** The deterministic numbers above it in the page
are computed with no model involved. The local model's opinion is rendered
separately and labelled as such.

---

## Configuration reference

|                             | LM Studio                    | Ollama                      |
| --------------------------- | ---------------------------- | --------------------------- |
| Default port                | `1234`                       | `11434`                     |
| Base URL                    | `http://127.0.0.1:1234`      | `http://127.0.0.1:11434`    |
| Make a model available      | Load it in the Developer tab | `ollama pull <model>`       |
| API key                     | Not needed                   | Ignored by the local server |
| `/models` lists             | Only what is **loaded**      | Everything ever **pulled**  |
| Pin `LOCAL_LLM_MODEL`       | Recommended                  | **Required**                |
| `response_format` JSON mode | Yes                          | Yes                         |
| Context window              | Set in the UI                | `PARAMETER num_ctx`         |

Other runtimes work too, if they expose the same `/v1` endpoints — llama.cpp's
server, vLLM, LM Studio's own variants. Point `LOCAL_LLM_BASE_URL` at them.
