// Mock vscode module for unit tests running outside VS Code
// Only mock what we actually use

const configValues: Record<string, Record<string, unknown>> = {};

export function setMockConfig(section: string, values: Record<string, unknown>): void {
  configValues[section] = values;
}

export function resetMockConfig(): void {
  for (const key of Object.keys(configValues)) {
    delete configValues[key];
  }
}

const configChangeListeners: Array<(e: { affectsConfiguration: (section: string) => boolean }) => void> = [];

export const workspace = {
  getConfiguration(section: string) {
    const values = configValues[section] || {};
    return {
      get<T>(key: string, defaultValue: T): T {
        const value = values[key];
        return value !== undefined ? (value as T) : defaultValue;
      },
      async update(_key: string, _value: unknown, _target?: unknown): Promise<void> {
        // no-op in tests
      },
    };
  },
  onDidChangeConfiguration(
    listener: (e: { affectsConfiguration: (section: string) => boolean }) => void
  ) {
    configChangeListeners.push(listener);
    return { dispose: () => {
      const idx = configChangeListeners.indexOf(listener);
      if (idx >= 0) configChangeListeners.splice(idx, 1);
    }};
  },
};

export function fireConfigChange(section: string): void {
  for (const listener of configChangeListeners) {
    listener({
      affectsConfiguration: (s: string) => s === section,
    });
  }
}

export const window = {
  showInformationMessage: async (_message: string) => undefined,
  showErrorMessage: async (_message: string) => undefined,
  showWarningMessage: async (_message: string) => undefined,
  createStatusBarItem: (_alignment?: unknown, _priority?: number) => ({
    text: '',
    tooltip: '',
    command: '',
    backgroundColor: undefined as unknown,
    show: () => {},
    hide: () => {},
    dispose: () => {},
  }),
};

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export class ThemeColor {
  constructor(public id: string) {}
}

export const commands = {
  registerCommand: (_command: string, _callback: (...args: unknown[]) => unknown) => ({
    dispose: () => {},
  }),
};

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

export const languages = {
  registerInlineCompletionItemProvider: (
    _selector: unknown,
    _provider: unknown
  ) => ({
    dispose: () => {},
  }),
};

export class CancellationTokenSource {
  token = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => {} }),
  };
  cancel(): void {
    this.token.isCancellationRequested = true;
  }
  dispose(): void {}
}

export class InlineCompletionItem {
  constructor(
    public insertText: string,
    public range?: unknown,
    public command?: unknown
  ) {}
}

export class InlineCompletionList {
  constructor(public items: InlineCompletionItem[]) {}
}

export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  constructor(public start: Position, public end: Position) {}
}

export class Uri {
  static file(path: string) {
    return { fsPath: path, scheme: 'file', path };
  }
}
