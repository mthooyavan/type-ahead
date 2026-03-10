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

// We need to mock the claude-agent-sdk module
import { CompletionRequest } from '../../src/backend/types';
import type { AutocompleteConfig } from '../../src/config/configManager';

// Helper to create a mock async generator for query results
async function* mockQueryGenerator(messages: Array<{ type: string; subtype?: string; result?: string }>) {
  for (const msg of messages) {
    yield msg;
  }
}

function makeConfig(overrides: Partial<AutocompleteConfig> = {}): AutocompleteConfig {
  return {
    enabled: true,
    backend: 'claude',
    model: 'claude-haiku-4-5',
    debounceMs: 300,
    contextLines: 100,
    cacheSize: 50,
    openaiBaseUrl: '',
    openaiApiKey: '',
    ...overrides,
  };
}

function makeRequest(overrides: Partial<CompletionRequest> = {}): CompletionRequest {
  return {
    prefix: 'function hello() {\n  return ',
    suffix: '\n}',
    language: 'typescript',
    filePath: '/project/test.ts',
    fileName: 'test.ts',
    cursorLine: 1,
    cursorColumn: 9,
    ...overrides,
  };
}

function makeCancellationToken(cancelled = false) {
  const listeners: Array<() => void> = [];
  return {
    isCancellationRequested: cancelled,
    onCancellationRequested: (listener: () => void) => {
      listeners.push(listener);
      return { dispose: () => {} };
    },
    _cancel: () => {
      (token as any).isCancellationRequested = true;
      listeners.forEach(l => l());
    },
  };
  // hack: capture reference for _cancel
  var token = arguments[0] === true ? { isCancellationRequested: true } : { isCancellationRequested: false };
}

