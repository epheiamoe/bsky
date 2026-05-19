# Phase 14: AI Batch AT Tool Calls — Implementation Plan

> **Status**: ✅ COMPLETED — Implemented in v0.15.0
> **Completed**: 2026-05-19
> **Branch**: feat/phase14-bsky-tools
> **Merged to main**: Pending PR
> **Estimated effort**: 3-5 days (with subagent parallelization)
> **Depends on**: v0.14.0 Python sandbox completion (Phase 1-13.5 ✅)
> **Document created**: 2026-05-19
> **Context recovery note**: If this doc is out of date, check `docs/PYTHON_SANDBOX_STATUS.md` for current status

---

## Vision

Enable AI to write Python scripts that **batch-call AT Protocol tools** within the Python sandbox. Instead of the AI making one tool call at a time (slow, token-expensive), it can write a Python script that efficiently processes data in bulk.

**Example use case**:
```python
from bsky_tools import search_posts, get_profile, follow

posts = search_posts(q="AI", limit=100)
for post in posts:
    profile = get_profile(post['author'])
    if profile['followersCount'] < 1000:
        follow(profile['did'])
        print(f"Followed {profile['handle']}")
```

**Why this matters**:
- **Efficiency**: One Python execution vs 100+ individual tool calls
- **Cost**: Fewer LLM tokens (no repeated tool call overhead)
- **Power**: Full Python logic (loops, conditionals, data processing)
- **User experience**: AI can say "I'll analyze your followers and follow back small accounts" and do it in one go

---

## Technical Architecture

### JS Proxy Bridge Pattern

```
Python code (in sandbox)
  → bsky_tools.search_posts()        [Python wrapper layer]
  → js_bsky_bridge.searchPosts()     [Pyodide JS interop]
  → Worker postMessage(apiCall)      [Worker → Main Thread]
  → BskyClient.searchPosts()         [Main thread, reuse auth]
  → 返回结果反向传递
```

### Platform-Specific Implementations

#### PWA (PyodideSandbox)

**Mechanism**: Pyodide has built-in `js` module for JS interop

**Files to modify/create**:
1. `packages/pwa/src/services/pyodide.worker.ts`
   - Add `js_bsky_bridge` object to pyodide globals
   - Handle `apiCall` / `apiResult` message types
   - Bridge between Python calls and Worker postMessage

2. `packages/pwa/src/services/pyodide-sandbox.ts`
   - Listen for `apiCall` messages from Worker
   - Call BskyClient methods
   - Return results via postMessage to Worker

3. **New**: `packages/pwa/src/services/bsky-tools-python.ts`
   - Python wrapper module code (injected into Pyodide)
   - Defines `bsky_tools` Python module with all API methods
   - Maps Pythonic naming (snake_case) to JS methods (camelCase)

#### TUI/MCP (NodePythonSandbox)

**Mechanism**: No Pyodide JS interop available. Use stdin/stdout or JSON-RPC bridge.

**Alternative approaches**:

**Option A: JSON-RPC over stdout** (Recommended)
```python
# Python side
import json
print(json.dumps({"method": "search_posts", "params": {"q": "AI", "limit": 100}}))
result = json.loads(input())  # Read result from stdin
```

**Option B: HTTP proxy** (Overkill)
- Start a temporary HTTP server in Node.js
- Python calls `requests.get("http://localhost:PORT/api/search_posts")`
- Requires `requests` library to be installed

**Option C: File-based IPC** (Simple but slow)
- Python writes request to `/workspace/temp/request.json`
- Node.js watches file, processes, writes response
- Python polls for response file

**Decision**: **Option A** for TUI/MCP
- stdin/stdout already used for Python execution
- Simple, no extra dependencies
- Works with existing architecture

**Files to modify/create**:
1. `packages/app/src/services/node-python-sandbox.ts`
   - Wrap Python code with JSON-RPC request/response helpers
   - Parse stdout for JSON-RPC requests
   - Call BskyClient methods
   - Inject results back via stdin

2. **New**: Python wrapper module (injected into Python environment)
   - Reads/writes JSON-RPC via stdin/stdout
   - Provides `bsky_tools` module interface

---

## Implementation Steps

### Step 1: Define `bsky_tools` Python API Surface

**New file**: `packages/core/src/ai/bsky-tools-api.ts`

Define all methods to expose:

```typescript
interface BskyToolsAPI {
  // Read operations
  searchPosts(q: string, limit?: number): Promise<Post[]>;
  getProfile(actor: string): Promise<Profile>;
  getTimeline(limit?: number): Promise<Post[]>;
  getAuthorFeed(actor: string, limit?: number): Promise<Post[]>;
  getPostThread(uri: string, depth?: number): Promise<Thread>;
  getConnections(actor: string, direction: 'following' | 'followers'): Promise<Profile[]>;
  searchActors(q: string, limit?: number): Promise<Profile[]>;
  getLists(actor: string): Promise<List[]>;
  getListFeed(listUri: string): Promise<Post[]>;
  listNotifications(limit?: number): Promise<Notification[]>;
  
  // Write operations (require confirmation)
  createPost(text: string, options?: PostOptions): Promise<{uri: string}>;
  like(uri: string): Promise<void>;
  repost(uri: string): Promise<void>;
  follow(did: string): Promise<void>;
  
  // Utility
  resolveHandle(handle: string): Promise<string>;  // Returns DID
}
```

