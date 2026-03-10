import * as vscode from 'vscode';
import { CompletionBackend, CompletionRequest } from './backend/types';
import { gatherContext } from './context/contextGatherer';
import { CompletionCache } from './cache/completionCache';
import { AutocompleteConfig } from './config/configManager';
import { StatusBarManager } from './statusBar';
import { matchesAnyPattern } from './utils/globMatcher';
import { buildSystemPrompt } from './prompt/promptBuilder';

export class ClaudeCompletionProvider implements vscode.InlineCompletionItemProvider {
  private backend: CompletionBackend;
  private cache: CompletionCache | null;
  private config: AutocompleteConfig;
  private statusBar: StatusBarManager;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceReject: ((e: Error) => void) | null = null;
  private consecutiveErrors = 0;
  private requestId = 0; // Tracks the latest request to discard stale results
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

    // Check exclude patterns
    if (matchesAnyPattern(document.uri.fsPath, this.config.excludePatterns)) {
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

    // Debounce — rejects previous waiters immediately
    try {
      await this.debounce(this.config.debounceMs, token);
    } catch {
      return null;
    }

    // Assign a request ID — if a newer request comes in while we're
    // waiting for the backend, the result from this request is stale
    const myRequestId = ++this.requestId;

    // Build request
    const request: CompletionRequest = {
      prefix: codeContext.prefix,
      suffix: codeContext.suffix,
      language: codeContext.language,
      filePath: codeContext.filePath,
      fileName: codeContext.fileName,
      cursorLine: codeContext.cursorLine,
      cursorColumn: codeContext.cursorColumn,
      systemPrompt: buildSystemPrompt(this.config.customInstructions),
    };

    this.statusBar.setState('loading');

    try {
      // Let the backend request run to completion — do NOT abort it via
      // VS Code's CancellationToken. The token fires too aggressively
      // (cursor blink, repaint, other extensions) and would kill every
      // request to servers with any latency.
      const completion = await this.backend.complete(request);

      if (completion === null) {
        this.statusBar.setState('ready');
        return null;
      }

      this.consecutiveErrors = 0;
      this.statusBar.setState('ready');

      if (this.cache) {
        this.cache.set(cacheKey, completion);
      }

      // If this result is stale (a newer request superseded us) or the
      // VS Code token was cancelled (slow server, token expired), the
      // returned items won't be shown. Cache the result and re-trigger
      // inline suggestions so VS Code re-queries us — the cache hit
      // will return instantly.
      const isStale = myRequestId !== this.requestId;
      if (isStale || token.isCancellationRequested) {
        console.log(`Type Ahead: [provider] result arrived late (${isStale ? 'stale' : 'token cancelled'}), re-triggering from cache`);
        vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
        return null;
      }

      return [new vscode.InlineCompletionItem(completion)];
    } catch (error: unknown) {
      this.consecutiveErrors++;
      console.error('Type Ahead: completion error', error);

      if (this.consecutiveErrors >= ClaudeCompletionProvider.MAX_CONSECUTIVE_ERRORS) {
        this.statusBar.setState('error');
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showWarningMessage(
          `Type Ahead: Multiple failures (${message}). Check your Type Ahead configuration.`
        );
      } else {
        this.statusBar.setState('ready');
      }

      return null;
    }
  }

  private debounce(ms: number, token: vscode.CancellationToken): Promise<void> {
    // Reject the previous debounce waiter immediately (don't leak promises)
    if (this.debounceReject) {
      this.debounceReject(new Error('Superseded'));
      this.debounceReject = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    return new Promise((resolve, reject) => {
      this.debounceReject = reject;

      const disposable = token.onCancellationRequested(() => {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = null;
        }
        this.debounceReject = null;
        disposable.dispose();
        reject(new Error('Cancelled'));
      });

      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        this.debounceReject = null;
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
