import { strict as assert } from 'assert';
import * as sinon from 'sinon';
import { setMockConfig, resetMockConfig, fireConfigChange } from '../mocks/vscode';

// Register the vscode mock before importing the module under test
import Module from 'module';
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, ...args: unknown[]) {
  if (request === 'vscode') {
    return require.resolve('../mocks/vscode');
  }
  return originalResolveFilename.call(this, request, ...args);
};

import { getConfig, resolveModel, onConfigChange } from '../../src/config/configManager';

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
      assert.equal(config.backend, 'claude');
      assert.equal(config.debounceMs, 300);
      assert.equal(config.contextLines, 100);
      assert.equal(config.cacheSize, 50);
      assert.equal(config.openaiBaseUrl, '');
      assert.equal(config.openaiApiKey, '');
    });

    it('reads custom settings from VS Code config', () => {
      setMockConfig('claudeAutocomplete', {
        enabled: false,
        backend: 'openai-compatible',
        debounceMs: 500,
        contextLines: 50,
        cacheSize: 100,
        openaiBaseUrl: 'http://localhost:11434/v1',
        openaiApiKey: 'test-key',
      });

      const config = getConfig();
      assert.equal(config.enabled, false);
      assert.equal(config.backend, 'openai-compatible');
      assert.equal(config.debounceMs, 500);
      assert.equal(config.contextLines, 50);
      assert.equal(config.cacheSize, 100);
      assert.equal(config.openaiBaseUrl, 'http://localhost:11434/v1');
      assert.equal(config.openaiApiKey, 'test-key');
    });

    it('resolves model through Claude priority chain by default', () => {
      setMockConfig('claudeAutocomplete', { model: 'claude-sonnet-4-6' });
      const config = getConfig();
      assert.equal(config.model, 'claude-sonnet-4-6');
    });

    it('trims openaiBaseUrl whitespace', () => {
      setMockConfig('claudeAutocomplete', {
        openaiBaseUrl: '  http://localhost:11434/v1  ',
      });
      const config = getConfig();
      assert.equal(config.openaiBaseUrl, 'http://localhost:11434/v1');
    });
  });

  describe('resolveModel() — Claude backend', () => {
    it('returns extension setting when provided', () => {
      assert.equal(resolveModel('claude-sonnet-4-6', 'claude'), 'claude-sonnet-4-6');
    });

    it('trims whitespace from extension setting', () => {
      assert.equal(resolveModel('  claude-sonnet-4-6  ', 'claude'), 'claude-sonnet-4-6');
    });

    it('falls back to ANTHROPIC_SMALL_FAST_MODEL env var when setting is empty', () => {
      process.env.ANTHROPIC_SMALL_FAST_MODEL = 'claude-opus-4-6';
      assert.equal(resolveModel('', 'claude'), 'claude-opus-4-6');
    });

    it('trims whitespace from env var', () => {
      process.env.ANTHROPIC_SMALL_FAST_MODEL = '  claude-opus-4-6  ';
      assert.equal(resolveModel('', 'claude'), 'claude-opus-4-6');
    });

    it('falls back to claude-haiku-4-5 when both setting and env var are empty', () => {
      assert.equal(resolveModel('', 'claude'), 'claude-haiku-4-5');
    });

    it('ignores env var when extension setting is set', () => {
      process.env.ANTHROPIC_SMALL_FAST_MODEL = 'claude-opus-4-6';
      assert.equal(resolveModel('claude-sonnet-4-6', 'claude'), 'claude-sonnet-4-6');
    });

    it('treats whitespace-only setting as empty', () => {
      process.env.ANTHROPIC_SMALL_FAST_MODEL = 'claude-opus-4-6';
      assert.equal(resolveModel('   ', 'claude'), 'claude-opus-4-6');
    });

    it('treats whitespace-only env var as empty', () => {
      process.env.ANTHROPIC_SMALL_FAST_MODEL = '   ';
      assert.equal(resolveModel('', 'claude'), 'claude-haiku-4-5');
    });
  });

  describe('resolveModel() — OpenAI-compatible backend', () => {
    it('returns setting value directly', () => {
      assert.equal(resolveModel('codellama:7b', 'openai-compatible'), 'codellama:7b');
    });

    it('trims whitespace', () => {
      assert.equal(resolveModel('  deepseek-coder:6.7b  ', 'openai-compatible'), 'deepseek-coder:6.7b');
    });

    it('returns empty string when no model set (caller must validate)', () => {
      assert.equal(resolveModel('', 'openai-compatible'), '');
    });

    it('ignores ANTHROPIC_SMALL_FAST_MODEL env var', () => {
      process.env.ANTHROPIC_SMALL_FAST_MODEL = 'claude-opus-4-6';
      assert.equal(resolveModel('', 'openai-compatible'), '');
    });

    it('does not fall back to claude-haiku-4-5', () => {
      assert.equal(resolveModel('', 'openai-compatible'), '');
    });
  });

  describe('onConfigChange()', () => {
    it('calls callback when claudeAutocomplete config changes', () => {
      const callback = sinon.stub();
      const disposable = onConfigChange(callback);

      fireConfigChange('claudeAutocomplete');
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

    it('stops calling callback after dispose', () => {
      const callback = sinon.stub();
      const disposable = onConfigChange(callback);

      disposable.dispose();
      fireConfigChange('claudeAutocomplete');
      assert.equal(callback.callCount, 0);
    });
  });
});
