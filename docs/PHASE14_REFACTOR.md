# Phase 14 Refactor Plan: Unify API Handler Layer

> **Status**: 🚧 IN PROGRESS — Refactor implemented, bugs found, fixes planned  
> **Target**: Complete before merging feat/phase14-bsky-tools to main  
> **Estimated Effort**: 2-3 days initial + 1 day fixes  
> **Priority**: 🔴 Critical — Blocks stable release  
> **Depends on**: Current Phase 14 implementation (bsky_tools in development)  
> **Created**: 2026-05-20  
> **Last Updated**: 2026-05-20

---

## Testing Results (2026-05-20)

### ✅ Verified Fixes

| Fix | Status | Evidence |
|-----|--------|----------|
| `BSKY_WORKSPACE` env var | ✅ | `os.environ['BSKY_WORKSPACE']` returns `/workspace` |
| Module namespace pollution | ✅ | No leaked user variables (`pd`, `np`, `plt`, etc.) in `bsky_tools` |
| COEP + fetch workaround | ✅ | Worker loads via `fetch()` + `eval()` instead of `importScripts()` |

### ❌ Remaining Bugs

All API calls fail due to **two data serialization issues** in Worker ↔ Main Thread communication:

#### Bug 1: `DataCloneError` (fields parameter)

**Error**:
```
DataCloneError: Failed to execute 'postMessage' on 'DedicatedWorkerGlobalScope':
[object Object] could not be cloned.
```

**Root cause**: `dispatchToMainThread` calls `self.postMessage({ params })` with `undefined` values in params (e.g., `cursor: undefined`). Structured clone algorithm cannot serialize `undefined`.

**Example**: Python calls `search_posts("AI", limit=3, fields=[...])` → JS bridge receives `{q: "AI", limit: 3, cursor: undefined, sort: undefined, fields: [...]}` → `postMessage` fails.

**Fix**: Filter `undefined` values from params before `postMessage`.

```javascript
const cleanParams = {};
for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) cleanParams[key] = value;
}
self.postMessage({ type: 'toolCall', id, method, params: cleanParams, sab });
```

#### Bug 2: `TextDecoder` cannot decode SharedArrayBuffer

**Error**:
```
TypeError: Failed to execute 'decode' on 'TextDecoder':
The provided ArrayBufferView value must not be shared.
```

**Root cause**: `TextDecoder.decode()` does not accept views of `SharedArrayBuffer`.

**Current code**:
```javascript
const byteView = new Uint8Array(toolSab); // toolSab is SharedArrayBuffer
const jsonStr = decoder.decode(byteView.subarray(4)); // ❌ fails
```

**Fix Applied**: Copy data to a regular `ArrayBuffer` before decoding.

```javascript
const rawBytes = byteView.subarray(4);
const bytes = new Uint8Array(rawBytes.length); // regular ArrayBuffer
bytes.set(rawBytes);
const jsonStr = decoder.decode(bytes).replace(/\0/g, '');
```

**Status**: ❌ Fix applied but **still failing**. Need to investigate further.

### Files Fixed (but issue persists)

| File | Lines | Fix | Status |
|------|-------|-----|--------|
| `packages/pwa/src/services/pyodide.worker.ts` | ~348 | Filter `undefined` from params before `postMessage` | Applied |
| `packages/pwa/src/services/pyodide.worker.ts` | ~354-355 | Copy SAB data to regular buffer before `TextDecoder.decode()` | Applied |

### Next Steps (TODO)

- [ ] Debug actual runtime error after fixes
- [ ] Verify fixes are in deployed build
- [ ] Check if there are additional serialization issues
- [ ] Consider alternative: MessageChannel instead of SAB

---

---

## Problem Statement

The current Phase 14 implementation has a **fundamental architectural flaw**: the PWA Worker (`pyodide.worker.ts`) re-implemented all 27 read API handlers from scratch instead of reusing the existing `tools.ts` handlers.

### Why This Happened

During initial implementation, I made a wrong assumption:
- "Worker is isolated, can't import main thread code"
- "Easier to just write sync XHR calls in the worker"
- "PWA and TUI have different environments anyway"

This led to:
1. **Two implementations of every API call** — one in `tools.ts`, one in `pyodide.worker.ts`
2. **Different response structures** — PWA returns raw API, TUI returns normalized
3. **Bugs in one not in the other** — fields filtering, error handling diverged
4. **Maintenance nightmare** — fix a bug in one place, forget the other

### Impact on Users

- `fields` parameter broken in PWA (returns `{}`)
- `search_web_ddg` fails with CORS (uses raw DDG instead of `fetchViaJina`)
- `get_connections` returns different structure than TUI/MCP
- `BSKY_WORKSPACE` not set in Pyodide
- Module namespace pollution from `globals()` leak

---

## Target Architecture

