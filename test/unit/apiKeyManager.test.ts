import { strict as assert } from 'assert';
import * as sinon from 'sinon';
import { ApiKeyManager, splitCommand, ExecFileFn } from '../../src/auth/apiKeyManager';

describe('ApiKeyManager', () => {
  let execFileStub: sinon.SinonStub;

  beforeEach(() => {
    execFileStub = sinon.stub();
  });

  afterEach(() => {
    sinon.restore();
  });

  // Helper to make the stub call the callback with given results
  function mockExecFile(stdout: string, stderr = '', error: Error | null = null) {
    execFileStub.callsFake((_cmd: string, _args: string[], _opts: any, cb: Function) => {
      cb(error, stdout, stderr);
    });
  }

  function createManager(helper: string, staticKey = ''): ApiKeyManager {
    return new ApiKeyManager(helper, staticKey, execFileStub as unknown as ExecFileFn);
  }

  describe('getKey() — with helper command', () => {
    it('runs the helper command and returns stdout as key', async () => {
      mockExecFile('my-api-key-123');

      const manager = createManager('get-key', '');
      const key = await manager.getKey();

      assert.equal(key, 'my-api-key-123');
      assert.ok(execFileStub.calledOnce);
      assert.equal(execFileStub.firstCall.args[0], 'get-key');
    });

    it('trims whitespace from key output', async () => {
      mockExecFile('  my-key  \n');

      const manager = createManager('get-key', '');
      const key = await manager.getKey();

      assert.equal(key, 'my-key');
    });

    it('caches the key on subsequent calls', async () => {
      mockExecFile('cached-key');

      const manager = createManager('get-key', '');
      await manager.getKey();
      await manager.getKey();
      await manager.getKey();

      // Should only execute once
      assert.equal(execFileStub.callCount, 1);
    });

    it('passes arguments from the command string', async () => {
      mockExecFile('key');

      const manager = createManager('my-tool --get-key --format token', '');
      await manager.getKey();

      assert.equal(execFileStub.firstCall.args[0], 'my-tool');
      assert.deepEqual(execFileStub.firstCall.args[1], ['--get-key', '--format', 'token']);
    });

    it('rejects when helper command fails', async () => {
      mockExecFile('', 'command not found', new Error('exit code 1'));

      const manager = createManager('nonexistent-cmd', '');

      await assert.rejects(
        () => manager.getKey(),
        /API key helper failed: command not found/
      );
    });

    it('rejects when helper returns empty output', async () => {
      mockExecFile('');

      const manager = createManager('empty-output', '');

      await assert.rejects(
        () => manager.getKey(),
        /API key helper returned empty output/
      );
    });

    it('rejects when helper returns only whitespace', async () => {
      mockExecFile('  \n  ');

      const manager = createManager('whitespace-only', '');

      await assert.rejects(
        () => manager.getKey(),
        /API key helper returned empty output/
      );
    });

    it('uses error.message when stderr is empty', async () => {
      mockExecFile('', '', new Error('ENOENT'));

      const manager = createManager('missing-binary', '');

      await assert.rejects(
        () => manager.getKey(),
        /API key helper failed: ENOENT/
      );
    });
  });

  describe('getKey() — static key (no helper)', () => {
    it('returns static key when no helper is configured', async () => {
      const manager = createManager('', 'static-key-456');
      const key = await manager.getKey();

      assert.equal(key, 'static-key-456');
      assert.ok(execFileStub.notCalled);
    });

    it('returns null when both helper and static key are empty', async () => {
      const manager = createManager('', '');
      const key = await manager.getKey();

      assert.equal(key, null);
    });
  });

  describe('refreshKey()', () => {
    it('re-runs the helper and returns new key', async () => {
      let callCount = 0;
      execFileStub.callsFake((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        callCount++;
        cb(null, `key-${callCount}`, '');
      });

      const manager = createManager('get-key', '');

      const key1 = await manager.getKey();
      assert.equal(key1, 'key-1');

      const key2 = await manager.refreshKey();
      assert.equal(key2, 'key-2');

      // After refresh, getKey should return the new cached key
      const key3 = await manager.getKey();
      assert.equal(key3, 'key-2');
      assert.equal(execFileStub.callCount, 2); // Only 2 calls total
    });

    it('deduplicates concurrent refresh calls', async () => {
      mockExecFile('refreshed-key');

      const manager = createManager('get-key', '');

      // Fire multiple refresh calls concurrently
      const [key1, key2, key3] = await Promise.all([
        manager.refreshKey(),
        manager.refreshKey(),
        manager.refreshKey(),
      ]);

      assert.equal(key1, 'refreshed-key');
      assert.equal(key2, 'refreshed-key');
      assert.equal(key3, 'refreshed-key');
      // Should only have executed once
      assert.equal(execFileStub.callCount, 1);
    });

    it('returns static key when no helper configured', async () => {
      const manager = createManager('', 'static-key');
      const key = await manager.refreshKey();

      assert.equal(key, 'static-key');
      assert.ok(execFileStub.notCalled);
    });

    it('returns null when no helper and no static key', async () => {
      const manager = createManager('', '');
      const key = await manager.refreshKey();

      assert.equal(key, null);
    });
  });

  describe('updateConfig()', () => {
    it('clears cache when helper command changes', async () => {
      mockExecFile('key-from-old');

      const manager = createManager('old-cmd', '');
      await manager.getKey();
      assert.equal(execFileStub.callCount, 1);

      mockExecFile('key-from-new');
      manager.updateConfig('new-cmd', '');
      const key = await manager.getKey();

      assert.equal(key, 'key-from-new');
      assert.equal(execFileStub.callCount, 2);
    });

    it('preserves cache when helper command unchanged', async () => {
      mockExecFile('cached-key');

      const manager = createManager('same-cmd', '');
      await manager.getKey();

      manager.updateConfig('same-cmd', 'different-static');
      const key = await manager.getKey();

      assert.equal(key, 'cached-key');
      assert.equal(execFileStub.callCount, 1); // Still cached
    });

    it('switches from helper to static key', async () => {
      mockExecFile('helper-key');

      const manager = createManager('some-cmd', '');
      await manager.getKey();

      manager.updateConfig('', 'new-static-key');
      const key = await manager.getKey();

      assert.equal(key, 'new-static-key');
    });
  });

  describe('warmUp()', () => {
    it('eagerly generates key when helper is configured', async () => {
      mockExecFile('warmed-up-key');

      const manager = createManager('get-key', '');
      await manager.warmUp();

      // Key should now be cached
      const key = await manager.getKey();
      assert.equal(key, 'warmed-up-key');
      assert.equal(execFileStub.callCount, 1);
    });

    it('does nothing when no helper configured', async () => {
      const manager = createManager('', 'static');
      await manager.warmUp();

      assert.ok(execFileStub.notCalled);
    });
  });

  describe('dispose()', () => {
    it('clears cached key', async () => {
      mockExecFile('key');

      const manager = createManager('cmd', '');
      await manager.getKey();
      manager.dispose();

      mockExecFile('new-key');
      const key = await manager.getKey();
      assert.equal(key, 'new-key');
      assert.equal(execFileStub.callCount, 2);
    });
  });
});

describe('splitCommand()', () => {
  it('splits simple command', () => {
    assert.deepEqual(splitCommand('echo hello'), ['echo', 'hello']);
  });

  it('handles single argument', () => {
    assert.deepEqual(splitCommand('get-key'), ['get-key']);
  });

  it('handles multiple spaces', () => {
    assert.deepEqual(splitCommand('cmd  arg1   arg2'), ['cmd', 'arg1', 'arg2']);
  });

  it('handles double-quoted arguments', () => {
    assert.deepEqual(splitCommand('cmd "arg with spaces"'), ['cmd', 'arg with spaces']);
  });

  it('handles single-quoted arguments', () => {
    assert.deepEqual(splitCommand("cmd 'arg with spaces'"), ['cmd', 'arg with spaces']);
  });

  it('handles mixed quoting', () => {
    assert.deepEqual(
      splitCommand('cmd "first arg" \'second arg\' third'),
      ['cmd', 'first arg', 'second arg', 'third']
    );
  });

  it('returns empty array for empty string', () => {
    assert.deepEqual(splitCommand(''), []);
  });

  it('returns empty array for whitespace-only string', () => {
    assert.deepEqual(splitCommand('   '), []);
  });
});
