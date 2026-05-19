# MCP 错误排查指南

> 本文档帮助排查 Bluesky MCP Server 的常见问题。

## 目录

- [环境变量问题](#环境变量问题)
- [网络连接问题](#网络连接问题)
- [工具调用问题](#工具调用问题)
- [Python 沙箱问题](#python-沙箱问题)
- [写入操作问题](#写入操作问题)

---

## 环境变量问题

### 错误：`BSKY_HANDLE and BSKY_APP_PASSWORD environment variables must be set.`

**原因**：MCP Server 无法读取 Bluesky 认证信息。

**解决方案**：

1. **检查 .env 文件位置**
   - 项目根目录：`E:\Epheia\dev\apps\AI-native-apps\bsky\.env`
   - 当前工作目录：`process.cwd()/.env`

2. **检查变量名**
   - ✅ 正确：`BSKY_HANDLE` 和 `BSKY_APP_PASSWORD`
   - ❌ 错误：`BLUESKY_HANDLE`（旧版 TUI 使用此名称）
   
   如果使用旧版 `.env`，MCP 包装脚本会自动映射：
   ```
   BLUESKY_HANDLE → BSKY_HANDLE
   BLUESKY_APP_PASSWORD → BSKY_APP_PASSWORD
   ```

3. **手动设置环境变量**（PowerShell）
   ```powershell
   $env:BSKY_HANDLE = 'your-handle.bsky.social'
   $env:BSKY_APP_PASSWORD = 'your-app-password'
   $env:BSKY_ENABLE_WRITE = 'true'  # 如需写入操作
   ```

4. **验证环境变量**
   ```powershell
   node -e "console.log(process.env.BSKY_HANDLE)"
   ```

---

## 网络连接问题

### 错误：`ConnectTimeoutError: Connect Timeout Error`

**原因**：无法连接到 bsky.social。

**解决方案**：

1. **检查网络连接**
   ```bash
   ping bsky.social
   ```

2. **使用 VPN**（中国大陆用户）
   - 某些地区无法直接访问 bsky.social
   - 开启 VPN 后重试

3. **指定自定义 PDS**
   ```powershell
   $env:BSKY_PDS = 'https://your-pds.com'
   ```

4. **检查代理设置**
   ```powershell
   # 查看系统代理
   [System.Net.WebRequest]::DefaultWebProxy
   ```

---

## 工具调用问题

### 错误：`Unknown tool: xxx`

**原因**：工具名称拼写错误或未启用。

**解决方案**：

1. **查看可用工具列表**
   ```bash
   opencode mcp list
   ```

2. **检查写入权限**
   - 写入工具（create_post, like, repost, follow, create_list, edit_list_members）需要 `BSKY_ENABLE_WRITE=true`
   - 默认只读，防止意外操作

3. **工具名称对照表**

| 工具名 | 类型 | 需要写入权限 |
|--------|------|-------------|
| execute_python | 读取 | 否 |
| search_posts | 读取 | 否 |
| get_profile | 读取 | 否 |
| create_post | 写入 | ✅ |
| like | 写入 | ✅ |
| repost | 写入 | ✅ |
| follow | 写入 | ✅ |

---

## Python 沙箱问题

### 错误：`ModuleNotFoundError: No module named 'matplotlib'`

**原因**：MCP/TUI 使用系统 Python，第三方库需要手动安装。

**解决方案**：

1. **安装缺失的包**
   ```bash
   pip install pandas numpy matplotlib
   ```

2. **检查已安装的包**
   ```bash
   python -c "import pandas; print(pandas.__version__)"
   ```

3. **PWA vs MCP/TUI 差异**

| 功能 | PWA | MCP/TUI |
|------|-----|---------|
| 第三方包安装 | ✅ 自动（micropip） | ❌ 需手动 pip install |
| matplotlib | ✅ 可用 | ⚠️ 需手动安装 |
| 文件路径 | `/workspace/output/` | `os.environ['BSKY_WORKSPACE']` |

4. **跨平台路径处理**
   ```python
   import os
   workspace = os.environ['BSKY_WORKSPACE']
   output_path = os.path.join(workspace, 'output', 'file.csv')
   ```
   ❌ 不要硬编码：`/workspace/output/file.csv`

### 错误：`PermissionError: Sandbox: Access denied`

**原因**：尝试访问沙箱外的路径。

**解决方案**：
- 只访问 `BSKY_WORKSPACE` 下的目录
- 使用 `os.path.join()` 构建路径
- 不要访问 `/usr`、`C:\Windows` 等系统目录

---

## 写入操作问题

### 错误：`Write tools are disabled. Set BSKY_ENABLE_WRITE=true to enable them.`

**原因**：写入操作默认禁用，防止意外发帖/点赞/关注。

**解决方案**：

1. **启用写入权限**
   ```powershell
   $env:BSKY_ENABLE_WRITE = 'true'
   ```

2. **在 .env 文件中添加**
   ```
   BSKY_ENABLE_WRITE=true
   ```

3. **安全风险提醒**
   - 启用写入后，AI 可以直接发帖、点赞、关注
   - 建议仅在可信环境中启用
   - 生产环境建议保持只读

---

## 调试命令

### 查看 MCP 服务器状态
```bash
opencode mcp list
```

### 测试 MCP 连接
```bash
node packages/mcp/dist/start-with-env.js
```

### 查看环境变量
```powershell
Get-ChildItem Env: | Where-Object { $_.Name -like '*BSKY*' }
```

### 测试 Bluesky API 连接
```bash
node -e "fetch('https://bsky.social/xrpc/com.atproto.server.describeServer').then(r=>r.json()).then(console.log)"
```

---

## 快速检查清单

- [ ] `.env` 文件存在且包含 `BSKY_HANDLE` 和 `BSKY_APP_PASSWORD`
- [ ] 网络可以访问 `bsky.social`（尝试 ping）
- [ ] `BSKY_ENABLE_WRITE` 已设置（如需写入操作）
- [ ] 系统 Python 已安装 pandas/numpy（如需数据分析）
- [ ] opencode.jsonc 配置正确（使用 `packages/mcp/dist/start-with-env.js`）

---

## 相关文档

- [PWA Python 沙箱状态](PYTHON_SANDBOX_STATUS.md)
- [MCP 实现记录](MCP.md)
- [项目 TODO](TODO.md)
