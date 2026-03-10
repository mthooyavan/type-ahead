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

import { createBackend } from '../../src/extension';
import { ClaudeAgentBackend } from '../../src/backend/claudeAgentBackend';
import { OpenAICompatibleBackend } from '../../src/backend/openaiCompatibleBackend';
import type { AutocompleteConfig } from '../../src/config/configManager';

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

describe('Backend Factory', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('creates ClaudeAgentBackend when backend is "claude"', () => {
    const backend = createBackend(makeConfig({ backend: 'claude' }));
    assert.ok(backend instanceof ClaudeAgentBackend);
    backend.dispose();
  });

  it('creates OpenAICompatibleBackend when backend is "openai-compatible"', () => {
    const backend = createBackend(makeConfig({
      backend: 'openai-compatible',
      model: 'codellama:7b',
      openaiBaseUrl: 'http://localhost:11434/v1',
    }));
    assert.ok(backend instanceof OpenAICompatibleBackend);
    backend.dispose();
  });

  it('defaults to ClaudeAgentBackend', () => {
    const backend = createBackend(makeConfig());
    assert.ok(backend instanceof ClaudeAgentBackend);
    backend.dispose();
  });

  it('creates OpenAICompatibleBackend even with missing baseUrl (validation is deferred)', () => {
    // The backend is still created — it will error at runtime when complete() is called
    const backend = createBackend(makeConfig({
      backend: 'openai-compatible',
      model: 'some-model',
      openaiBaseUrl: '',
    }));
    assert.ok(backend instanceof OpenAICompatibleBackend);
    backend.dispose();
  });
});

describe('OpenAICompatibleBackend Integration', () => {
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch' as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('sends request to configured base URL', async () => {
    fetchStub.returns(Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'completed_code' } }],
      }),
    }));

    const backend = new OpenAICompatibleBackend(makeConfig({
      backend: 'openai-compatible',
      model: 'codellama:7b',
      openaiBaseUrl: 'http://localhost:11434/v1',
    }));

    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => {} }),
    } as any;

    const result = await backend.complete({
      prefix: 'function hello() {\n  return ',
      suffix: '\n}',
      language: 'typescript',
      filePath: '/test.ts',
      fileName: 'test.ts',
      cursorLine: 1,
      cursorColumn: 9,
    }, token);

    assert.equal(result, 'completed_code');

    const calledUrl = fetchStub.firstCall.args[0];
    assert.equal(calledUrl, 'http://localhost:11434/v1/chat/completions');

    const body = JSON.parse(fetchStub.firstCall.args[1].body);
    assert.equal(body.model, 'codellama:7b');
    assert.equal(body.messages[0].role, 'system');
    assert.equal(body.messages[1].role, 'user');
    assert.ok(body.messages[1].content.includes('<CURSOR/>'));
  });

  it('works with vLLM-style endpoint', async () => {
    fetchStub.returns(Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'return 42;' } }],
      }),
    }));

    const backend = new OpenAICompatibleBackend(makeConfig({
      backend: 'openai-compatible',
      model: 'deepseek-coder-v2',
      openaiBaseUrl: 'http://localhost:8000/v1',
      openaiApiKey: 'api-key-123',
    }));

    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => {} }),
    } as any;

    const result = await backend.complete({
      prefix: 'x = ',
      suffix: '',
      language: 'python',
      filePath: '/main.py',
      fileName: 'main.py',
      cursorLine: 0,
      cursorColumn: 4,
    }, token);

    assert.equal(result, 'return 42;');

    const calledUrl = fetchStub.firstCall.args[0];
    assert.equal(calledUrl, 'http://localhost:8000/v1/chat/completions');

    const headers = fetchStub.firstCall.args[1].headers;
    assert.equal(headers['Authorization'], 'Bearer api-key-123');
  });

  it('handles Ollama model-not-found error gracefully', async () => {
    fetchStub.returns(Promise.resolve({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve('model "nonexistent" not found'),
    }));

    const backend = new OpenAICompatibleBackend(makeConfig({
      backend: 'openai-compatible',
      model: 'nonexistent',
      openaiBaseUrl: 'http://localhost:11434/v1',
    }));

    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => {} }),
    } as any;

    await assert.rejects(
      () => backend.complete({
        prefix: 'x = ',
        suffix: '',
        language: 'python',
        filePath: '/main.py',
        fileName: 'main.py',
        cursorLine: 0,
        cursorColumn: 4,
      }, token),
      /API error 404.*nonexistent/
    );
  });
});
