# Phase 14 Complete — Python Sandbox & bsky_tools Library

> **Version**: v0.14.0  
> **Status**: COMPLETE ✅  
> **Branch**: `feat/phase14-bsky-tools` → `main`  
> **Duration**: 2026-05-16 to 2026-05-22 (7 days)  
> **Commits**: 55 commits  
> **Test Coverage**: 51 tests, 95.7% pass rate  
> **Documentation**: `docs/BSKY_TOOLS.md`, `docs/PYTHON_SANDBOX_STATUS.md`, `docs/MCP_TROUBLESHOOTING.md`

---

## Executive Summary

Phase 14 delivered a **Python sandbox execution environment** and the **bsky_tools Python library** across all three platforms (PWA, TUI, MCP). This enables AI to execute Python code for data analysis, batch processing, and bulk API operations — a paradigm shift from individual tool calls to programmatic data pipelines.

**Key Achievement**: Zero handler duplication. All 33 Bluesky API methods are implemented once in `@bsky/core` and reused by PWA (Pyodide), TUI (Node.js child_process), and MCP (Node.js child_process) through a unified `ToolDispatcher` architecture.

---

## Development Timeline

### Day 1 (2026-05-16) — Foundation

**Core Implementation**:
- `bsky-tools-api.ts` — TypeScript interfaces for all 33 methods
- `bsky-tools-definitions.ts` — Tool metadata, Python wrapper generators (Pyodide + Node), AST analysis helpers
- `generatePyodideWrapper()` — Python wrapper for PWA Pyodide environment
- `generateNodeWrapper()` — Python wrapper for TUI/MCP JSON-RPC environment
- `bsky_tools` module registration in `sys.modules`

**PWA Bridge**:
- Synchronous XHR-based API client in Web Worker
- `bsky_tools` Python methods call JS bridge → dispatch to BskyClient

**Commits**:
- `db57c90` feat(core): add bsky_tools API definitions and Python wrappers
- `fcaa2b3` feat(pwa): add bsky_tools Pyodide bridge with sync XHR
- `15fe905` feat(core): add bsky_tools instructions to AI system prompt
- `501abbc` feat(core): update execute_python tool description with bsky_tools
- `56cece7` docs: add BSKY_TOOLS.md user documentation

### Day 2 (2026-05-17) — Integration & Testing

**Features**:
- Write operation confirmation via AST analysis
- Remaining 7 bsky_tools methods implemented in PWA
- Fields parameter filtering
- Response structure fixes

**Commits**:
- `688c124` docs: update CHANGELOG for v0.15.0 bsky_tools release
- `9127c0e` docs: mark Phase 14 as completed in implementation plan
- `239961c` feat(pwa): add write operation confirmation with AST analysis
- `664ac0b` feat(pwa): implement remaining 7 bsky_tools methods
- `5faa347` docs: update BSKY_TOOLS.md with testing findings
- `95b8601` fix(pwa): auto-init, fields, error handling, DID support
- `d6b09e0` fix(tui/mcp): fields string support, DID handling, error propagation
- `6343ab0` docs: update PHASE14_PLAN with post-implementation fixes
- `81f0bd6` fix(pwa): register bsky_tools as real Python module
- `bdd6363` docs: update BSKY_TOOLS.md for real module import

### Day 3 (2026-05-18) — Bug Fixes & Refinement

**Major Fixes**:
- Version number correction (removed premature v0.15.0/v0.16.0)
- `search_posts` fields parameter smart array detection
- `get_feed_generator` response unwrapping
- `get_connections` normalization
- Snake_case parameter naming for Python conventions

**Commits**:
- `80744ee` docs: update BSKY_TOOLS, PHASE14_PLAN, CHANGELOG with testing results and refactor plan
- `0532c44` docs: remove incorrect version numbers
- `bbf8b13` docs: fix version numbers — remove v0.15.0/v0.16.0, merge all into v0.14.0 Unreleased
- `951d9c5` fix(bsky_tools): hotfix fields filtering, JSON parse, feed generator unwrap, connections normalization, snake_case params
- `3f246eb` docs(CONTEXT): update architecture notes for unified ToolDispatcher

### Day 4 (2026-05-19) — Architecture Refactor (Critical)

**Unified ToolDispatcher**:
- PWA Worker no longer hardcodes API handlers
- Worker becomes transport-only: `dispatchToMainThread()` via SharedArrayBuffer + Atomics
- Main thread gets `ToolDispatcher`: routes `{method, params}` to existing handlers
- TUI/MCP `NodePythonSandbox` uses `ToolDispatcher` instead of manual handler map
- DELETED: `packages/pwa/src/services/bsky-tools-pyodide.ts` (old duplicate)

