#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/api/models.ts
var models_exports = {};
__export(models_exports, {
  DeltaChangeType: () => DeltaChangeType,
  LockType: () => LockType,
  ModelType: () => ModelType
});
var ModelType, DeltaChangeType, LockType;
var init_models = __esm({
  "src/api/models.ts"() {
    "use strict";
    ModelType = /* @__PURE__ */ ((ModelType2) => {
      ModelType2[ModelType2["Note"] = 1] = "Note";
      ModelType2[ModelType2["Folder"] = 2] = "Folder";
      ModelType2[ModelType2["Setting"] = 3] = "Setting";
      ModelType2[ModelType2["Resource"] = 4] = "Resource";
      ModelType2[ModelType2["Tag"] = 5] = "Tag";
      ModelType2[ModelType2["NoteTag"] = 6] = "NoteTag";
      ModelType2[ModelType2["MasterKey"] = 9] = "MasterKey";
      return ModelType2;
    })(ModelType || {});
    DeltaChangeType = /* @__PURE__ */ ((DeltaChangeType2) => {
      DeltaChangeType2[DeltaChangeType2["Create"] = 1] = "Create";
      DeltaChangeType2[DeltaChangeType2["Update"] = 2] = "Update";
      DeltaChangeType2[DeltaChangeType2["Delete"] = 3] = "Delete";
      return DeltaChangeType2;
    })(DeltaChangeType || {});
    LockType = /* @__PURE__ */ ((LockType2) => {
      LockType2[LockType2["Sync"] = 1] = "Sync";
      LockType2[LockType2["Exclusive"] = 2] = "Exclusive";
      return LockType2;
    })(LockType || {});
  }
});

// src/convert/JoplinSerializer.ts
var JoplinSerializer_exports = {};
__export(JoplinSerializer_exports, {
  JoplinSerializer: () => JoplinSerializer
});
var NOTE_FIELD_ORDER, FOLDER_FIELD_ORDER, RESOURCE_FIELD_ORDER, TIME_FIELDS, DEFAULTS, JoplinSerializer;
var init_JoplinSerializer = __esm({
  "src/convert/JoplinSerializer.ts"() {
    "use strict";
    init_models();
    NOTE_FIELD_ORDER = [
      "id",
      "parent_id",
      "created_time",
      "updated_time",
      "is_conflict",
      "latitude",
      "longitude",
      "altitude",
      "author",
      "source_url",
      "is_todo",
      "todo_due",
      "todo_completed",
      "source",
      "source_application",
      "application_data",
      "order",
      "user_created_time",
      "user_updated_time",
      "encryption_cipher_text",
      "encryption_applied",
      "markup_language",
      "is_shared",
      "share_id",
      "conflict_original_id",
      "master_key_id",
      "user_data",
      "deleted_time",
      "type_"
    ];
    FOLDER_FIELD_ORDER = [
      "id",
      "created_time",
      "updated_time",
      "user_created_time",
      "user_updated_time",
      "encryption_cipher_text",
      "encryption_applied",
      "parent_id",
      "is_shared",
      "share_id",
      "master_key_id",
      "icon",
      "user_data",
      "deleted_time",
      "type_"
    ];
    RESOURCE_FIELD_ORDER = [
      "id",
      "mime",
      "filename",
      "created_time",
      "updated_time",
      "user_created_time",
      "user_updated_time",
      "file_extension",
      "encryption_cipher_text",
      "encryption_applied",
      "encryption_blob_encrypted",
      "size",
      "is_shared",
      "share_id",
      "master_key_id",
      "user_data",
      "blob_updated_time",
      "ocr_text",
      "ocr_details",
      "ocr_status",
      "ocr_error",
      "type_"
    ];
    TIME_FIELDS = /* @__PURE__ */ new Set([
      "created_time",
      "updated_time",
      "user_created_time",
      "user_updated_time"
    ]);
    DEFAULTS = {
      is_conflict: 0,
      latitude: "0.00000000",
      longitude: "0.00000000",
      altitude: "0.0000",
      author: "",
      source_url: "",
      is_todo: 0,
      todo_due: 0,
      todo_completed: 0,
      source: "obsidian-joplin-sync",
      source_application: "net.obsidian.joplin-server-sync",
      application_data: "",
      order: 0,
      encryption_cipher_text: "",
      encryption_applied: 0,
      markup_language: 1,
      is_shared: 0,
      share_id: "",
      conflict_original_id: "",
      master_key_id: "",
      user_data: "",
      deleted_time: 0,
      icon: ""
    };
    JoplinSerializer = class {
      serialize(item) {
        const order = this.fieldOrder(item.type_);
        const lines = [];
        lines.push(item.title ?? "");
        lines.push("");
        if (item.type_ === 1 /* Note */) {
          lines.push(item.body ?? "");
          lines.push("");
        }
        for (const key of order) {
          const rawValue = item[key];
          const value = rawValue ?? DEFAULTS[key] ?? "";
          lines.push(key + ": " + (TIME_FIELDS.has(key) ? this.formatTime(Number(value)) : String(value)));
        }
        return lines.join("\n");
      }
      unserialize(raw) {
        const lines = raw.split("\n");
        const item = {};
        let bodyEndIndex = lines.length;
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i];
          if (line.trim() === "") {
            bodyEndIndex = i;
            break;
          }
          const sep2 = line.indexOf(":");
          if (sep2 < 0)
            continue;
          const key = line.slice(0, sep2).trim();
          const value = line.slice(sep2 + 1).trim();
          item[key] = TIME_FIELDS.has(key) ? this.parseTime(value) : this.coerce(key, value);
        }
        const headerBody = lines.slice(0, bodyEndIndex);
        item.title = headerBody[0] ?? "";
        if (item.type_ === 1 /* Note */) {
          item.body = headerBody.slice(2).join("\n");
        }
        item.type_ = Number(item.type_);
        return item;
      }
      fieldOrder(type) {
        switch (type) {
          case 1 /* Note */:
            return NOTE_FIELD_ORDER;
          case 2 /* Folder */:
            return FOLDER_FIELD_ORDER;
          case 4 /* Resource */:
            return RESOURCE_FIELD_ORDER;
          default:
            return NOTE_FIELD_ORDER;
        }
      }
      formatTime(ms) {
        return new Date(ms || 0).toISOString();
      }
      parseTime(s) {
        return s ? new Date(s).getTime() : 0;
      }
      coerce(key, value) {
        const numeric = /* @__PURE__ */ new Set([
          "type_",
          "is_conflict",
          "is_todo",
          "todo_due",
          "todo_completed",
          "encryption_applied",
          "markup_language",
          "is_shared",
          "order",
          "size",
          "deleted_time",
          "blob_updated_time"
        ]);
        return numeric.has(key) ? Number(value) : value;
      }
    };
  }
});

// src/mapping/IdGenerator.ts
var IdGenerator_exports = {};
__export(IdGenerator_exports, {
  createJoplinId: () => createJoplinId,
  isValidJoplinId: () => isValidJoplinId
});
function createJoplinId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function isValidJoplinId(id) {
  return /^[0-9a-f]{32}$/.test(id);
}
var init_IdGenerator = __esm({
  "src/mapping/IdGenerator.ts"() {
    "use strict";
  }
});

// cli/sync-cli.ts
var fs3 = __toESM(require("fs"));
var path3 = __toESM(require("path"));

// test/mock/obsidian-real.ts
var import_crypto = require("crypto");
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var vaultRoot = "";
function setVaultRoot(root) {
  vaultRoot = root;
}
var TFile = class {
  constructor(p) {
    this.path = p;
    this.name = p.split("/").pop() || p;
    const d = this.name.lastIndexOf(".");
    this.extension = d >= 0 ? this.name.slice(d + 1) : "";
    this.basename = d >= 0 ? this.name.slice(0, d) : this.name;
    const abs = path.isAbsolute(p) ? p : vaultRoot ? path.join(vaultRoot, p) : p;
    try {
      const s = fs.statSync(abs);
      this.stat = { ctime: s.ctimeMs, mtime: s.mtimeMs, size: s.size };
    } catch {
      const t = Date.now();
      this.stat = { ctime: t, mtime: t, size: 0 };
    }
  }
};
var TFolder = class {
  constructor(p) {
    this.path = p;
  }
};
var Notice = class {
  constructor(_m) {
  }
};
function normalizePath(p) {
  return p;
}
globalThis.window = globalThis.window || globalThis;
if (!globalThis.crypto)
  globalThis.crypto = import_crypto.webcrypto;
async function requestUrl(param) {
  const headers = { ...param.headers || {} };
  if (param.contentType)
    headers["Content-Type"] = param.contentType;
  const res = await fetch(param.url, { method: param.method, headers, body: param.body });
  const buf = await res.arrayBuffer();
  let text = "";
  try {
    text = new TextDecoder().decode(buf);
  } catch {
  }
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
  }
  return { status: res.status, text, json, arrayBuffer: buf };
}

