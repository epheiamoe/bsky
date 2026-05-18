import { spawn } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync, existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { PythonSandboxEngine, PythonExecutionResult, PythonFile } from '@bsky/core';
import { getDefaultWorkspaceStorage } from './workspaceStorage.js';

/**
 * NodePythonSandbox — executes Python in a sandboxed child process.
 * 
 * Security model:
 * - Each execution gets a fresh temp directory
 * - Python code is wrapped with filesystem restrictions
 * - Network access is NOT blocked (MCP may need to call AT Protocol)
 * - 30-second timeout per execution
 * - Process is killed after execution
 * 
 * Suitable for: MCP server, TUI, any Node.js environment.
 */
export class NodePythonSandbox implements PythonSandboxEngine {
  private baseDir: string;
  private _isReady = true;  // Always ready — no async init needed
  private _initFailed = false;

  constructor() {
    this.baseDir = mkdtempSync(join(tmpdir(), 'bsky-python-'));
    this.ensureWorkspaceDirs();
  }

  private ensureWorkspaceDirs(): void {
    const dirs = ['data', 'output', 'temp'];
    for (const dir of dirs) {
      const path = join(this.baseDir, dir);
      if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
      }
    }
  }

  private getWorkspaceDir(chatId?: string): string {
    if (chatId) {
      const dir = join(this.baseDir, 'output', chatId);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      return dir;
    }
    return join(this.baseDir, 'output');
  }

  isReady(): boolean {
    return this._isReady;
  }

  hasInitFailed(): boolean {
    return this._initFailed;
  }

  async *initialize(): AsyncIterable<{ stage: string; progress: number; message: string }> {
    yield { stage: 'ready', progress: 1, message: 'Python sandbox ready' };
  }

  async execute(code: string, chatId?: string): Promise<PythonExecutionResult> {
    const startTime = Date.now();
    const workspaceDir = this.getWorkspaceDir(chatId);
    const scriptPath = join(this.baseDir, 'temp', `script_${Date.now()}.py`);

    // Wrap user code with sandbox guards
    const wrappedCode = this.wrapCode(code, workspaceDir);
    writeFileSync(scriptPath, wrappedCode, 'utf-8');

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      const proc = spawn('python3', [scriptPath], {
        cwd: this.baseDir,
        env: {
          ...process.env,
          PYTHONPATH: this.baseDir,
          BSKY_WORKSPACE: workspaceDir,
        },
      });

      // 30-second timeout
      const timeout = setTimeout(() => {
        killed = true;
        proc.kill('SIGKILL');
      }, 30000);

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString('utf-8');
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString('utf-8');
      });

      proc.on('close', async (code: number | null) => {
        clearTimeout(timeout);

        // Cleanup temp script
        try { rmSync(scriptPath); } catch {}

        const executionTime = Date.now() - startTime;
        const files = this.scanOutputFiles(chatId);

        // Save output files to workspace storage (unified with PWA behavior)
        if (chatId && files.length > 0) {
          try {
            const storage = getDefaultWorkspaceStorage();
            for (const file of files) {
              const isText = this.isTextFile(file.type);
              let data: Uint8Array;
              if (isText) {
                data = Buffer.from(file.content, 'utf-8');
              } else {
                data = Buffer.from(file.content, 'base64');
              }
              const id = `py-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              const mimeType = isText
                ? `text/${file.type === 'md' ? 'markdown' : file.type}`
                : 'application/octet-stream';
              await storage.saveFile({
                id,
                name: file.name,
                mimeType,
                size: file.size || data.length,
                data,
                uploadedAt: new Date().toISOString(),
                chatId,
              });
            }
          } catch (err) {
            console.error('[NodePythonSandbox] Failed to save output files:', err);
          }
        }

        resolve({
          stdout,
          stderr,
          returnValue: null,
          files,
          success: code === 0 && !killed,
          executionTime,
          executionTimestamp: startTime,
        });
      });

      proc.on('error', (err: Error) => {
        clearTimeout(timeout);
        try { rmSync(scriptPath); } catch {}
        reject(err);
      });
    });
  }

  async mountFile(name: string, data: Uint8Array): Promise<void> {
    const path = join(this.baseDir, 'data', name);
    writeFileSync(path, data);
  }

  async unmountFile(name: string): Promise<void> {
    const path = join(this.baseDir, 'data', name);
    try { rmSync(path); } catch {}
  }

  /**
   * Wrap user code with:
   * - Filesystem sandbox (restrict open() to workspace)
   * - stdout/stderr capture helpers
   * - Pre-defined workspace paths
   */
  private wrapCode(code: string, workspaceDir: string): string {
    return `# Bsky Python Sandbox Wrapper
import sys
import os
import json

# Store workspace path
_WORKSPACE = ${JSON.stringify(workspaceDir)}
_BASE_DIR = ${JSON.stringify(this.baseDir)}

# Sandbox: restrict open() to workspace
_original_open = open

def _sandboxed_open(file, mode='r', *args, **kwargs):
    if hasattr(file, 'read'):
        return _original_open(file, mode, *args, **kwargs)
    abs_path = os.path.abspath(file)
    # Allow access to workspace, baseDir, and system libs
    if not (abs_path.startswith(_BASE_DIR) or abs_path.startswith('/usr') or abs_path.startswith('/lib') or '/python' in abs_path):
        raise PermissionError(f"Sandbox: Access denied to {file}. Allowed paths: {_WORKSPACE}/*")
    return _original_open(file, mode, *args, **kwargs)

__builtins__.open = _sandboxed_open

# Helper: print to stdout (already captured)
def bsky_print(*args, **kwargs):
    print(*args, **kwargs)
    sys.stdout.flush()

# Execute user code
${code}
`;
  }

  private scanOutputFiles(chatId?: string): PythonFile[] {
    const workspaceDir = this.getWorkspaceDir(chatId);
    if (!existsSync(workspaceDir)) return [];

    const files: PythonFile[] = [];
    try {
      const entries = readdirSync(workspaceDir);
      for (const name of entries) {
        if (name === '.' || name === '..') continue;
        const filePath = join(workspaceDir, name);
        const stat = statSync(filePath);
        if (!stat.isFile()) continue;

        const type = this.getFileType(name);
        let content: string;

        try {
          if (this.isTextFile(type)) {
            content = readFileSync(filePath, 'utf-8');
          } else {
            const buffer = readFileSync(filePath);
            content = buffer.toString('base64');
          }
        } catch {
          continue;
        }

        files.push({
          name,
          type,
          size: stat.size,
          path: filePath,
          content,
        });
      }
    } catch {
      // Directory may not exist
    }
    return files;
  }

  private getFileType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const typeMap: Record<string, string> = {
      csv: 'csv',
      json: 'json',
      png: 'png',
      jpg: 'jpg',
      jpeg: 'jpeg',
      txt: 'txt',
      md: 'md',
      py: 'txt',
    };
    return typeMap[ext] || 'unknown';
  }

  private isTextFile(type: string): boolean {
    return ['csv', 'json', 'txt', 'md'].includes(type);
  }
}