**Infrastructure**:
- COOP/COEP headers for SharedArrayBuffer
- `fetch()` + `eval()` workaround for COEP compatibility
- Dynamic wrapper injection in Worker

**Commits**:
- `ee1f98a` feat(pwa): add COOP/COEP headers for SharedArrayBuffer support
- `2d1361b` fix(pwa): replace importScripts with fetch+eval for COEP compatibility
- `9fa45dd` docs: update PHASE14_PLAN and PHASE14_REFACTOR with testing results and bug fix plan
- `470155e` fix(pwa): fix DataCloneError and TextDecoder SAB issues in Worker transport
- `d984258` docs: update CONTEXT and PHASE14_REFACTOR — fixes applied but issues persist
- `378b593` fix: get_list_feed param name and list_records handle resolution
- `c81ca17` fix(worker): correct result key and add Pyodide proxy serialization
- `87d6bb8` docs: comprehensive update for Phase 14 completion
- `3b8301f` fix(pwa): change COEP from require-corp to credentialless

### Day 5 (2026-05-20) — Security & Polish

**Security Fixes**:
- Write confirmation bypass vulnerability (AST analysis crash → fail-safe)
- Worker `createToolBridge(enableWrite)` as second defense line
- i18n for Python write confirmation dialog

**Enhancements**:
- System prompt optimization for execute_python visibility
- Output file isolation per execution
- Auto matplotlib Agg backend
- Feed API time fields (indexedAt + createdAt)

**Commits**:
- `708c4a3` feat(ai): enhance system prompt with execute_python visibility and bsky_tools response structure
- `62d8b26` fix(security): Python sandbox write confirmation bypass
- `88b4b60` feat(i18n): localize Python sandbox write confirmation dialog
- `2820620` fix(pwa): isolate output files per python execution
- `13a642f` fix(pwa): SyntaxError no longer triggers false write confirmation
- `a49360c` fix(pwa): prevent workspace image flicker during streaming
- `d64dac4` feat: add time fields to feed APIs + auto matplotlib Agg backend
- `fd48fd2` fix(mcp): pass BskyClient to NodePythonSandbox
- `ae758d5` fix(tui): force UTF-8 encoding for Python sandbox on Windows
- `7976b09` fix(app): export getI18nStore for Python sandbox i18n

### Day 6 (2026-05-21) — Testing & Stabilization

**Comprehensive Testing**:
- 51 tests covering all 33 methods
- Fields parameter, edge cases, batch calls
- 95.7% pass rate (44/46, excluding expected exceptions)

**Remaining Fixes**:
- TUI/MCP UTF-8 encoding
- PWA Worker architecture refactor completion
- AST analysis robustness (stdout capture)
- Bridge injection timing (init before initComplete)

**Commits**:
- `625f8a1` docs: update PYTHON_SANDBOX_STATUS for architecture refactor
- `10edfbb` fix(pwa): robust AST analysis via stdout capture
- `cea835d` refactor(pwa): dynamic bsky_tools wrapper injection
- `0272768` refactor(core): generatePyodideWrapper uses sync bridge interface
- `13ad77c` fix(core): generatePyodideWrapper uses Python globals for bridge
- `9a32107` fix(pwa): inject bsky_tools during init (before initComplete)
- `bf16707` docs: update PYTHON_SANDBOX_STATUS for injection timing fix

### Day 7 (2026-05-22) — Final Fixes & Completion

**Critical Fixes**:
- `import bsky_tools` ModuleNotFoundError (missing sys.modules registration in NodeWrapper)
- Pyodide proxy parameter loss (Map vs Object)
- Optional parameter defaults (keyword-only + None defaults)
- System prompt consistency (examples, parameter names)

**Verification**:
- MCP live testing: all read operations ✅
- Write operation (create_post) with BSKY_ENABLE_WRITE ✅
- PWA staging deployment ✅
- TUI build passes ✅

**Commits**:
- `bf75510` fix(core): register bsky_tools in sys.modules for import support
- `bf551b7` fix(pwa): toPlainJs handles Pyodide dict->Map conversion + robustness
- `5183b2f` fix(pwa): convert Pyodide proxy params + force keyword args in Python wrapper
- `a052469` fix(core): optional params default to None + keyword-only + prompt updates
- `44c4134` fix(core): prompts and tools description consistency
- `b7fa73b` fix(core): add sys.modules registration to generateNodeWrapper

---

## Architecture Evolution

### Initial Design (Day 1-2)

