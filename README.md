# Joplin Server Sync

Sync your vault with Joplin Server. Bidirectional, attachments, tags, link conversion.

## Features

- **Upload all notes** to Joplin Server (Phase 1)
- **Bidirectional sync** with delta API (Phase 2)
- **Attachments** sync as Joplin Resources (Phase 3)
- **Tags and link conversion** between Obsidian and Joplin formats (Phase 3)
- **Conflict resolution**: duplicate, local-wins, or remote-wins

## Installation

### From Obsidian Community Plugins

Settings → Community Plugins → Browse → Search "Joplin Server Sync"

### Manual / BRAT

1. Install [BRAT](https://obsidian.md/plugins?id=obsidian42-brat)
2. Add repository: `yanqingwang/obsidian-joplin-server-sync`

## Setup

1. Open Settings → Joplin Server Sync
2. Enter your Joplin Server URL (e.g. `https://joplin.example.com`)
3. Enter your email and password
4. Click "Test connection" to verify
5. Run "Upload vault to Joplin Server" from the command palette

## Commands

| Command | Description |
|---------|-------------|
| Upload vault to Joplin Server | Upload all .md files to Joplin Server |
| Test Joplin Server connection | Verify login credentials |
| About / Status | Show mapping statistics |

## Development

```bash
git clone https://github.com/yanqingwang/obsidian-joplin-server-sync
cd obsidian-joplin-server-sync
npm install
npm run dev
npm run build
```

## License

MIT

Copyright (c) 2026 rosswang (Heart and Road Ltd)