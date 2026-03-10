import { CompletionBackend, CompletionRequest } from './types';
import { buildPrompt, COMPLETION_SYSTEM_PROMPT } from '../prompt/promptBuilder';
import { postProcess } from '../prompt/postProcessor';
import { AutocompleteConfig } from '../config/configManager';
import { ApiKeyManager } from '../auth/apiKeyManager';

const ANTHROPIC_VERSION = '2023-06-01';

interface AnthropicMessagesResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    type?: string;
    message?: string;
  };
}

export class AnthropicBackend implements CompletionBackend {
  private config: AutocompleteConfig;
  private keyManager: ApiKeyManager;

  constructor(config: AutocompleteConfig, keyManager: ApiKeyManager) {
    this.config = config;
    this.keyManager = keyManager;
  }

  updateConfig(config: AutocompleteConfig): void {
    this.config = config;
    this.keyManager.updateConfig(config.apiKeyHelper, config.apiKey);
  }

  async complete(request: CompletionRequest): Promise<string | null> {
    const { apiBaseUrl, model } = this.config;

    if (!apiBaseUrl) {
      throw new Error('apiBaseUrl is required for the Anthropic backend');
    }
    if (!model) {
      throw new Error('model is required for the Anthropic backend');
    }

    try {
      const prompt = buildPrompt(request);
      const url = `${apiBaseUrl.replace(/\/+$/, '')}/v1/messages`;

      const body = JSON.stringify({
        model,
        max_tokens: 256,
        system: COMPLETION_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        stop_sequences: ['<NO_COMPLETION/>'],
      });

      console.log(`Nerd Code Completion: [llm] POST ${url} (model: ${model})`);
      const startTime = Date.now();
      let response = await this.doFetch(url, body);
      const elapsed = Date.now() - startTime;
      console.log(`Nerd Code Completion: [llm] response ${response.status} in ${elapsed}ms`);

      if (response.status === 401 || response.status === 403) {
        console.log(`Nerd Code Completion: [llm] auth error (${response.status}), refreshing API key and retrying...`);
        await this.keyManager.refreshKey();
        const retryStart = Date.now();
        response = await this.doFetch(url, body);
        console.log(`Nerd Code Completion: [llm] retry response ${response.status} in ${Date.now() - retryStart}ms`);
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const errMsg = `API error ${response.status}: ${errorText || response.statusText}`;
        console.error(`Nerd Code Completion: [llm] ${errMsg}`);
        throw new Error(errMsg);
      }

      const data = (await response.json()) as AnthropicMessagesResponse;
      const textBlock = data.content?.find((c) => c.type === 'text');
      const content = textBlock?.text;
      if (!content) {
        console.log('Nerd Code Completion: [llm] empty completion returned');
        return null;
      }

      const processed = postProcess(content);
      console.log(`Nerd Code Completion: [llm] completion: ${processed ? processed.length + ' chars' : 'null (filtered)'}`);
      return processed;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Nerd Code Completion: [llm] request failed: ${msg}`);
      throw error;
    }
  }

  private async doFetch(url: string, body: string): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
    };
    const apiKey = await this.keyManager.getKey();
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
    console.log(`Nerd Code Completion: [llm] auth: ${apiKey ? 'x-api-key set' : 'no auth'}`);
    return fetch(url, { method: 'POST', headers, body });
  }

  dispose(): void {
    this.keyManager.dispose();
  }
}
