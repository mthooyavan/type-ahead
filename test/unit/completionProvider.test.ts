import { strict as assert } from 'assert';
import * as sinon from 'sinon';

// Mock vscode before importing
import Module from 'module';
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, ...args: unknown[]) {
  if (request === 'vscode') {
    return require.resolve('../mocks/vscode');
  }
  return originalResolveFilename.call(this, request, ...args);
};

import { ClaudeCompletionProvider } from '../../src/completionProvider';
import { CompletionBackend, CompletionRequest } from '../../src/backend/types';
import type { AutocompleteConfig } from '../../src/config/configManager';
import type * as vscode from 'vscode';

function makeConfig(overrides: Partial<AutocompleteConfig> = {}): AutocompleteConfig {
  return {
    enabled: true,
    backend: 'openai',
    model: 'codellama:7b',
    debounceMs: 10, // Short for tests
    contextLines: 100,
    cacheSize: 50,
    apiBaseUrl: 'http://localhost:11434/v1',
    apiKey: '',
    apiKeyHelper: '',
    excludePatterns: [],
    customInstructions: '',
    litellmAnthropicResponse: false,
    ...overrides,
  };
}

function makeMockBackend(): CompletionBackend & { completeStub: sinon.SinonStub } {
  const completeStub = sinon.stub().resolves('completed_code');
  return {
    complete: completeStub,
    updateConfig: sinon.stub(),
    dispose: sinon.stub(),
    completeStub,
  };
}

function makeMockDocument(content: string, filePath = '/project/test.ts'): vscode.TextDocument {
  const lines = content.split('\n');
  return {
    lineCount: lines.length,
    languageId: 'typescript',
    uri: { fsPath: filePath, scheme: 'file', path: filePath },
    lineAt: (line: number) => ({ text: lines[line] ?? '' }),
    getText: () => content,
  } as unknown as vscode.TextDocument;
}

function makePosition(line: number, character: number): vscode.Position {
  return { line, character } as unknown as vscode.Position;
}

function makeToken(cancelled = false): vscode.CancellationToken {
  const listeners: Array<() => void> = [];
  const token = {
    isCancellationRequested: cancelled,
    onCancellationRequested: (listener: () => void) => {
      listeners.push(listener);
      return { dispose: () => {} };
    },
  };
  return token as unknown as vscode.CancellationToken;
}

function makeContext(): vscode.InlineCompletionContext {
  return {
    triggerKind: 0, // Automatic
    selectedCompletionInfo: undefined,
  } as unknown as vscode.InlineCompletionContext;
}

