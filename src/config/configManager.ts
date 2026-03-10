import * as vscode from 'vscode';

const DEFAULT_MODEL = 'claude-haiku-4-5';
const CONFIG_SECTION = 'claudeAutocomplete';

export type BackendType = 'claude' | 'openai-compatible';

export interface AutocompleteConfig {
  enabled: boolean;
  backend: BackendType;
  model: string;
  debounceMs: number;
  contextLines: number;
  cacheSize: number;
  openaiBaseUrl: string;
  openaiApiKey: string;
}

export function getConfig(): AutocompleteConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const backend = config.get<BackendType>('backend', 'claude');
  const rawModel = config.get<string>('model', '');

  return {
    enabled: config.get<boolean>('enabled', true),
    backend,
    model: resolveModel(rawModel, backend),
    debounceMs: config.get<number>('debounceMs', 300),
    contextLines: config.get<number>('contextLines', 100),
    cacheSize: config.get<number>('cacheSize', 50),
    openaiBaseUrl: config.get<string>('openaiBaseUrl', '').trim(),
    openaiApiKey: config.get<string>('openaiApiKey', ''),
  };
}

export function resolveModel(settingValue: string, backend: BackendType): string {
  const trimmed = settingValue.trim();

  if (backend === 'openai-compatible') {
    // For OpenAI-compatible, use the raw setting value directly — no env var fallback
    return trimmed;
  }

  // Claude backend: setting → env var → default
  if (trimmed.length > 0) {
    return trimmed;
  }

  const envModel = process.env.ANTHROPIC_SMALL_FAST_MODEL;
  if (envModel && envModel.trim().length > 0) {
    return envModel.trim();
  }

  return DEFAULT_MODEL;
}

export function onConfigChange(callback: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(CONFIG_SECTION)) {
      callback();
    }
  });
}