**Key design decisions**:
- Use simple data types (strings, numbers, arrays) for Python compatibility
- Return plain objects (not class instances)
- Async operations return Promises (mapped to Python asyncio or blocking calls)
- Write operations must respect existing confirmation mechanism

### Step 2: PWA Implementation (Pyodide Bridge)

**New file**: `packages/pwa/src/services/bsky-tools-pyodide.ts`

```typescript
// Python module code as string
const BSKY_TOOLS_PYTHON = `
import js
from typing import List, Dict, Any

class BskyToolsError(Exception):
    pass

class search_posts:
    def __call__(self, q: str, limit: int = 25) -> List[Dict[str, Any]]:
        result = js.bskyBridge.searchPosts(q, limit)
        return result.to_py()

# ... other methods
`;

export function injectBskyTools(pyodide: any, bridge: any) {
  pyodide.globals.set('bskyBridge', bridge);
  pyodide.runPython(BSKY_TOOLS_PYTHON);
}
```

**Modify**: `packages/pwa/src/services/pyodide.worker.ts`
- Add message types: `apiCall`, `apiResult`
- Create bridge object that postMessages to main thread
- Handle `apiResult` responses and resolve pending Python promises

**Modify**: `packages/pwa/src/services/pyodide-sandbox.ts`
- Add `apiCall` listener
- Map method names to BskyClient methods
- Handle errors and return structured responses
- **Critical**: Write operations must go through confirmation gate

### Step 3: TUI/MCP Implementation (JSON-RPC Bridge)

**Modify**: `packages/app/src/services/node-python-sandbox.ts`

Update `wrapCode()` to inject JSON-RPC helpers:

```python
# Injected into every Python execution
import json
import sys

class BskyTools:
    def _call(self, method: str, **kwargs):
        request = {"jsonrpc": "2.0", "method": method, "params": kwargs, "id": 1}
        print("__JSONRPC__" + json.dumps(request))
        sys.stdout.flush()
        
        # Read response from stdin
        response = json.loads(sys.stdin.readline())
        if "error" in response:
            raise Exception(response["error"]["message"])
        return response["result"]
    
    def search_posts(self, q, limit=25):
        return self._call("search_posts", q=q, limit=limit)
    
    # ... other methods

bsky_tools = BskyTools()
```

**Modify**: Node.js side (in `execute()` method)
- Parse stdout for `__JSONRPC__` prefixed lines
- Extract requests, call BskyClient methods
- Write JSON-RPC responses back to Python stdin
- Handle concurrent requests (multiple JSON-RPC calls in one execution)

### Step 4: Write Operation Confirmation

**Critical requirement**: Batch write operations must still respect user confirmation.

**Approach**:
1. AI generates Python code with write operations
2. Before execution, parse Python AST to detect write calls
3. Show confirmation dialog listing all planned writes
4. If confirmed, execute with `BSKY_ENABLE_WRITE` flag
5. If rejected, return error to AI

**Alternative** (simpler):
1. Execute Python normally
2. When a write operation is called, emit `confirmation_needed` event
3. Pause Python execution until user confirms
4. Resume with result

**Decision**: Alternative approach for PWA (async), batch confirmation for TUI/MCP.

### Step 5: Update AI Prompts

**Modify**: `packages/core/src/ai/prompts.ts`

Add instructions about `bsky_tools`:

```
You also have access to a Python library called `bsky_tools` that lets you efficiently batch-call Bluesky API methods:

Available methods:
- bsky_tools.search_posts(q, limit=25) → list of posts
- bsky_tools.get_profile(actor) → profile dict
- bsky_tools.get_timeline(limit=25) → list of posts
- bsky_tools.follow(did) → None
- bsky_tools.create_post(text) → {uri: string}
- ... (full list)

Use bsky_tools when you need to:
1. Process multiple posts/users in a loop
2. Filter/sort data before taking action
3. Perform batch operations (e.g., follow 50 accounts)
4. Analyze data with pandas + Bluesky data

Example:
```python
posts = bsky_tools.search_posts("AI", limit=50)
for post in posts:
    if post['likeCount'] > 100:
        bsky_tools.like(post['uri'])
```

Note: Write operations (create_post, like, repost, follow) still require user confirmation.
```

### Step 6: Error Handling & Timeouts

- **API errors**: Map BskyClient errors to Python exceptions
- **Timeout**: Individual API calls timeout after 10s (configurable)
- **Rate limiting**: Respect Bluesky rate limits, add retry with backoff
- **Partial failure**: If batch of 100 operations fails on #50, report completed + failed