// src/api/JoplinServerApi.ts
var JoplinServerApi = class {
  // re-login every 200 API calls
  constructor(getConfig) {
    this.sessionId = null;
    this.callCount = 0;
    this.REFRESH_INTERVAL = 200;
    this.execJsonLogCount = 0;
    this.getConfig = getConfig;
  }
  async login() {
    const { baseUrl, email, password } = this.getConfig();
    const res = await requestUrl({
      url: this.trimSlash(baseUrl) + "/api/sessions",
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ email, password }),
      throw: false
    });
    if (res.status !== 200)
      throw new Error("Login failed (" + res.status + "): " + res.text);
    const body = res.json;
    this.sessionId = body.id;
  }
  async rawRequest(method, path4, opts = {}) {
    if (!this.sessionId)
      await this.login();
    this.callCount++;
    if (this.callCount >= this.REFRESH_INTERVAL) {
      this.callCount = 0;
      try {
        await this.login();
      } catch {
      }
    }
    const maxRetries = opts.retries ?? 3;
    for (let attempt = 0; ; attempt++) {
      const headers = {
        "X-API-AUTH": this.sessionId,
        "X-API-MIN-VERSION": "2.6.0"
      };
      if (opts.contentType)
        headers["Content-Type"] = opts.contentType;
      const res = await requestUrl({
        url: this.trimSlash(this.getConfig().baseUrl) + path4,
        method,
        headers,
        body: opts.body,
        throw: false
      });
      if (res.status === 401 && attempt === 0) {
        await this.login();
        continue;
      }
      if (res.status >= 500 && attempt < maxRetries) {
        await this.sleep(Math.pow(4, attempt) * 1e3);
        continue;
      }
      return { status: res.status, text: res.text, arrayBuffer: res.arrayBuffer };
    }
  }
  safeJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  async exec(method, path4, opts = {}) {
    const res = await this.rawRequest(method, path4, opts);
    let json = null;
    try {
      json = JSON.parse(res.text);
    } catch {
      if (this.execJsonLogCount < 5) {
        this.execJsonLogCount++;
        console.warn("[joplin-sync] non-json response", method, path4, "status=" + res.status, "body=" + res.text.slice(0, 200));
      }
    }
    return { ...res, json };
  }
  itemPath(name, suffix = "") {
    return "/api/items/root:/" + encodeURIComponent(name) + ":" + suffix;
  }
  async getItem(name) {
    const res = await this.rawRequest("GET", this.itemPath(name, "/content"));
    if (res.status === 404)
      return null;
    if (res.status !== 200)
      throw new ApiError(res.status, res.text);
    return res.text;
  }
  async getItemBinary(name) {
    const res = await this.rawRequest("GET", this.itemPath(name, "/content"));
    if (res.status === 404)
      throw new ApiError(404, "Not found");
    if (res.status !== 200)
      throw new ApiError(res.status, res.text);
    return res.arrayBuffer;
  }
  async putItem(name, content, force = false) {
    const res = await this.exec("PUT", this.itemPath(name, "/content") + (force ? "?force=1" : ""), {
      body: content,
      contentType: "application/octet-stream"
    });
    if (res.status !== 200)
      throw new ApiError(res.status, res.text);
    if (!res.json)
      throw new ApiError(res.status, "PUT response not JSON: " + res.text.slice(0, 200));
    return {
      id: res.json.id || "",
      updated_time: res.json.updated_time || Date.now()
    };
  }
  async deleteItem(name) {
    const res = await this.exec("DELETE", this.itemPath(name));
    if (res.status !== 200 && res.status !== 404)
      throw new ApiError(res.status, res.text);
  }
  async listChildren(cursor) {
    const q = cursor ? "?cursor=" + encodeURIComponent(cursor) : "";
    const res = await this.exec("GET", "/api/items/root:/:/children" + q);
    if (res.status !== 200)
      throw new ApiError(res.status, res.text);
    if (!res.json)
      throw new ApiError(res.status, "listChildren body is not JSON: " + res.text.slice(0, 200));
    return res.json;
  }
  async listChildrenOf(parentId, cursor) {
    const base = parentId ? "/api/items/root:/" + parentId + ":/children" : "/api/items/root:/:/children";
    const q = cursor ? "?cursor=" + encodeURIComponent(cursor) : "";
    const res = await this.exec("GET", base + q);
    if (res.status !== 200)
      throw new ApiError(res.status, res.text);
    if (!res.json)
      throw new ApiError(res.status, "listChildrenOf body is not JSON: " + res.text.slice(0, 200));
    return res.json;
  }
  async delta(cursor) {
    const q = cursor ? "?cursor=" + encodeURIComponent(cursor) : "";
    const res = await this.exec("GET", "/api/items/root:/:/delta" + q);
    if (res.status !== 200)
      throw new ApiError(res.status, res.text);
    if (!res.json)
      throw new ApiError(res.status, "delta body is not JSON: " + res.text.slice(0, 200));
    const raw = res.json;
    const items = raw.items || [];
    for (const item of items) {
      if (item.item_name)
        item.name = item.item_name;
      if (item.jop_updated_time)
        item.updated_time = item.jop_updated_time;
      if (item.type !== void 0)
        item.type = Number(item.type);
      if (item.item_type !== void 0)
        item.item_type = Number(item.item_type);
    }
    return { items, has_more: !!raw.has_more, cursor: raw.cursor };
  }
  async acquireLock(type, clientType, clientId) {
    const res = await this.exec("POST", "/api/locks", {
      body: JSON.stringify({ type, clientType, clientId }),
      contentType: "application/json"
    });
    if (res.status === 409)
      throw new LockConflictError(res.text);
    if (res.status !== 200)
      throw new ApiError(res.status, res.text);
    if (!res.json)
      throw new ApiError(res.status, "acquireLock body is not JSON: " + res.text.slice(0, 200));
    return res.json;
  }
  async releaseLock(type, clientType, clientId) {
    await this.exec("DELETE", "/api/locks/" + type + "_" + clientType + "_" + clientId);
  }
  async listLocks() {
    const res = await this.exec("GET", "/api/locks");
    if (res.status !== 200)
      throw new ApiError(res.status, res.text);
    if (!res.json)
      throw new ApiError(res.status, "listLocks body is not JSON: " + res.text.slice(0, 200));
    return res.json;
  }
  trimSlash(u) {
    return u.replace(/\/+$/, "");
  }
  sleep(ms) {
    return new Promise((r) => window.setTimeout(r, ms));
  }
};
var ApiError = class extends Error {
  constructor(status, text) {
    super("API error " + status + ": " + text);
    this.status = status;
  }
};
var LockConflictError = class extends Error {
};

// src/mapping/MappingStore.ts
var MappingStore = class {
  constructor(plugin) {
    this.plugin = plugin;
    this.data = { version: 1, deltaCursor: "", rootFolderId: "", entries: [], tombstones: [] };
    this.byId = /* @__PURE__ */ new Map();
    this.byPath = /* @__PURE__ */ new Map();
    this.dirty = false;
  }
  get filePath() {
    return this.plugin.manifest.dir + "/data/mapping.json";
  }
  async load() {
    const adapter = this.plugin.app.vault.adapter;
    if (adapter.exists) {
      if (await adapter.exists(this.filePath)) {
        this.data = JSON.parse(await adapter.read(this.filePath));
      }
    }
    this.rebuildIndexes();
  }
  async flush() {
    if (!this.dirty)
      return;
    const adapter = this.plugin.app.vault.adapter;
    const dir = this.plugin.manifest.dir + "/data";
    if (!await adapter.exists(dir))
      await adapter.mkdir(dir);
    const tmp = this.filePath + ".tmp";
    await adapter.write(tmp, JSON.stringify(this.data));
    if (await adapter.exists(this.filePath))
      await adapter.remove(this.filePath);
    await adapter.rename(tmp, this.filePath);
    this.dirty = false;
  }
  getByPath(path4) {
    return this.byPath.get(path4);
  }
  getById(id) {
    return this.byId.get(id);
  }
  all() {
    return this.data.entries;
  }
  getDeltaCursor() {
    return this.data.deltaCursor;
  }
  setDeltaCursor(cursor) {
    this.data.deltaCursor = cursor;
    this.dirty = true;
  }
  setRootFolderId(id) {
    this.data.rootFolderId = id;
    this.dirty = true;
  }
  get rootFolderId() {
    return this.data.rootFolderId;
  }
  upsert(entry) {
    const existing = this.byId.get(entry.joplinId);
    if (existing) {
      this.byPath.delete(existing.path);
      Object.assign(existing, entry);
      this.byPath.set(existing.path, existing);
    } else {
      this.data.entries.push(entry);
      this.byId.set(entry.joplinId, entry);
      this.byPath.set(entry.path, entry);
    }
    this.dirty = true;
  }
  remove(joplinId) {
    const e = this.byId.get(joplinId);
    if (!e)
      return;
    this.data.entries = this.data.entries.filter((x) => x.joplinId !== joplinId);
    this.byId.delete(joplinId);
    this.byPath.delete(e.path);
    this.dirty = true;
  }
  get tombstones() {
    return this.data.tombstones;
  }
  addTombstone(joplinId, type) {
    this.data.tombstones.push({ joplinId, type, deletedAt: Date.now() });
    this.dirty = true;
  }
  clearTombstone(joplinId) {
    this.data.tombstones = this.data.tombstones.filter((t) => t.joplinId !== joplinId);
    this.dirty = true;
  }
  renamePrefix(oldPrefix, newPrefix) {
    for (const e of this.data.entries) {
      if (e.path === oldPrefix || e.path.startsWith(oldPrefix)) {
        this.byPath.delete(e.path);
        e.path = newPrefix + e.path.slice(oldPrefix.length);
        this.byPath.set(e.path, e);
      }
    }
    this.dirty = true;
  }
  rebuildIndexes() {
    this.byId.clear();
    this.byPath.clear();
    for (const e of this.data.entries) {
      this.byId.set(e.joplinId, e);
      this.byPath.set(e.path, e);
    }
  }
};

// src/core/SyncEngine.ts
init_JoplinSerializer();

// src/core/SyncInfo.ts
var SUPPORTED_SYNC_VERSION = 3;
var SyncInfoHandler = class {
  constructor(api) {
    this.api = api;
    this._e2eeEnabled = false;
  }
  get e2eeEnabled() {
    return this._e2eeEnabled;
  }
  async checkOrInit() {
    const raw = await this.api.getItem("info.json");
    if (raw === null) {
      const info2 = { version: SUPPORTED_SYNC_VERSION };
      await this.api.putItem("info.json", JSON.stringify(info2));
      return info2;
    }
    const info = JSON.parse(raw);
    if (info.version > SUPPORTED_SYNC_VERSION) {
      throw new Error("Sync target version " + info.version + " > supported " + SUPPORTED_SYNC_VERSION + ". Please update the plugin.");
    }
    if (info.version < SUPPORTED_SYNC_VERSION) {
      throw new Error("Sync target needs upgrade (v" + info.version + "). Run sync in official Joplin client first.");
    }
    this._e2eeEnabled = info.e2ee?.value === true;
    if (this._e2eeEnabled) {
      console.warn("[joplin-sync] E2EE target detected \u2014 read-only decryption mode");
    }
    return info;
  }
};

// src/core/SyncEngine.ts
init_IdGenerator();
init_models();

// src/core/ChangeQueue.ts
var ChangeQueue = class {
  constructor(plugin) {
    this.plugin = plugin;
    this.items = /* @__PURE__ */ new Map();
    this.debounceMs = 3e3;
    this.persistTimer = null;
  }
  push(change) {
    const prev = this.items.get(change.oldPath ?? change.path);
    if (change.kind === "rename" && prev) {
      this.items.delete(change.oldPath);
    }
    const merged = this.merge(prev, change);
    if (merged)
      this.items.set(change.path, merged);
    else
      this.items.delete(change.path);
    this.persist();
  }
  drain() {
    const now = Date.now();
    const ready = [];
    for (const [path4, c] of this.items) {
      if (now - c.time >= this.debounceMs) {
        ready.push(c);
        this.items.delete(path4);
      }
    }
    this.persist();
    return ready.sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.time - b.time);
  }
  requeue(changes) {
    for (const c of changes)
      this.items.set(c.path, c);
    this.persist();
  }
  get size() {
    return this.items.size;
  }
  merge(prev, next) {
    if (!prev)
      return next;
    if (prev.kind === "create" && next.kind === "delete")
      return null;
    if (prev.kind === "create" && next.kind === "modify")
      return { ...next, kind: "create" };
    if (next.kind === "rename" && prev.kind === "create")
      return { ...next, kind: "create", oldPath: void 0 };
    return next;
  }
  persist() {
    if (this.persistTimer)
      return;
    this.persistTimer = window.setTimeout(async () => {
      this.persistTimer = null;
      const adapter = this.plugin.app.vault.adapter;
      await adapter.write(
        this.plugin.manifest.dir + "/data/queue.json",
        JSON.stringify([...this.items.values()])
      );
    }, 500);
  }
  async restore() {
    const adapter = this.plugin.app.vault.adapter;
    const p = this.plugin.manifest.dir + "/data/queue.json";
    if (await adapter.exists(p)) {
      for (const c of JSON.parse(await adapter.read(p))) {
        this.items.set(c.path, c);
      }
    }
  }
};