### Principle: Single Source of Truth

All three platforms (PWA, TUI, MCP) must use **the same handler layer** (`tools.ts`). The only platform-specific code should be the **transport layer** (how Python calls reach the handler).

```
┌─────────────────────────────────────────────────────────────┐
│                        Python Code                           │
│  bsky_tools.search_posts("AI", limit=50)                    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              Python Wrapper (platform-agnostic)              │
│  - Snake_case parameters                                    │
│  - Error handling (BskyToolsError)                          │
│  - fields parameter processing                              │
└─────────────────────────────────────────────────────────────┘
                           ↓
        ┌──────────────────┴──────────────────┐
        ↓                                     ↓
┌───────────────┐                   ┌──────────────────┐
│   PWA Worker  │                   │   Node Process   │
│   Transport   │                   │   Transport      │
│               │                   │                  │
│ postMessage() │                   │ JSON-RPC stdout  │
│ Atomics.wait  │                   │ stdin read       │
└───────┬───────┘                   └────────┬─────────┘
        ↓                                    ↓
┌─────────────────────────────────────────────────────────────┐
│              Main Thread (PWA) / Node.js (TUI/MCP)          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Tool Dispatcher (NEW — unified)            │   │
│  │                                                      │   │
│  │  1. Receive request {method, params}                │   │
│  │  2. Look up handler in tools.ts                     │   │
│  │  3. Call handler with BskyClient                    │   │
│  │  4. Apply fields filtering                          │   │
│  │  5. Return JSON result                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           tools.ts (EXISTING — unchanged)            │   │
│  │                                                      │   │
│  │  - 33 tool handlers                                  │   │
│  │  - BskyClient integration                            │   │
│  │  - Response normalization                            │   │
│  │  - Error handling                                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           BskyClient (EXISTING — unchanged)          │   │
│  │                                                      │   │
│  │  - API calls                                         │   │
│  │  - JWT refresh                                       │   │
│  │  - Rate limiting                                     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Refactor Steps

### Step 1: Create Unified Tool Dispatcher

**New file**: `packages/core/src/ai/tool-dispatcher.ts`

```typescript
/**
 * Unified Tool Dispatcher
 * 
 * Single entry point for all bsky_tools API calls across all platforms.
 * Receives {method, params} and routes to the correct tools.ts handler.
 */

import { createTools, type ToolHandler } from './tools.js';
import type { BskyClient } from '../at/client.js';
import { filterFields } from './bsky-tools-api.js';

export interface ToolDispatchRequest {
  method: string;
  params: Record<string, unknown>;
}

export interface ToolDispatchResponse {
  success: boolean;
  result?: unknown;
  error?: string;
}

export class ToolDispatcher {
  private handlers: Map<string, ToolHandler>;
  
  constructor(client: BskyClient) {
    const tools = createTools(client);
    this.handlers = new Map();
    for (const tool of tools) {
      if (tool.definition.name !== 'execute_python') {
        this.handlers.set(tool.definition.name, tool.handler);
      }
    }
  }
  
