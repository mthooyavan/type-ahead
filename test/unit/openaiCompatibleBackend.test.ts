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

import { OpenAICompatibleBackend } from '../../src/backend/openaiCompatibleBackend';
import { CompletionRequest } from '../../src/backend/types';
import type { AutocompleteConfig } from '../../src/config/configManager';

function makeConfig(overrides: Partial<AutocompleteConfig> = {}): AutocompleteConfig {
  return {
    enabled: true,
    backend: 'openai-compatible',
    model: 'codellama:7b',
    debounceMs: 300,
    contextLines: 100,
    cacheSize: 50,
    openaiBaseUrl: 'http://localhost:11434/v1',
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

function makeToken(cancelled = false) {
  return {
    isCancellationRequested: cancelled,
    onCancellationRequested: () => ({ dispose: () => {} }),
  } as any;
}

function mockFetchResponse(body: object, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function successResponse(content: string) {
  return mockFetchResponse({
    choices: [{ message: { content } }],
  });
}

describe('OpenAICompatibleBackend', () => {
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch' as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('successful completions', () => {
    it('returns completion text from API response', async () => {
      fetchStub.returns(successResponse('"world"'));

      const backend = new OpenAICompatibleBackend(makeConfig());
      const result = await backend.complete(makeRequest(), makeToken());

      assert.equal(result, '"world"');
    });

    it('post-processes markdown fences from response', async () => {
      fetchStub.returns(successResponse('```typescript\n"world"\n```'));

      const backend = new OpenAICompatibleBackend(makeConfig());
      const result = await backend.complete(makeRequest(), makeToken());

      assert.equal(result, '"world"');
    });

    it('returns null for NO_COMPLETION marker', async () => {
      fetchStub.returns(successResponse('<NO_COMPLETION/>'));

      const backend = new OpenAICompatibleBackend(makeConfig());
      const result = await backend.complete(makeRequest(), makeToken());

      assert.equal(result, null);
    });

    it('returns null for empty content', async () => {
      fetchStub.returns(mockFetchResponse({
        choices: [{ message: { content: '' } }],
      }));

      const backend = new OpenAICompatibleBackend(makeConfig());
      const result = await backend.complete(makeRequest(), makeToken());

      assert.equal(result, null);
    });

    it('returns null for missing choices', async () => {
      fetchStub.returns(mockFetchResponse({ choices: [] }));

      const backend = new OpenAICompatibleBackend(makeConfig());
      const result = await backend.complete(makeRequest(), makeToken());

      assert.equal(result, null);
    });
  });

  describe('request format', () => {
    it('sends correct URL with trailing slash stripped', async () => {
      fetchStub.returns(successResponse('x'));

      const backend = new OpenAICompatibleBackend(
        makeConfig({ openaiBaseUrl: 'http://localhost:11434/v1/' })
      );
      await backend.complete(makeRequest(), makeToken());

      const url = fetchStub.firstCall.args[0];
      assert.equal(url, 'http://localhost:11434/v1/chat/completions');
    });

    it('sends model in request body', async () => {
      fetchStub.returns(successResponse('x'));

      const backend = new OpenAICompatibleBackend(
        makeConfig({ model: 'deepseek-coder:6.7b' })
      );
      await backend.complete(makeRequest(), makeToken());

      const body = JSON.parse(fetchStub.firstCall.args[1].body);
      assert.equal(body.model, 'deepseek-coder:6.7b');
    });

    it('sends system and user messages', async () => {
      fetchStub.returns(successResponse('x'));

      const backend = new OpenAICompatibleBackend(makeConfig());
      await backend.complete(makeRequest(), makeToken());

      const body = JSON.parse(fetchStub.firstCall.args[1].body);
      assert.equal(body.messages.length, 2);
      assert.equal(body.messages[0].role, 'system');
      assert.equal(body.messages[1].role, 'user');
      assert.ok(body.messages[1].content.includes('<CURSOR/>'));
    });

    it('sends temperature and max_tokens', async () => {
      fetchStub.returns(successResponse('x'));

      const backend = new OpenAICompatibleBackend(makeConfig());
      await backend.complete(makeRequest(), makeToken());

      const body = JSON.parse(fetchStub.firstCall.args[1].body);
      assert.equal(body.temperature, 0.2);
      assert.equal(body.max_tokens, 256);
    });

    it('includes stop sequence for NO_COMPLETION marker', async () => {
      fetchStub.returns(successResponse('x'));

      const backend = new OpenAICompatibleBackend(makeConfig());
      await backend.complete(makeRequest(), makeToken());

      const body = JSON.parse(fetchStub.firstCall.args[1].body);
      assert.deepEqual(body.stop, ['<NO_COMPLETION/>']);
    });
  });

  describe('authentication', () => {
    it('sends no Authorization header when apiKey is empty', async () => {
      fetchStub.returns(successResponse('x'));

      const backend = new OpenAICompatibleBackend(
        makeConfig({ openaiApiKey: '' })
      );
      await backend.complete(makeRequest(), makeToken());

      const headers = fetchStub.firstCall.args[1].headers;
      assert.equal(headers['Authorization'], undefined);
    });

    it('sends Bearer token when apiKey is set', async () => {
      fetchStub.returns(successResponse('x'));

      const backend = new OpenAICompatibleBackend(
        makeConfig({ openaiApiKey: 'sk-test-key' })
      );
      await backend.complete(makeRequest(), makeToken());

      const headers = fetchStub.firstCall.args[1].headers;
      assert.equal(headers['Authorization'], 'Bearer sk-test-key');
    });
  });

  describe('error handling', () => {
    it('throws on missing baseUrl', async () => {
      const backend = new OpenAICompatibleBackend(
        makeConfig({ openaiBaseUrl: '' })
      );

      await assert.rejects(
        () => backend.complete(makeRequest(), makeToken()),
        /openaiBaseUrl is required/
      );
    });

    it('throws on missing model', async () => {
      const backend = new OpenAICompatibleBackend(
        makeConfig({ model: '' })
      );

      await assert.rejects(
        () => backend.complete(makeRequest(), makeToken()),
        /model is required/
      );
    });

    it('throws on HTTP 401 (unauthorized)', async () => {
      fetchStub.returns(mockFetchResponse(
        { error: { message: 'Invalid API key' } },
        401
      ));

      const backend = new OpenAICompatibleBackend(makeConfig());

      await assert.rejects(
        () => backend.complete(makeRequest(), makeToken()),
        /API error 401/
      );
    });

    it('throws on HTTP 500 (server error)', async () => {
      fetchStub.returns(mockFetchResponse(
        { error: { message: 'Internal server error' } },
        500
      ));

      const backend = new OpenAICompatibleBackend(makeConfig());

      await assert.rejects(
        () => backend.complete(makeRequest(), makeToken()),
        /API error 500/
      );
    });

    it('throws on HTTP 404 (model not found)', async () => {
      fetchStub.returns(mockFetchResponse(
        { error: { message: 'model not found' } },
        404
      ));

      const backend = new OpenAICompatibleBackend(makeConfig());

      await assert.rejects(
        () => backend.complete(makeRequest(), makeToken()),
        /API error 404/
      );
    });

    it('throws on network error', async () => {
      fetchStub.rejects(new TypeError('fetch failed'));

      const backend = new OpenAICompatibleBackend(makeConfig());

      await assert.rejects(
        () => backend.complete(makeRequest(), makeToken()),
        /fetch failed/
      );
    });
  });

  describe('cancellation', () => {
    it('returns null when already cancelled', async () => {
      const backend = new OpenAICompatibleBackend(makeConfig());
      const result = await backend.complete(makeRequest(), makeToken(true));

      assert.equal(result, null);
      assert.ok(fetchStub.notCalled);
    });

    it('returns null when cancelled mid-request via token', async () => {
      // Simulate a slow fetch that gets cancelled
      let fetchResolve: (v: any) => void;
      fetchStub.returns(new Promise((resolve) => { fetchResolve = resolve; }));

      const listeners: Array<() => void> = [];
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: (listener: () => void) => {
          listeners.push(listener);
          return { dispose: () => {} };
        },
      } as any;

      const backend = new OpenAICompatibleBackend(makeConfig());
      const promise = backend.complete(makeRequest(), token);

      // Simulate cancellation after fetch starts — the abort will cause
      // the fetch promise to reject, but since signal.aborted is true,
      // the backend returns null
      token.isCancellationRequested = true;
      listeners.forEach(l => l());

      // Resolve fetch with an abort error (simulating what happens when signal fires)
      fetchResolve!({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ choices: [{ message: { content: 'x' } }] }),
      });

      const result = await promise;
      assert.equal(result, null);
    });
  });

  describe('updateConfig', () => {
    it('uses updated config for subsequent calls', async () => {
      fetchStub.returns(successResponse('x'));

      const backend = new OpenAICompatibleBackend(makeConfig({ model: 'model-a' }));
      await backend.complete(makeRequest(), makeToken());

      let body = JSON.parse(fetchStub.firstCall.args[1].body);
      assert.equal(body.model, 'model-a');

      fetchStub.returns(successResponse('y'));
      backend.updateConfig(makeConfig({ model: 'model-b' }));
      await backend.complete(makeRequest(), makeToken());

      body = JSON.parse(fetchStub.secondCall.args[1].body);
      assert.equal(body.model, 'model-b');
    });
  });
});
