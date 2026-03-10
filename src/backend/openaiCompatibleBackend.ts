import * as vscode from 'vscode';
import { CompletionBackend, CompletionRequest } from './types';
import { buildPrompt, COMPLETION_SYSTEM_PROMPT } from '../prompt/promptBuilder';
import { postProcess } from '../prompt/postProcessor';
import { AutocompleteConfig } from '../config/configManager';

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

export class OpenAICompatibleBackend implements CompletionBackend {
  private config: AutocompleteConfig;

  constructor(config: AutocompleteConfig) {
    this.config = config;
  }

  updateConfig(config: AutocompleteConfig): void {
    this.config = config;
  }

  async complete(
    request: CompletionRequest,
    token: vscode.CancellationToken
  ): Promise<string | null> {
    const { openaiBaseUrl, openaiApiKey, model } = this.config;

    if (!openaiBaseUrl) {
      throw new Error('openaiBaseUrl is required when using openai-compatible backend');
    }

    if (!model) {
      throw new Error('model is required when using openai-compatible backend');
    }

    const abortController = new AbortController();

    const cancellationListener = token.onCancellationRequested(() => {
      abortController.abort();
    });

    if (token.isCancellationRequested) {
      cancellationListener.dispose();
      return null;
    }

    try {
      const prompt = buildPrompt({
        prefix: request.prefix,
        suffix: request.suffix,
        language: request.language,
        fileName: request.fileName,
        filePath: request.filePath,
        cursorLine: request.cursorLine,
        cursorColumn: request.cursorColumn,
      });

      const url = `${openaiBaseUrl.replace(/\/+$/, '')}/chat/completions`;
      console.log(`Claude Autocomplete: POST ${url} (model: ${model})`);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (openaiApiKey) {
        headers['Authorization'] = `Bearer ${openaiApiKey}`;
      }

      const body = JSON.stringify({
        model,
        messages: [
          { role: 'system', content: COMPLETION_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 256,
        stop: ['<NO_COMPLETION/>'],
      });

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: abortController.signal,
      });

      if (token.isCancellationRequested) {
        return null;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`API error ${response.status}: ${errorText || response.statusText}`);
      }

      const data = (await response.json()) as OpenAIChatResponse;

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        return null;
      }

      return postProcess(content);
    } catch (error: unknown) {
      if (abortController.signal.aborted) {
        return null;
      }
      throw error;
    } finally {
      cancellationListener.dispose();
    }
  }

  dispose(): void {
    // No persistent resources
  }
}