// src/vault/VaultWatcher.ts
var VaultWatcher = class {
  constructor(plugin, queue) {
    this.plugin = plugin;
    this.queue = queue;
    this.suppressed = /* @__PURE__ */ new Set();
  }
  start() {
    const v = this.plugin.app.vault;
    this.plugin.registerEvent(v.on("create", (f) => this.onEvent("create", f)));
    this.plugin.registerEvent(v.on("modify", (f) => this.onEvent("modify", f)));
    this.plugin.registerEvent(v.on("delete", (f) => this.onEvent("delete", f)));
    this.plugin.registerEvent(v.on("rename", (f, oldPath) => this.onRename(f, oldPath)));
  }
  suppress(path4) {
    this.suppressed.add(path4);
  }
  release(path4) {
    window.setTimeout(() => this.suppressed.delete(path4), 2e3);
  }
  onEvent(kind, f) {
    if (this.suppressed.has(f.path))
      return;
    if (!this.shouldTrack(f))
      return;
    this.queue.push({ kind, path: f.path, isFolder: f instanceof TFolder, time: Date.now() });
  }
  onRename(f, oldPath) {
    if (this.suppressed.has(f.path))
      return;
    if (!this.shouldTrack(f))
      return;
    this.queue.push({ kind: "rename", path: f.path, oldPath, isFolder: f instanceof TFolder, time: Date.now() });
  }
  shouldTrack(f) {
    const s = this.plugin.settings;
    if (f.path.startsWith(this.plugin.app.vault.configDir + "/"))
      return false;
    if (f.path.startsWith("_conflicts/"))
      return false;
    if (s.excludePatterns.some((p) => f.path.startsWith(p)))
      return false;
    if (f instanceof TFile && f.extension !== "md") {
      return true;
    }
    return true;
  }
};

// src/core/LocalPusher.ts
init_JoplinSerializer();
init_IdGenerator();
init_models();

// src/resource/ResourceManager.ts
init_JoplinSerializer();
init_IdGenerator();
init_models();
var MIME_MAP = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  zip: "application/zip"
};
var ResourceManager = class {
  constructor(plugin) {
    this.plugin = plugin;
    this.serializer = new JoplinSerializer();
    this.hashToId = /* @__PURE__ */ new Map();
  }
  async uploadResource(file) {
    const data = await this.plugin.app.vault.readBinary(file);
    const hash = await sha256(data);
    const existing = this.plugin.mapping.getByPath(file.path);
    if (existing && existing.localHash === hash)
      return existing.joplinId;
    const dedup = this.hashToId.get(hash);
    if (dedup)
      return dedup;
    const maxSize = this.plugin.settings.maxAttachmentMB * 1024 * 1024 || 100 * 1024 * 1024;
    if (data.byteLength > maxSize)
      throw new Error("Attachment too large: " + file.path);
    const id = existing?.joplinId ?? createJoplinId();
    const now = Date.now();
    const st = file.stat || { ctime: now, mtime: now };
    await this.plugin.api.putItem(".resource/" + id, data);
    const meta = {
      id,
      parent_id: "",
      title: file.name,
      mime: MIME_MAP[file.extension.toLowerCase()] ?? "application/octet-stream",
      // Store the FULL relative path in `filename` so the pull side can
      // recreate the original folder structure (not flatten into one dir).
      filename: file.path,
      file_extension: file.extension,
      size: data.byteLength,
      blob_updated_time: now,
      created_time: st.ctime ?? now,
      updated_time: now,
      user_created_time: st.ctime ?? now,
      user_updated_time: st.mtime ?? now,
      type_: 4 /* Resource */,
      encryption_applied: 0,
      encryption_cipher_text: ""
    };
    const res = await this.plugin.api.putItem(id + ".md", this.serializer.serialize(meta));
    this.plugin.mapping.upsert({
      joplinId: id,
      path: file.path,
      type: 4 /* Resource */,
      localHash: hash,
      remoteUpdatedTime: res.updated_time,
      syncedAt: now
    });
    this.hashToId.set(hash, id);
    return id;
  }
  async downloadResource(meta) {
    const existing = this.plugin.mapping.getById(meta.id);
    if (existing && (meta.blob_updated_time ?? 0) <= existing.remoteUpdatedTime)
      return existing.path;
    const blob = await this.plugin.api.getItemBinary(".resource/" + meta.id);
    if (!blob)
      throw new Error("Resource blob missing: " + meta.id);
    const dir = this.plugin.settings.attachmentFolder || "attachments";
    const relName = meta.filename && meta.filename.includes("/") ? meta.filename : dir + "/" + (meta.filename || meta.id + "." + (meta.file_extension || "bin"));
    let path4 = normalizePath(relName);
    const clash = this.plugin.mapping.getByPath(path4);
    if (clash && clash.joplinId !== meta.id) {
      path4 = normalizePath(dir + "/" + meta.id.slice(0, 7) + "_" + (meta.filename || meta.id + "." + (meta.file_extension || "bin")));
    }
    const watcher = this.plugin.engine?.watcher;
    const write = async () => {
      const f = this.plugin.app.vault.getAbstractFileByPath(path4);
      if (f instanceof TFile)
        await this.plugin.app.vault.modifyBinary(f, blob);
      else
        await this.plugin.app.vault.createBinary(path4, blob);
    };
    if (watcher?.suppress) {
      watcher.suppress(path4);
      try {
        await write();
      } finally {
        watcher.release(path4);
      }
    } else {
      await write();
    }
    this.plugin.mapping.upsert({
      joplinId: meta.id,
      path: path4,
      type: 4 /* Resource */,
      localHash: await sha256(blob),
      remoteUpdatedTime: meta.blob_updated_time ?? meta.updated_time,
      syncedAt: Date.now()
    });
    return path4;
  }
};

// src/core/LocalPusher.ts
var LocalPusher = class {
  constructor(plugin, queue) {
    this.plugin = plugin;
    this.queue = queue;
    this.serializer = new JoplinSerializer();
    this.resources = new ResourceManager(plugin);
  }
  async pushAll() {
    const changes = this.queue.drain();
    let ok = 0;
    const failed = [];
    for (const change of changes) {
      try {
        await this.pushOne(change);
        ok++;
      } catch (e) {
        console.error("[joplin-sync] push failed: " + change.path, e);
        failed.push(change);
      }
    }
    if (failed.length)
      this.queue.requeue(failed);
    return { ok, fail: failed.length };
  }
  async pushOne(c) {
    switch (c.kind) {
      case "create":
      case "modify":
        return this.upsertItem(c.path);
      case "delete":
        return this.deleteItem(c.path, c.isFolder);
      case "rename":
        return this.renameItem(c.oldPath, c.path, c.isFolder);
    }
  }
  async upsertItem(path4) {
    const af = this.plugin.app.vault.getAbstractFileByPath(path4);
    if (!af)
      return;
    if (af instanceof TFolder) {
      await this.ensureFolderChain(path4 + "/");
      return;
    }
    if (!(af instanceof TFile))
      return;
    if (af.extension !== "md") {
      await this.resources.uploadResource(af);
      return;
    }
    const parentPath = af.parent?.path === "/" ? "" : af.parent.path + "/";
    const parentId = await this.ensureFolderChain(parentPath || "");
    const content = await this.plugin.app.vault.read(af);
    const hash = await sha256(content);
    const existing = this.plugin.mapping.getByPath(path4);
    if (existing?.localHash === hash)
      return;
    const id = existing?.joplinId ?? createJoplinId();
    let base = {};
    if (existing) {
      const remote = await this.plugin.api.getItem(id + ".md");
      if (remote)
        base = this.serializer.unserialize(remote);
    }
    const item = {
      ...base,
      id,
      parent_id: parentId,
      title: af.basename,
      body: content,
      created_time: base.created_time ?? af.stat.ctime,
      updated_time: Date.now(),
      user_created_time: base.user_created_time ?? af.stat.ctime,
      user_updated_time: af.stat.mtime,
      type_: 1 /* Note */,
      encryption_applied: 0,
      encryption_cipher_text: "",
      markup_language: 1
    };
    const e2ee = this.plugin.e2ee;
    const mkId = e2ee.firstLoadedKeyId;
    if (mkId && this.plugin.engine.e2eeActive) {
      const serialized = this.serializer.serialize(item);
      const encryptedCt = await e2ee.encryptItem(serialized, mkId);
      const cipherItem = {
        id,
        parent_id: parentId,
        title: "",
        body: "",
        created_time: item.created_time,
        updated_time: item.updated_time,
        user_created_time: item.user_created_time,
        user_updated_time: item.user_updated_time,
        type_: 1 /* Note */,
        encryption_applied: 1,
        encryption_cipher_text: encryptedCt,
        markup_language: 1
      };
      const cipherSerialized = this.serializer.serialize(cipherItem);
      const res2 = await this.plugin.api.putItem(id + ".md", cipherSerialized);
      this.plugin.mapping.upsert({
        joplinId: id,
        path: path4,
        type: 1 /* Note */,
        localHash: hash,
        remoteUpdatedTime: res2.updated_time,
        syncedAt: Date.now()
      });
      return;
    }
    const res = await this.plugin.api.putItem(id + ".md", this.serializer.serialize(item));
    this.plugin.mapping.upsert({
      joplinId: id,
      path: path4,
      type: 1 /* Note */,
      localHash: hash,
      remoteUpdatedTime: res.updated_time,
      syncedAt: Date.now()
    });
  }
  async deleteItem(path4, isFolder) {
    const key = isFolder ? path4 + "/" : path4;
    const entry = this.plugin.mapping.getByPath(key);
    if (!entry)
      return;
    await this.plugin.api.deleteItem(entry.joplinId + ".md");
    this.plugin.mapping.remove(entry.joplinId);
  }
  async renameItem(oldPath, newPath, isFolder) {
    const key = isFolder ? oldPath + "/" : oldPath;
    const entry = this.plugin.mapping.getByPath(key);
    if (!entry)
      return this.upsertItem(newPath);
    if (isFolder)
      this.plugin.mapping.renamePrefix(oldPath + "/", newPath + "/");
    else
      this.plugin.mapping.upsert({ ...entry, path: newPath });
    await this.upsertItem(isFolder ? newPath : newPath);
  }
  async ensureFolderChain(folderPath) {
    if (!folderPath || folderPath === "/")
      return this.ensureRootFolderId();
    const existing = this.plugin.mapping.getByPath(folderPath);
    if (existing)
      return existing.joplinId;
    const parts = folderPath.replace(/\/$/, "").split("/");
    const parentPath = parts.slice(0, -1).join("/");
    const parentId = await this.ensureFolderChain(parentPath ? parentPath + "/" : "");
    const id = createJoplinId();
    const now = Date.now();
    const item = {
      id,
      parent_id: parentId,
      title: parts[parts.length - 1],
      created_time: now,
      updated_time: now,
      user_created_time: now,
      user_updated_time: now,
      type_: 2 /* Folder */,
      encryption_applied: 0,
      encryption_cipher_text: ""
    };
    const res = await this.plugin.api.putItem(id + ".md", this.serializer.serialize(item));
    this.plugin.mapping.upsert({
      joplinId: id,
      path: folderPath,
      type: 2 /* Folder */,
      localHash: "",
      remoteUpdatedTime: res.updated_time,
      syncedAt: now
    });
    return id;
  }
  async ensureRootFolderId() {
    return "";
  }
};

// src/core/DeltaPuller.ts
init_JoplinSerializer();

