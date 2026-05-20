# Python Sandbox Status Tracker

> **Version**: v0.14.0 — Development (Phase 14 in progress)
> **Last Updated**: 2026-05-20

## Known Architecture Decisions

### COEP + fetch workaround for Pyodide loading

**Problem**: Adding `Cross-Origin-Embedder-Policy: require-corp` enables `SharedArrayBuffer` (needed for Worker↔Main Thread sync communication), but blocks `importScripts()` for cross-origin CDN resources without CORP headers.

**Solution**: Use `fetch(url, {mode: 'cors'})` + `(0, eval)(code)` instead of `importScripts()` in the Web Worker. This is compatible with COEP while allowing Pyodide loading from jsdelivr CDN.

**Files**:
- `packages/pwa/public/_headers` — COOP/COEP headers
- `packages/pwa/src/services/pyodide.worker.ts` — fetch+eval loader

**Trade-offs**:
- ✅ Enables SharedArrayBuffer for sync Worker↔Main Thread communication
- ✅ Unified ToolDispatcher architecture (single source of truth)
- ⚠️ Requires COEP headers on all responses
- ⚠️ All cross-origin resources must support CORS

## Overview

The Python Sandbox is a core v0.14.0 feature that enables AI to execute Python code for data analysis, batch processing, statistics, and plotting. It is implemented across three platforms with a unified architecture.

## Architecture

```
                    PythonSandboxEngine (interface)
                           @bsky/core
                    /              |              \
         PyodideSandbox    NodePythonSandbox    (future: cloud sandbox)
            (PWA)            (MCP + TUI)
         Web Worker         child_process
         Pyodide WASM       System Python
         Vite ?worker       child_process.spawn
```

### Platform Support

| Platform | Implementation | File | Status |
|----------|---------------|------|--------|
| **PWA** | `PyodideSandbox` (Web Worker + Pyodide WASM) | `packages/pwa/src/services/pyodide-sandbox.ts` | ✅ Production ready — stdout ✅ filesystem ✅ file scanning ✅ executionTime ✅ mountFile/unmountFile ✅ third-party packages (micropip) ✅ matplotlib Chinese fonts |
| **MCP** | `NodePythonSandbox` (child_process) | `packages/app/src/services/node-python-sandbox.ts` | ✅ Implemented — WorkspaceStorage fixed (2026-05-19), getChatId + assistant context fixed, BSKY_WORKSPACE env var |
| **TUI** | `NodePythonSandbox` (child_process) | `packages/app/src/services/node-python-sandbox.ts` | ✅ Implemented — ThinkingCard + ToolCard + PythonResult + WorkspaceModal + WidgetOverlay |

---

## Implementation Phases

### Phase 1-10: PWA Foundation ✅

All PWA-specific features completed:
- **Phase 1**: Python-level stdout/stderr capture
- **Phase 2**: Filesystem setup (`/workspace/data`, `/workspace/output`, `/workspace/temp`)
- **Phase 3**: Output file scanning with `pyodide.FS`
- **Phase 4**: Third-party package installation via micropip (pandas, numpy, matplotlib, beautifulsoup4, pyyaml, openpyxl, scipy, scikit-learn)
- **Phase 5**: executionTime calculation
- **Phase 6**: mountFile/unmountFile
- **Phase 7**: Matplotlib Chinese font support (Noto Sans CJK SC from jsDelivr CDN)
- **Phase 8**: Vite `?worker` import (fixed string escaping issues)
- **Phase 9**: Service Worker POST caching fix
- **Phase 10**: UI expand/collapse event propagation fix

### Phase 11: Workspace File Isolation ✅

**Status**: COMPLETED (2026-05-18)

Unified data flow across PWA + TUI + MCP:
- Sandbox layer saves files to WorkspaceStorage after execution
- Tool handler returns metadata-only JSON (no content) to AI
- UI loads files from WorkspaceStorage by chatId
- Strict chatId isolation (no global files leak)
- Orphan cleanup for legacy files without chatId

**Critical bugs fixed**:
- Stale closure in `AIChatPage.tsx` handleFileSelect (sessionId dependency)
- chatId propagation through `tools.ts` execute_python handler
- Binary file read with `encoding: 'binary'` in pyodide.worker.ts
- MIME type mapping for workspace file downloads

### Phase 12: Binary File Content ✅

**Status**: COMPLETED (2026-05-18)

Fixed `pyodide.FS.readFile(path)` default string return causing binary file corruption. Now uses `encoding: 'binary'` to get Uint8Array.

### Phase 13: AI Workspace Image References ✅

**Status**: COMPLETED (2026-05-18)

AI can reference workspace images using Markdown `![]()` syntax:
- `WorkspaceImage` component loads images from workspace storage
- `AssistantMessage` detects workspace image references in markdown
- Supports: `![desc](filename.png)` and `![desc](/workspace/output/filename.png)`

### Phase 13.5: TUI + MCP Synchronization ✅

**Status**: COMPLETED (2026-05-19)

**TUI additions**:
- `FileWorkspaceStorage` with strict chatId isolation + orphan cleanup
- `NodePythonSandbox` integrated with workspace storage
- `PythonResult` component (Ink) — workspace file loading, executionTimestamp filtering
- `WorkspaceModal` component (Ink) — file upload/download/delete/preview
- `ThinkingCard` component (Ink) — expandable thinking display
- `ToolCard` component (Ink) — 31 tool formatting, PythonResult integration
- Message grouping in `AIChatView` — tool_call/tool_result pairing
- `WidgetOverlay` — full-screen modal, `w` key, AIChat + Polish widgets

