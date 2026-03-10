import * as vscode from 'vscode';
import { getConfig, onConfigChange, AutocompleteConfig } from './config/configManager';
import { CompletionBackend } from './backend/types';
import { OpenAIBackend } from './backend/openaiBackend';
import { AnthropicBackend } from './backend/anthropicBackend';
import { ClaudeCompletionProvider } from './completionProvider';
import { ApiKeyManager } from './auth/apiKeyManager';
import { registerPartialAcceptCommands } from './partialAccept';

let provider: ClaudeCompletionProvider | null = null;
let currentBackend: CompletionBackend | null = null;
let currentBackendType: string | null = null;
let keyManager: ApiKeyManager | null = null;

export function createBackend(config: AutocompleteConfig, apiKeyManager: ApiKeyManager): CompletionBackend {
  switch (config.backend) {
    case 'anthropic':
      if (!config.model) {
        vscode.window.showErrorMessage(
          'Type Ahead: "model" is required for the Anthropic backend. Please set it in settings.'
        );
      }
      return new AnthropicBackend(config, apiKeyManager);

    case 'litellm':
    case 'openai':
      if (!config.apiBaseUrl) {
        vscode.window.showErrorMessage(
          `Type Ahead: "apiBaseUrl" is required for the ${config.backend} backend. Please set it in settings.`
        );
      }
      if (!config.model) {
        vscode.window.showErrorMessage(
          `Type Ahead: "model" is required for the ${config.backend} backend. Please set it in settings.`
        );
      }
      return new OpenAIBackend(config, apiKeyManager);

    default:
      return new OpenAIBackend(config, apiKeyManager);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const config = getConfig();

  keyManager = new ApiKeyManager(config.apiKeyHelper, config.apiKey);
  if (config.apiKeyHelper) {
    keyManager.warmUp().catch((err) => {
      console.error('Type Ahead: failed to warm up API key', err);
    });
  }

  currentBackend = createBackend(config, keyManager);
  currentBackendType = config.backend;
  provider = new ClaudeCompletionProvider(currentBackend, config);

  const providerDisposable = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' },
    provider
  );
  context.subscriptions.push(providerDisposable);

  // Register partial acceptance commands (accept word / accept line)
  registerPartialAcceptCommands(context, () => provider?.getLastCompletion() ?? null);

  // Invalidate cache when documents change
  const docChangeListener = vscode.workspace.onDidChangeTextDocument((e) => {
    if (provider && e.document.uri.scheme === 'file' && e.contentChanges.length > 0) {
      provider.onDocumentChanged(e.document.uri.fsPath);
    }
  });
  context.subscriptions.push(docChangeListener);

  const toggleCommand = vscode.commands.registerCommand(
    'typeAhead.toggle',
    async () => {
      const vsConfig = vscode.workspace.getConfiguration('typeAhead');
      const current = vsConfig.get<boolean>('enabled', true);
      await vsConfig.update('enabled', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `Type Ahead: ${!current ? 'Enabled' : 'Disabled'}`
      );
    }
  );
  context.subscriptions.push(toggleCommand);

  const configWatcher = onConfigChange(() => {
    const newConfig = getConfig();

    if (keyManager) {
      keyManager.updateConfig(newConfig.apiKeyHelper, newConfig.apiKey);
    }

    if (newConfig.backend !== currentBackendType) {
      currentBackend = createBackend(newConfig, keyManager!);
      currentBackendType = newConfig.backend;

      if (provider) {
        provider.setBackend(currentBackend);
        provider.updateConfig(newConfig);
      }

      if (newConfig.apiKeyHelper && keyManager) {
        keyManager.warmUp().catch((err) => {
          console.error('Type Ahead: failed to warm up API key', err);
        });
      }

      console.log(`Type Ahead: switched to ${newConfig.backend} backend`);
    } else {
      if (provider) {
        provider.updateConfig(newConfig);
      }
      if (currentBackend) {
        currentBackend.updateConfig(newConfig);
      }
    }
  });
  context.subscriptions.push(configWatcher);

  console.log(`Type Ahead: activated (${config.backend} backend)`);
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
  console.log('Type Ahead: deactivated');
}
