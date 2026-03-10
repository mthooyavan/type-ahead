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
    if (this.cachedKey !== null) {
      return this.cachedKey;
    }

    if (this.helperCommand) {
      console.log(`Type Ahead: [auth] generating key via helper: ${this.helperCommand.split(' ')[0]}`);
      return this.executeHelper();
    }

    if (this.staticKey) {
      console.log('Type Ahead: [auth] using static API key');
      return this.staticKey;
    }

    console.log('Type Ahead: [auth] no API key configured (no auth header will be sent)');
    return null;
  }

  /**
   * Force refresh the API key. Called on 401/403 errors.
   * If no helper is configured, returns the static key unchanged.
   */
  async refreshKey(): Promise<string | null> {
    if (!this.helperCommand) {
      console.log('Type Ahead: [auth] no helper configured, cannot refresh key');
      return this.staticKey || null;
    }

    if (this.refreshing) {
      console.log('Type Ahead: [auth] key refresh already in progress, waiting...');
      return this.refreshing;
    }

    console.log('Type Ahead: [auth] refreshing API key via helper...');
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
      console.log('Type Ahead: [auth] warming up API key at session start...');
      await this.executeHelper();
      console.log('Type Ahead: [auth] API key ready');
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
          console.error(`Type Ahead: [auth] helper command failed: ${msg}`);
          reject(new Error(`API key helper failed: ${msg}`));
          return;
        }

        const key = stdout.trim();
        if (!key) {
          console.error('Type Ahead: [auth] helper command returned empty output');
          reject(new Error('API key helper returned empty output'));
          return;
        }

        const maskedKey = key.length > 8 ? key.slice(0, 4) + '...' + key.slice(-4) : '****';
        console.log(`Type Ahead: [auth] helper returned key: ${maskedKey}`);
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
