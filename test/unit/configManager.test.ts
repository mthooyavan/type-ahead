import { strict as assert } from 'assert';
import * as sinon from 'sinon';
import { setMockConfig, resetMockConfig, fireConfigChange } from '../mocks/vscode';

import Module from 'module';
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, ...args: unknown[]) {
  if (request === 'vscode') {
    return require.resolve('../mocks/vscode');
  }
  return originalResolveFilename.call(this, request, ...args);
};

import { getConfig, resolveModel, resolveBaseUrl, onConfigChange } from '../../src/config/configManager';

describe('ConfigManager', () => {
  afterEach(() => {
    resetMockConfig();
    sinon.restore();
    delete process.env.ANTHROPIC_SMALL_FAST_MODEL;
  });

  describe('getConfig()', () => {
    it('returns default values when no settings configured', () => {
      const config = getConfig();
      assert.equal(config.enabled, true);
      assert.equal(config.backend, 'openai');
      assert.equal(config.debounceMs, 300);
      assert.equal(config.contextLines, 100);
      assert.equal(config.cacheSize, 50);
      assert.equal(config.apiBaseUrl, '');
      assert.equal(config.apiKey, '');
      assert.equal(config.apiKeyHelper, '');
    });

    it('reads custom settings from VS Code config', () => {
      setMockConfig('nerdCodeCompletion', {
        enabled: false,
        backend: 'anthropic',
        debounceMs: 500,
        contextLines: 50,
        cacheSize: 100,
        apiBaseUrl: 'https://api.anthropic.com',
        apiKey: 'test-key',
      });

      const config = getConfig();
      assert.equal(config.enabled, false);
      assert.equal(config.backend, 'anthropic');
      assert.equal(config.debounceMs, 500);
      assert.equal(config.apiBaseUrl, 'https://api.anthropic.com');
      assert.equal(config.apiKey, 'test-key');
    });

    it('trims apiBaseUrl whitespace', () => {
      setMockConfig('nerdCodeCompletion', {
        apiBaseUrl: '  http://localhost:11434/v1  ',
      });
      const config = getConfig();
      assert.equal(config.apiBaseUrl, 'http://localhost:11434/v1');
    });
  });

  describe('resolveModel() — Anthropic backend', () => {
    it('returns extension setting when provided', () => {
      assert.equal(resolveModel('claude-sonnet-4-6', 'anthropic'), 'claude-sonnet-4-6');
    });

    it('falls back to ANTHROPIC_SMALL_FAST_MODEL env var when setting is empty', () => {
      process.env.ANTHROPIC_SMALL_FAST_MODEL = 'claude-opus-4-6';
      assert.equal(resolveModel('', 'anthropic'), 'claude-opus-4-6');
    });

    it('falls back to claude-haiku-4-5 when both setting and env var are empty', () => {
      assert.equal(resolveModel('', 'anthropic'), 'claude-haiku-4-5');
    });

    it('ignores env var when extension setting is set', () => {
      process.env.ANTHROPIC_SMALL_FAST_MODEL = 'claude-opus-4-6';
      assert.equal(resolveModel('claude-sonnet-4-6', 'anthropic'), 'claude-sonnet-4-6');
    });
  });

  describe('resolveModel() — OpenAI backend', () => {
    it('returns setting value directly', () => {
      assert.equal(resolveModel('codellama:7b', 'openai'), 'codellama:7b');
    });

    it('returns empty string when no model set', () => {
      assert.equal(resolveModel('', 'openai'), '');
    });

    it('ignores ANTHROPIC_SMALL_FAST_MODEL env var', () => {
      process.env.ANTHROPIC_SMALL_FAST_MODEL = 'claude-opus-4-6';
      assert.equal(resolveModel('', 'openai'), '');
    });
  });

  describe('resolveModel() — LiteLLM backend', () => {
    it('returns setting value directly', () => {
      assert.equal(resolveModel('gpt-4o-mini', 'litellm'), 'gpt-4o-mini');
    });

    it('returns empty string when no model set', () => {
      assert.equal(resolveModel('', 'litellm'), '');
    });
  });

  describe('resolveBaseUrl()', () => {
    it('returns provided URL as-is', () => {
      assert.equal(resolveBaseUrl('http://localhost:11434/v1', 'openai'), 'http://localhost:11434/v1');
    });

    it('defaults to Anthropic API for anthropic backend', () => {
      assert.equal(resolveBaseUrl('', 'anthropic'), 'https://api.anthropic.com');
    });

    it('returns empty for openai backend with no URL', () => {
      assert.equal(resolveBaseUrl('', 'openai'), '');
    });

    it('returns empty for litellm backend with no URL', () => {
      assert.equal(resolveBaseUrl('', 'litellm'), '');
    });
  });

  describe('onConfigChange()', () => {
    it('calls callback when nerdCodeCompletion config changes', () => {
      const callback = sinon.stub();
      const disposable = onConfigChange(callback);
      fireConfigChange('nerdCodeCompletion');
      assert.equal(callback.callCount, 1);
      disposable.dispose();
    });

    it('does not call callback for unrelated config changes', () => {
      const callback = sinon.stub();
      const disposable = onConfigChange(callback);
      fireConfigChange('editor');
      assert.equal(callback.callCount, 0);
      disposable.dispose();
    });
  });
});