```
PWA: Python wrapper → JS bridge → sync XHR → BskyClient (in Worker)
TUI/MCP: Python wrapper → JSON-RPC → manual handler map → BskyClient
```

**Problem**: Handler logic duplicated between PWA (Worker) and TUI/MCP.

### Refactored Design (Day 4+)

```
All Platforms:
  Python wrapper → bridge → ToolDispatcher → tools.ts handlers → BskyClient
  
PWA:  Worker (transport) → SAB + Atomics → Main Thread (ToolDispatcher)
TUI/MCP: Python process (JSON-RPC) → NodePythonSandbox (ToolDispatcher)
```

**Benefits**:
- Single source of truth for all 33 handlers
- Changes to API logic apply to all platforms instantly
- Testing is unified (test handlers once, not per-platform)

---

## Key Technical Decisions

### 1. SharedArrayBuffer + Atomics.wait/notify

**Why**: Pyodide runs synchronously. Python `bsky_tools.get_profile()` must block until the API response returns.

**Solution**: 
- Worker allocates SharedArrayBuffer
- Main thread receives `toolCall` message, executes handler, writes JSON result to SAB
- Worker `Atomics.wait()` blocks until main thread `Atomics.notify()`

**Trade-off**: Requires COOP/COEP headers, complicates cross-origin resource loading.

### 2. COEP `credentialless` (not `require-corp`)

**Why**: `require-corp` broke all images from `cdn.bsky.app` (Bluesky CDN has no CORP header).

**Solution**: `Cross-Origin-Embedder-Policy: credentialless` — enables SAB while allowing cross-origin images without CORP.

### 3. Dynamic Wrapper Injection

**Why**: Hardcoding wrapper code in Worker duplicates logic, causes version skew.

**Solution**: `generatePyodideWrapper()` in `@bsky/core` generates wrapper dynamically. Worker receives wrapper code via `postMessage` during init.

**Benefit**: Single source of truth for wrapper logic.

### 4. ToolDispatcher with `fields` Filtering

**Why**: `fields` parameter needs to filter response data, not API request.

**Solution**: ToolDispatcher applies `filterFields()` after handler returns, before sending to Python.

**Benefit**: Consistent filtering across all platforms without modifying handlers.

### 5. AST Analysis for Write Confirmation

**Why**: Python `bsky_tools.create_post()` needs user confirmation before executing.

**Solution**: Pre-execution AST analysis detects `bsky_tools.create_post(...)` calls. If found, return confirmation request instead of executing.

**Security**: Fail-safe — AST analysis errors default to `hasWriteOperations: true`, forcing confirmation.

### 6. Keyword-Only Parameters

**Why**: Positional arguments caused parameter order confusion (e.g., `get_timeline(None, 3)` parsed as `cursor=None, limit=3` instead of `limit=3`).

**Solution**: All methods use `def method(self, *, ...)` forcing keyword arguments.

**Benefit**: Eliminates parameter order confusion entirely.

---

## Bug Chronicle

### Critical Bugs

| # | Bug | Impact | Root Cause | Fix |
|---|-----|--------|------------|-----|
| 1 | Write confirmation bypass | **Security** — AI could post without confirmation | AST analysis crashed on invalid code, return value undefined → falsy | Fail-safe: errors default to `hasWriteOperations: true` + Worker gate |
| 2 | Pyodide proxy params lost | All API calls return 400/empty | `Object.entries(Map)` returns `[]`, all kwargs lost | `toPlainJs()` with `dict_converter: Object.fromEntries` |
| 3 | `import bsky_tools` fails | Python library unusable | Missing `sys.modules` registration in NodeWrapper | Add `sys.modules['bsky_tools'] = bsky_tools` |
| 4 | COEP breaks images | All images from CDN fail | `require-corp` requires CORP header on CDN | Change to `credentialless` |
| 5 | Optional params become required | All `cursor`/`reply_to` etc. mandatory | `*` keyword-only + no default = required | Auto-generate `=None` for optional params without defaults |
| 6 | Wrapper injection timing race | ModuleNotFoundError on first execute | Wrapper injected after `initComplete`, execute arrives first | Inject during init, before `initComplete` |

### Testing Statistics

- **Total tests**: 51
- **Pass rate**: 95.7% (44/46, excluding expected exceptions)
- **Rounds**: 16 testing rounds over 7 days
- **Regression tests**: 5 (matplotlib, encoding, write confirmation, fields, API methods)

---

