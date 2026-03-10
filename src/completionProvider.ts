import * as vscode from 'vscode';
import { CompletionBackend, CompletionRequest } from './backend/types';
import { gatherContext } from './context/contextGatherer';
import { CompletionCache } from './cache/completionCache';
import { AutocompleteConfig } from './config/configManager';
import { StatusBarManager } from './statusBar';
import { matchesAnyPattern } from './utils/globMatcher';
import { buildSystemPrompt } from './prompt/promptBuilder';
import { removePrefixOverlap, removeSuffixOverlap, normalizeIndentation } from './prompt/postProcessor';
import { shouldTrigger } from './trigger/triggerFilter';
import { detectCompletionMode, getBlockHint } from './trigger/completionMode';
import { getEnclosingSymbol } from './context/symbolContext';

interface PendingResult {
  uri: string;
  version: number;
  line: number;
  character: number;
  value: string;
}

interface PositionedCompletion {
  value: string;
  uri: string;
  line: number;
}

export class ClaudeCompletionProvider implements vscode.InlineCompletionItemProvider {
  private backend: CompletionBackend;
  private cache: CompletionCache | null;
  private config: AutocompleteConfig;
  private statusBar: StatusBarManager;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceReject: ((e: Error) => void) | null = null;
  private consecutiveErrors = 0;
  private lastCompletion: PositionedCompletion | null = null;
  private pendingResult: PendingResult | null = null;
  private requestId = 0;
  private responseTimes: number[] = [];
  private static readonly MAX_CONSECUTIVE_ERRORS = 3;
  private static readonly RESPONSE_TIME_WINDOW = 10;

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
    this.pendingResult = null;
    this.lastCompletion = null;
    this.responseTimes = [];
  }

  getLastCompletion(): string | null {
    if (!this.lastCompletion) return null;
    // Validate that the completion is for the current editor position
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;
    if (this.lastCompletion.uri !== editor.document.uri.toString()) return null;
    if (this.lastCompletion.line !== editor.selection.active.line) return null;
    return this.lastCompletion.value;
  }

  onDocumentChanged(filePath: string): void {
    if (this.cache) {
      this.cache.invalidateFile(filePath);
    }
  }

  setBackend(backend: CompletionBackend): void {
    this.backend.dispose();
    this.backend = backend;
    this.consecutiveErrors = 0;
    this.pendingResult = null;
    this.lastCompletion = null;
    this.responseTimes = [];
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

    // === Step 1: Check pendingResult with FULL position validation ===
    if (this.pendingResult !== null) {
      const pr = this.pendingResult;
      this.pendingResult = null;

      const uriMatch = pr.uri === document.uri.toString();
      const versionMatch = pr.version === document.version;
      const lineMatch = pr.line === position.line;
      const charMatch = pr.character === position.character;

      if (uriMatch && versionMatch && lineMatch && charMatch) {
        console.log('Type Ahead: [provider] serving pending result');
        this.lastCompletion = { value: pr.value, uri: pr.uri, line: pr.line };
        return [new vscode.InlineCompletionItem(pr.value)];
      }
      // Position/version changed — discard stale pending result
      console.log('Type Ahead: [provider] discarding stale pending result (position changed)');
    }

    // === Step 2: Check exclude patterns ===
    if (matchesAnyPattern(document.uri.fsPath, this.config.excludePatterns)) {
      return null;
    }

    // === Step 3: Gather context + check cache ===
    const codeContext = gatherContext(document, position, this.config.contextLines);
    const cacheKey = CompletionCache.makeKey(
      codeContext.filePath,
      codeContext.prefix,
      codeContext.suffix
    );
    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) {
        this.lastCompletion = { value: cached, uri: document.uri.toString(), line: position.line };
        return [new vscode.InlineCompletionItem(cached)];
      }
    }

    // === Step 4: Below here requires an API call — check guards ===
    if (token.isCancellationRequested) {
      return null;
    }

    if (!shouldTrigger(document, position)) {
      return null;
    }

    // === Step 5: Debounce ===
    const debounceMs = this.getAdaptiveDebounce();
    try {
      await this.debounce(debounceMs, token);
    } catch {
      return null;
    }

    // === Step 6: Request ID + async work ===
    const myRequestId = ++this.requestId;

    const enclosingSymbol = await getEnclosingSymbol(document, position);
    // Staleness guard after async gap
    if (myRequestId !== this.requestId) {
      return null;
    }

    const request: CompletionRequest = {
      prefix: codeContext.prefix,
      suffix: codeContext.suffix,
      language: codeContext.language,
      filePath: codeContext.filePath,
      fileName: codeContext.fileName,
      cursorLine: codeContext.cursorLine,
      cursorColumn: codeContext.cursorColumn,
      systemPrompt: buildSystemPrompt(this.config.customInstructions)
        + getBlockHint(detectCompletionMode(codeContext.prefix, codeContext.language))
        + (enclosingSymbol ? `\n${enclosingSymbol}` : ''),
      relatedFiles: codeContext.relatedFiles,
    };

    this.statusBar.setState('loading');

    try {
      const startTime = Date.now();
      let completion = await this.backend.complete(request);
      this.recordResponseTime(Date.now() - startTime);

      // === Step 7: Post-process ===
      // Strip leading whitespace from first line — VS Code inserts at cursor
      // which already has the correct indentation
      if (completion) {
        const newlineIdx = completion.indexOf('\n');
        if (newlineIdx === -1) {
          completion = completion.trimStart();
        } else {
          completion = completion.substring(0, newlineIdx).trimStart() + completion.substring(newlineIdx);
        }
      }
      if (completion) {
        completion = removePrefixOverlap(completion, codeContext.prefix);
      }
      if (completion && completion.includes('\n')) {
        const editor = vscode.window.activeTextEditor;
        const useTabs = editor ? !editor.options.insertSpaces : false;
        const tabSize = (editor?.options.tabSize as number) ?? 4;
        const cursorLineText = document.lineAt(position.line).text;
        const cursorIndent = cursorLineText.match(/^(\s*)/)?.[1] ?? '';
        completion = normalizeIndentation(completion, cursorIndent, useTabs, tabSize);
      }
      if (completion) {
        completion = removeSuffixOverlap(completion, codeContext.suffix);
        if (completion.length === 0) completion = null;
      }

      if (completion === null) {
        this.statusBar.setState('ready');
        return null;
      }

      // === Step 8: Staleness check — BEFORE caching ===
      const isStale = myRequestId !== this.requestId;
      if (isStale || token.isCancellationRequested) {
        this.statusBar.setState('ready');
        // Store as pending with full position anchor — do NOT cache
        // (the context may have changed, so the cache key is unreliable)
        this.pendingResult = {
          uri: document.uri.toString(),
          version: document.version,
          line: position.line,
          character: position.character,
          value: completion,
        };
        console.log(`Type Ahead: [provider] result arrived late (${isStale ? 'stale' : 'token cancelled'}), re-triggering`);
        setTimeout(() => {
          vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
        }, 50);
        return null;
      }

      // === Step 9: Fresh result — cache and return ===
      this.consecutiveErrors = 0;
      this.statusBar.setState('ready');

      if (this.cache) {
        this.cache.set(cacheKey, completion);
      }

      this.lastCompletion = { value: completion, uri: document.uri.toString(), line: position.line };
      return [new vscode.InlineCompletionItem(completion)];
    } catch (error: unknown) {
      this.consecutiveErrors++;
      this.statusBar.setState(
        this.consecutiveErrors >= ClaudeCompletionProvider.MAX_CONSECUTIVE_ERRORS ? 'error' : 'ready'
      );
      console.error('Type Ahead: completion error', error);

      if (this.consecutiveErrors >= ClaudeCompletionProvider.MAX_CONSECUTIVE_ERRORS) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showWarningMessage(
          `Type Ahead: Multiple failures (${message}). Check your Type Ahead configuration.`
        );
      }

      return null;
    }
  }

  private debounce(ms: number, token: vscode.CancellationToken): Promise<void> {
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

  private recordResponseTime(ms: number): void {
    this.responseTimes.push(ms);
    if (this.responseTimes.length > ClaudeCompletionProvider.RESPONSE_TIME_WINDOW) {
      this.responseTimes.shift();
    }
  }

  private getAdaptiveDebounce(): number {
    const maxDebounce = this.config.debounceMs;
    if (this.responseTimes.length < 3) {
      return maxDebounce;
    }
    const avg = this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;

    if (avg < 500) return Math.min(maxDebounce, 150);
    if (avg < 2000) return Math.min(maxDebounce, 300);
    return Math.min(maxDebounce, 500);
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.pendingResult = null;
    this.lastCompletion = null;
    this.statusBar.dispose();
    this.backend.dispose();
  }
}
