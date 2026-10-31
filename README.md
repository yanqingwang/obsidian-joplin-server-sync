# Joplin Server Sync

[English](#english) | [中文](#中文)

---

## English

Bidirectional sync between Obsidian and a [Joplin Server](https://github.com/laurent22/joplin) instance. Keeps your notes, folders, and attachments in sync across multiple devices, with optional end-to-end encryption.

### Features

- **Bidirectional sync** — notes, folders, and attachments sync in both directions using the Joplin Server delta API
- **Attachments** — files are synced as Joplin resources and restored on the other side
- **End-to-end encryption (E2EE)** — optionally encrypt everything (notes, folders, attachments) before upload, using the official Joplin E2EE protocol. Enabled with one toggle + password, and verified against the master keys already stored on the server (one account, one password, no duplicate key generation)
- **Multi-client consistency** — every local file carries a stable `joplin-file-id` in its frontmatter, and a persistent change log drives conflict-free merge across multiple syncing clients
- **True three-way merge** — the last-synced body of every note is persisted, so edits to different regions of the same note merge automatically; only genuinely overlapping edits fall back to the conflict strategy
- **Destructive-op protection** — `Force push` / `Force pull` require a typed vault-name confirmation (toggleable), and a force pull that would shrink the vault far below its mapped size is blocked (wrong sync target / wiped server), *before* any local file is deleted
- **Delete vs. edit safety** — a note deleted on the server while it was edited locally is kept locally and re-uploaded instead of being destroyed
- **Folder & file moves/renames** — moving or renaming files and folders in Obsidian propagates to the server and to other clients
- **Conflict resolution** — duplicate, local-wins, or remote-wins strategies; three-way auto-merge for compatible changes
- **Force sync** — `Force push` wipes the server (protecting `info.json` and E2EE master keys) then re-uploads everything; `Force pull` wipes local files then re-downloads everything
- **Resilient transport** — per-request timeouts, jittered exponential backoff, 401 re-auth, an adaptive concurrency gate that speeds up on healthy servers and backs off on 429/5xx, and credentials/session tokens redacted from all logs
- **Sync history** — a settings panel table shows every sync cycle with created/updated/deleted/failed counts
- **Link & tag conversion** — Obsidian wiki-links and tags are converted to Joplin-compatible Markdown on upload and back on download
- **Exclude patterns** — skip paths (e.g. `.obsidian/`, `_conflicts/`, `templates/`) via comma-separated prefixes

### Installation

#### From Obsidian Community Plugins

1. Open **Settings → Community plugins → Browse**
2. Search for **Joplin Server Sync**
3. Install and enable the plugin

#### Manual / BRAT

1. Install [BRAT](https://obsidian.md/plugins?id=obsidian42-brat)
2. Add the repository: `yanqingwang/obsidian-joplin-server-sync`

#### Manual

Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/yanqingwang/obsidian-joplin-server-sync/releases) and place them in your vault at `.obsidian/plugins/joplin-server-sync/`.

### Setup

1. Open **Settings → Joplin Server Sync**
2. Enter your **Server URL** (e.g. `https://joplin.example.com` — without `/api`)
3. Enter your **email** and **password** for the Joplin Server account
4. Click **Test connection** to verify
5. Optional: enable **End-to-end encryption** and set the E2EE password (must match the password of the Joplin account; existing master keys are loaded and verified, never duplicated)
6. Run **Sync now** from the command palette, or use the **Force push / Force pull** commands for a full reset

### Commands

| Command | Description |
|---------|-------------|
| Sync now | Run a bidirectional sync cycle (push then pull) |
| Force push | Delete server items (keeps `info.json` and E2EE master keys), then upload the entire vault |
| Force pull | Delete local files (keeps the plugin config), then download the entire server |
| Test Joplin Server connection | Verify login credentials |
| Upload vault to Joplin Server | Initial upload of all notes |
| About / Status | Show mapping statistics |

### Settings

| Setting | Description |
|---------|-------------|
| Server URL | Joplin Server base URL (without `/api`) |
| Email / Password | Joplin Server account credentials (password stored in plugin `data.json`) |
| Auto sync interval | Seconds between automatic syncs. `0` = manual only (min 60) |
| Sync on startup | Run a sync when Obsidian starts |
| Confirm force push / force pull | Ask for a typed vault-name confirmation before overwriting the server or the local vault |
| Conflict strategy | `Duplicate`, `Local wins`, or `Remote wins` |
| Sync folders only | Sync folder structure only, no note content (useful for testing) |
| Exclude patterns | Comma-separated path prefixes to skip |
| Enable E2EE | Toggle end-to-end encryption (requires a password; loads and verifies server master keys) |
| E2EE password | Password used to encrypt/decrypt items |
| Load E2EE keys | Load master keys from the server using the E2EE password |

### E2EE notes

- Encryption follows the official Joplin E2EE protocol (`JED01` header, master keys, SJCL-compatible AES/KeyV1/FileV1/StringV1 item types).
- With E2EE enabled, the server only ever stores ciphertext — no plaintext leaks to the server.
- One account uses exactly one E2EE password. When enabled, the plugin verifies the password against the master keys already on the server and never generates a new master key if any exist.
- All syncing clients must use the same E2EE password. If one client disables E2EE, run a **Force push** from that client to overwrite the server with plaintext (this deletes the encrypted server data).

### Development

```bash
git clone https://github.com/yanqingwang/obsidian-joplin-server-sync
cd obsidian-joplin-server-sync
npm install
npm run dev
npm run build
```

Run the offline test suites (no server needed):

```bash
# reliability regressions: delete-vs-edit safety, blob-only delta pull,
# incomplete-server guard, changelog durability, three-way merge, redaction
npx esbuild test/reliability.test.ts --bundle --platform=node --format=cjs \
  --alias:obsidian=./test/mock/obsidian.ts --outfile=test/reliability-out.cjs --log-level=error
node test/reliability-out.cjs

# E2EE protocol vectors
npx esbuild test/e2ee.test.ts --bundle --platform=node --format=esm --outfile=test/e2ee-out.mjs --log-level=error
node test/e2ee-out.mjs

# force push → server → force pull round-trip (in-memory mock server)
npx esbuild test/run.ts --bundle --platform=node --format=cjs \
  --alias:obsidian=./test/mock/obsidian.ts --outfile=test/run-out.cjs --log-level=error
node test/run-out.cjs
```

The suites under `test/*.test.ts` that import `test/mock/obsidian-real.ts` drive a REAL Joplin Server (credentials read from a local vault) and are used for release verification.

### Issues & Feedback

- GitHub Issues: <https://github.com/yanqingwang/obsidian-joplin-server-sync/issues>
- Email: wangyantsing@qq.com

When reporting an issue, please include your Obsidian version, the plugin version, a description or screenshot of the problem, and what you expected to happen.

### License

MIT

Copyright (c) 2026 rosswang (Heart and Road Ltd)

---

## 中文

在 Obsidian 与 [Joplin Server](https://github.com/laurent22/joplin) 之间双向同步，让笔记、文件夹和附件在多台设备间保持一致，支持可选的端到端加密。

### 功能特点

- **双向同步** — 基于 Joplin Server delta API，笔记、文件夹、附件双向同步
- **附件** — 文件作为 Joplin 资源（resource）同步，在另一端自动还原
- **端到端加密（E2EE）** — 可选：上传前加密全部内容（笔记、文件夹、附件），采用 Joplin 官方 E2EE 协议。一个开关 + 密码即可开启，并与服务器上已有的主密钥校验（一个账号一个密码，不会重复生成密钥）
- **多客户端一致性** — 每个本地文件在 frontmatter 中携带稳定的 `joplin-file-id`，配合持久化变更日志，多客户端同步无冲突合并
- **真正的三方合并** — 每篇笔记的上次同步正文都会持久化，同一笔记不同区域的修改自动合并；只有真正重叠的修改才走冲突策略
- **破坏性操作保护** — `强制推送` / `强制拉取` 需要输入库名确认（可关闭）；强制拉取若会把库缩减到远小于映射规模（同步目标错误 / 服务器被清空）会被直接阻止，*先于* 任何本地文件被删除
- **删除与编辑安全** — 本地正在编辑的笔记在服务器端被删除时，本地保留并重新上传，不会被销毁
- **文件夹与文件的移动/重命名** — 在 Obsidian 中移动或重命名文件与文件夹会传播到服务器和其他客户端
- **冲突解决** — 可选「复制为冲突文件 / 本地优先 / 远程优先」策略；兼容性修改自动三方合并
- **强制同步** — `强制推送` 清空服务器（保留 `info.json` 与 E2EE 主密钥）后全量上传；`强制拉取` 清空本地文件后全量下载
- **可靠传输** — 逐请求超时、带抖动的指数退避、401 自动重认证、自适应并发闸门（服务器健康时加速，429/5xx 时退避），日志中凭证与会话令牌一律脱敏
- **同步历史** — 设置面板中的表格展示每次同步周期的创建/更新/删除/失败计数
- **链接与标签转换** — 上传时将 Obsidian wiki 链接和标签转换为 Joplin 兼容的 Markdown，下载时转换回来
- **排除规则** — 通过逗号分隔的前缀跳过指定路径（如 `.obsidian/`、`_conflicts/`、`templates/`）

### 安装

#### 从 Obsidian 社区插件市场

1. 打开 **设置 → 第三方插件 → 浏览**
2. 搜索 **Joplin Server Sync**
3. 安装并启用

#### 手动 / BRAT

1. 安装 [BRAT](https://obsidian.md/plugins?id=obsidian42-brat)
2. 添加仓库：`yanqingwang/obsidian-joplin-server-sync`

#### 手动

从[最新 release](https://github.com/yanqingwang/obsidian-joplin-server-sync/releases) 下载 `main.js`、`manifest.json`、`styles.css`，放入库中 `.obsidian/plugins/joplin-server-sync/` 目录。

### 配置

1. 打开 **设置 → Joplin Server Sync**
2. 填写**服务器地址**（如 `https://joplin.example.com` — 不带 `/api`）
3. 填写 Joplin Server 账号的**邮箱**和**密码**
4. 点击 **测试连接** 验证
5. 可选：开启**端到端加密**并设置 E2EE 密码（必须与 Joplin 账号密码一致；已有的主密钥会被加载校验，绝不重复生成）
6. 在命令面板执行 **立即同步**，或使用 **强制推送 / 强制拉取** 进行全量重置

### 命令

| 命令 | 说明 |
|---------|-------------|
| 立即同步（Sync now） | 执行一轮双向同步（先推送后拉取） |
| 强制推送（Force push） | 删除服务器条目（保留 `info.json` 与 E2EE 主密钥），然后上传整个库 |
| 强制拉取（Force pull） | 删除本地文件（保留插件配置），然后下载整个服务器 |
| 测试 Joplin 服务器连接 | 校验登录凭证 |
| 上传库到 Joplin 服务器 | 首次上传全部笔记 |
| 关于 / 状态 | 显示映射统计 |

### 设置项

| 设置项 | 说明 |
|---------|-------------|
| 服务器地址 | Joplin Server 基础 URL（不带 `/api`） |
| 邮箱 / 密码 | Joplin Server 账号凭证（密码保存在插件 `data.json` 中） |
| 自动同步间隔 | 自动同步的间隔秒数，`0` = 仅手动（最小 60） |
| 启动时同步 | Obsidian 启动时执行一次同步 |
| 强制操作确认 | 覆盖服务器或本地库前要求输入库名确认 |
| 冲突策略 | `复制为冲突文件（Duplicate）`、`本地优先（Local wins）`、`远程优先（Remote wins）` |
| 仅同步文件夹 | 只同步文件夹结构，不含笔记内容（适合测试） |
| 排除规则 | 逗号分隔的路径前缀，命中的路径跳过 |
| 启用 E2EE | 开关端到端加密（需要密码；加载并校验服务器主密钥） |
| E2EE 密码 | 用于加解密条目的密码 |
| 加载 E2EE 密钥 | 用 E2EE 密码从服务器加载主密钥 |

### E2EE 说明

- 加密遵循 Joplin 官方 E2EE 协议（`JED01` 头、主密钥、SJCL 兼容的 AES/KeyV1/FileV1/StringV1 条目类型）。
- 开启 E2EE 后，服务器上只存储密文——明文不会泄漏到服务器。
- 一个账号对应唯一一个 E2EE 密码。开启时插件会用服务器上已有的主密钥校验密码，只要存在主密钥就绝不生成新的。
- 所有同步客户端必须使用同一个 E2EE 密码。如果某个客户端关闭了 E2EE，请从该客户端执行 **强制推送**，以明文覆盖服务器（这会删除服务器上的加密数据）。

### 开发

```bash
git clone https://github.com/yanqingwang/obsidian-joplin-server-sync
cd obsidian-joplin-server-sync
npm install
npm run dev
npm run build
```

运行离线测试套件（无需服务器）：

```bash
# 可靠性回归：删除与编辑安全、blob-only 增量拉取、
# 服务器数据不完整保护、变更日志持久化、三方合并、日志脱敏
npx esbuild test/reliability.test.ts --bundle --platform=node --format=cjs \
  --alias:obsidian=./test/mock/obsidian.ts --outfile=test/reliability-out.cjs --log-level=error
node test/reliability-out.cjs

# E2EE 协议测试向量
npx esbuild test/e2ee.test.ts --bundle --platform=node --format=esm --outfile=test/e2ee-out.mjs --log-level=error
node test/e2ee-out.mjs

# 强制推送 → 服务器 → 强制拉取 往返（内存 mock 服务器）
npx esbuild test/run.ts --bundle --platform=node --format=cjs \
  --alias:obsidian=./test/mock/obsidian.ts --outfile=test/run-out.cjs --log-level=error
node test/run-out.cjs
```

`test/*.test.ts` 中引用 `test/mock/obsidian-real.ts` 的套件会驱动**真实** Joplin Server（凭证从本地库读取），用于发版验证。

### 问题与反馈

- GitHub Issues：<https://github.com/yanqingwang/obsidian-joplin-server-sync/issues>
- 邮箱：wangyantsing@qq.com

反馈时请尽量附上：Obsidian 版本、插件版本、问题描述或截图、预期结果。

### 许可证

MIT

Copyright (c) 2026 rosswang (Heart and Road Ltd)
