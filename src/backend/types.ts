import { AutocompleteConfig } from '../config/configManager';

export interface CompletionRequest {
  prefix: string;
  suffix: string;
  language: string;
  filePath: string;
  fileName: string;
  cursorLine: number;
  cursorColumn: number;
}

export interface CompletionBackend {
  complete(request: CompletionRequest): Promise<string | null>;
  updateConfig(config: AutocompleteConfig): void;
  dispose(): void;
}
