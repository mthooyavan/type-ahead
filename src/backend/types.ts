import * as vscode from 'vscode';
import { AutocompleteConfig } from '../config/configManager';

export interface CompletionRequest {
  /** Code before the cursor */
  prefix: string;
  /** Code after the cursor */
  suffix: string;
  /** Language identifier */
  language: string;
  /** Full file path */
  filePath: string;
  /** File name */
  fileName: string;
  /** Cursor line number */
  cursorLine: number;
  /** Cursor column number */
  cursorColumn: number;
}

export interface CompletionBackend {
  /**
   * Generate a completion for the given request.
   * Returns the completion text, or null if no completion available.
   */
  complete(
    request: CompletionRequest,
    token: vscode.CancellationToken
  ): Promise<string | null>;

  /** Update configuration (e.g., model, settings) */
  updateConfig(config: AutocompleteConfig): void;

  /** Clean up resources */
  dispose(): void;
}
