export interface CodeContext {
  /** Code before the cursor position */
  prefix: string;
  /** Code after the cursor position */
  suffix: string;
  /** VS Code language identifier (e.g., 'typescript', 'python') */
  language: string;
  /** File name without path */
  fileName: string;
  /** Full file path */
  filePath: string;
  /** Zero-based cursor line number */
  cursorLine: number;
  /** Zero-based cursor column number */
  cursorColumn: number;
  /** Snippets from other open editor tabs (imports + signatures) */
  relatedFiles?: RelatedFileContext[];
}

export interface RelatedFileContext {
  fileName: string;
  language: string;
  /** First ~50 lines of the file (imports + top-level declarations) */
  snippet: string;
}
