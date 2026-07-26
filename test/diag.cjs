"use strict";

// test/mock/obsidian-real.ts
var import_crypto = require("crypto");
globalThis.window = globalThis.window || globalThis;
if (!globalThis.crypto)
  globalThis.crypto = import_crypto.webcrypto;
async function requestUrl(param) {
  const headers = { ...param.headers || {} };
  if (param.contentType)
    headers["Content-Type"] = param.contentType;
  const res = await fetch(param.url, { method: param.method, headers, body: param.body });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
  }
  return { status: res.status, text, json, arrayBuffer: new TextEncoder().encode(text).buffer };
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
  async rawRequest(method, path, opts = {}) {
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
        url: this.trimSlash(this.getConfig().baseUrl) + path,
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
  async exec(method, path, opts = {}) {
    const res = await this.rawRequest(method, path, opts);
    let json = null;
    try {
      json = JSON.parse(res.text);
    } catch {
      if (this.execJsonLogCount < 5) {
        this.execJsonLogCount++;
        console.warn("[joplin-sync] non-json response", method, path, "status=" + res.status, "body=" + res.text.slice(0, 200));
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

// src/convert/JoplinSerializer.ts
var NOTE_FIELD_ORDER = [
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
var FOLDER_FIELD_ORDER = [
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
var RESOURCE_FIELD_ORDER = [
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
var TIME_FIELDS = /* @__PURE__ */ new Set([
  "created_time",
  "updated_time",
  "user_created_time",
  "user_updated_time"
]);
var DEFAULTS = {
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
var JoplinSerializer = class {
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
      const sep = line.indexOf(":");
      if (sep < 0)
        continue;
      const key = line.slice(0, sep).trim();
      const value = line.slice(sep + 1).trim();
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

// test/diag.ts
var api = new JoplinServerApi(() => ({
  baseUrl: "https://joplin.8.130.118.200.sslip.io/",
  email: "289@qq.com",
  password: 'gcJG.<|QU6"`'
}));
async function main() {
  await api.login();
  console.log("logged in");
  const names = [];
  let cursor;
  while (true) {
    const page = await api.listChildren(cursor);
    for (const it of page.items)
      names.push(it.name);
    cursor = page.cursor;
    if (!page.has_more)
      break;
  }
  console.log("total items on server:", names.length);
  const noteNames = names.filter((n) => /^[0-9a-f]{32}\.md$/.test(n));
  const resourceNames = names.filter((n) => n.startsWith(".resource/"));
  console.log("notes:", noteNames.length, "resources:", resourceNames.length);
  const serializer = new JoplinSerializer();
  const folders = /* @__PURE__ */ new Map();
  const notes = [];
  let done = 0;
  const B = 8;
  for (let i = 0; i < noteNames.length; i += B) {
    const batch = noteNames.slice(i, i + B);
    await Promise.all(batch.map(async (n) => {
      try {
        const raw = await api.getItem(n);
        if (!raw)
          return;
        const it = serializer.unserialize(raw);
        const o = { id: it.id, title: it.title || "", parent_id: it.parent_id || "", path: "" };
        if (Number(it.type_) === 2 /* Folder */)
          folders.set(o.id, { ...o, path: "" });
        else if (Number(it.type_) === 1 /* Note */)
          notes.push(o);
      } catch (e) {
      }
    }));
    done += batch.length;
  }
  const folderPath = (id, seen = /* @__PURE__ */ new Set()) => {
    if (!id)
      return "";
    const f = folders.get(id);
    if (!f)
      return "";
    if (seen.has(id))
      return "";
    seen.add(id);
    const parent = folderPath(f.parent_id, seen);
    return parent + f.title + "/";
  };
  for (const f of folders.values())
    f.path = folderPath(f.id);
  for (const n of notes)
    n.path = folderPath(n.parent_id) + n.title + ".md";
  const folderPaths = [...folders.values()].map((f) => f.path);
  const dupFolders = folderPaths.filter((p, i) => folderPaths.indexOf(p) !== i);
  const notesMissingFolder = notes.filter((n) => n.parent_id && !folders.has(n.parent_id));
  const notePaths = notes.map((n) => n.path);
  const dupNotes = notePaths.filter((p, i) => notePaths.indexOf(p) !== i);
  console.log("folders:", folders.size);
  console.log("DUPLICATE folder paths on server:", [...new Set(dupFolders)].length, [...new Set(dupFolders)].slice(0, 20));
  console.log("notes with MISSING parent folder:", notesMissingFolder.length);
  console.log("DUPLICATE note paths on server:", [...new Set(dupNotes)].length, [...new Set(dupNotes)].slice(0, 20));
  const fs = require("fs");
  const path = require("path");
  const testFolders = /* @__PURE__ */ new Set();
  const rec = (dir) => {
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (e.name === ".obsidian")
        continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        testFolders.add(path.relative("/home/wang/\u6587\u6863/test", full).split(path.sep).join("/") + "/");
        rec(full);
      }
    }
  };
  rec("/home/wang/\u6587\u6863/test");
  const serverFolderSet = new Set(folderPaths);
  const missingOnServer = [...testFolders].filter((p) => !serverFolderSet.has(p));
  const extraOnServer = [...serverFolderSet].filter((p) => p && !testFolders.has(p));
  console.log("\ntest/ folder count:", testFolders.size, "| server folder count:", serverFolderSet.size);
  console.log("folders in test/ but NOT on server:", missingOnServer.length, missingOnServer.slice(0, 30));
  console.log("folders on server but NOT in test/:", extraOnServer.length, extraOnServer.slice(0, 30));
}
main().catch((e) => {
  console.error("DIAG ERROR", e);
  process.exit(2);
});
