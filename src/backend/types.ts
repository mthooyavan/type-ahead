import { AutocompleteConfig } from '../config/configManager';
import { RelatedFileContext } from '../context/types';

export interface CompletionRequest {
  prefix: string;
  suffix: string;
  language: string;
  filePath: string;
  fileName: string;
  cursorLine: number;
  cursorColumn: number;
  systemPrompt: string;
  relatedFiles?: RelatedFileContext[];
}

export interface CompletionBackend {
  complete(request: CompletionRequest): Promise<string | null>;
  updateConfig(config: AutocompleteConfig): void;
  dispose(): void;
}
