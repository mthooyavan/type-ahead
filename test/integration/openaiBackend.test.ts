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

import { createBackend } from '../../src/extension';
import { OpenAIBackend } from '../../src/backend/openaiBackend';
import { AnthropicBackend } from '../../src/backend/anthropicBackend';
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

describe('Backend Factory', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('creates OpenAIBackend when backend is "openai"', () => {
    const backend = createBackend(makeConfig({ backend: 'openai' }), makeKeyManager());
    assert.ok(backend instanceof OpenAIBackend);
    backend.dispose();
  });

  it('creates AnthropicBackend when backend is "anthropic"', () => {
    const backend = createBackend(makeConfig({
      backend: 'anthropic',
      model: 'claude-haiku-4-5',
      apiBaseUrl: 'https://api.anthropic.com',
    }), makeKeyManager());
    assert.ok(backend instanceof AnthropicBackend);
    backend.dispose();
  });

  it('creates OpenAIBackend for "litellm" (same as openai)', () => {
    const backend = createBackend(makeConfig({ backend: 'litellm' }), makeKeyManager());
    assert.ok(backend instanceof OpenAIBackend);
    backend.dispose();
  });

  it('defaults to OpenAIBackend', () => {
    const backend = createBackend(makeConfig(), makeKeyManager());
    assert.ok(backend instanceof OpenAIBackend);
    backend.dispose();
  });
});

describe('OpenAIBackend Integration', () => {
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch' as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('sends request to configured base URL', async () => {
    fetchStub.returns(Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ choices: [{ message: { content: 'done' } }] }),
    }));

    const backend = new OpenAIBackend(makeConfig(), makeKeyManager());
    const result = await backend.complete({
      prefix: 'x = ', suffix: '', language: 'python',
      filePath: '/main.py', fileName: 'main.py', cursorLine: 0, cursorColumn: 4, systemPrompt: 'test',
    });

    assert.equal(result, 'done');
    assert.equal(fetchStub.firstCall.args[0], 'http://localhost:11434/v1/chat/completions');
  });
});

describe('AnthropicBackend Integration', () => {
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch' as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('sends request to Anthropic Messages API', async () => {
    fetchStub.returns(Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ content: [{ type: 'text', text: 'done' }] }),
    }));

    const backend = new AnthropicBackend(makeConfig({
      backend: 'anthropic',
      model: 'claude-haiku-4-5',
      apiBaseUrl: 'https://api.anthropic.com',
      apiKey: 'sk-ant-test',
    }), makeKeyManager('sk-ant-test'));

    const result = await backend.complete({
      prefix: 'x = ', suffix: '', language: 'python',
      filePath: '/main.py', fileName: 'main.py', cursorLine: 0, cursorColumn: 4, systemPrompt: 'test',
    });

    assert.equal(result, 'done');
    assert.equal(fetchStub.firstCall.args[0], 'https://api.anthropic.com/v1/messages');
    assert.equal(fetchStub.firstCall.args[1].headers['x-api-key'], 'sk-ant-test');
    assert.equal(fetchStub.firstCall.args[1].headers['anthropic-version'], '2023-06-01');
  });
});
