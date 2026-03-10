import * as vscode from 'vscode';
import * as path from 'path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { CompletionBackend, CompletionRequest } from './types';
import { buildPrompt, COMPLETION_SYSTEM_PROMPT } from '../prompt/promptBuilder';
import { postProcess } from '../prompt/postProcessor';
import { AutocompleteConfig } from '../config/configManager';

/**
 * Resolve the path to the Claude Agent SDK's bundled cli.js.
 * The SDK uses import.meta.url internally to find this, but VS Code's
 * extension host module loader can break that. We resolve it explicitly.
 */
function resolveCliPath(): string {
  // require.resolve finds the SDK's entry point (sdk.mjs)
  // cli.js is in the same directory
  const sdkEntry = require.resolve('@anthropic-ai/claude-agent-sdk');
  return path.join(path.dirname(sdkEntry), 'cli.js');
}

export class ClaudeAgentBackend implements CompletionBackend {
  private config: AutocompleteConfig;
  private cliPath: string;

  constructor(config: AutocompleteConfig) {
    this.config = config;
    this.cliPath = resolveCliPath();
  }

  updateConfig(config: AutocompleteConfig): void {
    this.config = config;
  }

  async complete(
    request: CompletionRequest,
    token: vscode.CancellationToken
  ): Promise<string | null> {
    const abortController = new AbortController();

    // Wire VS Code cancellation to AbortController
    const cancellationListener = token.onCancellationRequested(() => {
      abortController.abort();
    });

    // Also abort if already cancelled
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

      const q = query({
        prompt,
        options: {
          pathToClaudeCodeExecutable: this.cliPath,
          // Load user/project/local settings so auth config (apiKeyHelper, etc.) is inherited
          settingSources: ['user', 'project', 'local'],
          model: this.config.model,
          tools: [],
          thinking: { type: 'disabled' },
          maxTurns: 1,
          effort: 'low',
          persistSession: false,
          permissionMode: 'dontAsk',
          systemPrompt: COMPLETION_SYSTEM_PROMPT,
          abortController,
        },
      });

      for await (const message of q) {
        if (token.isCancellationRequested) {
          q.close();
          return null;
        }

        if (message.type === 'result') {
          if (message.subtype === 'success') {
            return postProcess(message.result);
          }
          // Error result - return null
          return null;
        }
      }

      return null;
    } catch (error: unknown) {
      if (abortController.signal.aborted) {
        return null;
      }
      // Re-throw non-cancellation errors for the caller to handle
      throw error;
    } finally {
      cancellationListener.dispose();
    }
  }

  dispose(): void {
    // No persistent resources to clean up with query() API
  }
}
