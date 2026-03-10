import * as vscode from 'vscode';
import { CompletionBackend, CompletionRequest } from './backend/types';
import { gatherContext } from './context/contextGatherer';
import { CompletionCache } from './cache/completionCache';
import { AutocompleteConfig } from './config/configManager';
import { StatusBarManager } from './statusBar';

export class ClaudeCompletionProvider implements vscode.InlineCompletionItemProvider {
  private backend: CompletionBackend;
  private cache: CompletionCache | null;
  private config: AutocompleteConfig;
  private statusBar: StatusBarManager;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveErrors = 0;
  private static readonly MAX_CONSECUTIVE_ERRORS = 3;

  constructor(backend: CompletionBackend, config: AutocompleteConfig) {
    this.backend = backend;
    this.config = config;
    this.cache = config.cacheSize > 0 ? new CompletionCache(config.cacheSize) : null;
    this.statusBar = new StatusBarManager();
    this.statusBar.setState(config.enabled ? 'ready' : 'disabled');
  }

  updateConfig(config: AutocompleteConfig): void {
    this.config = config;
    this.cache = config.cacheSize > 0 ? new CompletionCache(config.cacheSize) : null;
    this.statusBar.setState(config.enabled ? 'ready' : 'disabled');
    this.consecutiveErrors = 0;
  }

  setBackend(backend: CompletionBackend): void {
    this.backend.dispose();
    this.backend = backend;
    this.consecutiveErrors = 0;
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | null> {
    if (!this.config.enabled) {
      return null;
    }

    if (token.isCancellationRequested) {
      return null;
    }

    // Gather context
    const codeContext = gatherContext(document, position, this.config.contextLines);

    // Check cache
    const cacheKey = CompletionCache.makeKey(
      codeContext.filePath,
      codeContext.prefix,
      codeContext.suffix
    );
    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) {
        return [new vscode.InlineCompletionItem(cached)];
      }
    }

    // Debounce
    try {
      await this.debounce(this.config.debounceMs, token);
    } catch {
      console.log('Nerd Code Completion: [provider] cancelled during debounce');
      return null;
    }

    if (token.isCancellationRequested) {
      return null;
    }

    // Build request
    const request: CompletionRequest = {
      prefix: codeContext.prefix,
      suffix: codeContext.suffix,
      language: codeContext.language,
      filePath: codeContext.filePath,
      fileName: codeContext.fileName,
      cursorLine: codeContext.cursorLine,
      cursorColumn: codeContext.cursorColumn,
    };

    this.statusBar.setState('loading');

    try {
      const completion = await this.backend.complete(request, token);

      if (completion === null || token.isCancellationRequested) {
        this.statusBar.setState('ready');
        return null;
      }

      this.consecutiveErrors = 0;
      this.statusBar.setState('ready');

      if (this.cache) {
        this.cache.set(cacheKey, completion);
      }
      return [new vscode.InlineCompletionItem(completion)];
    } catch (error: unknown) {
      this.consecutiveErrors++;
      console.error('Nerd Code Completion: completion error', error);

      if (this.consecutiveErrors >= ClaudeCompletionProvider.MAX_CONSECUTIVE_ERRORS) {
        this.statusBar.setState('error');
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showWarningMessage(
          `Nerd Code Completion: Multiple failures (${message}). Check your Nerd Code Completion configuration.`
        );
      } else {
        this.statusBar.setState('ready');
      }

      return null;
    }
  }

  private debounce(ms: number, token: vscode.CancellationToken): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      const disposable = token.onCancellationRequested(() => {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = null;
        }
        disposable.dispose();
        reject(new Error('Cancelled'));
      });

      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        disposable.dispose();
        resolve();
      }, ms);
    });
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.statusBar.dispose();
    this.backend.dispose();
  }
}
