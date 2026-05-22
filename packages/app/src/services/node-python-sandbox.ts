import { spawn, spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync, existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { PythonSandboxEngine, PythonExecutionResult, PythonFile, BskyClient } from '@bsky/core';
import {
  generateNodeWrapper,
  generateASTAnalysisCode,
  ToolDispatcher,
} from '@bsky/core';
import { getDefaultWorkspaceStorage } from './workspaceStorage.js';

const MIME_TYPE_MAP: Record<string, string> = {
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'csv': 'text/csv',
  'json': 'application/json',
  'txt': 'text/plain',
  'md': 'text/markdown',
};

function getMimeType(type: string): string {
  return MIME_TYPE_MAP[type] || 'application/octet-stream';
}

interface JSONRPCRequest {
  jsonrpc: '2.0';
  method: string;
  params: Record<string, unknown>;
  id: number | string;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: { code: number; message: string };
  id: number | string | null;
}

interface ASTAnalysisResult {
  hasWriteOperations: boolean;
  writeOperations: Array<{ tool: string; count: number; lineNumbers: number[] }>;
  hasDynamicCalls: boolean;
  dynamicCallLines: number[];
  error?: string;
}

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
 * JSON-RPC Bridge (v0.8.0+):
 * - Pre-execution AST analysis detects write operations and dynamic calls
 * - User code is wrapped with bsky_tools Python library (JSON-RPC over stdin/stdout)
 * - Tool calls are dispatched to existing BskyClient handlers
 * - Field filtering is applied before returning results
 *
 * Suitable for: MCP server, TUI, any Node.js environment.
 */
export class NodePythonSandbox implements PythonSandboxEngine {
  private baseDir: string;
  private _isReady = true;  // Always ready — no async init needed
  private _initFailed = false;
  private dispatcher: ToolDispatcher | null;

  constructor(client?: BskyClient) {
    this.baseDir = mkdtempSync(join(tmpdir(), 'bsky-python-'));
    this.ensureWorkspaceDirs();
    this.dispatcher = client ? new ToolDispatcher(client) : null;
  }

  setClient(client: BskyClient): void {
    this.dispatcher = new ToolDispatcher(client);
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

  /**
   * Execute Python code with optional write confirmation.
   *
   * Execution flow:
   * 1. AST analysis detects write operations and dynamic calls
   * 2. If writes detected and not confirmed → return confirmation request
   * 3. If dynamic calls detected → return security error
   * 4. Inject Node.js wrapper + user code → spawn Python
   * 5. Intercept JSON-RPC requests on stdout → call BskyClient → write response to stdin
   * 6. Return stdout/stderr/output files
   */
  async execute(code: string, chatId?: string, options?: { confirmed?: boolean }): Promise<PythonExecutionResult> {
    const startTime = Date.now();

    // Step 1: AST Analysis
    const astResult = await this.analyzeAST(code);

    if (astResult.error) {
      return {
        stdout: '',
        stderr: '',
        returnValue: null,
        files: [],
        success: false,
        executionTime: Date.now() - startTime,
        executionTimestamp: startTime,
        error: `AST analysis failed: ${astResult.error}`,
      };
    }

    if (astResult.hasDynamicCalls) {
      return {
        stdout: '',
        stderr: `Security error: Dynamic tool invocation detected on lines: ${astResult.dynamicCallLines.join(', ')}. Use direct bsky_tools.xxx() calls only.`,
        returnValue: null,
        files: [],
        success: false,
        executionTime: Date.now() - startTime,
        executionTimestamp: startTime,
      };
    }

    if (astResult.hasWriteOperations && !options?.confirmed) {
      return {
        stdout: '',
        stderr: '',
        returnValue: null,
        files: [],
        success: false,
        executionTime: Date.now() - startTime,
        executionTimestamp: startTime,
        requiresConfirmation: true,
        writeOperations: astResult.writeOperations,
      };
    }

    // Step 2: Execute with JSON-RPC bridge
    return this.executeWithJSONRPC(code, chatId, startTime);
  }

  /**
   * Run AST analysis in a separate Python process to detect write operations
   * and dynamic calls before executing user code.
   */
  private async analyzeAST(code: string): Promise<ASTAnalysisResult> {
    const analysisCode = generateASTAnalysisCode(code);
    const analysisPath = join(this.baseDir, 'temp', `ast_${Date.now()}.py`);
    writeFileSync(analysisPath, analysisCode, 'utf-8');

    return new Promise((resolve, reject) => {
      let stdout = '';

      const proc = spawn('python3', [analysisPath], { cwd: this.baseDir });

      // 10-second timeout for AST analysis
      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
      }, 10000);

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString('utf-8');
      });

      proc.stderr.on('data', () => {
        // Ignore stderr from AST analysis
      });

      proc.on('close', () => {
        clearTimeout(timeout);
        try { rmSync(analysisPath); } catch {}

        try {
          const result = JSON.parse(stdout.trim()) as ASTAnalysisResult;
          resolve(result);
        } catch {
          resolve({
            hasWriteOperations: false,
            writeOperations: [],
            hasDynamicCalls: false,
            dynamicCallLines: [],
            error: 'Failed to parse AST analysis output',
          });
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        try { rmSync(analysisPath); } catch {}
        reject(err);
      });
    });
  }

  /**
   * Execute Python code with the JSON-RPC bridge.
   * Injects the bsky_tools wrapper before user code and intercepts
   * __JSONRPC__ prefixed lines on stdout.
   */
  private async executeWithJSONRPC(code: string, chatId: string | undefined, startTime: number): Promise<PythonExecutionResult> {
    const workspaceDir = this.getWorkspaceDir(chatId);
    const wrapper = generateNodeWrapper();
    const scriptPath = join(this.baseDir, 'temp', `script_${Date.now()}.py`);

    // Step 1: Syntax check — compile user code to catch errors early
    const syntaxCheckPath = join(this.baseDir, 'temp', `syntax_${Date.now()}.py`);
    writeFileSync(syntaxCheckPath, code, 'utf-8');
    
    try {
      const { status } = spawnSync('python3', ['-m', 'py_compile', syntaxCheckPath], {
        encoding: 'utf-8',
        timeout: 5000,
      });
      if (status !== 0) {
        // Try to get the actual error message
        const { stderr } = spawnSync('python3', ['-m', 'py_compile', syntaxCheckPath], {
          encoding: 'utf-8',
          timeout: 5000,
        });
        return {
          stdout: '',
          stderr: `SyntaxError: ${stderr || 'Invalid Python syntax'}`,
          returnValue: null,
          files: [],
          success: false,
          executionTime: Date.now() - startTime,
          executionTimestamp: startTime,
        };
      }
    } catch {
      // py_compile not available, skip syntax check and let Python handle it
    } finally {
      try { rmSync(syntaxCheckPath); } catch {}
    }

    // Combine wrapper + user code, then apply sandbox guards
    const fullCode = `${wrapper}\n\n# ============ USER CODE ============\n${code}`;
    const wrappedCode = this.wrapCode(fullCode, workspaceDir);
    writeFileSync(scriptPath, wrappedCode, 'utf-8');

    return new Promise((resolve, reject) => {
      let normalStdout = '';
      let stderr = '';
      let killed = false;
      let stdoutBuffer = '';

      const proc = spawn('python3', [scriptPath], {
        cwd: this.baseDir,
        env: {
          ...process.env,
          PYTHONPATH: this.baseDir,
          BSKY_WORKSPACE: workspaceDir,
          PYTHONIOENCODING: 'utf-8',
        },
      });

      // 30-second timeout
      const timeout = setTimeout(() => {
        killed = true;
        proc.kill('SIGKILL');
      }, 30000);

      // JSON-RPC request queue — processes sequentially to match Python's blocking _call()
      const requestQueue: JSONRPCRequest[] = [];
      let isProcessingQueue = false;

      const processQueue = async () => {
        if (isProcessingQueue || requestQueue.length === 0) return;
        isProcessingQueue = true;

        while (requestQueue.length > 0) {
          const req = requestQueue.shift()!;
          const response = await this.handleJSONRPCRequest(req);
          if (proc.stdin.writable && !proc.stdin.destroyed) {
            proc.stdin.write(JSON.stringify(response) + '\n');
          }
        }

        isProcessingQueue = false;
      };

      proc.stdout.on('data', (data: Buffer) => {
        stdoutBuffer += data.toString('utf-8');

        // Process complete lines
        let newlineIndex: number;
        while ((newlineIndex = stdoutBuffer.indexOf('\n')) !== -1) {
          const line = stdoutBuffer.slice(0, newlineIndex);
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('__JSONRPC__')) {
            try {
              const request = JSON.parse(trimmedLine.slice('__JSONRPC__'.length)) as JSONRPCRequest;
              requestQueue.push(request);
              processQueue();
            } catch {
              // Invalid JSON-RPC line — treat as normal output
              normalStdout += line + '\n';
            }
          } else {
            normalStdout += line + '\n';
          }
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString('utf-8');
      });

      proc.on('close', async (code: number | null) => {
        clearTimeout(timeout);

        // Append any remaining buffer content as normal stdout
        if (stdoutBuffer) {
          normalStdout += stdoutBuffer;
        }

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
              const mimeType = getMimeType(file.type);
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
          stdout: normalStdout,
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

  /**
   * Handle a single JSON-RPC request by dispatching to the appropriate tool handler.
   * Applies field filtering if the `fields` parameter is present.
   */
  private async handleJSONRPCRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const { method, params, id } = request;

    if (!this.dispatcher) {
      return {
        jsonrpc: '2.0',
        error: { code: -32603, message: 'BskyClient not available. Sandbox was initialized without a client.' },
        id,
      };
    }

    const response = await this.dispatcher.dispatch({
      method,
      params,
    });

    if (response.success) {
      return { jsonrpc: '2.0', result: response.result, id };
    } else {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: response.error || 'Unknown error',
        },
        id,
      };
    }
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
import io

# [FIX] Force UTF-8 encoding for stdout/stderr on Windows (default is GBK)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

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
