/**
 * Python Sandbox Engine — executes Python code in an isolated environment.
 * 
 * Architecture:
 * - Core defines the interface (this file)
 * - PWA implements via Pyodide (WebAssembly)
 * - TUI implements via Pyodide or system Python
 * 
 * The sandbox has a virtual file system at /workspace/:
 *   - /workspace/data/     — user-uploaded files (read-only to Python)
 *   - /workspace/output/   — Python output files (scanned after execution)
 *   - /workspace/temp/     — temporary files (cleaned after execution)
 */

export interface PythonFile {
  path: string;
  name: string;
  type: string;  // 'csv' | 'json' | 'png' | 'jpg' | 'txt' | 'unknown'
  size: number;
  content: string;  // base64 for binary, text for text files
}

export interface PythonExecutionResult {
  stdout: string;
  stderr: string;
  returnValue: unknown;
  files: PythonFile[];
  success: boolean;
  executionTime: number;
  executionTimestamp: number; // Unix timestamp when execution started, for filtering recent files
  /** If true, the code contains write operations and requires user confirmation before execution */
  requiresConfirmation?: boolean;
  /** List of write operations detected by AST analysis (only present when requiresConfirmation is true) */
  writeOperations?: Array<{ tool: string; count: number; lineNumbers: number[] }>;
  /** Error message if execution failed before running code */
  error?: string;
}

export interface PythonSandboxEngine {
  /**
   * Execute Python code.
   * @param code — Python source code
   * @param chatId — optional chat session ID for workspace file isolation
   * @returns execution result including stdout, stderr, and output files
   */
  execute(code: string, chatId?: string): Promise<PythonExecutionResult>;

  /**
   * Mount a user file into /workspace/data/.
   * @param name — filename
   * @param data — file content
   */
  mountFile(name: string, data: Uint8Array): Promise<void>;

  /**
   * Unmount a file from /workspace/data/.
   */
  unmountFile(name: string): Promise<void>;

  /**
   * Check if the sandbox is ready (initialized).
   */
  isReady(): boolean;

  /**
   * Check if initialization has failed (timed out or crashed).
   */
  hasInitFailed(): boolean;

  /**
   * Initialize the sandbox (load runtime, install packages, etc.).
   * Returns progress updates.
   */
  initialize(): AsyncIterable<{ stage: string; progress: number; message: string }>;
}

/** Global sandbox instance — set by the UI layer */
let _globalSandbox: PythonSandboxEngine | null = null;

export function setGlobalPythonSandbox(sandbox: PythonSandboxEngine): void {
  _globalSandbox = sandbox;
}

export function getGlobalPythonSandbox(): PythonSandboxEngine | null {
  return _globalSandbox;
}
