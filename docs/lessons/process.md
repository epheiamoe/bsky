# Development Process Lessons

> Build processes, testing strategies, and development workflows
>
> Part of the [Lessons Learned](../LESSONS.md) collection.

---

## Lesson 15: Build Order — Commit Before Build for Correct Hash

**Category**: Performance/Development

**Root Cause**: Vite `define: { __COMMIT_HASH__: execSync('git rev-parse HEAD') }` 在 build 时执行。如果先 `git add` + `git commit` 但用之前的 build artifact 部署，hash 就是上次 commit 的。

**Fix**: 流程改为 `git commit` → `pnpm build` → `wrangler deploy`。确保 build 时 HEAD 就是目标 commit。

**Lesson Learned**: 构建时注入的元数据（commit hash、build time）必须在 commit 之后产生，否则与代码不同步。

---

---

## Lesson 60: Incremental Feature Addition in Sandbox Environments

**Category**: Development Process

**Root Cause**: 一次性在 Worker 代码中添加了 5 个复杂功能（stdout 捕获、文件系统、包安装、文件扫描、聊天隔离），导致无法快速定位是哪个功能导致崩溃。

**Context**:
- 从 commit `f481167`（~170 lines Worker 代码）到 `2e69a88`（~300 lines）
- 虽然每个功能单独看都合理，但组合在一起产生了不可预期的交互
- 子代理审查虽然代码语法正确，但无法预测浏览器/WASM 运行时行为

**Lesson Learned**:
1. **Sandbox/Worker 环境特别脆弱** — 错误直接终止整个 Worker，没有部分失败模式
2. **逐个添加功能，每个都测试** — 特别是涉及浏览器 API、WASM、跨域加载的代码
3. **原子化提交不仅是 git 纪律，也是调试需要** — 每次只改一个功能，方便 bisect
4. **最小可工作版本优先** — 先确保基础功能（执行 Python + 返回结果）绝对稳定，再逐步增强

---