  async dispatch(request: ToolDispatchRequest): Promise<ToolDispatchResponse> {
    const handler = this.handlers.get(request.method);
    if (!handler) {
      return { success: false, error: `Unknown method: ${request.method}` };
    }
    
    try {
      // Extract fields before calling handler
      const fields = request.params.fields as string[] | undefined;
      delete request.params.fields;
      
      // Call handler (returns JSON string)
      const jsonResult = await handler(request.params);
      const result = JSON.parse(jsonResult);
      
      // Apply fields filtering if requested
      if (fields && fields.length > 0) {
        return { 
          success: true, 
          result: filterFields(result, fields) 
        };
      }
      
      return { success: true, result };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
}
```

**Rationale**:
- Creates a single entry point for all tool calls
- Reuses existing `tools.ts` handlers (zero duplication)
- Centralizes `fields` filtering (currently duplicated in 3 places)
- Returns structured `{success, result, error}` instead of raw strings

### Step 2: Refactor PWA Worker Transport

**File**: `packages/pwa/src/services/pyodide.worker.ts`

**Current** (WRONG):
```typescript
// Worker does everything: HTTP calls, parsing, field filtering
bridge.search_posts = (q, limit, cursor, sort, fields) => {
    const res = get('app.bsky.feed.searchPosts', { q, limit, cursor, sort });
    return res.ok ? filterFields(res.data, fields) : { error: res.error };
};
// ... 26 more handlers
```

**Target** (CORRECT):
```typescript
// Worker only does transport: serialize request → send to main thread → deserialize response
bridge.search_posts = (q, limit, cursor, sort, fields) => {
    return dispatchToMainThread({
        method: 'search_posts',
        params: { q, limit, cursor, sort, fields }
    });
};
// ... all other handlers follow same pattern
```

**Implementation details**:

1. **Remove ALL API call logic** from worker (delete `syncRequest`, `get`, `post`, field filtering, etc.)
2. **Keep ONLY** the Python wrapper injection and transport mechanism
3. **Add `dispatchToMainThread`** function using `postMessage` + `Atomics.wait`:

```typescript
// Worker side
function dispatchToMainThread(request: { method: string; params: any }): any {
    const id = generateRequestId();
    const sab = new Int32Array(new SharedArrayBuffer(4));
    
    // Send request to main thread
    self.postMessage({ 
        type: 'toolCall', 
        id, 
        request,
        sharedBuffer: sab 
    });
    
    // Block until main thread responds
    Atomics.wait(sab, 0, 0);
    
    // Read response from shared memory or message queue
    return getResponse(id);
}
```

4. **Main thread side** (`pyodide-sandbox.ts`):
   - Listen for `toolCall` messages from worker
   - Create `ToolDispatcher` with `BskyClient`
   - Call `dispatcher.dispatch(request)`
   - Return result via `postMessage` back to worker

### Step 3: Refactor TUI/MCP Transport (Minor Changes)

**File**: `packages/app/src/services/node-python-sandbox.ts`

**Current**:
```typescript
// NodePythonSandbox has its own tool handlers map
this.toolHandlers = new Map();
for (const tool of tools) {
    this.toolHandlers.set(tool.definition.name, tool.handler);
}

// In handleJSONRPCRequest:
const handler = this.toolHandlers.get(request.method);
const result = await handler(request.params);
```

**Target**:
```typescript
// Replace manual handler map with ToolDispatcher
import { ToolDispatcher } from '@bsky/core';

this.dispatcher = new ToolDispatcher(client);

// In handleJSONRPCRequest:
const response = await this.dispatcher.dispatch({
    method: request.method,
    params: request.params
});
```

**Benefits**:
- Same dispatcher as PWA (single source of truth)
- Centralized fields filtering
- Consistent error handling

### Step 4: Fix fields Filtering

**Current** (BROKEN in 3 places):
- `bsky-tools-api.ts:filterFields` — core implementation, smart array handling added in hotfix
- `pyodide.worker.ts:filterFields` — old implementation, no smart array handling
- `node-python-sandbox.ts` — no filtering at all (relies on tools.ts handlers)

**Target** (SINGLE implementation):
- `ToolDispatcher.dispatch()` applies fields filtering **after** handler returns
- Uses `bsky-tools-api.ts:filterFields` (the one with smart array handling)
- No filtering in worker, no filtering in node-sandbox

### Step 5: Fix BSKY_WORKSPACE

**Current**: Not set in Pyodide environment

**Target**: Inject before every execution:
```typescript
// In pyodide.worker.ts executePython()
pyodide.runPython(`
import os
os.environ['BSKY_WORKSPACE'] = '/workspace'
`);
```

### Step 6: Fix Module Namespace Pollution

**Current**:
```python
_bsky_tools_module.__dict__.update(globals())  # LEAKS all user variables!
```

**Target**:
```python
# Only export public methods
for _name in dir(_bsky_tools_instance):
    if not _name.startswith('_'):
        setattr(_bsky_tools_module, _name, getattr(_bsky_tools_instance, _name))
_bsky_tools_module.BskyTools = BskyTools
_bsky_tools_module.BskyToolsError = BskyToolsError
```

### Step 7: Remove Worker-Specific API Implementations

**Delete from `pyodide.worker.ts`**:
- `syncRequest()` function (all HTTP calls go through main thread)
- `createBskyToolsBridge()` function (bridge only does transport)
- All inline API handlers (`bridge.search_posts = ...`, etc.)
- Worker-local `filterFields()` function

**Keep in `pyodide.worker.ts`**:
- `loadPyodideRuntime()` — Pyodide initialization
- `executePython()` — code execution with stdout/stderr capture
- `scanOutputFiles()` — file system scanning
- `mountFile()`/`unmountFile()` — file operations
- Transport layer (`dispatchToMainThread`)
- Python wrapper injection (but simplified)

---

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/ai/tool-dispatcher.ts` | Unified tool dispatch layer |

### Modified Files

| File | Changes |
|------|---------|
| `packages/pwa/src/services/pyodide.worker.ts` | Remove API handlers, add transport layer |
| `packages/pwa/src/services/pyodide-sandbox.ts` | Add ToolDispatcher, handle toolCall messages |
| `packages/app/src/services/node-python-sandbox.ts` | Use ToolDispatcher instead of manual handler map |
| `packages/core/src/ai/bsky-tools-api.ts` | Keep filterFields, may move to dispatcher |

### Deleted Logic (not files)

- `pyodide.worker.ts:syncRequest()` — replaced by main thread dispatch
- `pyodide.worker.ts:createBskyToolsBridge()` — replaced by simplified bridge
- `pyodide.worker.ts:filterFields()` — use shared implementation
- All 27 inline API handlers in worker — use tools.ts handlers

---

## Testing Plan

### Unit Tests

1. **ToolDispatcher**:
   - Dispatch known method → returns correct result
   - Dispatch unknown method → returns error
   - fields filtering applied correctly
   - Error handling works

2. **Worker Transport**:
   - dispatchToMainThread blocks until response
   - Response correctly deserialized
   - Timeout handling

3. **TUI/MCP Transport**:
   - JSON-RPC request → correct response
   - fields parameter passed through

### Integration Tests

1. **PWA**: `bsky_tools.search_posts("AI", limit=5)` → returns posts
2. **PWA**: `bsky_tools.search_posts("AI", fields=["uri"])` → returns filtered posts
3. **PWA**: `bsky_tools.fetch_web_markdown("https://example.com")` → returns markdown (via tools.ts handler)
4. **TUI**: Same tests as PWA
5. **MCP**: Same tests as TUI

### Cross-Platform Tests

Same Python code should produce identical results on all three platforms:
```python
import bsky_tools

# Test 1: Basic read
profile = bsky_tools.get_profile("alice.bsky.social")
assert profile['handle'] == 'alice.bsky.social'

# Test 2: fields filtering
posts = bsky_tools.search_posts("AI", limit=1, fields=["uri"])
assert "uri" in posts['posts'][0]
assert "text" not in posts['posts'][0]

# Test 3: External tool
result = bsky_tools.fetch_web_markdown("https://example.com")
assert "content" in result

# Test 4: Workspace
import os
assert os.environ['BSKY_WORKSPACE'] == '/workspace'  # PWA
# or assert 'output' in os.environ['BSKY_WORKSPACE']  # TUI/MCP
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Atomics.wait not supported in some browsers | Low | High | Fallback to async polling |
| Performance regression (main thread round-trip) | Medium | Medium | Measure before/after; optimize if >100ms overhead |
| Breaking changes for existing Python scripts | Medium | Medium | Test all documented examples; response structure should be identical or better |
| SharedArrayBuffer CSP issues | Low | High | Use MessageChannel as fallback |
| Worker-main thread message ordering | Medium | Medium | Use request IDs, handle out-of-order responses |

---

## Migration Guide

### For Users (Python Scripts)

**No changes required** — the refactor is transparent. All methods, parameters, and response structures remain the same (or are fixed to match documentation).

### For Developers

**Before**:
```typescript
// PWA worker: inline API call
bridge.search_posts = (q, limit) => {
    const res = get('app.bsky.feed.searchPosts', { q, limit });
    return res.ok ? res.data : { error: res.error };
};
```

**After**:
```typescript
// PWA worker: transport only
bridge.search_posts = (q, limit) => {
    return dispatchToMainThread({
        method: 'search_posts',
        params: { q, limit }
    });
};

// Main thread: unified dispatcher
const dispatcher = new ToolDispatcher(client);
worker.onmessage = async (e) => {
    if (e.data.type === 'toolCall') {
        const response = await dispatcher.dispatch(e.data.request);
        worker.postMessage({ type: 'toolResult', id: e.data.id, response });
    }
};
```

---

## Timeline

| Day | Task | Owner |
|-----|------|-------|
| 1 | Create ToolDispatcher, refactor TUI/MCP transport | AI |
| 1 | Remove worker API handlers, add transport layer | AI |
| 2 | Update main thread to handle toolCall messages | AI |
| 2 | Fix BSKY_WORKSPACE and namespace pollution | AI |
| 3 | Testing (PWA + TUI + MCP) | AI + User |
| 3 | Documentation updates | AI |

---

## Success Criteria

- [ ] Same Python code produces identical results on PWA, TUI, and MCP
- [ ] `fields` parameter works correctly on all platforms
- [ ] `search_web_ddg` works on TUI/MCP (uses `fetchViaJina`)
- [ ] `fetch_web_markdown` works on all platforms
- [ ] `BSKY_WORKSPACE` is set correctly
- [ ] No `globals()` namespace pollution
- [ ] All 33 tools available on all platforms
- [ ] Write confirmation works on all platforms
- [ ] Performance: <100ms overhead per tool call vs direct API

---

## Related Documents

- `docs/PHASE14_PLAN.md` — Original implementation plan
- `docs/BSKY_TOOLS.md` — User-facing API documentation
- `docs/PYTHON_SANDBOX_STATUS.md` — Sandbox architecture
- `packages/core/src/ai/tools.ts` — Existing tool handlers (source of truth)
- `packages/core/src/ai/bsky-tools-api.ts` — API definitions and filterFields

---

*Created: 2026-05-20 | Status: Planned | Target: Before merging feat/phase14-bsky-tools*