### Step 7: Testing

**Test scenarios**:
1. Simple read: `bsky_tools.search_posts("AI", limit=10)`
2. Batch write: Follow 20 accounts with confirmation
3. Error handling: Invalid DID, rate limit
4. Data analysis: pandas + bsky_tools combined
5. Cross-platform: Same Python code works on PWA and TUI

---

## File Checklist

### New Files

| File | Purpose | Platform |
|------|---------|----------|
| `packages/core/src/ai/bsky-tools-api.ts` | API interface definition | All |
| `packages/core/src/ai/bsky-tools-definitions.ts` | Method signatures + descriptions | All |
| `packages/pwa/src/services/bsky-tools-pyodide.ts` | Pyodide JS bridge + Python wrapper | PWA |
| `packages/app/src/services/bsky-tools-node.ts` | JSON-RPC bridge + Python wrapper | TUI/MCP |
| `docs/BSKY_TOOLS.md` | User-facing documentation with examples | N/A |

### Modified Files

| File | Changes | Platform |
|------|---------|----------|
| `packages/pwa/src/services/pyodide.worker.ts` | Add `apiCall`/`apiResult` handlers | PWA |
| `packages/pwa/src/services/pyodide-sandbox.ts` | Add BskyClient call dispatch | PWA |
| `packages/app/src/services/node-python-sandbox.ts` | Add JSON-RPC parsing + BskyClient dispatch | TUI/MCP |
| `packages/core/src/ai/tools.ts` | Update execute_python description | All |
| `packages/core/src/ai/prompts.ts` | Add bsky_tools usage instructions | All |
| `packages/core/src/ai/python-sandbox.ts` | Add `bsky_tools` injection hook | All |

---

## Key Design Decisions (To Be Confirmed)

### Decision 1: Async Model

**Question**: Should `bsky_tools` methods be blocking or async in Python?

**Options**:
- A) Blocking (simpler, but blocks Python execution)
- B) Async with `asyncio` (complex, requires `await`)
- C) Callback-based (Pythonic? No.)

**Recommendation**: **A) Blocking** for simplicity
- Each API call waits for result
- Simpler Python code for AI to generate
- OK because individual calls are fast (<1s)
- Timeout prevents hanging

### Decision 2: Data Format

**Question**: What format should API results be in?

**Options**:
- A) Raw JSON (as returned by BskyClient)
- B) Simplified dicts (only essential fields)
- C) Pandas DataFrames (for search results)

**Recommendation**: **B) Simplified dicts** with helper for C
- Essential fields only (reduce token usage when printed)
- Provide `to_dataframe()` helper for pandas users
- Example: `posts = bsky_tools.search_posts("AI"); df = bsky_tools.to_dataframe(posts)`

### Decision 3: Write Confirmation in Batches

**Question**: How to handle confirmation for 50 `follow()` calls?

**Options**:
- A) Confirm each individually (too annoying)
- B) Confirm once before execution ("Follow 50 accounts?")
- C) Confirm per-batch with summary

**Recommendation**: **B) Pre-execution confirmation**
- Parse Python AST to detect write operations
- Show summary: "This script will: follow 50 users, like 20 posts"
- Single confirm/cancel
- If cancelled, return error to AI

### Decision 4: Rate Limiting

**Question**: Should we enforce rate limits?

**Options**:
- A) Let Bluesky API return 429 (simplest)
- B) Client-side rate limiting (add delays)
- C) Queue + batch operations

**Recommendation**: **A) Let API handle it** for MVP
- Return 429 errors to Python as exceptions
- AI can catch and retry
- Future: Add client-side smoothing

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Pyodide JS interop complexity | Medium | High | Use simple data types, extensive testing |
| JSON-RPC parser brittleness | Medium | Medium | Use robust delimiter (`__JSONRPC__`), escape handling |
| Write confirmation bypass | Low | Critical | AST parsing + server-side double-check |
| Performance with 100+ calls | Medium | Medium | Add progress reporting, batching |
| Cross-platform code divergence | Medium | High | Shared API definitions in @bsky/core |

---

## Context Recovery Notes

**If this document is the only reference after context compression:**

1. Phase 14 is about enabling AI to batch-call Bluesky API from Python sandbox
2. Uses JS Proxy Bridge (PWA) or JSON-RPC (TUI/MCP)
3. New files: `bsky-tools-api.ts`, `bsky-tools-pyodide.ts`, `bsky-tools-node.ts`
4. Modified files: `pyodide.worker.ts`, `node-python-sandbox.ts`, `tools.ts`, `prompts.ts`
5. Key decision: Blocking API, simplified dicts, pre-execution confirmation
6. Check `docs/PYTHON_SANDBOX_STATUS.md` for Phase 1-13.5 status
7. Check `docs/TODO.md` for feature completion tracking

---

*Created: 2026-05-19 | Status: Planned | Target: Post-v0.14.0 release*
