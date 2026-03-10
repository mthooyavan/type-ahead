# Type Ahead

Inline code autocomplete for VS Code, powered by your choice of LLM backend. Get ghost-text suggestions as you type — accept with **Tab**, dismiss with **Escape**.

Works with **Ollama**, **Anthropic (Claude)**, **vLLM**, **LM Studio**, **LiteLLM Gateway**, or any server that speaks the OpenAI chat completions protocol.

---

## Quick Start

### Option 1: Local models with Ollama (free, private, no API key)

Best for: privacy-conscious users, offline work, or trying out the extension for free.

1. [Install Ollama](https://ollama.com) and pull a code model:
   ```bash
   ollama pull codellama:7b
   ```

2. Open VS Code Settings (`Cmd+,` / `Ctrl+,`) and search for `typeAhead`:

   | Setting | Value |
   |---|---|
   | **Backend** | `OpenAI Compatible` |
   | **Model** | `codellama:7b` |
   | **Api Base Url** | `http://localhost:11434/v1` |

3. Start typing in any file. Ghost text should appear after a brief pause.

> **Tip:** Other good Ollama models for code completion: `deepseek-coder:6.7b`, `starcoder2:3b` (fast), `codellama:13b` (better quality).

---

### Option 2: Anthropic (Claude) via API

Best for: highest quality completions using Claude models, when you have an Anthropic API key.

1. Get an API key from [console.anthropic.com](https://console.anthropic.com)

2. Settings:

   | Setting | Value |
   |---|---|
   | **Backend** | `Anthropic` |
   | **Model** | `claude-haiku-4-5` (fast) or `claude-sonnet-4-6` (smarter) |
   | **Api Key** | Your Anthropic API key (starts with `sk-ant-`) |

   Leave **Api Base Url** empty — it defaults to `https://api.anthropic.com`.

> **Tip:** If you leave **Model** empty, the extension uses the `ANTHROPIC_SMALL_FAST_MODEL` environment variable (if set), otherwise defaults to `claude-haiku-4-5`.

---

### Option 3: vLLM or LM Studio

Best for: running larger models on powerful hardware, or using models not available in Ollama.

Both vLLM and LM Studio expose an OpenAI-compatible API.

**vLLM:**
```bash
vllm serve deepseek-ai/deepseek-coder-6.7b-instruct --port 8000
```

| Setting | Value |
|---|---|
| **Backend** | `OpenAI Compatible` |
| **Model** | `deepseek-ai/deepseek-coder-6.7b-instruct` |
| **Api Base Url** | `http://localhost:8000/v1` |

**LM Studio:**
1. Download a model in LM Studio and start the local server
2. Use the model name shown in LM Studio's server tab

| Setting | Value |
|---|---|
| **Backend** | `OpenAI Compatible` |
| **Model** | (model name from LM Studio) |
| **Api Base Url** | `http://localhost:1234/v1` |

---

### Option 4: LiteLLM Gateway

Best for: organizations that route requests through a centralized LLM proxy, or when you need to use models from multiple providers through one endpoint.

[LiteLLM](https://docs.litellm.ai/) is a proxy server that translates OpenAI-format requests to 100+ LLM providers.

| Setting | Value |
|---|---|
| **Backend** | `LiteLLM Gateway` |
| **Model** | Model name as configured in your LiteLLM proxy (e.g., `gpt-4o-mini`, `claude-haiku`) |
| **Api Base Url** | Your LiteLLM server URL (e.g., `http://litellm.internal:4000/v1`) |
| **Api Key** | Your LiteLLM API key (if required) |

---

### Option 5: Any OpenAI-compatible server

The `OpenAI Compatible` backend works with **any server** that implements the `/chat/completions` endpoint in the OpenAI format. This includes:

- [Ollama](https://ollama.com)
- [vLLM](https://docs.vllm.ai/)
- [LM Studio](https://lmstudio.ai/)
- [LocalAI](https://localai.io/)
- [text-generation-webui](https://github.com/oobabooga/text-generation-webui) (with OpenAI extension)
- [llama.cpp server](https://github.com/ggerganov/llama.cpp/tree/master/examples/server)
- OpenAI API itself
- Azure OpenAI
- Any custom gateway

---

## Which Backend Should I Use?

| Scenario | Backend | Why |
|---|---|---|
| Free, local, private | `OpenAI Compatible` + Ollama | No API key needed. Data stays on your machine. |
| Best quality completions | `Anthropic` | Claude models produce high-quality code completions. |
| Large models on GPU server | `OpenAI Compatible` + vLLM | vLLM is optimized for GPU inference throughput. |
| Quick local experimentation | `OpenAI Compatible` + LM Studio | GUI for downloading and running models. |
| Corporate/team setup | `LiteLLM Gateway` | Centralized proxy with auth, logging, rate limiting. |
| Custom internal LLM gateway | `OpenAI Compatible` | Works with any OpenAI-compatible endpoint. |

---

## All Settings

Open VS Code Settings (`Cmd+,` / `Ctrl+,`) and search for `typeAhead`.

| Setting | Type | Default | Description |
|---|---|---|---|
| `typeAhead.enabled` | boolean | `true` | Enable or disable the extension |
| `typeAhead.backend` | enum | `openai` | Backend: `OpenAI Compatible`, `Anthropic`, or `LiteLLM Gateway` |
| `typeAhead.model` | string | `""` | Model name (required for OpenAI/LiteLLM, optional for Anthropic) |
| `typeAhead.apiBaseUrl` | string | `""` | API base URL (required for OpenAI/LiteLLM, defaults to `https://api.anthropic.com` for Anthropic) |
| `typeAhead.apiKey` | string | `""` | Static API key. Leave empty for servers that need no auth (like local Ollama) |
| `typeAhead.apiKeyHelper` | string | `""` | Shell command that outputs an API key (overrides `apiKey` — see below) |
| `typeAhead.debounceMs` | number | `300` | Milliseconds to wait after you stop typing before requesting a completion |
| `typeAhead.contextLines` | number | `100` | Lines of code before and after the cursor to send as context |
| `typeAhead.cacheSize` | number | `50` | Number of completions to cache. Set to `0` to disable caching |

You can also set these in your `settings.json`:

```json
{
  "typeAhead.backend": "openai",
  "typeAhead.model": "codellama:7b",
  "typeAhead.apiBaseUrl": "http://localhost:11434/v1"
}
```

---

## Dynamic API Keys with `apiKeyHelper`

For environments where API keys are short-lived (corporate SSO, rotating tokens, etc.), you can configure a shell command that generates a fresh key. The extension runs this command:

- Once when VS Code opens (session start)
- Again automatically if the server returns a 401 or 403 error

**Example: Using a custom CLI tool:**
```json
{
  "typeAhead.apiKeyHelper": "my-company-cli get-api-token --service llm"
}
```

**Example: Using environment-specific scripts:**
```json
{
  "typeAhead.apiKeyHelper": "/path/to/get-llm-key.sh"
}
```

**How it works:**
1. The extension runs your command and reads the API key from stdout
2. The key is cached in memory for the session (not written to disk)
3. If the server returns 401/403, the command is re-run to get a fresh key, and the request is retried

**Priority:** `apiKeyHelper` > `apiKey`. If both are set, the helper command wins.

---

## Commands

Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

| Command | Description |
|---|---|
| `Type Ahead: Toggle On/Off` | Quickly enable or disable the extension |

---

## Status Bar

The extension shows its status in the bottom-right of VS Code:

| Icon | Meaning |
|---|---|
| `$(sparkle) Type Ahead` | Ready — waiting for you to type |
| `$(loading~spin) Type Ahead` | Generating a completion |
| `$(warning) Type Ahead` | Error — click to toggle, check Output panel for details |
| `$(circle-slash) Type Ahead` | Disabled |

Click the status bar item to toggle the extension on/off.

---

## Troubleshooting

### No completions appear

1. Check the status bar — is it showing "Type Ahead" or is it hidden?
2. Open the **Output** panel (`Cmd+Shift+U`) and select **Extension Host** from the dropdown
3. Look for log lines starting with `Type Ahead:` — they show the full request/response flow:
   ```
   Type Ahead: [auth] warming up API key at session start...
   Type Ahead: [auth] API key ready
   Type Ahead: [llm] POST http://localhost:11434/v1/chat/completions (model: codellama:7b)
   Type Ahead: [llm] auth: Bearer token set
   Type Ahead: [llm] response 200 in 342ms
   Type Ahead: [llm] completion: 28 chars
   ```

### Completions are slow

- **Increase debounce:** Set `debounceMs` to 500-1000ms for slow servers. This reduces unnecessary requests while you're still typing.
- **Use a faster model:** Smaller models respond faster. Try `starcoder2:3b` or `codellama:7b` instead of 13B+ models.
- **Reduce context:** Lower `contextLines` from 100 to 30-50. Less context = faster inference.
- **The first completion is always slower** because there's no cache. Subsequent completions at the same position are instant (cache hit).

### "API error 401" or "API error 403"

- Your API key is invalid or expired
- If using `apiKeyHelper`, check that the command works: run it in your terminal and verify it outputs a key
- For Anthropic, make sure the key starts with `sk-ant-`

### "API error 404" or "model not found"

- The model name doesn't match what the server knows. Check:
  - Ollama: `ollama list` to see installed models
  - vLLM: check the model name you used in `vllm serve`
  - Anthropic: use `claude-haiku-4-5`, `claude-sonnet-4-6`, etc.

### "apiBaseUrl is required"

- You selected `OpenAI Compatible` or `LiteLLM Gateway` but didn't set a URL
- Set `apiBaseUrl` to your server's URL (e.g., `http://localhost:11434/v1` for Ollama)

### Extension Host shows "request failed: fetch failed"

- The server is not running or not reachable at the configured URL
- Check that your server is running: `curl http://localhost:11434/v1/models`

---

## Performance Tips

| Tip | Setting | Effect |
|---|---|---|
| Faster suggestions | `debounceMs: 150` | Triggers sooner after you stop typing (more API calls) |
| Less API usage | `debounceMs: 500` | Waits longer, fewer requests, saves tokens |
| Faster inference | `contextLines: 30` | Sends less code to the model |
| Better completions | `contextLines: 200` | More context = more accurate completions (slower) |
| Disable caching | `cacheSize: 0` | Every request goes to the server (useful for testing) |

---

## Language Support

The extension works with **all programming languages** supported by VS Code. The model receives the file name and language identifier along with the surrounding code, so it can adapt its completions to the language you're working in.

---

## Privacy

- **Local models (Ollama, vLLM, LM Studio):** Your code never leaves your machine.
- **Anthropic / LiteLLM / remote servers:** Code context (up to `contextLines` lines around your cursor) is sent to the configured API endpoint. No data is stored by the extension itself.
- **API keys:** Stored in VS Code settings (on disk). For sensitive environments, use `apiKeyHelper` to generate keys dynamically — they are only held in memory.
- **No telemetry:** The extension does not collect or send any usage data.
