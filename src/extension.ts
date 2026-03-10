import * as vscode from 'vscode';
import { getConfig, onConfigChange, AutocompleteConfig } from './config/configManager';
import { CompletionBackend } from './backend/types';
import { ClaudeAgentBackend } from './backend/claudeAgentBackend';
import { OpenAICompatibleBackend } from './backend/openaiCompatibleBackend';
import { ClaudeCompletionProvider } from './completionProvider';

let provider: ClaudeCompletionProvider | null = null;
let currentBackend: CompletionBackend | null = null;
let currentBackendType: string | null = null;

export function createBackend(config: AutocompleteConfig): CompletionBackend {
  if (config.backend === 'openai-compatible') {
    if (!config.openaiBaseUrl) {
      vscode.window.showErrorMessage(
        'Claude Autocomplete: "openaiBaseUrl" is required when backend is "openai-compatible". Please set it in settings.'
      );
    }
    if (!config.model) {
      vscode.window.showErrorMessage(
        'Claude Autocomplete: "model" is required when backend is "openai-compatible". Please set it in settings.'
      );
    }
    return new OpenAICompatibleBackend(config);
  }
  return new ClaudeAgentBackend(config);
}

export function activate(context: vscode.ExtensionContext): void {
  const config = getConfig();

  currentBackend = createBackend(config);
  currentBackendType = config.backend;
  provider = new ClaudeCompletionProvider(currentBackend, config);

  // Register inline completion provider for all languages
  const providerDisposable = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' },
    provider
  );
  context.subscriptions.push(providerDisposable);

  // Toggle command
  const toggleCommand = vscode.commands.registerCommand(
    'claudeAutocomplete.toggle',
    async () => {
      const vsConfig = vscode.workspace.getConfiguration('claudeAutocomplete');
      const current = vsConfig.get<boolean>('enabled', true);
      await vsConfig.update('enabled', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `Claude Autocomplete: ${!current ? 'Enabled' : 'Disabled'}`
      );
    }
  );
  context.subscriptions.push(toggleCommand);

  // Listen for config changes — swap backend if backend type changed
  const configWatcher = onConfigChange(() => {
    const newConfig = getConfig();

    if (newConfig.backend !== currentBackendType) {
      // Backend type changed — swap backend on the existing registered provider
      currentBackend = createBackend(newConfig);
      currentBackendType = newConfig.backend;

      if (provider) {
        provider.setBackend(currentBackend); // disposes old backend internally
        provider.updateConfig(newConfig);
      }
      console.log(`Claude Autocomplete: switched to ${newConfig.backend} backend`);
    } else {
      // Same backend — just update config
      if (provider) {
        provider.updateConfig(newConfig);
      }
      if (currentBackend) {
        currentBackend.updateConfig(newConfig);
      }
    }
  });
  context.subscriptions.push(configWatcher);

  console.log(`Claude Autocomplete: activated (${config.backend} backend)`);
}

export function deactivate(): void {
  if (provider) {
    provider.dispose();
    provider = null;
  }
  currentBackend = null;
  currentBackendType = null;
  console.log('Claude Autocomplete: deactivated');
}
