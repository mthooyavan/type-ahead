import { strict as assert } from 'assert';
import * as sinon from 'sinon';

import Module from 'module';
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, ...args: unknown[]) {
  if (request === 'vscode') {
    return require.resolve('../mocks/vscode');
  }
  return originalResolveFilename.call(this, request, ...args);
};

import { AnthropicBackend } from '../../src/backend/anthropicBackend';
import { CompletionRequest } from '../../src/backend/types';
import { ApiKeyManager } from '../../src/auth/apiKeyManager';
import type { AutocompleteConfig } from '../../src/config/configManager';

function makeConfig(overrides: Partial<AutocompleteConfig> = {}): AutocompleteConfig {
  return {
    enabled: true,
    backend: 'anthropic',
    model: 'claude-haiku-4-5',
    debounceMs: 300,
    contextLines: 100,
    cacheSize: 50,
    apiBaseUrl: 'https://api.anthropic.com',
    apiKey: 'sk-ant-test',
    apiKeyHelper: '',
    excludePatterns: [],
    customInstructions: '',
    ...overrides,
  };
}

function makeKeyManager(staticKey = 'sk-ant-test'): ApiKeyManager {
  return new ApiKeyManager('', staticKey);
}

function makeRequest(): CompletionRequest {
  return {
    prefix: 'function hello() {\n  return ',
    suffix: '\n}',
    language: 'typescript',
    filePath: '/project/test.ts',
    fileName: 'test.ts',
    cursorLine: 1,
    cursorColumn: 9,
    systemPrompt: 'test system prompt',
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

function successResponse(text: string) {
  return mockFetchResponse({
    content: [{ type: 'text', text }],
  });
}

describe('AnthropicBackend', () => {
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch' as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('successful completions', () => {
    it('returns completion text from Anthropic response', async () => {
      fetchStub.returns(successResponse('"world"'));
      const backend = new AnthropicBackend(makeConfig(), makeKeyManager());
      assert.equal(await backend.complete(makeRequest()), '"world"');
    });

    it('post-processes markdown fences', async () => {
      fetchStub.returns(successResponse('```typescript\n"world"\n```'));
      const backend = new AnthropicBackend(makeConfig(), makeKeyManager());
      assert.equal(await backend.complete(makeRequest()), '"world"');
    });

    it('returns null for empty content array', async () => {
      fetchStub.returns(mockFetchResponse({ content: [] }));
      const backend = new AnthropicBackend(makeConfig(), makeKeyManager());
      assert.equal(await backend.complete(makeRequest()), null);
    });

    it('finds the text block among multiple content blocks', async () => {
      fetchStub.returns(mockFetchResponse({
        content: [
          { type: 'thinking', text: 'hmm...' },
          { type: 'text', text: 'actual_completion' },
        ],
      }));
      const backend = new AnthropicBackend(makeConfig(), makeKeyManager());
      assert.equal(await backend.complete(makeRequest()), 'actual_completion');
    });
  });

  describe('request format', () => {
    it('sends to /v1/messages endpoint', async () => {
      fetchStub.returns(successResponse('x'));
      const backend = new AnthropicBackend(makeConfig(), makeKeyManager());
      await backend.complete(makeRequest());
      assert.equal(fetchStub.firstCall.args[0], 'https://api.anthropic.com/v1/messages');
    });

    it('sends Anthropic-format request body', async () => {
      fetchStub.returns(successResponse('x'));
      const backend = new AnthropicBackend(makeConfig(), makeKeyManager());
      await backend.complete(makeRequest());

      const body = JSON.parse(fetchStub.firstCall.args[1].body);
      assert.equal(body.model, 'claude-haiku-4-5');
      assert.equal(body.max_tokens, 256);
      assert.equal(body.temperature, 0.2);
      assert.ok(body.system); // system prompt as top-level field
      assert.equal(body.messages.length, 1); // only user message
      assert.equal(body.messages[0].role, 'user');
      assert.deepEqual(body.stop_sequences, ['<NO_COMPLETION/>']);
    });

    it('sends anthropic-version header', async () => {
      fetchStub.returns(successResponse('x'));
      const backend = new AnthropicBackend(makeConfig(), makeKeyManager());
      await backend.complete(makeRequest());
      assert.equal(fetchStub.firstCall.args[1].headers['anthropic-version'], '2023-06-01');
    });
  });

  describe('authentication', () => {
    it('sends x-api-key header (not Bearer)', async () => {
      fetchStub.returns(successResponse('x'));
      const backend = new AnthropicBackend(makeConfig(), makeKeyManager('my-key'));
      await backend.complete(makeRequest());

      const headers = fetchStub.firstCall.args[1].headers;
      assert.equal(headers['x-api-key'], 'my-key');
      assert.equal(headers['Authorization'], undefined);
    });

    it('sends no x-api-key when key is empty', async () => {
      fetchStub.returns(successResponse('x'));
      const backend = new AnthropicBackend(makeConfig({ apiKey: '' }), makeKeyManager(''));
      await backend.complete(makeRequest());

      const headers = fetchStub.firstCall.args[1].headers;
      assert.equal(headers['x-api-key'], undefined);
    });
  });

  describe('error handling', () => {
    it('throws on missing apiBaseUrl', async () => {
      const backend = new AnthropicBackend(makeConfig({ apiBaseUrl: '' }), makeKeyManager());
      await assert.rejects(() => backend.complete(makeRequest()), /apiBaseUrl is required/);
    });

    it('throws on missing model', async () => {
      const backend = new AnthropicBackend(makeConfig({ model: '' }), makeKeyManager());
      await assert.rejects(() => backend.complete(makeRequest()), /model is required/);
    });

    it('throws on HTTP 401', async () => {
      fetchStub.returns(mockFetchResponse({ error: { message: 'invalid key' } }, 401));
      const backend = new AnthropicBackend(makeConfig(), makeKeyManager());
      await assert.rejects(() => backend.complete(makeRequest()), /API error 401/);
    });

    it('retries on 401 after refreshing key', async () => {
      fetchStub.onFirstCall().returns(mockFetchResponse({ error: { message: 'invalid' } }, 401));
      fetchStub.onSecondCall().returns(successResponse('success'));
      const backend = new AnthropicBackend(makeConfig(), makeKeyManager('old-key'));
      assert.equal(await backend.complete(makeRequest()), 'success');
      assert.equal(fetchStub.callCount, 2);
    });

    it('throws on HTTP 429 (rate limit)', async () => {
      fetchStub.returns(mockFetchResponse({ error: { message: 'rate limited' } }, 429));
      const backend = new AnthropicBackend(makeConfig(), makeKeyManager());
      await assert.rejects(() => backend.complete(makeRequest()), /API error 429/);
    });
  });
});
