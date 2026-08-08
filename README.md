# Joplin Server Sync

Bidirectional sync between Obsidian and a [Joplin Server](https://github.com/laurent22/joplin) instance. Keeps your notes, folders, and attachments in sync across multiple devices, with optional end-to-end encryption.

## Features

- **Bidirectional sync** — notes, folders, and attachments sync in both directions using the Joplin Server delta API
- **Attachments** — files are synced as Joplin resources and restored on the other side
- **End-to-end encryption (E2EE)** — optionally encrypt everything (notes, folders, attachments) before upload, using the official Joplin E2EE protocol. Enabled with one toggle + password, and verified against the master keys already stored on the server (one account, one password, no duplicate key generation)
- **Multi-client consistency** — every local file carries a stable `joplin-file-id` in its frontmatter, and a persistent change log drives conflict-free merge across multiple syncing clients
- **Folder & file moves/renames** — moving or renaming files and folders in Obsidian propagates to the server and to other clients
- **Conflict resolution** — duplicate, local-wins, or remote-wins strategies; three-way auto-merge for compatible changes
- **Force sync** — `Force push` wipes the server (protecting `info.json` and E2EE master keys) then re-uploads everything; `Force pull` wipes local files then re-downloads everything
- **Sync history** — a settings panel table shows every sync cycle with created/updated/deleted/failed counts
- **Link & tag conversion** — Obsidian wiki-links and tags are converted to Joplin-compatible Markdown on upload and back on download
- **Exclude patterns** — skip paths (e.g. `.obsidian/`, `_conflicts/`, `templates/`) via comma-separated prefixes

## Installation

### From Obsidian Community Plugins

1. Open **Settings → Community plugins → Browse**
2. Search for **Joplin Server Sync**
3. Install and enable the plugin

### Manual / BRAT

1. Install [BRAT](https://obsidian.md/plugins?id=obsidian42-brat)
2. Add the repository: `yanqingwang/obsidian-joplin-server-sync`

### Manual

Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/yanqingwang/obsidian-joplin-server-sync/releases) and place them in your vault at `.obsidian/plugins/joplin-server-sync/`.

## Setup

1. Open **Settings → Joplin Server Sync**
2. Enter your **Server URL** (e.g. `https://joplin.example.com` — without `/api`)
3. Enter your **email** and **password** for the Joplin Server account
4. Click **Test connection** to verify
5. Optional: enable **End-to-end encryption** and set the E2EE password (must match the password of the Joplin account; existing master keys are loaded and verified, never duplicated)
6. Run **Sync now** from the command palette, or use the **Force push / Force pull** commands for a full reset

## Commands

| Command | Description |
|---------|-------------|
| Sync now | Run a bidirectional sync cycle (push then pull) |
| Force push | Delete server items (keeps `info.json` and E2EE master keys), then upload the entire vault |
| Force pull | Delete local files (keeps the plugin config), then download the entire server |
| Test Joplin Server connection | Verify login credentials |
| Upload vault to Joplin Server | Initial upload of all notes |
| About / Status | Show mapping statistics |

## Settings

| Setting | Description |
|---------|-------------|
| Server URL | Joplin Server base URL (without `/api`) |
| Email / Password | Joplin Server account credentials (password stored in plugin `data.json`) |
| Auto sync interval | Seconds between automatic syncs. `0` = manual only (min 60) |
| Sync on startup | Run a sync when Obsidian starts |
| Conflict strategy | `Duplicate`, `Local wins`, or `Remote wins` |
| Sync folders only | Sync folder structure only, no note content (useful for testing) |
| Exclude patterns | Comma-separated path prefixes to skip |
| Enable E2EE | Toggle end-to-end encryption (requires a password; loads and verifies server master keys) |
| E2EE password | Password used to encrypt/decrypt items |
| Load E2EE keys | Load master keys from the server using the E2EE password |

## E2EE notes

- Encryption follows the official Joplin E2EE protocol (`JED01` header, master keys, SJCL-compatible AES/KeyV1/FileV1/StringV1 item types).
- With E2EE enabled, the server only ever stores ciphertext — no plaintext leaks to the server.
- One account uses exactly one E2EE password. When enabled, the plugin verifies the password against the master keys already on the server and never generates a new master key if any exist.
- All syncing clients must use the same E2EE password. If one client disables E2EE, run a **Force push** from that client to overwrite the server with plaintext (this deletes the encrypted server data).

## Development

```bash
git clone https://github.com/yanqingwang/obsidian-joplin-server-sync
cd obsidian-joplin-server-sync
npm install
npm run dev
npm run build
```

Run the test suite:

```bash
npx esbuild test/full-change-sync.test.ts --bundle --platform=node --format=esm --outfile=test/full-change-sync.mjs --alias:obsidian=./test/mock/obsidian-real.ts
node test/full-change-sync.mjs
```

## License

MIT

Copyright (c) 2026 rosswang (Heart and Road Ltd)