// src/core/ConflictResolver.ts
var ConflictResolver = class {
  constructor(plugin, watcher) {
    this.plugin = plugin;
    this.watcher = watcher;
  }
  async resolve(mapping, remote, localContent, targetPath) {
    switch (this.plugin.settings.conflictStrategy) {
      case "local-wins":
        this.plugin.mapping.upsert({ ...mapping, remoteUpdatedTime: remote.updated_time });
        return;
      case "remote-wins":
        return this.applyRemote(mapping, remote);
      case "duplicate":
      default: {
        const ts = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "");
        const base = mapping.path.replace(/\.md$/, "").split("/").pop();
        const conflictPath = normalizePath("_conflicts/" + base + " (conflict " + ts + ").md");
        if (!this.plugin.app.vault.getAbstractFileByPath("_conflicts")) {
          await this.plugin.app.vault.createFolder("_conflicts").catch(() => {
          });
        }
        this.watcher.suppress(conflictPath);
        await this.plugin.app.vault.create(conflictPath, localContent);
        this.watcher.release(conflictPath);
        await this.applyRemote(mapping, remote);
        new Notice("Sync conflict: local copy saved to " + conflictPath);
      }
    }
  }
  async applyRemote(mapping, remote) {
    const f = this.plugin.app.vault.getAbstractFileByPath(mapping.path);
    this.watcher.suppress(mapping.path);
    try {
      if (f instanceof TFile)
        await this.plugin.app.vault.modify(f, remote.body ?? "");
      else
        await this.plugin.app.vault.create(mapping.path, remote.body ?? "");
    } finally {
      this.watcher.release(mapping.path);
    }
    this.plugin.mapping.upsert({
      ...mapping,
      localHash: await sha256(remote.body ?? ""),
      remoteUpdatedTime: remote.updated_time,
      syncedAt: Date.now()
    });
  }
};

// src/core/DeltaPuller.ts
init_models();

// src/core/pathUtil.ts
function safeFileName(name) {
  const cleaned = (name || "").replace(/[\/\\]/g, "_").replace(/[\x00-\x1f\x7f]/g, "").trim();
  return cleaned || "Untitled";
}

// src/core/DeltaPuller.ts
var DeltaPuller = class {
  // item_id → full path
  constructor(plugin, watcher) {
    this.plugin = plugin;
    this.watcher = watcher;
    this.serializer = new JoplinSerializer();
    this.rootAncestorCache = /* @__PURE__ */ new Map();
    this.acceptAll = false;
    this.folderPathCache = /* @__PURE__ */ new Map();
    this.conflicts = new ConflictResolver(plugin, watcher);
    this.resources = new ResourceManager(plugin);
  }
  belongsToRoot(item) {
    if (this.acceptAll)
      return true;
    const rootId = this.plugin.mapping.rootFolderId;
    if (!rootId)
      return true;
    const hasFolders = this.plugin.mapping.all().some((e) => e.type === 2);
    if (!hasFolders)
      return true;
    let pid = item.parent_id;
    const visited = /* @__PURE__ */ new Set();
    while (pid && !visited.has(pid)) {
      visited.add(pid);
      if (pid === rootId)
        return true;
      const parentMapping = this.plugin.mapping.getById(pid);
      if (!parentMapping)
        return false;
      pid = parentMapping.joplinId;
      break;
    }
    return false;
  }
  async pullAll() {
    let cursor = this.plugin.mapping.getDeltaCursor();
    const allItems = [];
    let ok = 0;
    let fail = 0;
    while (true) {
      const page = await this.plugin.api.delta(cursor || void 0);
      for (const d of page.items) {
        try {
          const items = await this.collectChange(d);
          allItems.push(...items);
          ok++;
        } catch (e) {
          fail++;
          console.error("[joplin-sync] collect delta failed", d.name, e);
        }
      }
      if (page.cursor)
        cursor = page.cursor;
      if (!page.has_more)
        break;
    }
    const folders = allItems.filter((i) => i.type_ === 2 /* Folder */);
    const notes = allItems.filter((i) => i.type_ === 1 /* Note */);
    const resources = allItems.filter((i) => i.type_ === 4 /* Resource */);
    this.buildFolderPaths(folders);
    for (const f of folders) {
      try {
        await this.applyFolder(f);
      } catch (e) {
        fail++;
        console.error("[joplin-sync] folder apply failed", f.title, e);
      }
    }
    if (!this.plugin.settings.syncFoldersOnly) {
      for (const n of notes) {
        try {
          await this.applyNote(n);
        } catch (e) {
          fail++;
          console.error("[joplin-sync] note apply failed", n.title, e);
        }
      }
    }
    for (const r of resources) {
      try {
        await this.applyResource(r);
      } catch (e) {
        fail++;
        console.error("[joplin-sync] resource apply failed", r.id, e);
      }
    }
    this.plugin.mapping.setDeltaCursor(cursor ?? "");
    return { ok, fail };
  }
  /** Download a delta item and return fully unserialized JoplinItems it contains */
  async collectChange(d) {
    if (d.name.startsWith(".resource/")) {
      if (d.type === 3 /* Delete */) {
        await this.applyDelete(d.name.replace(".resource/", ""));
        return [];
      }
      return [];
    }
    if (!/^[0-9a-f]{32}\.md$/.test(d.name))
      return [];
    const id = d.name.slice(0, 32);
    if (d.type === 3 /* Delete */) {
      await this.applyDelete(id);
      return [];
    }
    const raw = await this.plugin.api.getItem(d.name);
    if (raw === null)
      return [];
    const e2ee = this.plugin.e2ee;
    const probe = this.serializer.unserialize(raw);
    if (probe.type_ === 9) {
      e2ee.feedMasterKey(probe);
      return [];
    }
    const item = this.serializer.unserialize(raw);
    item.updated_time = d.jop_updated_time ?? item.updated_time;
    if (e2ee.isEncrypted(item)) {
      try {
        const decryptedBody = await e2ee.decryptItem(item);
        if (decryptedBody !== null) {
          const decrypted = this.serializer.unserialize(decryptedBody);
          decrypted.updated_time = item.updated_time;
          if (!this.belongsToRoot(decrypted))
            return [];
          return [decrypted];
        }
      } catch (e) {
        console.warn("[joplin-sync] E2EE decrypt failed for " + d.name + ": " + e.message);
        return [];
      }
    }
    if (!this.belongsToRoot(item))
      return [];
    return [item];
  }
  async applyNote(item) {
    const mapping = this.plugin.mapping.getById(item.id);
    const targetDir = this.resolveFolderPath(item.parent_id);
    const targetPath = this.uniquePath(targetDir, this.sanitize(item.title), item.id);
    if (!mapping) {
      await this.writeFile(targetPath, item.body ?? "");
      await this.saveMapping(item, targetPath);
      return;
    }
    if (item.updated_time <= mapping.remoteUpdatedTime)
      return;
    const localFile = this.plugin.app.vault.getAbstractFileByPath(mapping.path);
    const localContent = localFile ? await this.plugin.app.vault.read(localFile) : null;
    const localChanged = localContent !== null && await sha256(localContent) !== mapping.localHash;
    if (localChanged) {
      await this.conflicts.resolve(mapping, item, localContent, targetPath);
      return;
    }
    if (mapping.path !== targetPath && localFile) {
      this.watcher.suppress(mapping.path);
      this.watcher.suppress(targetPath);
      await this.plugin.app.vault.rename(localFile, targetPath);
      this.watcher.release(mapping.path);
      this.watcher.release(targetPath);
    }
    await this.writeFile(targetPath, item.body ?? "");
    await this.saveMapping(item, targetPath);
  }
  async applyFolder(item) {
    const parentPath = this.resolveFolderPath(item.parent_id);
    const path4 = parentPath + this.sanitize(item.title) + "/";
    const mapping = this.plugin.mapping.getById(item.id);
    const dirPath = path4.replace(/\/$/, "");
    if (!this.plugin.app.vault.getAbstractFileByPath(dirPath)) {
      if (parentPath && !this.plugin.app.vault.getAbstractFileByPath(parentPath.replace(/\/$/, ""))) {
        this.watcher.suppress(parentPath.replace(/\/$/, ""));
        try {
          await this.plugin.app.vault.createFolder(parentPath.replace(/\/$/, ""));
        } catch {
        }
        this.watcher.release(parentPath.replace(/\/$/, ""));
      }
      this.watcher.suppress(dirPath);
      await this.plugin.app.vault.createFolder(dirPath).catch(() => {
      });
      this.watcher.release(dirPath);
    }
    if (mapping && mapping.path !== path4) {
      const oldDir = mapping.path.replace(/\/$/, "");
      const f = this.plugin.app.vault.getAbstractFileByPath(oldDir);
      if (f) {
        this.watcher.suppress(oldDir);
        this.watcher.suppress(dirPath);
        await this.plugin.app.vault.rename(f, dirPath);
        this.watcher.release(oldDir);
        this.watcher.release(dirPath);
      }
      this.plugin.mapping.renamePrefix(mapping.path, path4);
    }
    this.plugin.mapping.upsert({
      joplinId: item.id,
      path: path4,
      type: 2 /* Folder */,
      localHash: "",
      remoteUpdatedTime: item.updated_time,
      syncedAt: Date.now()
    });
  }
  async applyDelete(id) {
    const mapping = this.plugin.mapping.getById(id);
    if (!mapping)
      return;
    const f = this.plugin.app.vault.getAbstractFileByPath(mapping.path.replace(/\/$/, ""));
    if (f) {
      this.watcher.suppress(f.path);
      if (f instanceof TFile) {
        this.plugin.app.fileManager.trashFile(f).catch(() => {
        });
      }
      this.watcher.release(f.path);
    }
    this.plugin.mapping.remove(id);
  }
  async writeFile(path4, content) {
    this.watcher.suppress(path4);
    try {
      const parentDir = path4.includes("/") ? path4.slice(0, path4.lastIndexOf("/")) : "";
      if (parentDir && !this.plugin.app.vault.getAbstractFileByPath(parentDir)) {
        try {
          await this.plugin.app.vault.createFolder(parentDir);
        } catch {
        }
      }
      const existing = this.plugin.app.vault.getAbstractFileByPath(path4);
      if (existing instanceof TFile)
        await this.plugin.app.vault.modify(existing, content);
      else
        await this.plugin.app.vault.create(path4, content);
    } finally {
      this.watcher.release(path4);
    }
  }
  async saveMapping(item, path4) {
    this.plugin.mapping.upsert({
      joplinId: item.id,
      path: path4,
      type: 1 /* Note */,
      localHash: await sha256(item.body ?? ""),
      remoteUpdatedTime: item.updated_time,
      syncedAt: Date.now()
    });
  }
  async applyResource(item) {
    try {
      await this.resources.downloadResource(item);
    } catch (e) {
      console.error("[joplin-sync] download resource failed: " + item.id, e);
    }
  }
  resolveFolderPath(parentId) {
    if (!parentId)
      return "";
    const cached = this.folderPathCache.get(parentId);
    if (cached !== void 0)
      return cached;
    const m = this.plugin.mapping.getById(parentId);
    return m ? m.path : "";
  }
  /** Pre-compute folder paths from delta items (no mapping dependency) */
  buildFolderPaths(folders) {
    this.folderPathCache.clear();
    const sanitize = (t) => safeFileName(t);
    const known = /* @__PURE__ */ new Map();
    for (const f of folders)
      known.set(f.id, sanitize(f.title || ""));
    const paths = /* @__PURE__ */ new Map();
    let remaining = [...folders];
    while (remaining.length > 0) {
      const next = [];
      for (const f of remaining) {
        const parentPath = f.parent_id ? paths.get(f.parent_id) : "";
        if (f.parent_id && parentPath === void 0) {
          next.push(f);
          continue;
        }
        paths.set(f.id, (parentPath || "") + sanitize(f.title || "") + "/");
      }
      if (next.length === remaining.length)
        break;
      remaining = next;
    }
    for (const [id, p] of paths)
      this.folderPathCache.set(id, p);
  }
  sanitize(title) {
    return safeFileName(title);
  }
  uniquePath(dir, name, id) {
    let p = dir + name + ".md";
    const existing = this.plugin.app.vault.getAbstractFileByPath(p);
    const mapped = this.plugin.mapping.getByPath(p);
    if (existing && mapped && mapped.joplinId !== id) {
      p = dir + name + " (" + id.slice(0, 7) + ").md";
    }
    return p;
  }
};