**MCP fixes**:
- `getChatId` passing and `assistant` context in tool calls
- WorkspaceStorage initialization (fixes file persistence)
- Updated execute_python tool description for cross-platform paths
- Added third-party package disclaimer for MCP/TUI mode
- Created `MCP_TROUBLESHOOTING.md` error diagnosis guide

**Deferred** (marked as TODO):
- SuggestedFollowsWidget
- SuggestedFeedsWidget
- TrendsWidget
- ProfilePreviewWidget

### Phase 14: AI Batch AT Tool Calls ⏳

**Status**: PLANNED — Next major feature after v0.14.0 release

**📄 Full implementation plan**: `docs/PHASE14_PLAN.md` — Complete technical specification with architecture decisions, file checklist, and risk assessment

**Vision**: Enable AI to write Python scripts that batch-call AT Protocol tools

**Example**:
```python
from bsky_tools import search_posts, get_profile, follow
posts = search_posts(q="AI", limit=100)
for post in posts:
    profile = get_profile(post['author'])
    if profile['followersCount'] < 1000:
        follow(profile['did'])
        print(f"Followed {profile['handle']}")
```

**Technical approach**: JS Proxy Bridge (PWA) / JSON-RPC (TUI/MCP)
- **PWA**: Pyodide `js` interop module → Worker postMessage → BskyClient
- **TUI/MCP**: JSON-RPC over stdin/stdout → BskyClient

**Key design decisions** (see PHASE14_PLAN.md for details):
- Blocking API calls (not async) for simplicity
- Simplified dict results (not raw JSON) for token efficiency
- Pre-execution confirmation for batch write operations
- Let Bluesky API handle rate limiting (client-side in future)

**Implementation steps**:
1. Define `bsky_tools` Python API surface in `@bsky/core`
2. PWA: Pyodide JS bridge + Python wrapper injection
3. TUI/MCP: JSON-RPC bridge in NodePythonSandbox
4. Write operation confirmation (batch summary before execution)
5. Update AI prompts with `bsky_tools` usage instructions
6. Error handling, timeouts, and testing

---

## PWA Test Results (2025-05-17)

| Test Item | Result |
|-----------|--------|
| Python Version | 3.11.3 (Pyodide WASM) |
| Platform | Emscripten-3.1.46-wasm32-32bit |
| Standard Libraries | 13/13 pass (json, math, statistics, csv, io, pathlib, datetime, re, collections, itertools, random, os, sys) |
| Third-party Packages | 8/8 pass (pandas 1.5.3, numpy 1.26.1, matplotlib 3.5.2, beautifulsoup4, pyyaml, openpyxl, scipy 1.11.2, scikit-learn 1.3.1) |
| Filesystem | `/workspace/output`, `/workspace/temp`, `/workspace/data` readable/writable |
| stdout/stderr Capture | ✅ Python-level redirection |
| Execution Time | ✅ Date.now() measurement |
| Output File Scanning | ✅ pyodide.FS.readdir + readFile |
| mountFile/unmountFile | ✅ pyodide.FS.writeFile/unlink |
| Cross-library | ✅ pandas + sklearn + openpyxl + yaml + matplotlib |

### Known Limitations

| Platform | Limitation | Workaround |
|----------|-----------|------------|
| **PWA** | No network requests (requests/urllib unavailable, WebAssembly limit) | Use `returnValue` for computation results |
| **PWA** | No subprocess support (WebAssembly limit) | N/A |
| **MCP/TUI** | Third-party packages not auto-installed | Pre-install with `pip install pandas numpy matplotlib` |
| **MCP/TUI** | Matplotlib may not be available | Install manually: `pip install matplotlib` |
| **All** | 30-second timeout per execution | Break tasks into smaller chunks |

---

## Cross-Platform Path Handling

### PWA (Browser)
```python
# Pyodide WASM — virtual filesystem
df = pd.read_csv('/workspace/data/sales.csv')
df.to_csv('/workspace/output/result.csv')
```

### MCP/TUI (Node.js)
```python
import os
workspace = os.environ['BSKY_WORKSPACE']  # Points to output/{chatId} directory
# Use os.path.join for cross-platform compatibility
filepath = os.path.join(workspace, 'result.csv')
df.to_csv(filepath)
```

**Important**: Always use `os.path.join()` and `os.environ['BSKY_WORKSPACE']` for MCP/TUI compatibility. Hard-coded `/workspace/output/` paths will fail on Windows.

---

## Key Lessons Learned

1. **Incremental changes**: Adding 5 features at once made debugging impossible
2. **Test each commit**: Every change must be tested before next change
3. **Baseline first**: Always have a known-working version to rollback to
4. **Vite ?worker over Blob URL**: Template string escaping in bundled Worker code causes SyntaxError
5. **Package installation batches**: Install heavy packages separately with longer timeouts
6. **FS.readFile encoding matters**: Pyodide's Emscripten FS defaults to string; binary files require explicit `{ encoding: 'binary' }`
7. **Tools should not carry binary content**: AI messages with base64 content waste tokens; store files in workspace, pass metadata only
8. **executionTimestamp filtering**: Only show files created during the current execution by comparing timestamps
9. **Unified architecture**: PWA + TUI + MCP should share the same file storage abstraction (WorkspaceStorage)
10. **Environment variable naming**: `BLUESKY_HANDLE` (TUI) vs `BSKY_HANDLE` (MCP) — provide mapping layer

---

## Related Documentation

- [MCP Troubleshooting Guide](MCP_TROUBLESHOOTING.md) — Error diagnosis for MCP server
- [MCP Implementation Record](MCP.md) — Architecture and integration details
- [TODO.md](TODO.md) — Feature completion status
- [Architecture Overview](ARCHITECTURE.md) — System architecture and dependency flow

---

*Part of v0.14.0 Python Sandbox feature. Last updated: 2026-05-19*
