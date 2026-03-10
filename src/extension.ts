import * as vscode from 'vscode';
import { getConfig, onConfigChange, AutocompleteConfig } from './config/configManager';
import { CompletionBackend } from './backend/types';
import { ClaudeAgentBackend } from './backend/claudeAgentBackend';
import { OpenAICompatibleBackend } from './backend/openaiCompatibleBackend';
import { ClaudeCompletionProvider } from './completionProvider';
import { ApiKeyManager } from './auth/apiKeyManager';

let provider: ClaudeCompletionProvider | null = null;
let currentBackend: CompletionBackend | null = null;
let currentBackendType: string | null = null;
let keyManager: ApiKeyManager | null = null;

export function createBackend(config: AutocompleteConfig, apiKeyManager: ApiKeyManager): CompletionBackend {
  if (config.backend === 'openai-compatible') {
    if (!config.openaiBaseUrl) {
      vscode.window.showErrorMessage(
        'Nerd Code Completion: "openaiBaseUrl" is required when backend is "openai-compatible". Please set it in settings.'
      );
    }
    if (!config.model) {
      vscode.window.showErrorMessage(
        'Nerd Code Completion: "model" is required when backend is "openai-compatible". Please set it in settings.'
      );
    }
    return new OpenAICompatibleBackend(config, apiKeyManager);
  }
  return new ClaudeAgentBackend(config);
}

export function activate(context: vscode.ExtensionContext): void {
  const config = getConfig();

  // Create API key manager and eagerly generate key at session start
  keyManager = new ApiKeyManager(config.apiKeyHelper, config.openaiApiKey);
  if (config.backend === 'openai-compatible' && config.apiKeyHelper) {
    keyManager.warmUp().catch((err) => {
      console.error('Nerd Code Completion: failed to warm up API key', err);
    });
  }

  currentBackend = createBackend(config, keyManager);
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
    'nerdCodeCompletion.toggle',
    async () => {
      const vsConfig = vscode.workspace.getConfiguration('nerdCodeCompletion');
      const current = vsConfig.get<boolean>('enabled', true);
      await vsConfig.update('enabled', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `Nerd Code Completion: ${!current ? 'Enabled' : 'Disabled'}`
      );
    }
  );
  context.subscriptions.push(toggleCommand);

  // Listen for config changes — swap backend if backend type changed
  const configWatcher = onConfigChange(() => {
    const newConfig = getConfig();

    // Update key manager config
    if (keyManager) {
      keyManager.updateConfig(newConfig.apiKeyHelper, newConfig.openaiApiKey);
    }

    if (newConfig.backend !== currentBackendType) {
      // Backend type changed — swap backend on the existing registered provider
      currentBackend = createBackend(newConfig, keyManager!);
      currentBackendType = newConfig.backend;

      if (provider) {
        provider.setBackend(currentBackend);
        provider.updateConfig(newConfig);
      }

      // Warm up key for new openai-compatible backend
      if (newConfig.backend === 'openai-compatible' && newConfig.apiKeyHelper && keyManager) {
        keyManager.warmUp().catch((err) => {
          console.error('Nerd Code Completion: failed to warm up API key', err);
        });
      }

      console.log(`Nerd Code Completion: switched to ${newConfig.backend} backend`);
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

  console.log(`Nerd Code Completion: activated (${config.backend} backend)`);
}

export function deactivate(): void {
  if (provider) {
    provider.dispose();
    provider = null;
  }
  if (keyManager) {
    keyManager.dispose();
    keyManager = null;
  }
  currentBackend = null;
  currentBackendType = null;
  console.log('Nerd Code Completion: deactivated');
}