## File Impact

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/ai/bsky-tools-api.ts` | TypeScript interfaces + `filterFields()` |
| `packages/core/src/ai/bsky-tools-definitions.ts` | Tool metadata + wrapper generation + AST analysis |
| `packages/core/src/ai/tool-dispatcher.ts` | Unified tool dispatch layer (PWA/TUI/MCP) |
| `packages/pwa/src/services/pyodide.worker.ts` | Web Worker: Pyodide loader + SAB transport |
| `packages/pwa/src/services/pyodide-sandbox.ts` | Main thread: ToolDispatcher + SAB communication |
| `docs/BSKY_TOOLS.md` | User-facing API documentation |
| `docs/PYTHON_SANDBOX_STATUS.md` | Implementation status tracker |
| `docs/MCP_TROUBLESHOOTING.md` | MCP error diagnosis guide |
| `docs/PHASE14_REFACTOR.md` | Refactor plan + testing results |

### Modified Files (Key)

| File | Changes |
|------|---------|
| `packages/core/src/ai/tools.ts` | `execute_python` handler, `create_post` handler updates |
| `packages/core/src/ai/prompts.ts` | bsky_tools usage guide, examples, response structure |
| `packages/core/src/index.ts` | Export `generatePyodideWrapper`, `generateNodeWrapper`, `ToolDispatcher` |
| `packages/pwa/public/_headers` | COOP + COEP:credentialless |
| `packages/app/src/services/node-python-sandbox.ts` | ToolDispatcher integration, `sys.modules` registration |
| `packages/mcp/src/server.ts` | Pass BskyClient to NodePythonSandbox |

### Deleted Files

| File | Reason |
|------|--------|
| `packages/pwa/src/services/bsky-tools-pyodide.ts` | Duplicate implementation, superseded by unified ToolDispatcher |

---

## Lessons Learned

### Architecture

1. **Transport != Handler**: Worker should only handle transport (SAB/JSON-RPC), not implement API logic. This separation enabled the unified architecture.
2. **Single Source of Truth**: Having `BSKY_TOOLS` metadata in one file (`bsky-tools-definitions.ts`) generates wrappers for all platforms automatically.
3. **Fail-Safe Security**: When security analysis (AST) fails, default to the safest option (require confirmation) rather than the most permissive.

### Pyodide / WASM

4. **Proxy Objects Are Treacherous**: Pyodide `dict.toJs()` returns `Map`, not plain `Object`. `Object.entries(Map)` silently returns `[]`.
5. **COEP is Complex**: `require-corp` breaks more than it fixes. `credentialless` is the pragmatic choice for apps loading cross-origin media.
6. **SAB + Atomics Pattern**: This is the only reliable way to do synchronous JS→Python calls in a Worker. Promises don't work across the WASM boundary.

### API Design

7. **Keyword-Only Parameters**: Python's `*,` syntax eliminates an entire class of parameter order bugs.
8. **Optional Params Need Defaults**: Marking a parameter `required: false` without a `default` value makes it required in Python keyword-only signatures.
9. **Parameter Naming Consistency**: System prompt examples must match actual Python wrapper parameter names (snake_case, not camelCase).

### Testing

10. **Integration Testing > Unit Testing**: The most bugs were found at the Python↔JS boundary, not in individual functions.
11. **Deploy Early, Test Often**: Staging deployments caught environment-specific bugs (COEP, CDN headers) that local testing missed.

---

## Future Work

### Deferred Features

- **TUI WidgetOverlay**: SuggestedFollows, SuggestedFeeds, Trends, ProfilePreview widgets deferred to v0.15.0+
- **Cloud Sandbox**: Future support for cloud-based Python execution (not WASM or local process)
- **Package Auto-Install for TUI/MCP**: Currently requires manual `pip install pandas numpy matplotlib`
- **Advanced Data Visualization**: Interactive charts, 3D plotting

### Known Limitations

- `get_popular_feed_generators` returns `{feeds, cursor}` instead of direct list
- `get_post_thread` format="flat" returns human-readable string (not structured JSON)
- PWA matplotlib Chinese fonts: requires manual font installation in Pyodide
- TUI/MCP: no native confirmation dialog for write operations (gated by env var only)

---

## Acknowledgments

This phase was developed iteratively with extensive user testing and feedback. The architecture evolved significantly from Day 1 to Day 7, with critical refactors driven by real-world testing failures rather than theoretical design.

**Key Insight**: The initial design (separate handler layers per platform) was fundamentally flawed. The refactor to a unified `ToolDispatcher` on Day 4 was the turning point that made the system maintainable and testable.

---

*Document archived as project record. For current documentation, see `docs/CONTEXT.md`, `docs/BSKY_TOOLS.md`, `docs/PYTHON_SANDBOX_STATUS.md`.*