// src/core/InitialSync.ts
init_JoplinSerializer();
init_models();
init_IdGenerator();
var InitialSync = class {
  constructor(plugin) {
    this.plugin = plugin;
    this.serializer = new JoplinSerializer();
  }
  async run() {
    const files = this.collectMarkdownFiles();
    if (files.length === 0) {
      new Notice("No markdown files to sync");
      return;
    }
    const folderMap = await this.createFolders(files);
    let done = 0;
    let fail = 0;
    if (this.plugin.settings.syncFoldersOnly) {
      new Notice("Folders only mode: skipping note upload");
    } else {
      for (const batch of chunk(files, 5)) {
        await Promise.all(batch.map(async (file) => {
          try {
            const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
            const parentId = folderMap.get(dir) || "";
            await this.uploadNote(file, parentId);
            done++;
          } catch (e) {
            fail++;
            console.error("[joplin-sync] initial upload fail [" + fail + "]:", file.path, e?.message || e);
          }
        }));
        await this.plugin.mapping.flush();
      }
    }
    let cursor;
    while (true) {
      const page = await this.plugin.api.delta(cursor);
      cursor = page.cursor;
      if (!page.has_more)
        break;
    }
    this.plugin.mapping.setDeltaCursor(cursor ?? "");
    await this.plugin.mapping.flush();
    new Notice("Initial sync: " + done + " uploaded" + (fail ? ", " + fail + " failed" : ""));
  }
  async createFolders(files) {
    const folderMap = /* @__PURE__ */ new Map();
    folderMap.set("", "");
    const dirs = /* @__PURE__ */ new Set();
    for (const f of files) {
      const d = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
      if (!d)
        continue;
      const parts = d.split("/");
      let accumulated = "";
      for (let i = 0; i < parts.length; i++) {
        accumulated = accumulated ? accumulated + "/" + parts[i] : parts[i];
        if (!folderMap.has(accumulated)) {
          const existing = this.plugin.mapping.getByPath(accumulated + "/");
          if (existing) {
            folderMap.set(accumulated, existing.joplinId);
            continue;
          }
          dirs.add(accumulated);
        }
      }
    }
    for (const dp of [...dirs].sort((a, b) => a.split("/").length - b.split("/").length)) {
      const parent = dp.includes("/") ? folderMap.get(dp.slice(0, dp.lastIndexOf("/"))) || "" : "";
      const fid = createJoplinId();
      const title = dp.split("/").pop() || dp;
      const item = {
        id: fid,
        parent_id: parent,
        title,
        type_: 2 /* Folder */,
        created_time: Date.now(),
        updated_time: Date.now(),
        user_created_time: Date.now(),
        user_updated_time: Date.now(),
        encryption_applied: 0,
        encryption_cipher_text: ""
      };
      try {
        const st = await this.plugin.api.putItem(fid + ".md", this.serializer.serialize(item), true);
        if (st && st.id) {
          this.plugin.mapping.upsert({
            joplinId: fid,
            path: dp + "/",
            type: 2 /* Folder */,
            localHash: "",
            remoteUpdatedTime: st.updated_time || Date.now(),
            syncedAt: Date.now()
          });
          folderMap.set(dp, fid);
        }
      } catch (e) {
        console.warn("[joplin-sync] folder create skipped:", dp, e?.message || e);
      }
    }
    return folderMap;
  }
  async uploadNote(file, parentId) {
    const content = await this.plugin.app.vault.read(file);
    const hash = await sha256(content);
    const id = createJoplinId();
    const now = Date.now();
    const item = {
      id,
      parent_id: parentId,
      title: file.basename,
      body: content,
      created_time: file.stat.ctime,
      updated_time: now,
      user_created_time: file.stat.ctime,
      user_updated_time: file.stat.mtime,
      type_: 1 /* Note */,
      encryption_applied: 0,
      encryption_cipher_text: "",
      markup_language: 1
    };
    const res = await this.plugin.api.putItem(id + ".md", this.serializer.serialize(item), true);
    this.plugin.mapping.upsert({
      joplinId: id,
      path: file.path,
      type: 1 /* Note */,
      localHash: hash,
      remoteUpdatedTime: res.updated_time || now,
      syncedAt: now
    });
  }
  collectMarkdownFiles() {
    const excludes = this.plugin.settings.excludePatterns;
    return this.plugin.app.vault.getMarkdownFiles().filter((f) => !excludes.some((p) => f.path.startsWith(p)));
  }
};