describe('ClaudeCompletionProvider', () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();
  });

  it('returns completion items from backend', async () => {
    const backend = makeMockBackend();
    const provider = new ClaudeCompletionProvider(backend, makeConfig());
    const doc = makeMockDocument('const x = ');
    const pos = makePosition(0, 10);

    const promise = provider.provideInlineCompletionItems(doc, pos, makeContext(), makeToken());

    // Advance past debounce
    await clock.tickAsync(50);

    const result = await promise;
    assert.ok(result);
    assert.equal(result!.length, 1);
    assert.equal((result![0] as any).insertText, 'completed_code');
  });

  it('returns null when disabled', async () => {
    const backend = makeMockBackend();
    const provider = new ClaudeCompletionProvider(backend, makeConfig({ enabled: false }));
    const doc = makeMockDocument('const x = ');

    const result = await provider.provideInlineCompletionItems(
      doc, makePosition(0, 10), makeContext(), makeToken()
    );

    assert.equal(result, null);
    assert.ok(backend.completeStub.notCalled);
  });

  it('returns null when token is already cancelled', async () => {
    const backend = makeMockBackend();
    const provider = new ClaudeCompletionProvider(backend, makeConfig());
    const doc = makeMockDocument('const x = ');

    const result = await provider.provideInlineCompletionItems(
      doc, makePosition(0, 10), makeContext(), makeToken(true)
    );

    assert.equal(result, null);
    assert.ok(backend.completeStub.notCalled);
  });

  it('returns null when backend returns null', async () => {
    const backend = makeMockBackend();
    backend.completeStub.resolves(null);
    const provider = new ClaudeCompletionProvider(backend, makeConfig());
    const doc = makeMockDocument('const x = ');

    const promise = provider.provideInlineCompletionItems(
      doc, makePosition(0, 10), makeContext(), makeToken()
    );
    await clock.tickAsync(50);
    const result = await promise;

    assert.equal(result, null);
  });

  it('returns null on backend error without surfacing it', async () => {
    const backend = makeMockBackend();
    backend.completeStub.rejects(new Error('API error'));
    const provider = new ClaudeCompletionProvider(backend, makeConfig());
    const doc = makeMockDocument('const x = ');

    const promise = provider.provideInlineCompletionItems(
      doc, makePosition(0, 10), makeContext(), makeToken()
    );
    await clock.tickAsync(50);
    const result = await promise;

    assert.equal(result, null);
  });

  it('returns cached result without calling backend', async () => {
    const backend = makeMockBackend();
    backend.completeStub.resolves('first_result');
    const provider = new ClaudeCompletionProvider(backend, makeConfig());
    const doc = makeMockDocument('const x = ');
    const pos = makePosition(0, 10);

    // First call - hits backend
    const promise1 = provider.provideInlineCompletionItems(doc, pos, makeContext(), makeToken());
    await clock.tickAsync(50);
    await promise1;
    assert.equal(backend.completeStub.callCount, 1);

    // Second call with same context - should use cache
    const promise2 = provider.provideInlineCompletionItems(doc, pos, makeContext(), makeToken());
    // No debounce needed for cache hit
    const result2 = await promise2;
    assert.ok(result2);
    assert.equal((result2![0] as any).insertText, 'first_result');
    // Backend should NOT have been called again
    assert.equal(backend.completeStub.callCount, 1);
  });

  it('debounces: does not call backend before debounce period', async () => {
    const backend = makeMockBackend();
    const provider = new ClaudeCompletionProvider(backend, makeConfig({ debounceMs: 100 }));
    const doc = makeMockDocument('const x = ');

    // Start a request but don't wait for debounce
    const promise = provider.provideInlineCompletionItems(
      doc, makePosition(0, 10), makeContext(), makeToken()
    );

    // Advance only 50ms (less than 100ms debounce)
    await clock.tickAsync(50);

    // Backend should not have been called yet
    assert.equal(backend.completeStub.callCount, 0);

    // Now advance past debounce
    await clock.tickAsync(60);
    await promise;

    // Now it should have been called
    assert.equal(backend.completeStub.callCount, 1);
  });

  it('does not cache when cacheSize is 0', async () => {
    const backend = makeMockBackend();
    backend.completeStub.resolves('result');
    const provider = new ClaudeCompletionProvider(backend, makeConfig({ cacheSize: 0 }));
    const doc = makeMockDocument('const x = ');
    const pos = makePosition(0, 10);

    // First call
    const p1 = provider.provideInlineCompletionItems(doc, pos, makeContext(), makeToken());
    await clock.tickAsync(50);
    await p1;
    assert.equal(backend.completeStub.callCount, 1);

    // Second call with same context - should still call backend (no cache)
    const p2 = provider.provideInlineCompletionItems(doc, pos, makeContext(), makeToken());
    await clock.tickAsync(50);
    await p2;
    assert.equal(backend.completeStub.callCount, 2);
  });

  it('passes correct request to backend', async () => {
    const backend = makeMockBackend();
    const provider = new ClaudeCompletionProvider(backend, makeConfig());
    const doc = makeMockDocument('hello world', '/project/main.ts');

    const promise = provider.provideInlineCompletionItems(
      doc, makePosition(0, 5), makeContext(), makeToken()
    );
    await clock.tickAsync(50);
    await promise;

    assert.ok(backend.completeStub.calledOnce);
    const request = backend.completeStub.firstCall.args[0];
    assert.equal(request.prefix, 'hello');
    assert.equal(request.suffix, ' world');
    assert.equal(request.language, 'typescript');
    assert.equal(request.filePath, '/project/main.ts');
  });

  it('updateConfig changes behavior', async () => {
    const backend = makeMockBackend();
    const provider = new ClaudeCompletionProvider(backend, makeConfig({ enabled: true }));
    const doc = makeMockDocument('x');

    // Disable
    provider.updateConfig(makeConfig({ enabled: false }));

    const result = await provider.provideInlineCompletionItems(
      doc, makePosition(0, 0), makeContext(), makeToken()
    );
    assert.equal(result, null);
    assert.ok(backend.completeStub.notCalled);
  });

  it('dispose cleans up resources', () => {
    const backend = makeMockBackend();
    const provider = new ClaudeCompletionProvider(backend, makeConfig());

    provider.dispose();
    assert.ok((backend.dispose as sinon.SinonStub).calledOnce);
  });
});
