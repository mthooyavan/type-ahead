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

import { OpenAIBackend } from '../../src/backend/openaiBackend';
import { CompletionRequest } from '../../src/backend/types';
import { ApiKeyManager } from '../../src/auth/apiKeyManager';
import type { AutocompleteConfig } from '../../src/config/configManager';

function makeConfig(overrides: Partial<AutocompleteConfig> = {}): AutocompleteConfig {
  return {
    enabled: true,
    backend: 'openai',
    model: 'codellama:7b',
    debounceMs: 300,
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

function makeKeyManager(staticKey = ''): ApiKeyManager {
  return new ApiKeyManager('', staticKey);
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
    systemPrompt: 'test system prompt',
    ...overrides,
  };
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

describe('OpenAIBackend', () => {
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
      const backend = new OpenAIBackend(makeConfig(), makeKeyManager());
      assert.equal(await backend.complete(makeRequest()), '"world"');
    });

    it('post-processes markdown fences from response', async () => {
      fetchStub.returns(successResponse('```typescript\n"world"\n```'));
      const backend = new OpenAIBackend(makeConfig(), makeKeyManager());
      assert.equal(await backend.complete(makeRequest()), '"world"');
    });

    it('returns null for NO_COMPLETION marker', async () => {
      fetchStub.returns(successResponse('<NO_COMPLETION/>'));
      const backend = new OpenAIBackend(makeConfig(), makeKeyManager());
      assert.equal(await backend.complete(makeRequest()), null);
    });

    it('returns null for empty content', async () => {
      fetchStub.returns(mockFetchResponse({ choices: [{ message: { content: '' } }] }));
      const backend = new OpenAIBackend(makeConfig(), makeKeyManager());
      assert.equal(await backend.complete(makeRequest()), null);
    });

    it('returns null for missing choices', async () => {
      fetchStub.returns(mockFetchResponse({ choices: [] }));
      const backend = new OpenAIBackend(makeConfig(), makeKeyManager());
      assert.equal(await backend.complete(makeRequest()), null);
    });
  });

  describe('request format', () => {
    it('sends correct URL with trailing slash stripped', async () => {
      fetchStub.returns(successResponse('x'));
      const backend = new OpenAIBackend(makeConfig({ apiBaseUrl: 'http://localhost:11434/v1/' }), makeKeyManager());
      await backend.complete(makeRequest());
      assert.equal(fetchStub.firstCall.args[0], 'http://localhost:11434/v1/chat/completions');
    });

    it('sends model in request body', async () => {
      fetchStub.returns(successResponse('x'));
      const backend = new OpenAIBackend(makeConfig({ model: 'deepseek-coder:6.7b' }), makeKeyManager());
      await backend.complete(makeRequest());
      const body = JSON.parse(fetchStub.firstCall.args[1].body);
      assert.equal(body.model, 'deepseek-coder:6.7b');
    });

    it('sends system and user messages', async () => {
      fetchStub.returns(successResponse('x'));
      const backend = new OpenAIBackend(makeConfig(), makeKeyManager());
      await backend.complete(makeRequest());
      const body = JSON.parse(fetchStub.firstCall.args[1].body);
      assert.equal(body.messages.length, 2);
      assert.equal(body.messages[0].role, 'system');
      assert.equal(body.messages[1].role, 'user');
    });
  });

  describe('authentication', () => {
    it('sends no Authorization header when apiKey is empty', async () => {
      fetchStub.returns(successResponse('x'));
      const backend = new OpenAIBackend(makeConfig({ apiKey: '' }), makeKeyManager());
      await backend.complete(makeRequest());
      assert.equal(fetchStub.firstCall.args[1].headers['Authorization'], undefined);
    });

    it('sends Bearer token when apiKey is set', async () => {
      fetchStub.returns(successResponse('x'));
      const backend = new OpenAIBackend(makeConfig({ apiKey: 'sk-test' }), makeKeyManager('sk-test'));
      await backend.complete(makeRequest());
      assert.equal(fetchStub.firstCall.args[1].headers['Authorization'], 'Bearer sk-test');
    });
  });

  describe('error handling', () => {
    it('throws on missing apiBaseUrl', async () => {
      const backend = new OpenAIBackend(makeConfig({ apiBaseUrl: '' }), makeKeyManager());
      await assert.rejects(() => backend.complete(makeRequest()), /apiBaseUrl is required/);
    });

    it('throws on missing model', async () => {
      const backend = new OpenAIBackend(makeConfig({ model: '' }), makeKeyManager());
      await assert.rejects(() => backend.complete(makeRequest()), /model is required/);
    });

    it('throws on HTTP 500', async () => {
      fetchStub.returns(mockFetchResponse({ error: { message: 'server error' } }, 500));
      const backend = new OpenAIBackend(makeConfig(), makeKeyManager());
      await assert.rejects(() => backend.complete(makeRequest()), /API error 500/);
    });

    it('throws on network error', async () => {
      fetchStub.rejects(new TypeError('fetch failed'));
      const backend = new OpenAIBackend(makeConfig(), makeKeyManager());
      await assert.rejects(() => backend.complete(makeRequest()), /fetch failed/);
    });
  });

  describe('updateConfig', () => {
    it('uses updated config for subsequent calls', async () => {
      fetchStub.returns(successResponse('x'));
      const backend = new OpenAIBackend(makeConfig({ model: 'model-a' }), makeKeyManager());
      await backend.complete(makeRequest());
      assert.equal(JSON.parse(fetchStub.firstCall.args[1].body).model, 'model-a');

      fetchStub.returns(successResponse('y'));
      backend.updateConfig(makeConfig({ model: 'model-b' }));
      await backend.complete(makeRequest());
      assert.equal(JSON.parse(fetchStub.secondCall.args[1].body).model, 'model-b');
    });
  });
});