// src/core/SyncEngine.ts
var SyncEngine = class {
  constructor(plugin) {
    this.plugin = plugin;
    this.serializer = new JoplinSerializer();
    this.running = false;
    this.state = 0 /* Idle */;
    this.timer = null;
    this.e2eeActive = false;
    this.forcePullFolderPaths = /* @__PURE__ */ new Map();
    this.syncInfo = new SyncInfoHandler(plugin.api);
    this.resources = new ResourceManager(plugin);
  }
  // ============ Phase 1: Legacy full upload ============
  async runFullUpload() {
    if (this.running) {
      new Notice("Sync already in progress");
      return;
    }
    this.running = true;
    try {
      await this.plugin.api.login();
      await this.syncInfo.checkOrInit();
      this.e2eeActive = this.syncInfo.e2eeEnabled;
      const files = this.collectMarkdownFiles();
      let done = 0, skipped = 0;
      const failed = [];
      for (const batch of chunk(files, 5)) {
        await Promise.all(batch.map(async (file) => {
          try {
            const changed = await this.uploadNote(file, "");
            changed ? done++ : skipped++;
          } catch (e) {
            failed.push(file.path + ": " + e.message);
          }
          this.plugin.statusBar.setProgress(done + skipped, files.length);
        }));
        await this.plugin.mapping.flush();
      }
      new Notice("Upload done: " + done + " uploaded, " + skipped + " unchanged, " + failed.length + " failed");
      if (failed.length)
        console.error("[joplin-sync] failures:", failed);
    } finally {
      this.running = false;
      await this.plugin.mapping.flush();
      this.plugin.statusBar.setIdle();
    }
  }
  async uploadNote(file, parentId, force = false) {
    const content = await this.plugin.app.vault.read(file);
    const hash = await sha256(content);
    const existing = this.plugin.mapping.getByPath(file.path);
    if (!force && existing && existing.localHash === hash)
      return false;
    const id = existing?.joplinId ?? createJoplinId();
    const item = {
      id,
      parent_id: parentId,
      title: file.basename,
      body: content,
      created_time: file.stat.ctime,
      updated_time: file.stat.mtime,
      user_created_time: file.stat.ctime,
      user_updated_time: file.stat.mtime,
      type_: 1 /* Note */,
      encryption_applied: 0,
      encryption_cipher_text: "",
      markup_language: 1
    };
    const payload = this.serializer.serialize(item);
    const result = await this.plugin.api.putItem(id + ".md", payload, force);
    try {
      const raw = await this.plugin.api.getItem(id + ".md");
      if (raw) {
        const remote = this.serializer.unserialize(raw);
        const remoteHash = await sha256(remote.body ?? "");
        if (remoteHash !== hash) {
          console.warn("[joplin-sync] verify mismatch for: " + file.path + " (expected " + hash + ", got " + remoteHash + ")");
        }
      }
    } catch (verifyErr) {
      console.warn("[joplin-sync] verify skipped for: " + file.path + " - " + (verifyErr?.message || verifyErr));
    }
    this.plugin.mapping.upsert({
      joplinId: id,
      path: file.path,
      type: 1 /* Note */,
      localHash: hash,
      remoteUpdatedTime: result.updated_time,
      syncedAt: Date.now()
    });
    return true;
  }
  ensureRootFolder() {
    return "";
  }
  collectMarkdownFiles() {
    const excludes = this.plugin.settings.excludePatterns;
    return this.plugin.app.vault.getMarkdownFiles().filter((f) => !excludes.some((p) => f.path.startsWith(p)));
  }
  // ============ Phase 2: Watcher + Scheduler ============
  startWatching() {
    this.queue = new ChangeQueue(this.plugin);
    void this.queue.restore();
    this.watcher = new VaultWatcher(this.plugin, this.queue);
    this.watcher.start();
    this.pusher = new LocalPusher(this.plugin, this.queue);
    this.deltaPuller = new DeltaPuller(this.plugin, this.watcher);
  }
  ensureReady() {
    if (!this.queue) {
      this.queue = new ChangeQueue(this.plugin);
      void this.queue.restore();
    }
    if (!this.watcher) {
      this.watcher = new VaultWatcher(this.plugin, this.queue);
      this.watcher.start();
    }
    if (!this.pusher)
      this.pusher = new LocalPusher(this.plugin, this.queue);
    if (!this.deltaPuller)
      this.deltaPuller = new DeltaPuller(this.plugin, this.watcher);
  }
  startScheduler() {
    const interval = this.plugin.settings.syncIntervalSec;
    if (interval > 0) {
      this.timer = window.setInterval(() => this.syncCycle(), interval * 1e3);
    }
    if (this.plugin.settings.syncOnStartup) {
      window.setTimeout(() => this.syncCycle(), 5e3);
    }
  }
  // ============ Phase 2: Sync Cycle ============
  async syncCycle() {
    if (this.state !== 0 /* Idle */) {
      new Notice("Sync already in progress");
      return;
    }
    this.ensureReady();
    try {
      this.state = 1 /* Pushing */;
      this.plugin.statusBar.setSyncing("pushing...");
      await this.plugin.api.login();
      await this.syncInfo.checkOrInit();
      this.e2eeActive = this.syncInfo.e2eeEnabled;
      if (!this.plugin.mapping.getDeltaCursor()) {
        this.plugin.statusBar.setSyncing("initial sync...");
        await new InitialSync(this.plugin).run();
      }
      this.state = 1 /* Pushing */;
      const pushResult = await this.pusher.pushAll();
      this.plugin.statusBar.setProgress(pushResult.ok, Math.max(pushResult.ok, 1), "push");
      this.state = 2 /* Pulling */;
      this.plugin.statusBar.setSyncing("pulling...");
      const pullResult = await this.deltaPuller.pullAll();
      this.plugin.statusBar.setProgress(pullResult.ok, Math.max(pullResult.ok, 1), "pull");
      this.state = 3 /* Resolving */;
      for (const t of [...this.plugin.mapping.tombstones]) {
        await this.plugin.api.deleteItem(t.joplinId + ".md");
        this.plugin.mapping.clearTombstone(t.joplinId);
      }
      const totalMapped = this.plugin.mapping.all().length;
      this.plugin.statusBar.setOk(Date.now(), totalMapped);
      const totalFail = (pushResult?.fail ?? 0) + (pullResult?.fail ?? 0);
      this.plugin.logSync("sync", totalMapped, totalFail);
      new Notice("Sync complete: " + totalMapped + " items mapped, " + totalFail + " failed");
    } catch (e) {
      this.state = 4 /* Error */;
      const msg = e?.message || e?.toString() || "Unknown error";
      console.error("[joplin-sync] sync cycle failed:", msg);
      this.plugin.statusBar.setError(msg);
      new Notice("Sync failed: " + msg, 8e3);
    } finally {
      await this.plugin.mapping.flush();
      this.state = 0 /* Idle */;
    }
  }
  async shutdown() {
    if (this.timer)
      window.clearInterval(this.timer);
  }
  // Phase 3: pre-assign note ID for link resolution
  async preassignNoteId(file) {
    const id = createJoplinId();
    this.plugin.mapping.upsert({
      joplinId: id,
      path: file.path,
      type: 1 /* Note */,
      localHash: "",
      remoteUpdatedTime: 0,
      syncedAt: Date.now()
    });
    return id;
  }
  // ============ Force Push: overwrite server with local ============
  async forcePush() {
    if (this.running) {
      new Notice("Sync already in progress");
      return;
    }
    this.running = true;
    try {
      this.plugin.statusBar.setSyncing("force push: rebuilding server...");
      await this.plugin.api.login();
      await this.syncInfo.checkOrInit();
      this.e2eeActive = this.syncInfo.e2eeEnabled;
      const rootFolderId = "";
      const files = this.collectMarkdownFiles();
      const pushedNoteIds = /* @__PURE__ */ new Set();
      const pushedFolderIds = /* @__PURE__ */ new Set();
      const folderMap = /* @__PURE__ */ new Map();
      folderMap.set("", rootFolderId);
      const dirs = /* @__PURE__ */ new Set();
      for (const f of files) {
        const d = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
        if (!d)
          continue;
        const parts = d.split("/");
        let accumulated = "";
        for (let i = 0; i < parts.length; i++) {
          accumulated = accumulated ? accumulated + "/" + parts[i] : parts[i];
          if (!folderMap.has(accumulated)) {
            const existing = this.plugin.mapping.getByPath(accumulated + "/");
            if (existing) {
              folderMap.set(accumulated, existing.joplinId);
              continue;
            }
            dirs.add(accumulated);
          }
        }
      }
      let folderCount = 0;
      for (const dp of [...dirs].sort((a, b) => a.split("/").length - b.split("/").length)) {
        const parent = dp.includes("/") ? folderMap.get(dp.slice(0, dp.lastIndexOf("/"))) || rootFolderId : rootFolderId;
        const fid = createJoplinId();
        const title = dp.split("/").pop() || dp;
        const item = {
          id: fid,
          parent_id: parent,
          title,
          type_: 2 /* Folder */,
          created_time: Date.now(),
          updated_time: Date.now(),
          user_created_time: Date.now(),
          user_updated_time: Date.now(),
          encryption_applied: 0,
          encryption_cipher_text: ""
        };
        try {
          const st = await this.plugin.api.putItem(fid + ".md", this.serializer.serialize(item), true);
          if (st && st.id) {
            this.plugin.mapping.upsert({
              joplinId: fid,
              path: dp + "/",
              type: 2 /* Folder */,
              localHash: "",
              remoteUpdatedTime: st.updated_time || Date.now(),
              syncedAt: Date.now()
            });
            folderMap.set(dp, fid);
            pushedFolderIds.add(fid);
            folderCount++;
          }
        } catch (e) {
        }
      }
      const totalFolders = folderMap.size - 1;
      let done = 0;
      let fail = 0;
      if (this.plugin.settings.syncFoldersOnly) {
        new Notice("Force push: " + totalFolders + " folders synced (folders-only mode)");
        this.plugin.logSync("folders", totalFolders, 0);
        done = totalFolders;
      } else {
        for (const batch of chunk(files, 5)) {
          await Promise.all(batch.map(async (file) => {
            try {
              const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
              const parentId = folderMap.get(dir) || rootFolderId;
              await this.uploadNote(file, parentId, true);
              const m = this.plugin.mapping.getByPath(file.path);
              if (m)
                pushedNoteIds.add(m.joplinId);
              done++;
            } catch (e) {
              fail++;
              console.error("[joplin-sync] upload fail [" + fail + "]:", file.path, e?.message || e);
            }
          }));
          await this.plugin.mapping.flush();
        }
      }
      if (!this.plugin.settings.syncFoldersOnly) {
        console.log("[joplin-sync] force push notes: done=" + done + " fail=" + fail + " pushedNoteIds=" + pushedNoteIds.size);
        this.plugin.logSync("push", done, fail);
      }
      const pushedResourceIds = /* @__PURE__ */ new Set();
      if (!this.plugin.settings.syncFoldersOnly) {
        const excludes = this.plugin.settings.excludePatterns;
        const isExcluded = (p) => excludes.some((e) => p.startsWith(e)) || p.includes("/.obsidian/") || p.startsWith(".obsidian/");
        const allFiles = this.plugin.app.vault.getFiles();
        let rDone = 0, rFail = 0;
        for (const f of allFiles) {
          if (f.extension === "md")
            continue;
          if (isExcluded(f.path))
            continue;
          try {
            const rid = await this.resources.uploadResource(f);
            pushedResourceIds.add(rid);
            rDone++;
          } catch (e) {
            rFail++;
            console.error("[joplin-sync] resource upload fail:", f.path, e?.message || e);
          }
        }
        if (rDone || rFail)
          console.log("[joplin-sync] force push files: " + rDone + " uploaded, " + rFail + " failed");
      }
      let removed = 0, removedNotes = 0, removedFolders = 0, removedResources = 0;
      const remote = await this.listAllRemoteItems();
      console.log("[joplin-sync] force push cleanup: scanning " + remote.length + " remote items");
      for (const stat of remote) {
        const noteMatch = stat.name.match(/^([0-9a-f]{32})\.md$/);
        if (noteMatch) {
          const id = noteMatch[1];
          const entry = this.plugin.mapping.getById(id);
          if (entry?.type === 2 /* Folder */) {
            if (!pushedFolderIds.has(id)) {
              try {
                await this.plugin.api.deleteItem(stat.name);
                removed++;
                removedFolders++;
              } catch {
              }
            }
          } else if (entry?.type === 4 /* Resource */) {
            if (!pushedResourceIds.has(id)) {
              try {
                await this.plugin.api.deleteItem(stat.name);
                removed++;
                removedResources++;
              } catch {
              }
            }
          } else if (!this.plugin.settings.syncFoldersOnly) {
            if (!pushedNoteIds.has(id)) {
              try {
                await this.plugin.api.deleteItem(stat.name);
                removed++;
                removedNotes++;
              } catch {
              }
            }
          }
        } else {
          const resMatch = stat.name.match(/^\.resource\/([0-9a-f]{32})$/);
          if (resMatch && !this.plugin.settings.syncFoldersOnly) {
            const id = resMatch[1];
            if (!pushedResourceIds.has(id)) {
              try {
                await this.plugin.api.deleteItem(stat.name);
                removed++;
              } catch {
              }
            }
          }
        }
      }
      if (removed)
        console.log("[joplin-sync] force push cleaned " + removed + " items (notes=" + removedNotes + " folders=" + removedFolders + " resources=" + removedResources + ")");
      let cursor;
      while (true) {
        const page = await this.plugin.api.delta(cursor);
        cursor = page.cursor;
        if (!page.has_more)
          break;
      }
      this.plugin.mapping.setDeltaCursor(cursor ?? "");
      this.plugin.statusBar.setOk(Date.now(), done);
    } finally {
      this.running = false;
      await this.plugin.mapping.flush();
      this.plugin.statusBar.setIdle();
    }
  }
  // ============ Force Pull: overwrite local with server ============
  async forcePull() {
    if (this.running) {
      new Notice("Sync already in progress");
      return;
    }
    this.running = true;
    try {
      this.plugin.statusBar.setSyncing("force pull: clearing local...");
      await this.plugin.api.login();
      const allFiles = this.plugin.app.vault.getFiles();
      let delCount = 0;
      for (const f of allFiles) {
        if (f.extension === "md") {
          this.plugin.app.fileManager.trashFile(f).catch(() => {
          });
          delCount++;
        }
      }
      this.plugin.mapping.setDeltaCursor("");
      console.debug("[joplin-sync] force pull: deleted " + delCount + " local files");
      const remoteStats = await this.listAllRemoteItems();
      const e2ee = this.plugin.e2ee;
      let done = 0;
      let failed = 0;
      let skipped = 0;
      const allItems = [];
      for (const stat of remoteStats) {
        if (!/^[0-9a-f]{32}\.md$/.test(stat.name))
          continue;
        if (stat.name.startsWith(".resource/"))
          continue;
        try {
          const raw = await this.plugin.api.getItem(stat.name);
          if (!raw)
            continue;
          const item = this.serializer.unserialize(raw);
          if (item.type_ === 9) {
            e2ee.feedMasterKey(item);
            continue;
          }
          if (e2ee.isEncrypted(item)) {
            try {
              const ds = await e2ee.decryptItem(item);
              if (ds) {
                const d = this.serializer.unserialize(ds);
                allItems.push(d);
              }
            } catch {
              failed++;
              continue;
            }
          } else {
            allItems.push(item);
          }
        } catch (e) {
          failed++;
          if (failed <= 3)
            console.error("[joplin-sync] force-pull:", stat.name, e);
        }
      }
      const folders = allItems.filter((i) => i.type_ === 2 /* Folder */);
      this.buildForcePullFolderPaths(folders);
      for (const f of folders) {
        if (!f.title) {
          skipped++;
          continue;
        }
        try {
          const parentPath = this.resolveForcePullFolderPath(f.parent_id);
          const dirName = safeFileName(f.title);
          const dirPath = parentPath + dirName;
          if (!this.plugin.app.vault.getAbstractFileByPath(dirPath)) {
            await this.plugin.app.vault.createFolder(dirPath).catch(() => {
            });
          }
          this.plugin.mapping.upsert({
            joplinId: f.id,
            path: dirPath + "/",
            type: 2 /* Folder */,
            localHash: "",
            remoteUpdatedTime: f.updated_time,
            syncedAt: Date.now()
          });
        } catch (e) {
          console.warn("[joplin-sync] force-pull folder:", f.title, e?.message || e);
        }
      }
      const notes = allItems.filter((i) => i.type_ === 1 /* Note */);
      for (const item of notes) {
        if (!item.title) {
          skipped++;
          continue;
        }
        try {
          const dir = this.resolveForcePullFolderPath(item.parent_id);
          const sanitized = safeFileName(item.title);
          const path4 = dir + sanitized + ".md";
          let body = item.body ?? "";
          if (e2ee.isEncrypted(item)) {
            try {
              const ds = await e2ee.decryptItem(item);
              if (ds) {
                const d = this.serializer.unserialize(ds);
                body = d.body ?? "";
              }
            } catch {
              failed++;
              continue;
            }
          }
          if (dir && !this.plugin.app.vault.getAbstractFileByPath(dir.replace(/\/$/, ""))) {
            try {
              await this.plugin.app.vault.createFolder(dir.replace(/\/$/, ""));
            } catch {
            }
          }
          const existing = this.plugin.app.vault.getAbstractFileByPath(path4);
          if (existing) {
            await this.plugin.app.vault.modify(existing, body || "");
          } else {
            await this.plugin.app.vault.create(path4, body || "");
          }
          const hash = await sha256(body);
          this.plugin.mapping.upsert({
            joplinId: item.id,
            path: path4,
            type: 1 /* Note */,
            localHash: hash,
            remoteUpdatedTime: item.updated_time,
            syncedAt: Date.now()
          });
          done++;
        } catch (e) {
          failed++;
          const msg = e?.message || "";
          if (msg.includes("401"))
            try {
              await this.plugin.api.login();
            } catch {
            }
          if (failed <= 3)
            console.error("[joplin-sync] force-pull:", item.title, msg);
        }
        this.plugin.statusBar.setProgress(done + failed + skipped, remoteStats.length, "pull");
      }
      let cursor;
      while (true) {
        const page = await this.plugin.api.delta(cursor);
        cursor = page.cursor;
        if (!page.has_more)
          break;
      }
      this.plugin.mapping.setDeltaCursor(cursor ?? "");
      await this.plugin.mapping.flush();
      const resources = allItems.filter((i) => i.type_ === 4 /* Resource */);
      const downloadedPaths = /* @__PURE__ */ new Set();
      let rDone = 0, rFail = 0;
      for (const r of resources) {
        try {
          const p = await this.resources.downloadResource(r);
          if (p)
            downloadedPaths.add(p);
          rDone++;
        } catch (e) {
          rFail++;
          if (rFail <= 3)
            console.error("[joplin-sync] force-pull resource:", r.id, e?.message || e);
        }
      }
      if (rDone || rFail)
        console.log("[joplin-sync] force pull attachments: " + rDone + " downloaded, " + rFail + " failed");
      const excludes = this.plugin.settings.excludePatterns;
      const isExcluded = (p) => excludes.some((e) => p.startsWith(e)) || p.includes("/.obsidian/") || p.startsWith(".obsidian/");
      let localRemoved = 0;
      for (const f of this.plugin.app.vault.getFiles()) {
        if (f.extension === "md")
          continue;
        if (isExcluded(f.path))
          continue;
        if (downloadedPaths.has(f.path))
          continue;
        try {
          await this.plugin.app.fileManager.trashFile(f);
          localRemoved++;
        } catch {
        }
      }
      if (localRemoved)
        console.log("[joplin-sync] force pull removed " + localRemoved + " stale local files");
      new Notice("Force pull: " + done + " notes, " + failed + " failed" + (rDone ? ", " + rDone + " attachments" : ""));
      this.plugin.logSync("pull", done, failed);
      this.plugin.statusBar.setOk(Date.now(), done);
    } catch (e) {
      const msg = e?.message || e?.toString() || "Unknown error";
      console.error("[joplin-sync] force pull failed:", msg);
      this.plugin.statusBar.setError(msg);
      new Notice("Force pull failed: " + msg, 8e3);
    } finally {
      this.running = false;
      await this.plugin.mapping.flush();
      this.plugin.statusBar.setIdle();
    }
  }
  buildForcePullFolderPaths(folders) {
    this.forcePullFolderPaths.clear();
    const sanitize = (t) => safeFileName(t);
    const paths = /* @__PURE__ */ new Map();
    let remaining = [...folders];
    while (remaining.length > 0) {
      const next = [];
      for (const f of remaining) {
        let parentPath;
        if (f.parent_id) {
          parentPath = paths.get(f.parent_id) ?? this.forcePullFolderPaths.get(f.parent_id);
          if (parentPath === void 0) {
            const m = this.plugin.mapping.getById(f.parent_id);
            if (m) {
              paths.set(f.id, m.path);
              continue;
            }
            next.push(f);
            continue;
          }
        } else {
          parentPath = "";
        }
        paths.set(f.id, parentPath + sanitize(f.title || "") + "/");
      }
      if (next.length === remaining.length)
        break;
      remaining = next;
    }
    for (const [id, p] of paths)
      this.forcePullFolderPaths.set(id, p);
  }
  resolveForcePullFolderPath(parentId) {
    if (!parentId)
      return "";
    const cached = this.forcePullFolderPaths.get(parentId);
    if (cached !== void 0)
      return cached;
    const m = this.plugin.mapping.getById(parentId);
    return m ? m.path : "";
  }
  // Enumerate EVERY live item on the server (notes, folders, resource metadata,
  // and resource blobs). Our addressing is FLAT: every Joplin item lives at
  // `root:/<id>.md` (or `root:/.resource/<id>` for resource blobs), with the
  // logical hierarchy encoded in each item's `parent_id` field — NOT in the
  // file-system path. Because of that, the server's path-based listing exposes
  // ALL items as direct children of root, regardless of their real folder
  // nesting. So we simply paginate `listChildrenOf(root)` to obtain the full
  // live set.
  //
  // Why not the `delta` endpoint? The real Joplin Server's delta feed (a) does
  // NOT return `item_type`, and (b) is a change-log that accumulates delete
  // events forever. Reconstructing "what is currently live" from it is fragile
  // and, in practice, caused forcePush's cleanup to delete every note and
  // forcePull to silently skip the whole vault.
  async listAllRemoteItems() {
    const out = [];
    let cursor;
    while (true) {
      const page = await this.plugin.api.listChildrenOf("", cursor);
      for (const it of page.items) {
        const name = it.name || "";
        if (!name)
          continue;
        out.push({ name, updated_time: Number(it.updated_time) || 0 });
      }
      cursor = page.cursor;
      if (!page.has_more)
        break;
    }
    return out;
  }
};
async function sha256(text) {
  const data = typeof text === "string" ? new TextEncoder().encode(text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")) : text;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size)
    out.push(arr.slice(i, i + size));
  return out;
}

// test/mock/vault.ts
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
var MockVault = class {
  constructor(root) {
    this.root = root;
    this.adapter = new MockAdapter();
    if (!fs2.existsSync(root))
      fs2.mkdirSync(root, { recursive: true });
  }
  abs(p) {
    return path2.join(this.root, p.replace(/^\/+/, ""));
  }
  getMarkdownFiles() {
    return this.walk().filter((f) => f.endsWith(".md")).map((f) => new TFile(f));
  }
  getFiles() {
    return this.walk().filter((f) => {
      const ext = f.split(".").pop() || "";
      return ext.length > 0 && ext !== "md" ? true : f.endsWith(".md");
    }).map((f) => new TFile(f));
  }
  walk() {
    const out = [];
    const rec = (dir) => {
      let ents;
      try {
        ents = fs2.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of ents) {
        const full = path2.join(dir, e.name);
        const rel = path2.relative(this.root, full).split(path2.sep).join("/");
        if (e.isDirectory())
          rec(full);
        else
          out.push(rel);
      }
    };
    rec(this.root);
    return out;
  }
  getAbstractFileByPath(p) {
    const clean = p.replace(/\/+$/, "");
    const abs = this.abs(clean);
    try {
      const st = fs2.statSync(abs);
      if (st.isDirectory())
        return new TFolder(clean + "/");
      if (st.isFile())
        return new TFile(clean);
    } catch {
      return null;
    }
    return null;
  }
  async create(p, content) {
    const abs = this.abs(p);
    fs2.mkdirSync(path2.dirname(abs), { recursive: true });
    fs2.writeFileSync(abs, content);
  }
  async createBinary(p, content) {
    const abs = this.abs(p);
    fs2.mkdirSync(path2.dirname(abs), { recursive: true });
    fs2.writeFileSync(abs, Buffer.from(content));
  }
  async modifyBinary(file, content) {
    const p = typeof file === "string" ? file : file.path;
    fs2.writeFileSync(this.abs(p), Buffer.from(content));
  }
  async modify(file, content) {
    const p = typeof file === "string" ? file : file.path;
    fs2.writeFileSync(this.abs(p), content);
  }
  async createFolder(p) {
    fs2.mkdirSync(this.abs(p), { recursive: true });
  }
  async read(file) {
    const p = typeof file === "string" ? file : file.path;
    return fs2.readFileSync(this.abs(p), "utf8");
  }
  async readBinary(file) {
    const p = typeof file === "string" ? file : file.path;
    const buf = fs2.readFileSync(this.abs(p));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
};
var MockFileManager = class {
  constructor(vault) {
    this.vault = vault;
  }
  async trashFile(file) {
    const abs = path2.join(this.vault.root, file.path);
    try {
      fs2.rmSync(abs, { force: true });
    } catch {
    }
  }
};
var MockAdapter = class {
  constructor() {
    this.store = /* @__PURE__ */ new Map();
  }
  async exists(p) {
    return this.store.has(p);
  }
  async read(p) {
    return this.store.get(p) || "";
  }
  async write(p, content) {
    this.store.set(p, content);
  }
  async mkdir(_p) {
  }
  async rename(from, to) {
    const v = this.store.get(from);
    if (v !== void 0) {
      this.store.delete(from);
      this.store.set(to, v);
    }
  }
  async remove(p) {
    this.store.delete(p);
  }
};
var DiskAdapter = class {
  async exists(p) {
    try {
      return fs2.existsSync(p);
    } catch {
      return false;
    }
  }
  async read(p) {
    return fs2.readFileSync(p, "utf8");
  }
  async write(p, content) {
    fs2.mkdirSync(path2.dirname(p), { recursive: true });
    fs2.writeFileSync(p, content);
  }
  async mkdir(p) {
    fs2.mkdirSync(p, { recursive: true });
  }
  async rename(from, to) {
    fs2.mkdirSync(path2.dirname(to), { recursive: true });
    fs2.renameSync(from, to);
  }
  async remove(p) {
    fs2.rmSync(p, { force: true });
  }
};

// src/settings/PluginSettings.ts
var DEFAULT_SETTINGS = {
  serverUrl: "",
  email: "",
  password: "",
  syncIntervalSec: 300,
  syncOnStartup: false,
  syncFoldersOnly: false,
  conflictStrategy: "duplicate",
  excludePatterns: [".obsidian/", "_conflicts/", "templates/", ".directory", ".noteforge/"],
  attachmentFolder: "attachments",
  maxAttachmentMB: 100,
  clientId: "",
  logLevel: "info",
  syncLog: [],
  e2eePassword: ""
};

// cli/sync-cli.ts
function loadCreds(vaultPath) {
  const p = path3.join(vaultPath, ".obsidian/plugins/joplin-server-sync/data.json");
  if (!fs3.existsSync(p))
    throw new Error("No plugin config found at " + p + " \u2014 deploy the plugin first.");
  const d = JSON.parse(fs3.readFileSync(p, "utf8"));
  return {
    serverUrl: d.serverUrl,
    email: d.email,
    password: d.password,
    attachmentFolder: d.attachmentFolder || "attachments",
    excludePatterns: d.excludePatterns || []
  };
}
function makePlugin(vaultRoot2, creds) {
  const vault = new MockVault(vaultRoot2);
  vault.adapter = new DiskAdapter();
  const api = new JoplinServerApi(() => ({
    baseUrl: creds.serverUrl,
    email: creds.email,
    password: creds.password
  }));
  const plugin = {
    app: { vault, fileManager: new MockFileManager(vault) },
    api,
    settings: { ...DEFAULT_SETTINGS, attachmentFolder: creds.attachmentFolder, excludePatterns: creds.excludePatterns },
    manifest: { dir: path3.join(vaultRoot2, ".obsidian/plugins/joplin-server-sync") },
    statusBar: {
      setSyncing(m) {
        console.log("  [status]", m);
      },
      setProgress() {
      },
      setIdle() {
      },
      setOk() {
      },
      setError(e) {
        console.log("  [ERROR]", e);
      }
    },
    logSync() {
    },
    e2ee: { feedMasterKey() {
    }, isEncrypted() {
      return false;
    }, decryptItem() {
      return null;
    } }
  };
  plugin.mapping = new MappingStore(plugin);
  return plugin;
}
async function main() {
  const [mode, vaultPath] = process.argv.slice(2);
  if (!mode || !vaultPath) {
    console.log("Usage: node cli/sync-cli.js <push|pull|sync|diag> <vaultPath>");
    process.exit(1);
  }
  const creds = loadCreds(vaultPath);
  setVaultRoot(vaultPath);
  const plugin = makePlugin(vaultPath, creds);
  await plugin.mapping.load();
  const engine = new SyncEngine(plugin);
  console.log(`== ${mode} on ${vaultPath} ==`);
  if (mode === "push")
    await engine.forcePush();
  else if (mode === "pull")
    await engine.forcePull();
  else if (mode === "sync")
    await engine.syncCycle();
  else if (mode === "probe2") {
    await plugin.api.login();
    const { createJoplinId: createJoplinId2 } = (init_IdGenerator(), __toCommonJS(IdGenerator_exports));
    const { JoplinSerializer: JoplinSerializer2 } = (init_JoplinSerializer(), __toCommonJS(JoplinSerializer_exports));
    const { ModelType: ModelType2 } = (init_models(), __toCommonJS(models_exports));
    const ser = new JoplinSerializer2();
    const F1 = createJoplinId2();
    const now = Date.now();
    await plugin.api.putItem(F1 + ".md", ser.serialize({
      id: F1,
      parent_id: "",
      title: "PROBE_FOLDER",
      type_: ModelType2.Folder,
      created_time: now,
      updated_time: now,
      user_created_time: now,
      user_updated_time: now,
      encryption_applied: 0,
      encryption_cipher_text: ""
    }), true);
    console.log("PUT folder", F1);
    const N1 = createJoplinId2();
    await plugin.api.putItem(N1 + ".md", ser.serialize({
      id: N1,
      parent_id: F1,
      title: "PROBE_NOTE",
      body: "hello probe",
      type_: ModelType2.Note,
      created_time: now,
      updated_time: now,
      user_created_time: now,
      user_updated_time: now,
      encryption_applied: 0,
      encryption_cipher_text: "",
      markup_language: 1
    }), true);
    console.log("PUT note", N1, "parent", F1);
    const raw = (p) => plugin.api.rawRequest("GET", "/api/items/root:/" + p + ":/content");
    console.log("GET folder flat      =>", (await raw(F1 + ".md")).status);
    console.log("GET note  flat      =>", (await raw(N1 + ".md")).status);
    console.log("GET note  nested    =>", (await raw(F1 + "/" + N1 + ".md")).status);
    console.log("listChildren root    =>", (await plugin.api.listChildrenOf("")).items.length);
    console.log("listChildren folder  =>", (await plugin.api.listChildrenOf(F1)).items.length);
    await plugin.api.deleteItem(N1 + ".md");
    await plugin.api.deleteItem(F1 + ".md");
    console.log("cleaned up probe items");
    const fs4 = require("fs");
    const mapPath = path3.join(vaultPath, ".obsidian/plugins/joplin-server-sync/data/mapping.json");
    const map = JSON.parse(fs4.readFileSync(mapPath, "utf8"));
    const notes = (map.entries || []).filter((e) => e.type === 1).slice(0, 20);
    const folders = (map.entries || []).filter((e) => e.type === 2).slice(0, 10);
    let nOk = 0;
    for (const e of notes) {
      const r = await plugin.api.rawRequest("GET", "/api/items/root:/" + e.joplinId + ".md:/content");
      if (r.status === 200)
        nOk++;
    }
    let fOk = 0;
    for (const e of folders) {
      const r = await plugin.api.rawRequest("GET", "/api/items/root:/" + e.joplinId + ".md:/content");
      if (r.status === 200)
        fOk++;
    }
    console.log(`mapping notes sampled=${notes.length} retrievable=${nOk} | folders sampled=${folders.length} retrievable=${fOk}`);
    const fs22 = require("fs");
    const p2 = require("path");
    const realNotePath = [];
    const walk = (d) => {
      if (realNotePath.length)
        return;
      let ents;
      try {
        ents = fs22.readdirSync(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of ents) {
        if (realNotePath.length)
          return;
        const full = p2.join(d, e.name);
        if (e.isDirectory()) {
          if (!e.name.startsWith("."))
            walk(full);
        } else if (e.name.endsWith(".md"))
          realNotePath.push(full);
      }
    };
    walk(vaultPath);
    if (realNotePath.length) {
      const fp = realNotePath[0];
      const body = fs22.readFileSync(fp, "utf8");
      const RN = createJoplinId2();
      const ser3 = ser.serialize({
        id: RN,
        parent_id: "",
        title: p2.basename(fp).replace(/\.md$/, ""),
        body,
        type_: ModelType2.Note,
        created_time: now,
        updated_time: now,
        user_created_time: now,
        user_updated_time: now,
        encryption_applied: 0,
        encryption_cipher_text: "",
        markup_language: 1
      });
      console.log("REAL upload: " + fp + " (bodyLen " + body.length + ")");
      let putOk = true;
      try {
        const pr = await plugin.api.putItem(RN + ".md", ser3, true);
        console.log("  putItem result:", JSON.stringify(pr).slice(0, 120));
      } catch (err) {
        putOk = false;
        console.log("  putItem THREW:", err.message);
      }
      if (putOk) {
        const r1 = await plugin.api.rawRequest("GET", "/api/items/root:/" + RN + ".md:/content");
        console.log("  after REAL upload GET =>", r1.status, "| len", (r1.text || "").length);
        await plugin.api.deleteItem(RN + ".md");
        console.log("  cleaned up real note");
      }
    } else {
      console.log("no real note found on disk");
    }
  } else if (mode === "diag") {
    await plugin.api.login();
    const fs4 = require("fs");
    const mapPath = path3.join(vaultPath, ".obsidian/plugins/joplin-server-sync/data/mapping.json");
    const map = JSON.parse(fs4.readFileSync(mapPath, "utf8"));
    const entries = map.entries || map.items || [];
    const note = entries.find((e) => e.type === 1);
    const folder = entries.find((e) => e.type === 2);
    console.log("mapping entries:", entries.length, "| sample note id:", note?.joplinId, "| sample folder id:", folder?.joplinId);
    if (note) {
      const rawReq = (p) => plugin.api.rawRequest("GET", "/api/items/root:/" + p + ":/content");
      const r1 = await rawReq(note.joplinId + ".md");
      console.log("RAW GET note @root/<id>.md => status", r1.status, "| len", (r1.text || "").length);
      if (folder) {
        const r2 = await rawReq(folder.joplinId + "/" + note.joplinId + ".md");
        console.log("RAW GET note @root/<folder>/<id>.md => status", r2.status);
        const r3 = await rawReq(folder.joplinId + ".md");
        console.log("RAW GET folder @root/<folder>.md => status", r3.status);
        const ft = folder.path.replace(/\/$/, "").split("/").pop() || folder.path;
        const r4 = await rawReq(encodeURIComponent(ft) + "/" + note.joplinId + ".md");
        console.log("RAW GET note @root/<folderTitle>/<id>.md (" + ft + ") => status", r4.status);
        const r5 = await rawReq(encodeURIComponent(ft) + ".md");
        console.log("RAW GET folder @root/<folderTitle>.md => status", r5.status);
      }
      const res = entries.find((e) => e.type === 4);
      if (res) {
        const rr = await rawReq(res.joplinId + ".md");
        console.log("RAW GET resource @root/<id>.md => status", rr.status, "| len", (rr.text || "").length);
      }
    }
    if (folder) {
      const raw = await plugin.api.getItem(folder.joplinId + ".md");
      console.log("GET folder meta (first 160):", raw ? JSON.stringify(raw.slice(0, 160)) : "NULL");
      try {
        const kids = await plugin.api.listChildrenOf(folder.joplinId);
        console.log("listChildrenOf(folder) count:", kids.items.length, "| sample:", JSON.stringify(kids.items.slice(0, 3)));
      } catch (e) {
        console.log("listChildrenOf(folder) ERROR:", e.message);
      }
    }
    try {
      const root = await plugin.api.listChildrenOf("");
      console.log("listChildrenOf(root) count:", root.items.length, "| sample:", JSON.stringify(root.items.slice(0, 5)));
    } catch (e) {
      console.log("listChildrenOf(root) ERROR:", e.message);
    }
  } else if (mode === "rt") {
    await plugin.api.login();
    const fs4 = require("fs");
    const mapPath = path3.join(vaultPath, ".obsidian/plugins/joplin-server-sync/data/mapping.json");
    const map = JSON.parse(fs4.readFileSync(mapPath, "utf8"));
    const entries = map.entries || map.items || [];
    const noteIds = entries.filter((e) => e.type === 1).map((e) => e.joplinId);
    const names = /* @__PURE__ */ new Map();
    let cur;
    while (true) {
      const p = await plugin.api.delta(cur);
      for (const it of p.items) {
        const n = it.name || "";
        if (n)
          names.set(n, Number(it.type));
      }
      cur = p.cursor;
      if (!p.has_more)
        break;
    }
    const present = noteIds.filter((id) => names.has(id + ".md"));
    const presentNotDeleted = noteIds.filter((id) => names.get(id + ".md") !== 3);
    console.log("mapping note ids:", noteIds.length, "| present (any):", present.length, "| present & not-deleted:", presentNotDeleted.length);
    console.log("sample absent:", JSON.stringify(noteIds.filter((id) => !names.has(id + ".md")).slice(0, 3)));
  } else if (mode === "deltaprobe") {
    await plugin.api.login();
    let cur;
    let count = 0;
    const samples = [];
    const typeCounts = {};
    const itemTypeCounts = {};
    while (true) {
      const p = await plugin.api.delta(cur);
      for (const it of p.items) {
        const t = String(it.type);
        typeCounts[t] = (typeCounts[t] || 0) + 1;
        const it2 = String(it.item_type ?? it.itemType ?? "?");
        itemTypeCounts[it2] = (itemTypeCounts[it2] || 0) + 1;
        if (samples.length < 8)
          samples.push({ ...it });
        count++;
      }
      cur = p.cursor;
      if (!p.has_more)
        break;
    }
    console.log("total delta items:", count);
    console.log("change-type counts (1=create,2=update,3=delete):", JSON.stringify(typeCounts));
    console.log("item_type counts (1=note,2=folder,4=resource):", JSON.stringify(itemTypeCounts));
    console.log("--- sample raw delta items ---");
    for (const s of samples)
      console.log(JSON.stringify(s));
  } else if (mode === "lsroot") {
    await plugin.api.login();
    let cur;
    let total = 0;
    const byExt = {};
    const samples = [];
    while (true) {
      const p = await plugin.api.listChildrenOf("", cur);
      for (const it of p.items) {
        total++;
        const name = it.name || "";
        const ext = name.includes(".") ? name.split(".").pop() : name.includes("/") ? "dir" : "noext";
        byExt[ext] = (byExt[ext] || 0) + 1;
        if (samples.length < 5)
          samples.push({ ...it });
      }
      cur = p.cursor;
      if (!p.has_more)
        break;
    }
    console.log("listChildrenOf(root) TOTAL items:", total);
    console.log("by extension/shape:", JSON.stringify(byExt));
    console.log("--- sample items ---");
    for (const s of samples)
      console.log(JSON.stringify(s));
  } else {
    console.log("Unknown mode: " + mode);
    process.exit(1);
  }
  console.log(`== ${mode} done ==`);
}
main().catch((e) => {
  console.error("CLI ERROR", e);
  process.exit(2);
});
