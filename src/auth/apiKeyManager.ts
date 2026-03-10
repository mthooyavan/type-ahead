import { execFile as nodeExecFile } from 'child_process';

export type ExecFileFn = typeof nodeExecFile;

/**
 * Manages API key lifecycle for the OpenAI-compatible backend.
 *
 * Supports two modes:
 * 1. Dynamic: runs a shell command (apiKeyHelper) to generate keys on demand
 * 2. Static: uses a hardcoded key from settings (openaiApiKey)
 *
 * Dynamic keys are cached and refreshed on 401/403 errors.
 */
export class ApiKeyManager {
  private cachedKey: string | null = null;
  private helperCommand: string;
  private staticKey: string;
  private refreshing: Promise<string | null> | null = null;
  private execFileFn: ExecFileFn;

  constructor(helperCommand: string, staticKey: string, execFileFn?: ExecFileFn) {
    this.helperCommand = helperCommand.trim();
    this.staticKey = staticKey;
    this.execFileFn = execFileFn ?? nodeExecFile;
  }

  /**
   * Get the current API key. Returns cached key if available,
   * otherwise generates a new one.
   */
  async getKey(): Promise<string | null> {
    // If we have a cached key (from helper), return it
    if (this.cachedKey !== null) {
      return this.cachedKey;
    }

    // If helper is configured, run it to generate a key
    if (this.helperCommand) {
      return this.executeHelper();
    }

    // Fall back to static key (may be empty string → null)
    return this.staticKey || null;
  }

  /**
   * Force refresh the API key. Called on 401/403 errors.
   * If no helper is configured, returns the static key unchanged.
   */
  async refreshKey(): Promise<string | null> {
    if (!this.helperCommand) {
      // No helper → static key can't be refreshed
      return this.staticKey || null;
    }

    // Deduplicate concurrent refresh calls
    if (this.refreshing) {
      return this.refreshing;
    }

    this.cachedKey = null;
    this.refreshing = this.executeHelper().finally(() => {
      this.refreshing = null;
    });

    return this.refreshing;
  }

  /**
   * Update configuration (e.g., when settings change).
   * Clears cached key if helper command changed.
   */
  updateConfig(helperCommand: string, staticKey: string): void {
    const newHelper = helperCommand.trim();
    if (newHelper !== this.helperCommand) {
      this.cachedKey = null;
    }
    this.helperCommand = newHelper;
    this.staticKey = staticKey;
  }

  /**
   * Eagerly generate and cache the API key.
   * Called at extension activation (IDE open).
   */
  async warmUp(): Promise<void> {
    if (this.helperCommand) {
      await this.executeHelper();
    }
  }

  private executeHelper(): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const parts = splitCommand(this.helperCommand);
      if (parts.length === 0) {
        resolve(null);
        return;
      }

      const [executable, ...args] = parts;

      this.execFileFn(executable, args, { timeout: 10000 }, (error, stdout, stderr) => {
        if (error) {
          const msg = stderr?.trim() || error.message;
          reject(new Error(`API key helper failed: ${msg}`));
          return;
        }

        const key = stdout.trim();
        if (!key) {
          reject(new Error('API key helper returned empty output'));
          return;
        }

        this.cachedKey = key;
        resolve(key);
      });
    });
  }

  dispose(): void {
    this.cachedKey = null;
    this.refreshing = null;
  }
}

/**
 * Split a command string into executable and arguments.
 * Handles simple quoting (single and double quotes).
 */
export function splitCommand(command: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === ' ' && !inSingle && !inDouble) {
      if (current.length > 0) {
        parts.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
}
