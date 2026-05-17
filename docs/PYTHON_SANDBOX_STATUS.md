# Python Sandbox Status Tracker

## Current State (2025-05-17 14:00 CST)

### Git Status
- **Branch**: `feat/adapter-pattern`
- **Current Commit**: `efd954a` — `chore: remove temporary files`
- **Previous**: `bbfce8e` — `feat: NodePythonSandbox for MCP and TUI with child_process sandboxing`
- **Status**: ✅ **NodePythonSandbox IMPLEMENTED** — MCP and TUI now support Python execution

### Architecture Overview

```
                    PythonSandboxEngine (interface)
                           @bsky/core
                    /              |              \
        PyodideSandbox    NodePythonSandbox    (future: cloud sandbox)
           (PWA)            (MCP + TUI)
        Web Worker         child_process
        Pyodide WASM       System Python
```

### Platform Support

| Platform | Implementation | File | Status |
|----------|---------------|------|--------|
| **PWA** | `PyodideSandbox` (Web Worker + Pyodide WASM) | `packages/pwa/src/services/pyodide-sandbox.ts` | ✅ Base execution works (stdout not captured yet) |
| **MCP** | `NodePythonSandbox` (child_process) | `packages/app/src/services/node-python-sandbox.ts` | ✅ Implemented, needs testing |
| **TUI** | `NodePythonSandbox` (child_process) | `packages/app/src/services/node-python-sandbox.ts` | ✅ Implemented, needs testing |

### NodePythonSandbox Details

**Location**: `packages/app/src/services/node-python-sandbox.ts`

**Features**:
- ✅ `child_process.spawn('python3')` execution
- ✅ Sandboxed filesystem (temp directory per instance)
- ✅ File output scanning (`/workspace/output/`)
- ✅ stdout/stderr capture
- ✅ 30-second timeout
- ✅ `mountFile`/`unmountFile` support
- ✅ Chat isolation via `chatId` parameter

**Security**:
- Each sandbox instance gets a unique temp directory
- Python code is wrapped with filesystem restrictions
- `open()` is monkey-patched to deny access outside workspace
- Process is killed after timeout

**Package structure**:
- `@bsky/app` exports `NodePythonSandbox` via conditional export:
  - `import { NodePythonSandbox } from '@bsky/app/services/node-python-sandbox'`
  - Main `index.ts` does NOT export it (avoids browser bundling issues)

### Registration Points

**MCP**: `packages/mcp/src/server.ts`
```typescript
import { NodePythonSandbox } from '@bsky/app/services/node-python-sandbox';
setGlobalPythonSandbox(new NodePythonSandbox());
```

**TUI**: `packages/tui/src/cli.ts`
```typescript
import { NodePythonSandbox } from '@bsky/app/services/node-python-sandbox';
setGlobalPythonSandbox(new NodePythonSandbox());
```

**PWA**: `packages/pwa/src/components/AIChatPage.tsx`
```typescript
import { PyodideSandbox } from '../services/pyodide-sandbox.js';
setGlobalPythonSandbox(new PyodideSandbox());
```

### Deployment

- **PWA staging**: https://6e574d37.ai-bsky.pages.dev
- **MCP**: Needs manual testing via MCP client
- **TUI**: Needs manual testing via terminal

## Final Goal: AI Batch AT Tool Calls via Python

**Vision**: Enable AI to write Python scripts that batch-call AT Protocol tools.

**Example use case**:
```python
from bsky_tools import search_posts, get_profile, follow

# Find users who posted about "AI" in the last week
posts = search_posts(q="AI lang:en since:2025-05-10", limit=100)

# Get their profiles
for post in posts:
    profile = get_profile(post['author'])
    if profile['followersCount'] < 1000:
        # Follow small accounts interested in AI
        follow(profile['did'])
        print(f"Followed {profile['handle']}")
```

**Implementation plan**:
1. ✅ Python sandbox infrastructure (PWA + MCP + TUI)
2. 🔄 Create `bsky_tools` Python library that wraps AT Protocol API
3. 🔄 Inject `bsky_tools` into Python execution environment
4. 🔄 Add `BskyClient` instance to sandbox context
5. 🔄 Support async operations (since AT tools are async)
6. 🔄 Handle authentication (use existing BskyClient session)

**Status**: Infrastructure complete. Custom library pending.

## Progress Log

### 2025-05-17
- [x] Git stash saved broken state
- [x] Create minimal Worker (subagent)
- [x] Fix double slash path
- [x] Remove unpkg (CORS blocked)
- [x] Commit: `f5d3a54` — v0.14.0 initial
- [x] Deploy to staging
- [x] Add timeout + progress + abort
- [x] Commit: `f481167` — **PWA WORKING baseline**
- [x] Add stdout/stderr capture
- [x] Setup filesystem (/workspace/*)
- [x] Install packages (pandas/numpy/matplotlib)
- [x] Add output file scanning
- [x] Implement chat isolation
- [x] Commit: `2e69a88` — **BROKEN**
- [x] Deploy to staging (60075760)
- [x] Subagent code review
- [x] **BLOCKED**: Worker immediate failure
- [x] Sleep — wait to see if issue is temporary
- [x] Issue persists after 8+ hours
- [x] **ROLLBACK** to `f481167`
- [x] Commit: `c39c839` — **ROLLED BACK**
- [x] Deploy rollback (ce30e42b)
- [x] **Implement NodePythonSandbox** for MCP + TUI
- [x] Commit: `bbfce8e` — NodePythonSandbox
- [x] Deploy updated PWA (6e574d37)
- [ ] Test MCP execute_python
- [ ] Test TUI execute_python
- [ ] Create bsky_tools Python library
