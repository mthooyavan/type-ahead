import * as vscode from 'vscode';

const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5';
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const CONFIG_SECTION = 'typeAhead';

export type BackendType = 'openai' | 'anthropic' | 'litellm';

export interface AutocompleteConfig {
  enabled: boolean;
  backend: BackendType;
  model: string;
  debounceMs: number;
  contextLines: number;
  cacheSize: number;
  apiBaseUrl: string;
  apiKey: string;
  apiKeyHelper: string;
  excludePatterns: string[];
  customInstructions: string;
  litellmAnthropicResponse: boolean;
}

export function getConfig(): AutocompleteConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const backend = config.get<BackendType>('backend', 'openai');
  const rawModel = config.get<string>('model', '');
  const rawBaseUrl = config.get<string>('apiBaseUrl', '').trim();

  return {
    enabled: config.get<boolean>('enabled', true),
    backend,
    model: resolveModel(rawModel, backend),
    debounceMs: config.get<number>('debounceMs', 300),
    contextLines: config.get<number>('contextLines', 100),
    cacheSize: config.get<number>('cacheSize', 50),
    apiBaseUrl: resolveBaseUrl(rawBaseUrl, backend),
    apiKey: config.get<string>('apiKey', ''),
    apiKeyHelper: config.get<string>('apiKeyHelper', ''),
    excludePatterns: config.get<string[]>('excludePatterns', []),
    customInstructions: config.get<string>('customInstructions', '').trim(),
    litellmAnthropicResponse: config.get<boolean>('litellmAnthropicResponse', false),
  };
}

export function resolveModel(settingValue: string, backend: BackendType): string {
  const trimmed = settingValue.trim();

  if (backend === 'anthropic') {
    // Anthropic: setting → env var → default
    if (trimmed.length > 0) {
      return trimmed;
    }
    const envModel = process.env.ANTHROPIC_SMALL_FAST_MODEL;
    if (envModel && envModel.trim().length > 0) {
      return envModel.trim();
    }
    return DEFAULT_ANTHROPIC_MODEL;
  }

  // OpenAI / LiteLLM: use the raw setting value directly — no fallback
  return trimmed;
}

export function resolveBaseUrl(rawBaseUrl: string, backend: BackendType): string {
  if (rawBaseUrl) {
    return rawBaseUrl;
  }
  if (backend === 'anthropic') {
    return DEFAULT_ANTHROPIC_BASE_URL;
  }
  return '';
}

export function onConfigChange(callback: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(CONFIG_SECTION)) {
      callback();
    }
  });
}
