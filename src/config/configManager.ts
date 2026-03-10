import * as vscode from 'vscode';

const DEFAULT_MODEL = 'claude-haiku-4-5';
const CONFIG_SECTION = 'claudeAutocomplete';

export interface AutocompleteConfig {
  enabled: boolean;
  model: string;
  debounceMs: number;
  contextLines: number;
  cacheSize: number;
}

export function getConfig(): AutocompleteConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  return {
    enabled: config.get<boolean>('enabled', true),
    model: resolveModel(config.get<string>('model', '')),
    debounceMs: config.get<number>('debounceMs', 300),
    contextLines: config.get<number>('contextLines', 100),
    cacheSize: config.get<number>('cacheSize', 50),
  };
}

export function resolveModel(settingValue: string): string {
  // Priority: extension setting > env var > default
  if (settingValue && settingValue.trim().length > 0) {
    return settingValue.trim();
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