describe('ClaudeAgentBackend', () => {
  let queryStub: sinon.SinonStub;
  let ClaudeAgentBackend: any;

  beforeEach(() => {
    // Clear module cache so we can re-mock
    queryStub = sinon.stub();

    // Mock the claude-agent-sdk module
    const sdkModulePath = require.resolve('@anthropic-ai/claude-agent-sdk');
    require.cache[sdkModulePath] = {
      id: sdkModulePath,
      filename: sdkModulePath,
      loaded: true,
      exports: {
        query: queryStub,
      },
    } as any;

    // Clear the backend module cache so it picks up the mock
    const backendPath = require.resolve('../../src/backend/claudeAgentBackend');
    delete require.cache[backendPath];

    // Re-require
    ClaudeAgentBackend = require('../../src/backend/claudeAgentBackend').ClaudeAgentBackend;
  });

  afterEach(() => {
    sinon.restore();
  });

  it('returns completion text on successful query', async () => {
    const mockGen = mockQueryGenerator([
      { type: 'result', subtype: 'success', result: '"world"' },
    ]);
    // Add close method
    (mockGen as any).close = () => {};
    queryStub.returns(mockGen);

    const backend = new ClaudeAgentBackend(makeConfig());
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => {} }),
    };

    const result = await backend.complete(makeRequest(), token as any);
    assert.equal(result, '"world"');
  });

  it('passes correct options to query()', async () => {
    const mockGen = mockQueryGenerator([
      { type: 'result', subtype: 'success', result: 'x' },
    ]);
    (mockGen as any).close = () => {};
    queryStub.returns(mockGen);

    const config = makeConfig({ model: 'claude-sonnet-4-6' });
    const backend = new ClaudeAgentBackend(config);
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => {} }),
    };

    await backend.complete(makeRequest(), token as any);

    assert.ok(queryStub.calledOnce);
    const callArgs = queryStub.firstCall.args[0];
    assert.equal(callArgs.options.model, 'claude-sonnet-4-6');
    assert.deepEqual(callArgs.options.tools, []);
    assert.deepEqual(callArgs.options.thinking, { type: 'disabled' });
    assert.equal(callArgs.options.maxTurns, 1);
    assert.equal(callArgs.options.effort, 'low');
    assert.equal(callArgs.options.persistSession, false);
    assert.equal(callArgs.options.permissionMode, 'dontAsk');
  });

  it('returns null on error result', async () => {
    const mockGen = mockQueryGenerator([
      { type: 'result', subtype: 'error_during_execution' },
    ]);
    (mockGen as any).close = () => {};
    queryStub.returns(mockGen);

    const backend = new ClaudeAgentBackend(makeConfig());
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => {} }),
    };

    const result = await backend.complete(makeRequest(), token as any);
    assert.equal(result, null);
  });

  it('returns null when already cancelled', async () => {
    const backend = new ClaudeAgentBackend(makeConfig());
    const token = {
      isCancellationRequested: true,
      onCancellationRequested: () => ({ dispose: () => {} }),
    };

    const result = await backend.complete(makeRequest(), token as any);
    assert.equal(result, null);
    assert.ok(queryStub.notCalled);
  });

  it('returns null for empty result', async () => {
    const mockGen = mockQueryGenerator([
      { type: 'result', subtype: 'success', result: '' },
    ]);
    (mockGen as any).close = () => {};
    queryStub.returns(mockGen);

    const backend = new ClaudeAgentBackend(makeConfig());
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => {} }),
    };

    const result = await backend.complete(makeRequest(), token as any);
    assert.equal(result, null);
  });

  it('returns null for NO_COMPLETION marker', async () => {
    const mockGen = mockQueryGenerator([
      { type: 'result', subtype: 'success', result: '<NO_COMPLETION/>' },
    ]);
    (mockGen as any).close = () => {};
    queryStub.returns(mockGen);

    const backend = new ClaudeAgentBackend(makeConfig());
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => {} }),
    };

    const result = await backend.complete(makeRequest(), token as any);
    assert.equal(result, null);
  });

  it('post-processes markdown fences from result', async () => {
    const mockGen = mockQueryGenerator([
      { type: 'result', subtype: 'success', result: '```typescript\n"world"\n```' },
    ]);
    (mockGen as any).close = () => {};
    queryStub.returns(mockGen);

    const backend = new ClaudeAgentBackend(makeConfig());
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => {} }),
    };

    const result = await backend.complete(makeRequest(), token as any);
    assert.equal(result, '"world"');
  });

  it('includes prompt with file context', async () => {
    const mockGen = mockQueryGenerator([
      { type: 'result', subtype: 'success', result: 'x' },
    ]);
    (mockGen as any).close = () => {};
    queryStub.returns(mockGen);

    const backend = new ClaudeAgentBackend(makeConfig());
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => {} }),
    };

    await backend.complete(makeRequest({ fileName: 'main.py', language: 'python' }), token as any);

    const prompt = queryStub.firstCall.args[0].prompt;
    assert.ok(prompt.includes('File: main.py (python)'));
    assert.ok(prompt.includes('<CURSOR/>'));
  });

  it('skips non-result messages', async () => {
    const mockGen = mockQueryGenerator([
      { type: 'assistant' },
      { type: 'system' },
      { type: 'result', subtype: 'success', result: 'completion_text' },
    ]);
    (mockGen as any).close = () => {};
    queryStub.returns(mockGen);

    const backend = new ClaudeAgentBackend(makeConfig());
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => {} }),
    };

    const result = await backend.complete(makeRequest(), token as any);
    assert.equal(result, 'completion_text');
  });

  it('handles query throwing an error', async () => {
    queryStub.throws(new Error('Network error'));

    const backend = new ClaudeAgentBackend(makeConfig());
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => {} }),
    };

    await assert.rejects(
      () => backend.complete(makeRequest(), token as any),
      /Network error/
    );
  });

  it('updateConfig changes the model used', async () => {
    const mockGen1 = mockQueryGenerator([
      { type: 'result', subtype: 'success', result: 'x' },
    ]);
    (mockGen1 as any).close = () => {};
    const mockGen2 = mockQueryGenerator([
      { type: 'result', subtype: 'success', result: 'y' },
    ]);
    (mockGen2 as any).close = () => {};
    queryStub.onFirstCall().returns(mockGen1);
    queryStub.onSecondCall().returns(mockGen2);

    const backend = new ClaudeAgentBackend(makeConfig({ model: 'claude-haiku-4-5' }));
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => {} }),
    };

    await backend.complete(makeRequest(), token as any);
    assert.equal(queryStub.firstCall.args[0].options.model, 'claude-haiku-4-5');

    backend.updateConfig(makeConfig({ model: 'claude-sonnet-4-6' }));
    await backend.complete(makeRequest(), token as any);
    assert.equal(queryStub.secondCall.args[0].options.model, 'claude-sonnet-4-6');
  });
});
