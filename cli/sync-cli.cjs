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

// test/mock/obsidian-real.ts
function setVaultRoot(root) {
  vaultRoot = root;
}
function normalizePath(p) {
  return p;
}
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
var import_crypto, fs, path, vaultRoot, TFile, TFolder, Notice, Modal;
var init_obsidian_real = __esm({
  "test/mock/obsidian-real.ts"() {
    "use strict";
    import_crypto = require("crypto");
    fs = __toESM(require("fs"));
    path = __toESM(require("path"));
    vaultRoot = "";
    TFile = class {
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
    TFolder = class {
      constructor(p) {
        this.path = p;
      }
    };
    Notice = class {
      constructor(_m) {
      }
    };
    Modal = class {
      constructor(app) {
        this.app = app;
        this.titleEl = { setText(_t) {
        } };
        const makeEl = () => ({
          setText(_x) {
          },
          addClass(_c) {
          },
          onclick: void 0,
          createEl(_t, _o) {
            return makeEl();
          },
          createDiv() {
            return makeEl();
          }
        });
        this.contentEl = makeEl();
      }
      open() {
      }
      close() {
      }
    };
    globalThis.window = globalThis.window || globalThis;
    if (!globalThis.crypto)
      globalThis.crypto = import_crypto.webcrypto;
  }
});

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
var NOTE_FIELD_ORDER, FOLDER_FIELD_ORDER, RESOURCE_FIELD_ORDER, MASTER_KEY_FIELD_ORDER, TIME_FIELDS, DEFAULTS, JoplinSerializer;
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
    MASTER_KEY_FIELD_ORDER = [
      "id",
      "created_time",
      "updated_time",
      "user_created_time",
      "user_updated_time",
      "encryption_method",
      "checksum",
      "content",
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
        if (item.type_ === 1 /* Note */ || item.type_ === 9 /* MasterKey */) {
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
        if (item.type_ === 1 /* Note */ || item.type_ === 9 /* MasterKey */) {
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
          case 9 /* MasterKey */:
            return MASTER_KEY_FIELD_ORDER;
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

// src/core/SyncInfo.ts
var SUPPORTED_SYNC_VERSION, SyncInfoHandler;
var init_SyncInfo = __esm({
  "src/core/SyncInfo.ts"() {
    "use strict";
    SUPPORTED_SYNC_VERSION = 3;
    SyncInfoHandler = class {
      constructor(api, getVaultId) {
        this.api = api;
        this.getVaultId = getVaultId;
        this._e2eeEnabled = false;
        this._vaultId = "";
      }
      get e2eeEnabled() {
        return this._e2eeEnabled;
      }
      get serverVaultId() {
        return this._vaultId;
      }
      async checkOrInit() {
        const raw = await this.api.getItem("info.json");
        if (raw === null) {
          const info2 = { version: SUPPORTED_SYNC_VERSION, vaultId: this.getVaultId() };
          await this.api.putItem("info.json", JSON.stringify(info2));
          this._vaultId = info2.vaultId ?? "";
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
        this._vaultId = info.vaultId ?? "";
        if (this._e2eeEnabled) {
          console.warn("[joplin-sync] E2EE target detected \u2014 read-only decryption mode");
        }
        const mine = this.getVaultId();
        if (this._vaultId && mine && this._vaultId !== mine) {
          console.warn('[joplin-sync] Server was first initialized by vault "' + this._vaultId + '" but this vault is "' + mine + '". Same account used by multiple vaults can cause data loss. Use a separate account per vault, or keep a single primary vault.');
        }
        return info;
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

// src/vault/VaultWatcher.ts
var VaultWatcher;
var init_VaultWatcher = __esm({
  "src/vault/VaultWatcher.ts"() {
    "use strict";
    init_obsidian_real();
    init_models();
    VaultWatcher = class {
      constructor(plugin, changeLog) {
        this.plugin = plugin;
        this.changeLog = changeLog;
        this.suppressed = /* @__PURE__ */ new Map();
        // path → outstanding tokens
        this.suppressTimers = /* @__PURE__ */ new Map();
        this.suspended = false;
      }
      /** Ignore ALL vault events while suspended (force operations rebuild the
       *  vault and would otherwise flood the changelog) (C3). */
      suspend() {
        this.suspended = true;
      }
      resume() {
        this.suspended = false;
        this.suppressed.clear();
      }
      start() {
        const v = this.plugin.app.vault;
        this.plugin.registerEvent(v.on("create", (f) => this.onEvent("create", f)));
        this.plugin.registerEvent(v.on("modify", (f) => this.onEvent("modify", f)));
        this.plugin.registerEvent(v.on("delete", (f) => this.onEvent("delete", f)));
        this.plugin.registerEvent(v.on("rename", (f, oldPath) => this.onRename(f, oldPath)));
      }
      /** Suppress ONE matching event for this path. The first matching event
       *  consumes the token; a 5s fallback clears it if nothing arrives (B30). */
      suppress(path4) {
        this.suppressed.set(path4, (this.suppressed.get(path4) ?? 0) + 1);
        if (!this.suppressTimers.has(path4)) {
          const timer = window.setTimeout(() => {
            this.suppressed.delete(path4);
            this.suppressTimers.delete(path4);
          }, 5e3);
          this.suppressTimers.set(path4, timer);
        }
      }
      release(path4) {
      }
      consume(path4) {
        const n = this.suppressed.get(path4);
        if (n === void 0 || n <= 0)
          return false;
        if (n === 1) {
          this.suppressed.delete(path4);
          const t = this.suppressTimers.get(path4);
          if (t) {
            window.clearTimeout(t);
            this.suppressTimers.delete(path4);
          }
        } else {
          this.suppressed.set(path4, n - 1);
        }
        return true;
      }
      onEvent(kind, f) {
        if (this.suspended)
          return;
        if (this.consume(f.path))
          return;
        if (!this.shouldTrack(f))
          return;
        void this.record(kind, f.path, void 0, f instanceof TFolder, f instanceof TFile ? f : void 0);
      }
      onRename(f, oldPath) {
        if (this.suspended)
          return;
        if (this.consume(f.path))
          return;
        if (!this.consume(oldPath)) {
          if (!this.shouldTrack(f))
            return;
          void this.record("rename", f.path, oldPath, f instanceof TFolder, f instanceof TFile ? f : void 0);
        }
      }
      async record(kind, path4, oldPath, isFolder, file) {
        if (isFolder) {
          const folderId = "dir:" + path4.replace(/\/$/, "");
          this.changeLog.push({ fileId: folderId, op: kind === "modify" ? "update" : kind, path: path4, oldPath, type: 2 /* Folder */ });
          return;
        }
        if (!file)
          return;
        if (file.extension !== "md") {
          const mapped = this.plugin.mapping.getByPath(file.path);
          const fileId2 = mapped?.joplinId ?? "file:" + file.path;
          this.changeLog.push({ fileId: fileId2, op: kind === "modify" ? "update" : kind, path: path4, oldPath, type: 4 /* Resource */, hash: void 0 });
          return;
        }
        const fileId = await this.plugin.identity.ensureId(file);
        const op = kind === "modify" ? "update" : kind;
        let hash;
        if (kind !== "delete") {
          try {
            hash = await this.plugin.engine.sha256Of(file);
          } catch {
          }
        }
        this.changeLog.push({ fileId, op, path: path4, oldPath, type: 1 /* Note */, hash });
      }
      shouldTrack(f) {
        if (f.path.startsWith(this.plugin.app.vault.configDir + "/"))
          return false;
        return !this.plugin.engine.shouldExclude(f.path);
      }
    };
  }
});

// src/resource/ResourceManager.ts
var MIME_MAP, ResourceManager;
var init_ResourceManager = __esm({
  "src/resource/ResourceManager.ts"() {
    "use strict";
    init_obsidian_real();
    init_JoplinSerializer();
    init_IdGenerator();
    init_models();
    init_SyncEngine();
    MIME_MAP = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      pdf: "application/pdf",
      mp3: "audio/mpeg",
      mp4: "video/mp4",
      zip: "application/zip",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
      xls: "application/vnd.ms-excel",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      doc: "application/msword",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ppt: "application/vnd.ms-powerpoint",
      html: "text/html",
      htm: "text/html",
      canvas: "application/obsidian-canvas",
      drawio: "application/x-drawio"
    };
    ResourceManager = class {
      constructor(plugin) {
        this.plugin = plugin;
        this.serializer = new JoplinSerializer();
        this.hashToId = /* @__PURE__ */ new Map();
      }
      async uploadResource(file, force = false) {
        const data = await this.plugin.app.vault.readBinary(file);
        const hash = await sha256(data);
        const existing = this.plugin.mapping.getByPath(file.path);
        if (!force && existing && existing.localHash === hash)
          return existing.joplinId;
        const metaId = existing?.joplinId ?? createJoplinId();
        const maxSize = (this.plugin.settings.maxAttachmentMB ?? 100) * 1024 * 1024;
        if (data.byteLength > maxSize)
          throw new Error("Attachment too large: " + file.path);
        const parentDir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
        if (parentDir && !this.plugin.mapping.getByPath(parentDir + "/")) {
          await this.ensureRemoteFolder(parentDir);
        }
        const now = Date.now();
        const st = file.stat ?? { ctime: now, mtime: now };
        const meta = {
          id: metaId,
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
        const e2ee = this.plugin.e2ee;
        const mkId = e2ee.activeKeyId ?? e2ee.firstLoadedKeyId;
        if (this.plugin.engine.e2eeActive && !mkId) {
          throw new Error("E2EE is enabled but no master key is loaded. Enter the E2EE password in settings first.");
        }
        const encrypt = this.plugin.engine.e2eeActive && !!mkId;
        if (encrypt) {
          const blobCipher = await e2ee.encryptBlobData(data, mkId);
          await this.plugin.api.putItem(".resource/" + metaId, blobCipher);
          const ct = await e2ee.encryptItem(this.serializer.serialize(meta), mkId);
          const encMeta = {
            id: metaId,
            parent_id: "",
            title: "",
            created_time: now,
            updated_time: now,
            user_created_time: now,
            user_updated_time: now,
            type_: 4 /* Resource */,
            encryption_applied: 1,
            encryption_cipher_text: ct
          };
          const res2 = await this.plugin.api.putItem(metaId + ".md", this.serializer.serialize(encMeta));
          this.plugin.mapping.upsert({
            joplinId: metaId,
            path: file.path,
            type: 4 /* Resource */,
            localHash: hash,
            remoteUpdatedTime: res2.updated_time,
            syncedAt: now
          });
          return metaId;
        }
        await this.plugin.api.putItem(".resource/" + metaId, data);
        const res = await this.plugin.api.putItem(metaId + ".md", this.serializer.serialize(meta));
        this.plugin.mapping.upsert({
          joplinId: metaId,
          path: file.path,
          type: 4 /* Resource */,
          localHash: hash,
          remoteUpdatedTime: res.updated_time,
          syncedAt: now
        });
        return metaId;
      }
      /** Ensure a remote folder exists for the given vault-relative path */
      async ensureRemoteFolder(dirPath) {
        const parts = dirPath.split("/");
        let accumulated = "";
        for (let i = 0; i < parts.length; i++) {
          accumulated = accumulated ? accumulated + "/" + parts[i] : parts[i];
          const mapped = this.plugin.mapping.getByPath(accumulated + "/");
          if (mapped)
            continue;
          const fid = createJoplinId();
          const now = Date.now();
          const rootId = this.plugin.mapping.rootFolderId;
          const item = {
            id: fid,
            parent_id: "",
            title: parts[i],
            created_time: now,
            updated_time: now,
            user_created_time: now,
            user_updated_time: now,
            type_: 2 /* Folder */,
            encryption_applied: 0,
            encryption_cipher_text: ""
          };
          const parentPath = i > 0 ? parts.slice(0, i).join("/") : "";
          if (parentPath) {
            const parent = this.plugin.mapping.getByPath(parentPath + "/");
            if (parent)
              item.parent_id = parent.joplinId;
          } else if (rootId) {
            item.parent_id = rootId;
          }
          const res = await this.plugin.api.putItem(fid + ".md", this.serializer.serialize(item), true);
          this.plugin.mapping.upsert({
            joplinId: fid,
            path: accumulated + "/",
            type: 2 /* Folder */,
            localHash: "",
            remoteUpdatedTime: res.updated_time || now,
            syncedAt: now
          });
        }
        return accumulated;
      }
      async downloadResource(meta) {
        const e2ee = this.plugin.e2ee;
        let metaToUse = meta;
        if (e2ee.isEncrypted(meta)) {
          const ds = await e2ee.decryptItem(meta);
          if (ds)
            metaToUse = this.serializer.unserialize(ds);
        }
        const existing = this.plugin.mapping.getById(meta.id);
        const correctPath = metaToUse.filename ? normalizePath(metaToUse.filename) : "";
        if (existing && (metaToUse.blob_updated_time ?? 0) <= existing.remoteUpdatedTime) {
          if (correctPath && existing.path !== correctPath) {
            this.plugin.mapping.remove(existing.joplinId);
          } else if (this.plugin.app.vault.getAbstractFileByPath(existing.path)) {
            return existing.path;
          }
        }
        const blob = await this.plugin.api.getItemBinary(".resource/" + meta.id);
        if (!blob)
          throw new Error("Resource blob missing: " + meta.id);
        const blobHead = new TextDecoder().decode(blob.slice(0, 5));
        const blobIsEncrypted = blobHead === "JED01";
        let plainBlob = blob;
        if (blobIsEncrypted) {
          plainBlob = await e2ee.decryptBlobData(blob);
        }
        const dir = this.plugin.settings.attachmentFolder || "attachments";
        const relName = metaToUse.filename ? metaToUse.filename : dir + "/" + meta.id + "." + (metaToUse.file_extension || "bin");
        let path4 = normalizePath(relName);
        const occupant = this.plugin.app.vault.getAbstractFileByPath(path4);
        const clash = this.plugin.mapping.getByPath(path4);
        if (occupant && !(clash && clash.joplinId === meta.id)) {
          const base = (metaToUse.filename ? metaToUse.filename.split("/").pop() : "") || meta.id + "." + (metaToUse.file_extension || "bin");
          path4 = normalizePath(dir + "/" + meta.id.slice(0, 7) + "_" + base);
        }
        const watcher = this.plugin.engine?.watcher;
        const write = async () => {
          const parentDir = path4.includes("/") ? path4.slice(0, path4.lastIndexOf("/")) : "";
          if (parentDir && !this.plugin.app.vault.getAbstractFileByPath(parentDir)) {
            try {
              await this.plugin.app.vault.createFolder(parentDir);
            } catch {
            }
          }
          const f = this.plugin.app.vault.getAbstractFileByPath(path4);
          if (f instanceof TFile)
            await this.plugin.app.vault.modifyBinary(f, plainBlob);
          else
            await this.plugin.app.vault.createBinary(path4, plainBlob);
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
          localHash: await sha256(plainBlob),
          remoteUpdatedTime: metaToUse.blob_updated_time ?? metaToUse.updated_time,
          syncedAt: Date.now()
        });
        return path4;
      }
    };
  }
});

// src/core/ConflictResolver.ts
var ConflictResolver;
var init_ConflictResolver = __esm({
  "src/core/ConflictResolver.ts"() {
    "use strict";
    init_obsidian_real();
    init_SyncEngine();
    ConflictResolver = class {
      constructor(plugin, watcher) {
        this.plugin = plugin;
        this.watcher = watcher;
      }
      async resolve(mapping, remote, localContent, targetPath) {
        const base = await this.readBase(mapping);
        if (base !== null) {
          const merged = this.tryMerge(base, localContent, remote.body ?? "");
          if (merged) {
            await this.applyMerged(mapping, remote, merged, targetPath);
            return;
          }
        }
        await this.resolveByStrategy(mapping, remote, localContent, targetPath);
      }
      /** Read base content if stored (mapping keeps only a hash — subclasses may persist full base). */
      async readBase(mapping) {
        const f = this.plugin.app.vault.getAbstractFileByPath(mapping.path);
        if (f instanceof TFile) {
          const content = await this.plugin.app.vault.read(f);
          const h = await sha256(content);
          if (h === mapping.localHash)
            return content;
        }
        return null;
      }
      /** Line-based merge: identical base lines are dropped; diverging hunks kept. */
      tryMerge(base, local, remote) {
        const b = base.split("\n"), l = local.split("\n"), r = remote.split("\n");
        if (l.join("\n") === b.join("\n"))
          return remote;
        if (r.join("\n") === b.join("\n"))
          return local;
        const out = [];
        let conflict = false;
        const max = Math.max(b.length, l.length, r.length);
        for (let i = 0; i < max; i++) {
          const lb = b[i], ll = l[i], lr = r[i];
          if (ll !== void 0 && ll === lb) {
            if (lr !== void 0)
              out.push(lr);
          } else if (lr !== void 0 && lr === lb) {
            if (ll !== void 0)
              out.push(ll);
          } else if (ll === lr) {
            out.push(ll ?? "");
          } else if (ll === void 0 && lr === void 0) {
            continue;
          } else {
            conflict = true;
            break;
          }
        }
        if (conflict)
          return null;
        return out.join("\n");
      }
      async applyMerged(mapping, remote, merged, targetPath) {
        const f = this.plugin.app.vault.getAbstractFileByPath(targetPath);
        this.watcher.suppress(targetPath);
        try {
          if (f instanceof TFile)
            await this.plugin.app.vault.modify(f, merged);
          else
            await this.plugin.app.vault.create(targetPath, merged);
        } finally {
          this.watcher.release(targetPath);
        }
        this.plugin.mapping.upsert({
          ...mapping,
          path: targetPath,
          localHash: await sha256(merged),
          remoteUpdatedTime: remote.updated_time,
          syncedAt: Date.now()
        });
        new Notice("Sync: auto-merged changes for " + targetPath);
      }
      async resolveByStrategy(mapping, remote, localContent, targetPath) {
        switch (this.plugin.settings.conflictStrategy) {
          case "local-wins":
            this.plugin.mapping.upsert({ ...mapping, path: targetPath, remoteUpdatedTime: remote.updated_time });
            return;
          case "remote-wins":
            return this.applyRemote(mapping, remote, targetPath);
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
            await this.applyRemote(mapping, remote, targetPath);
            new Notice("Sync conflict: local copy saved to " + conflictPath);
          }
        }
      }
      async applyRemote(mapping, remote, targetPath) {
        const f = this.plugin.app.vault.getAbstractFileByPath(targetPath);
        this.watcher.suppress(targetPath);
        try {
          if (f instanceof TFile)
            await this.plugin.app.vault.modify(f, remote.body ?? "");
          else
            await this.plugin.app.vault.create(targetPath, remote.body ?? "");
        } finally {
          this.watcher.release(targetPath);
        }
        this.plugin.mapping.upsert({
          ...mapping,
          path: targetPath,
          localHash: await sha256(remote.body ?? ""),
          remoteUpdatedTime: remote.updated_time,
          syncedAt: Date.now()
        });
      }
    };
  }
});

// src/core/LocalPusher.ts
var LocalPusher;
var init_LocalPusher = __esm({
  "src/core/LocalPusher.ts"() {
    "use strict";
    init_obsidian_real();
    init_JoplinSerializer();
    init_IdGenerator();
    init_models();
    init_SyncEngine();
    init_ResourceManager();
    init_ConflictResolver();
    LocalPusher = class {
      constructor(plugin, changeLog) {
        this.plugin = plugin;
        this.changeLog = changeLog;
        this.serializer = new JoplinSerializer();
        this.resources = new ResourceManager(plugin);
      }
      async pushAll() {
        const changes = this.changeLog.pending();
        const stats = { created: 0, updated: 0, deleted: 0, fail: 0 };
        const failed = [];
        for (const change of changes) {
          try {
            const op = await this.pushOne(change);
            if (op === "create")
              stats.created++;
            else if (op === "update")
              stats.updated++;
            else if (op === "delete")
              stats.deleted++;
            this.changeLog.markSynced(change.fileId);
          } catch (e) {
            console.error("[joplin-sync] push failed: " + change.path, e);
            stats.fail++;
            failed.push(change);
          }
        }
        return stats;
      }
      async pushOne(c) {
        switch (c.op) {
          case "create":
            return this.upsertItem(c.path, c.fileId);
          case "update":
            return this.upsertItem(c.path, c.fileId);
          case "delete":
            return this.deleteItem(c.path, c.fileId, c.type === 2 /* Folder */);
          case "rename":
            return this.renameItem(c.oldPath, c.path, c.fileId, c.type === 2 /* Folder */);
        }
      }
      async upsertItem(path4, fileId, force = false) {
        const af = this.plugin.app.vault.getAbstractFileByPath(path4);
        if (!af)
          return "none";
        if (af instanceof TFolder) {
          await this.ensureFolderChain(path4 + "/");
          return "create";
        }
        if (!(af instanceof TFile))
          return "none";
        if (af.extension !== "md") {
          await this.resources.uploadResource(af);
          return "create";
        }
        const parentPath = af.parent && af.parent.path && af.parent.path !== "/" ? af.parent.path + "/" : path4.includes("/") ? path4.slice(0, path4.lastIndexOf("/")) + "/" : "";
        const parentId = await this.ensureFolderChain(parentPath || "");
        const content = await this.plugin.app.vault.read(af);
        const hash = await sha256(content);
        const existing = this.plugin.mapping.getById(fileId) ?? this.plugin.mapping.getByPath(path4);
        if (!force && existing && existing.localHash === hash && existing.path === path4)
          return "none";
        const moved = existing && existing.path !== path4;
        const isNew = !existing;
        const id = existing?.joplinId ?? fileId;
        let base = {};
        if (existing) {
          const remote = await this.plugin.api.getItem(id + ".md");
          if (remote)
            base = this.serializer.unserialize(remote);
          const remoteTime = base.updated_time ?? 0;
          if (!force && remoteTime > existing.remoteUpdatedTime && existing.localHash !== hash) {
            const watcher = this.plugin.engine.watcher;
            const resolver = new ConflictResolver(this.plugin, watcher);
            await resolver.resolve(existing, base, content, path4);
            return "none";
          }
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
        if (this.plugin.engine.e2eeActive && !mkId) {
          throw new Error("E2EE is enabled but no master key is loaded. Enter the E2EE password in settings first.");
        }
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
          return isNew ? "create" : "update";
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
        return isNew ? "create" : "update";
      }
      async deleteItem(path4, fileId, isFolder) {
        const key = isFolder ? path4 + "/" : path4;
        const entry = this.plugin.mapping.getById(fileId) ?? this.plugin.mapping.getByPath(key);
        if (!entry)
          return "none";
        await this.plugin.api.deleteItem(entry.joplinId + ".md");
        this.plugin.mapping.remove(entry.joplinId);
        this.plugin.mapping.addTombstone(entry.joplinId, entry.type);
        return "delete";
      }
      async renameItem(oldPath, newPath, fileId, isFolder) {
        const key = isFolder ? oldPath + "/" : oldPath;
        const entry = this.plugin.mapping.getById(fileId) ?? this.plugin.mapping.getByPath(key);
        if (!entry) {
          return this.upsertItem(newPath, fileId);
        }
        if (isFolder) {
          const newTitle = newPath.split("/").pop() || newPath;
          const parentDir = newPath.includes("/") ? newPath.slice(0, newPath.lastIndexOf("/")) + "/" : "";
          const parentId = parentDir ? await this.ensureFolderChain(parentDir) : "";
          const now = Date.now();
          const folderItem = {
            id: entry.joplinId,
            parent_id: parentId,
            title: newTitle,
            created_time: now,
            updated_time: now,
            user_created_time: now,
            user_updated_time: now,
            type_: 2 /* Folder */,
            encryption_applied: 0,
            encryption_cipher_text: ""
          };
          const res = await this.plugin.api.putItem(entry.joplinId + ".md", this.serializer.serialize(folderItem), true);
          this.plugin.mapping.renamePrefix(oldPath + "/", newPath + "/");
          const folderMapping = this.plugin.mapping.getById(entry.joplinId);
          if (folderMapping) {
            this.plugin.mapping.upsert({ ...folderMapping, path: newPath + "/", remoteUpdatedTime: res.updated_time ?? now });
          }
          return "update";
        }
        const result = await this.upsertItem(newPath, fileId);
        if (result === "none") {
          const af = this.plugin.app.vault.getAbstractFileByPath(newPath);
          if (af instanceof TFile) {
            return this.upsertItem(newPath, fileId, true);
          }
          return "none";
        }
        return result;
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
        const existing = this.plugin.mapping.rootFolderId;
        if (existing)
          return existing;
        return this.plugin.engine.ensureRootFolder();
      }
    };
  }
});

// src/core/pathUtil.ts
function safeFileName(name) {
  let cleaned = (name || "").replace(/[/\\]/g, "_").replace(/[:*?"<>|]/g, "_").replace(new RegExp("\\p{Cc}", "gu"), "").replace(/\s+$/g, "").replace(/[. ]+$/g, "").trim().slice(0, 200);
  if (cleaned === "" || cleaned === ".")
    return "Untitled";
  if (WINDOWS_RESERVED.has(cleaned.toUpperCase()))
    return "_" + cleaned;
  return cleaned;
}
var WINDOWS_RESERVED;
var init_pathUtil = __esm({
  "src/core/pathUtil.ts"() {
    "use strict";
    WINDOWS_RESERVED = /* @__PURE__ */ new Set([
      "CON",
      "PRN",
      "AUX",
      "NUL",
      "COM1",
      "COM2",
      "COM3",
      "COM4",
      "COM5",
      "COM6",
      "COM7",
      "COM8",
      "COM9",
      "LPT1",
      "LPT2",
      "LPT3",
      "LPT4",
      "LPT5",
      "LPT6",
      "LPT7",
      "LPT8",
      "LPT9"
    ]);
  }
});

// src/core/FileIdentity.ts
function stampFrontmatter(body, fileId) {
  const line = FILE_ID_FIELD + ": " + fileId;
  if (body.startsWith("---")) {
    const end = body.indexOf("\n---", 4);
    if (end >= 0) {
      const fm = body.slice(0, end + 1);
      const rest = body.slice(end + 1);
      const re = /^joplin-file-id:.*$/m;
      return re.test(fm) ? fm.replace(re, line) + rest : fm + "\n" + line + rest;
    }
  }
  return "---\n" + line + "\n---\n" + body;
}
var FILE_ID_FIELD, FileIdentity;
var init_FileIdentity = __esm({
  "src/core/FileIdentity.ts"() {
    "use strict";
    init_IdGenerator();
    FILE_ID_FIELD = "joplin-file-id";
    FileIdentity = class {
      constructor(plugin) {
        this.plugin = plugin;
      }
      /** Read the stable id from frontmatter, or mint + persist a new one. */
      async ensureId(file) {
        const content = await this.plugin.app.vault.read(file);
        const existing = this.readFromFrontmatter(content);
        if (existing)
          return existing;
        const mapped = this.plugin.mapping.getByPath(file.path);
        if (mapped?.joplinId) {
          await this.writeToFrontmatter(file, content, mapped.joplinId);
          return mapped.joplinId;
        }
        const id = createJoplinId();
        await this.writeToFrontmatter(file, content, id);
        return id;
      }
      readFromFrontmatter(content) {
        if (!content.startsWith("---"))
          return null;
        const end = content.indexOf("\n---", 4);
        if (end < 0)
          return null;
        const fm = content.slice(4, end);
        const m = fm.match(new RegExp("^" + FILE_ID_FIELD + ":\\s*(\\S+)", "m"));
        return m ? m[1] : null;
      }
      /** Inject (or replace) the id in YAML frontmatter. */
      async writeToFrontmatter(file, content, id) {
        const watcher = this.plugin.engine?.watcher;
        const write = async () => {
          let newContent;
          if (content.startsWith("---")) {
            const end = content.indexOf("\n---", 4);
            const rest = end >= 0 ? content.slice(end + 1) : content;
            const fm = end >= 0 ? content.slice(0, end + 1) : content;
            newContent = this.upsertFrontmatter(fm, id) + rest;
          } else {
            newContent = "---\n" + FILE_ID_FIELD + ": " + id + "\n---\n" + content;
          }
          if (newContent !== content)
            await this.plugin.app.vault.modify(file, newContent);
        };
        if (watcher?.suppress) {
          watcher.suppress(file.path);
          try {
            await write();
          } finally {
            watcher.release(file.path);
          }
        } else {
          await write();
        }
      }
      upsertFrontmatter(fm, id) {
        const line = FILE_ID_FIELD + ": " + id;
        const re = new RegExp("^" + FILE_ID_FIELD + ":.*$", "m");
        return re.test(fm) ? fm.replace(re, line) : fm + "\n" + line;
      }
    };
  }
});

// src/core/DeltaPuller.ts
var DeltaPuller;
var init_DeltaPuller = __esm({
  "src/core/DeltaPuller.ts"() {
    "use strict";
    init_obsidian_real();
    init_JoplinSerializer();
    init_ConflictResolver();
    init_models();
    init_SyncEngine();
    init_ResourceManager();
    init_pathUtil();
    init_FileIdentity();
    DeltaPuller = class {
      // item_id → full path
      constructor(plugin, watcher) {
        this.plugin = plugin;
        this.watcher = watcher;
        this.serializer = new JoplinSerializer();
        this.rootAncestorCache = /* @__PURE__ */ new Map();
        this.acceptAll = false;
        this.folderPathCache = /* @__PURE__ */ new Map();
        this.parentIdMap = /* @__PURE__ */ new Map();
        this.conflicts = new ConflictResolver(plugin, watcher);
        this.resources = new ResourceManager(plugin);
      }
      /** Seed the parent chain from the current delta batch so belongsToRoot can
       *  walk it without relying on mapping (mapping has no parentId field). */
      buildParentMap(items) {
        this.parentIdMap.clear();
        this.rootAncestorCache.clear();
        for (const it of items)
          if (it.parent_id)
            this.parentIdMap.set(it.id, it.parent_id);
      }
      belongsToRoot(item) {
        if (this.acceptAll)
          return true;
        const rootId = this.plugin.mapping.rootFolderId;
        if (!rootId)
          return true;
        if (item.type_ === 4 /* Resource */ || item.type_ === 9 /* MasterKey */)
          return true;
        let pid = item.parent_id;
        if (!pid)
          return false;
        const visited = /* @__PURE__ */ new Set();
        let depth = 0;
        while (pid && !visited.has(pid) && depth < 64) {
          visited.add(pid);
          if (pid === rootId) {
            for (const v of visited)
              this.rootAncestorCache.set(v, true);
            return true;
          }
          const cached = this.rootAncestorCache.get(pid);
          if (cached !== void 0) {
            for (const v of visited)
              this.rootAncestorCache.set(v, cached);
            return cached;
          }
          const next = this.parentIdMap.get(pid) ?? this.plugin.mapping.getById(pid)?.joplinId;
          if (next === void 0 || next === pid) {
            for (const v of visited)
              this.rootAncestorCache.set(v, false);
            return false;
          }
          pid = next;
          depth++;
        }
        return false;
      }
      async pullAll() {
        const stats = { created: 0, updated: 0, deleted: 0, fail: 0 };
        const allItems = [];
        const deletes = [];
        let cursor = this.plugin.mapping.getDeltaCursor();
        while (true) {
          let page;
          try {
            page = await this.plugin.api.delta(cursor || void 0);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (cursor && /400|invalid.*cursor|cursor.*invalid|resync/i.test(msg)) {
              console.warn("[joplin-sync] delta cursor invalidated \u2014 clearing cursor for full resync: " + msg);
              this.plugin.mapping.setDeltaCursor("");
              cursor = "";
              continue;
            }
            throw e;
          }
          if (page.has_more && !page.cursor) {
            console.error("[joplin-sync] delta returned has_more without cursor \u2014 aborting pull to avoid a loop.");
            stats.fail++;
            break;
          }
          for (const d of page.items) {
            try {
              if (d.type === 3 /* Delete */) {
                const id = d.name.replace(/\.resource\//, "").replace(/\.md$/, "");
                deletes.push(id);
                continue;
              }
              const items = await this.collectChange(d);
              allItems.push(...items);
            } catch (e) {
              const isAbort = e?.__decryptAbort === true;
              stats.fail++;
              console.error("[joplin-sync] collect delta failed", d.name, e);
              if (isAbort) {
                console.error("[joplin-sync] aborting pull before cursor advance (decrypt failure)");
                this.plugin.mapping.setDeltaCursor(this.plugin.mapping.getDeltaCursor());
                return stats;
              }
            }
          }
          if (page.cursor)
            cursor = page.cursor;
          if (!page.has_more)
            break;
        }
        const totalMapped = this.plugin.mapping.all().length;
        if (totalMapped > 20 && deletes.length > totalMapped / 2) {
          console.error("[joplin-sync] refusing " + deletes.length + " delta deletes over " + totalMapped + " mapped items \u2014 possible stale cursor or foreign vault. Skipping this batch (cursor NOT advanced).");
          stats.fail += deletes.length;
          this.plugin.mapping.setDeltaCursor(this.plugin.mapping.getDeltaCursor());
          new Notice("Sync blocked: " + deletes.length + ' deletes detected (over half the vault). This usually means the server was force-pushed from another vault. Run "Force pull" to rebuild from the server, or "Force push" to overwrite it.', 15e3);
          return stats;
        }
        for (const id of deletes) {
          try {
            if (await this.applyDelete(id))
              stats.deleted++;
          } catch (e) {
            stats.fail++;
            console.error("[joplin-sync] delta delete failed", id, e);
          }
        }
        this.buildParentMap(allItems);
        const folders = allItems.filter((i) => i.type_ === 2 /* Folder */);
        const notes = allItems.filter((i) => i.type_ === 1 /* Note */);
        const resources = allItems.filter((i) => i.type_ === 4 /* Resource */);
        this.buildFolderPaths(folders);
        for (const f of folders) {
          try {
            if (await this.applyFolder(f))
              stats.created++;
            else
              stats.updated++;
          } catch (e) {
            stats.fail++;
            console.error("[joplin-sync] folder apply failed", f.title, e);
          }
        }
        if (!this.plugin.settings.syncFoldersOnly) {
          for (const n of notes) {
            try {
              if (await this.applyNote(n))
                stats.created++;
              else
                stats.updated++;
            } catch (e) {
              stats.fail++;
              console.error("[joplin-sync] note apply failed", n.title, e);
            }
          }
        }
        for (const r of resources) {
          try {
            await this.applyResource(r);
            stats.created++;
          } catch (e) {
            stats.fail++;
            console.error("[joplin-sync] resource apply failed", r.id, e);
          }
        }
        this.plugin.mapping.setDeltaCursor(cursor ?? "");
        return stats;
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
        const allowed = /* @__PURE__ */ new Set([1 /* Note */, 2 /* Folder */, 4 /* Resource */, 9 /* MasterKey */]);
        if (!allowed.has(probe.type_))
          return [];
        if (probe.type_ === 9 /* MasterKey */) {
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
            console.warn("[joplin-sync] E2EE decrypt failed for " + d.name + ": " + (e instanceof Error ? e.message : String(e)));
            const err = new Error("E2EE decrypt failed: " + d.name);
            err.__decryptAbort = true;
            throw err;
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
          await this.writeNoteWithId(targetPath, item.body ?? "", item.id);
          await this.saveMapping(item, targetPath);
          return true;
        }
        if (item.updated_time <= mapping.remoteUpdatedTime)
          return false;
        const localFile = this.plugin.app.vault.getAbstractFileByPath(mapping.path);
        const localContent = localFile instanceof TFile ? await this.plugin.app.vault.read(localFile) : null;
        const localChanged = localContent !== null && await sha256(localContent) !== mapping.localHash;
        if (localChanged) {
          await this.conflicts.resolve(mapping, item, localContent, targetPath);
          return false;
        }
        if (mapping.path !== targetPath && localFile) {
          this.watcher.suppress(mapping.path);
          this.watcher.suppress(targetPath);
          await this.plugin.app.vault.rename(localFile, targetPath);
          this.watcher.release(mapping.path);
          this.watcher.release(targetPath);
        }
        await this.writeNoteWithId(targetPath, item.body ?? "", item.id);
        await this.saveMapping(item, targetPath);
        return false;
      }
      /** Write a note, stamping the server item id as frontmatter fileId so other
       *  terminals reading this file converge on the same identity. */
      async writeNoteWithId(path4, body, fileId) {
        await this.writeFile(path4, stampFrontmatter(body, fileId));
      }
      async applyFolder(item) {
        const parentPath = this.resolveFolderPath(item.parent_id);
        const path4 = parentPath + this.sanitize(item.title) + "/";
        const mapping = this.plugin.mapping.getById(item.id);
        const dirPath = path4.replace(/\/$/, "");
        const isNew = !this.plugin.app.vault.getAbstractFileByPath(dirPath);
        if (isNew) {
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
        return isNew;
      }
      async applyDelete(id) {
        const mapping = this.plugin.mapping.getById(id);
        if (!mapping)
          return false;
        try {
          const stillThere = await this.plugin.api.getItem(id + ".md");
          if (stillThere !== null) {
            console.warn("[joplin-sync] skip local delete for " + mapping.path + ": server still has item " + id + " (stale cursor or foreign vault)");
            return false;
          }
        } catch (e) {
          console.warn("[joplin-sync] delete verification failed for " + id + ", skipping local delete: " + (e instanceof Error ? e.message : String(e)));
          return false;
        }
        const f = this.plugin.app.vault.getAbstractFileByPath(mapping.path.replace(/\/$/, ""));
        if (f) {
          this.watcher.suppress(f.path);
          if (f instanceof TFile) {
            const fm = this.plugin.app.fileManager;
            if (fm?.trashFile)
              await fm.trashFile(f).catch(() => {
              });
            else
              await this.plugin.app.vault.remove(f).catch(() => {
              });
          } else if ("remove" in this.plugin.app.vault) {
            await this.plugin.app.vault.remove(f).catch(() => {
            });
          }
          this.watcher.release(f.path);
        }
        this.plugin.mapping.remove(id);
        return true;
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
          localHash: await sha256(stampFrontmatter(item.body ?? "", item.id)),
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
        if (existing && (!mapped || mapped.joplinId !== id)) {
          p = dir + name + " (" + id.slice(0, 7) + ").md";
        }
        return p;
      }
    };
  }
});

// src/core/InitialSync.ts
var InitialSync;
var init_InitialSync = __esm({
  "src/core/InitialSync.ts"() {
    "use strict";
    init_obsidian_real();
    init_JoplinSerializer();
    init_models();
    init_IdGenerator();
    init_SyncEngine();
    InitialSync = class {
      constructor(plugin) {
        this.plugin = plugin;
        this.serializer = new JoplinSerializer();
      }
      async run(rootFolderId = "") {
        await this.plugin.engine.forcePullInner();
        const files = this.collectMarkdownFiles();
        const unmapped = files.filter((f) => !this.plugin.mapping.getByPath(f.path));
        const consumeDelta = async () => {
          let cursor;
          while (true) {
            const page = await this.plugin.api.delta(cursor);
            if (page.has_more && !page.cursor)
              break;
            cursor = page.cursor;
            if (!page.has_more)
              break;
          }
          this.plugin.mapping.setDeltaCursor(cursor ?? "");
          await this.plugin.mapping.flush();
        };
        if (unmapped.length === 0) {
          await consumeDelta();
          new Notice("Initial sync: no new local files to upload");
          return;
        }
        const folderMap = await this.createFolders(unmapped, rootFolderId);
        let done = 0;
        let fail = 0;
        if (!this.plugin.settings.syncFoldersOnly) {
          for (const batch of chunk(unmapped, 5)) {
            await Promise.all(batch.map(async (file) => {
              try {
                const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
                const parentId = folderMap.get(dir) || rootFolderId;
                await this.uploadNote(file, parentId);
                done++;
              } catch (e) {
                fail++;
                console.error("[joplin-sync] initial upload fail [" + fail + "]:", file.path, e instanceof Error ? e.message : String(e));
              }
            }));
            await this.plugin.mapping.flush();
          }
        }
        await consumeDelta();
        new Notice("Initial sync: " + done + " uploaded" + (fail ? ", " + fail + " failed" : ""));
      }
      async createFolders(files, rootFolderId) {
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
            }
          } catch (e) {
            console.warn("[joplin-sync] folder create skipped:", dp, e instanceof Error ? e.message : String(e));
          }
        }
        return folderMap;
      }
      async uploadNote(file, parentId) {
        const id = await this.plugin.identity.ensureId(file);
        const content = await this.plugin.app.vault.read(file);
        const hash = await sha256(content);
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
        return this.plugin.app.vault.getMarkdownFiles().filter((f) => !this.plugin.engine.shouldExclude(f.path));
      }
    };
  }
});

// src/core/SyncEngine.ts
var SyncEngine_exports = {};
__export(SyncEngine_exports, {
  SyncEngine: () => SyncEngine,
  SyncState: () => SyncState,
  chunk: () => chunk,
  sha256: () => sha256
});
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
var SyncState, SyncEngine;
var init_SyncEngine = __esm({
  "src/core/SyncEngine.ts"() {
    "use strict";
    init_obsidian_real();
    init_JoplinSerializer();
    init_SyncInfo();
    init_IdGenerator();
    init_models();
    init_VaultWatcher();
    init_LocalPusher();
    init_DeltaPuller();
    init_InitialSync();
    init_pathUtil();
    init_FileIdentity();
    init_ResourceManager();
    SyncState = /* @__PURE__ */ ((SyncState2) => {
      SyncState2[SyncState2["Idle"] = 0] = "Idle";
      SyncState2[SyncState2["Pushing"] = 1] = "Pushing";
      SyncState2[SyncState2["Pulling"] = 2] = "Pulling";
      SyncState2[SyncState2["Resolving"] = 3] = "Resolving";
      SyncState2[SyncState2["Error"] = 4] = "Error";
      return SyncState2;
    })(SyncState || {});
    SyncEngine = class {
      constructor(plugin) {
        this.plugin = plugin;
        this.serializer = new JoplinSerializer();
        this.running = false;
        this.state = 0 /* Idle */;
        this.timer = null;
        this.e2eeActive = false;
        this.forcePullFolderPaths = /* @__PURE__ */ new Map();
        this.serverEncryptedCache = null;
        this.syncInfo = new SyncInfoHandler(plugin.api, () => this.plugin.app.vault.getName());
        this.resources = new ResourceManager(plugin);
      }
      get configDir() {
        const vault = this.plugin.app.vault;
        return vault.configDir ?? ".obsidian";
      }
      /**
       * Provision + load the E2EE master key so the live sync path can encrypt.
       *
       * Driven by the LOCAL `e2eePassword` setting (not the server's info.json),
       * so enabling E2EE here is a local decision:
       *   1. If a master key already exists on the server, feed + load it.
       *   2. Otherwise generate a fresh master key, upload it (type_=9), and mark
       *      the sync target as E2EE-enabled.
       *   3. Load every fed master key with the password and set `e2eeActive`.
       */
      async enableE2EE() {
        if (!this.plugin.settings.e2eeEnabled) {
          this.e2eeActive = false;
          return false;
        }
        const pw = this.plugin.settings.e2eePassword;
        if (!pw) {
          this.e2eeActive = false;
          return false;
        }
        if (this.plugin.e2ee.hasLoadedKeys) {
          this.e2eeActive = true;
          return true;
        }
        const e2ee = this.plugin.e2ee;
        const cachedId = this.plugin.mapping.e2eeMasterKeyId;
        let cachedOk = false;
        if (cachedId) {
          try {
            const raw = await this.plugin.api.getItem(cachedId + ".md");
            if (raw) {
              const item = this.serializer.unserialize(raw);
              if (item.type_ === 9 /* MasterKey */) {
                e2ee.feedMasterKey(item);
                await e2ee.loadMasterKey(cachedId, pw);
                cachedOk = true;
                console.log("[joplin-sync] E2EE cached key " + cachedId + " loaded");
              }
            }
          } catch (e) {
            console.warn("[joplin-sync] E2EE cached key " + cachedId + " failed: " + (e instanceof Error ? e.message : String(e)));
          }
        }
        const mkIds = await this.discoverMasterKeys();
        let anyLoaded = cachedOk;
        for (const id of mkIds) {
          try {
            await e2ee.loadMasterKey(id, pw);
            anyLoaded = true;
          } catch (e) {
            console.warn("[joplin-sync] E2EE master key " + id + " failed to load: " + (e instanceof Error ? e.message : String(e)));
          }
        }
        if (!anyLoaded && mkIds.length === 0) {
          const mkId = createJoplinId();
          const mk = await e2ee.generateMasterKey(pw, mkId);
          await this.plugin.api.putItem(mkId + ".md", this.serializer.serialize({
            id: mkId,
            type_: 9 /* MasterKey */,
            content: mk.encryptedContent,
            encryption_cipher_text: "",
            encryption_applied: 0
          }), true);
          e2ee.feedMasterKey({ id: mkId, type_: 9, content: mk.encryptedContent });
          try {
            await e2ee.loadMasterKey(mkId, pw);
            anyLoaded = true;
          } catch {
          }
          this.plugin.mapping.setE2eeMasterKeyId(mkId);
          try {
            await this.plugin.api.putItem("info.json", JSON.stringify({ version: 3, e2ee: { value: true } }));
          } catch {
          }
          console.log("[joplin-sync] E2EE: generated + uploaded first master key " + mkId);
        } else if (!anyLoaded && mkIds.length > 0) {
          new Notice("E2EE password is wrong \u2014 none of the " + mkIds.length + " server master keys could be decrypted. Check the password.");
        }
        this.e2eeActive = anyLoaded;
        if (anyLoaded)
          console.log("[joplin-sync] E2EE active with " + e2ee.availableMasterKeys.length + " master key(s)");
        return anyLoaded;
      }
      /** Find existing MasterKey items (type_=9) on the server. */
      async discoverMasterKeys() {
        const e2ee = this.plugin.e2ee;
        const ids = [];
        let cursor;
        while (true) {
          const page = await this.plugin.api.listChildrenOf("", cursor);
          for (const stat of page.items) {
            if (!/^[0-9a-f]{32}\.md$/.test(stat.name) || stat.name.startsWith(".resource/"))
              continue;
            const raw = await this.plugin.api.getItem(stat.name);
            if (!raw)
              continue;
            const item = this.serializer.unserialize(raw);
            if (item.type_ === 9 /* MasterKey */) {
              e2ee.feedMasterKey(item);
              ids.push(item.id);
            }
          }
          cursor = page.cursor;
          if (!page.has_more || !cursor)
            break;
        }
        return ids;
      }
      // ============ Phase 1: Legacy full upload ============
      async runFullUpload() {
        if (this.running) {
          new Notice("Sync already in progress");
          return;
        }
        this.running = true;
        this.ensureReady();
        try {
          await this.syncInfo.checkOrInit();
          this.e2eeActive = this.syncInfo.e2eeEnabled;
          this.invalidateServerEncryptedCache();
          const uploadCompatErr = await this.checkEncryptionCompatibility("forcePush");
          if (uploadCompatErr) {
            this.plugin.statusBar.setError(uploadCompatErr);
            new Notice("Upload blocked: " + uploadCompatErr, 1e4);
            return;
          }
          await this.enableE2EE();
          const files = this.collectMarkdownFiles();
          let done = 0, skipped = 0;
          const failed = [];
          for (const batch of chunk(files, 5)) {
            await Promise.all(batch.map(async (file) => {
              try {
                const changed = await this.uploadNote(file, "");
                changed ? done++ : skipped++;
              } catch (e) {
                failed.push(file.path + ": " + (e instanceof Error ? e.message : String(e)));
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
        let content = await this.plugin.app.vault.read(file);
        const fileId = await this.plugin.identity.ensureId(file);
        content = await this.plugin.app.vault.read(file);
        const hash = await sha256(content);
        const existing = this.plugin.mapping.getById(fileId) ?? this.plugin.mapping.getByPath(file.path);
        if (!force && existing && existing.localHash === hash)
          return false;
        const id = existing?.joplinId ?? fileId;
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
        const mkId = this.plugin.e2ee.activeKeyId ?? this.plugin.e2ee.firstLoadedKeyId;
        let payload;
        let encrypted = false;
        if (this.e2eeActive && mkId) {
          const serialized = this.serializer.serialize(item);
          const cipherText = await this.plugin.e2ee.encryptItem(serialized, mkId);
          const encItem = {
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
            encryption_cipher_text: cipherText,
            markup_language: 1
          };
          payload = this.serializer.serialize(encItem);
          encrypted = true;
        } else {
          payload = this.serializer.serialize(item);
        }
        const result = await this.plugin.api.putItem(id + ".md", payload, force);
        if (!encrypted) {
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
            console.warn("[joplin-sync] verify skipped for: " + file.path + " - " + (verifyErr instanceof Error ? verifyErr.message : String(verifyErr)));
          }
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
      collectMarkdownFiles() {
        return this.plugin.app.vault.getMarkdownFiles().filter((f) => !this.shouldExclude(f.path));
      }
      /** Unified exclusion rule — every sync path (push/pull/watcher/force)
       *  must consult this. Excludes: explicit excludePatterns, the config dir,
       *  Obsidian conflict files, and ANY path segment starting with `.`
       *  (hidden files/folders, Unix convention). */
      shouldExclude(path4) {
        if (this.plugin.settings.excludePatterns.some((p) => path4.startsWith(p)))
          return true;
        if (path4.startsWith(this.configDir + "/") || path4 === this.configDir)
          return true;
        if (path4.startsWith("_conflicts/"))
          return true;
        const segments = path4.split("/").filter((s) => s.length > 0);
        return segments.some((seg) => seg.startsWith("."));
      }
      // ============ Phase 2: Watcher + Scheduler ============
      startWatching() {
        this.watcher = new VaultWatcher(this.plugin, this.plugin.changeLog);
        this.watcher.start();
        this.pusher = new LocalPusher(this.plugin, this.plugin.changeLog);
        this.deltaPuller = new DeltaPuller(this.plugin, this.watcher);
      }
      ensureReady() {
        if (!this.watcher) {
          this.watcher = new VaultWatcher(this.plugin, this.plugin.changeLog);
          this.watcher.start();
        }
        if (!this.pusher)
          this.pusher = new LocalPusher(this.plugin, this.plugin.changeLog);
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
        if (this.running || this.state !== 0 /* Idle */) {
          new Notice("Sync already in progress");
          return;
        }
        this.running = true;
        this.ensureReady();
        try {
          this.state = 1 /* Pushing */;
          this.plugin.statusBar.setSyncing("pushing...");
          await this.syncInfo.checkOrInit();
          this.e2eeActive = this.syncInfo.e2eeEnabled;
          const compatErr = await this.checkEncryptionCompatibility("cycle");
          if (compatErr) {
            this.state = 4 /* Error */;
            this.plugin.statusBar.setError(compatErr);
            new Notice("Sync blocked: " + compatErr, 1e4);
            return;
          }
          await this.enableE2EE();
          if (!this.plugin.mapping.getDeltaCursor()) {
            this.plugin.statusBar.setSyncing("initial sync...");
            const rootFolderId = await this.ensureRootFolder();
            await new InitialSync(this.plugin).run(rootFolderId);
          }
          this.state = 1 /* Pushing */;
          const pushResult = await this.pusher.pushAll();
          this.plugin.statusBar.setProgress(pushResult.created + pushResult.updated + pushResult.deleted, Math.max(pushResult.created + pushResult.updated + pushResult.deleted, 1), "push");
          this.state = 2 /* Pulling */;
          this.plugin.statusBar.setSyncing("pulling...");
          const pullResult = await this.deltaPuller.pullAll();
          this.plugin.statusBar.setProgress(pullResult.created + pullResult.updated + pullResult.deleted, Math.max(pullResult.created + pullResult.updated + pullResult.deleted, 1), "pull");
          this.state = 3 /* Resolving */;
          for (const t of [...this.plugin.mapping.tombstones]) {
            try {
              await this.plugin.api.deleteItem(t.joplinId + ".md");
            } catch {
            }
            this.plugin.mapping.clearTombstone(t.joplinId);
          }
          const totalMapped = this.plugin.mapping.all().length;
          this.plugin.statusBar.setOk(Date.now(), totalMapped);
          const c = (pushResult?.created ?? 0) + (pullResult?.created ?? 0);
          const u = (pushResult?.updated ?? 0) + (pullResult?.updated ?? 0);
          const d = (pushResult?.deleted ?? 0) + (pullResult?.deleted ?? 0);
          const totalFail = (pushResult?.fail ?? 0) + (pullResult?.fail ?? 0);
          this.plugin.logSync("sync", c + u + d, totalFail, { created: c, updated: u, deleted: d });
          const parts = ["Created " + c, "Updated " + u, "Deleted " + d];
          if (totalFail)
            parts.push("Failed " + totalFail);
          new Notice("Sync complete: " + parts.join(", ") + ". " + totalMapped + " item(s) mapped");
        } catch (e) {
          this.state = 4 /* Error */;
          const msg = e instanceof Error ? e.message : String(e ?? "Unknown error");
          console.error("[joplin-sync] sync cycle failed:", msg);
          this.plugin.statusBar.setError(msg);
          new Notice("Sync failed: " + msg, 8e3);
        } finally {
          await this.plugin.mapping.flush();
          this.state = 0 /* Idle */;
          this.running = false;
        }
      }
      async shutdown() {
        if (this.timer)
          window.clearInterval(this.timer);
      }
      /** SHA-256 of a TFile's current content (used by the watcher). */
      async sha256Of(file) {
        const content = await this.plugin.app.vault.read(file);
        return sha256(content);
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
      /** Create (or reuse) the vault's root folder on the server. Everything this
       *  vault pushes is parented under it, so the delta-pull root filter
       *  (`belongsToRoot`) can reject items belonging to other vaults that share
       *  the same account/server — the root cause of cross-vault deletion. */
      async ensureRootFolder() {
        const existing = this.plugin.mapping.rootFolderId;
        if (existing) {
          try {
            const raw = await this.plugin.api.getItem(existing + ".md");
            if (raw !== null)
              return existing;
          } catch {
          }
        }
        const vaultName = this.plugin.app.vault.getName() || "vault";
        const title = "_vault_" + vaultName;
        const id = createJoplinId();
        const now = Date.now();
        const item = {
          id,
          parent_id: "",
          title,
          type_: 2 /* Folder */,
          created_time: now,
          updated_time: now,
          user_created_time: now,
          user_updated_time: now,
          encryption_applied: 0,
          encryption_cipher_text: ""
        };
        await this.plugin.api.putItem(id + ".md", this.serializer.serialize(item), true);
        this.plugin.mapping.setRootFolderId(id);
        this.plugin.mapping.upsert({
          joplinId: id,
          path: title + "/",
          type: 2 /* Folder */,
          localHash: "",
          remoteUpdatedTime: now,
          syncedAt: now
        });
        console.log("[joplin-sync] root folder created: " + title + " (" + id + ")");
        return id;
      }
      async forcePush() {
        if (this.running) {
          new Notice("Sync already in progress");
          return;
        }
        this.running = true;
        this.ensureReady();
        this.watcher?.suspend();
        try {
          this.plugin.statusBar.setSyncing("force push: rebuilding server...");
          await this.syncInfo.checkOrInit();
          this.e2eeActive = this.syncInfo.e2eeEnabled;
          this.invalidateServerEncryptedCache();
          const pushCompatErr = await this.checkEncryptionCompatibility("forcePush");
          if (pushCompatErr) {
            this.plugin.statusBar.setError(pushCompatErr);
            new Notice("Force push blocked: " + pushCompatErr, 1e4);
            return;
          }
          const migratingToE2EE = this.plugin.settings.e2eeEnabled && !!this.plugin.settings.e2eePassword && !await this.serverIsEncrypted();
          if (migratingToE2EE) {
            const ok = await this.confirmMigration();
            if (!ok) {
              this.plugin.statusBar.setIdle();
              new Notice("Force push cancelled \u2014 server stays plaintext.");
              return;
            }
          }
          await this.enableE2EE();
          const rootFolderId = await this.ensureRootFolder();
          const files = this.collectMarkdownFiles();
          const ownedIds = new Set(this.plugin.mapping.all().map((e) => e.joplinId));
          {
            const remote2 = await this.listAllRemoteItems();
            let wiped = 0, skipped = 0;
            console.debug("[joplin-sync] force push reset: scanning " + remote2.length + " remote items");
            const masterKeyIds = new Set(this.plugin.e2ee.availableMasterKeys);
            if (this.plugin.mapping.e2eeMasterKeyId)
              masterKeyIds.add(this.plugin.mapping.e2eeMasterKeyId);
            const protectedRootId = this.plugin.mapping.rootFolderId;
            for (const stat of remote2) {
              if (stat.name === "info.json") {
                skipped++;
                continue;
              }
              const noteMatch = stat.name.match(/^([0-9a-f]{32})\.md$/);
              if (noteMatch) {
                const id = noteMatch[1];
                if (id === protectedRootId) {
                  skipped++;
                  continue;
                }
                const entry = this.plugin.mapping.getById(id);
                if (entry?.type === 9 /* MasterKey */ || masterKeyIds.has(id)) {
                  skipped++;
                  continue;
                }
                if (!ownedIds.has(id)) {
                  skipped++;
                  continue;
                }
              } else {
                const resMatch = stat.name.match(/^\.resource\/([0-9a-f]{32})$/);
                if (resMatch && !ownedIds.has(resMatch[1])) {
                  skipped++;
                  continue;
                }
              }
              try {
                await this.plugin.api.deleteItem(stat.name);
                wiped++;
              } catch (e) {
                console.warn("[joplin-sync] reset delete failed: " + stat.name + " - " + (e instanceof Error ? e.message : String(e)));
              }
            }
            this.plugin.mapping.clearAll();
            console.debug("[joplin-sync] force push reset: wiped " + wiped + " items, kept " + skipped + " (info.json/master keys/foreign items)");
          }
          const pushedNoteIds = /* @__PURE__ */ new Set();
          const pushedFolderIds = /* @__PURE__ */ new Set();
          pushedFolderIds.add(rootFolderId);
          const folderMap = /* @__PURE__ */ new Map();
          folderMap.set("", rootFolderId);
          const dirs = /* @__PURE__ */ new Set();
          const discoverParentDirs = (path4) => {
            const d = path4.includes("/") ? path4.slice(0, path4.lastIndexOf("/")) : "";
            if (!d)
              return;
            const parts = d.split("/");
            if (parts.some((p) => p.startsWith(".")))
              return;
            let accumulated = "";
            for (let i = 0; i < parts.length; i++) {
              accumulated = accumulated ? accumulated + "/" + parts[i] : parts[i];
              if (!folderMap.has(accumulated)) {
                const existing = this.plugin.mapping.getByPath(accumulated + "/");
                if (existing) {
                  folderMap.set(accumulated, existing.joplinId);
                  pushedFolderIds.add(existing.joplinId);
                  continue;
                }
                dirs.add(accumulated);
              }
            }
          };
          for (const f of files)
            discoverParentDirs(f.path);
          for (const f of this.plugin.app.vault.getFiles()) {
            if (f.extension === "md")
              continue;
            discoverParentDirs(f.path);
          }
          const SYSTEM_TOP_DIRS = /* @__PURE__ */ new Set(["home", "Library", "node_modules", "tmp", "private", "Users"]);
          for (const f of this.plugin.app.vault.getAllLoadedFiles()) {
            if (!(f instanceof TFolder))
              continue;
            const rel = f.path.replace(/\/+$/, "");
            if (!rel)
              continue;
            const folderName = rel.split("/").pop() || "";
            if (folderName.startsWith("."))
              continue;
            if (this.shouldExclude(rel + "/"))
              continue;
            const top = rel.split("/")[0];
            if (!rel.includes("/") && SYSTEM_TOP_DIRS.has(top))
              continue;
            if (!folderMap.has(rel)) {
              const existing = this.plugin.mapping.getByPath(rel + "/");
              if (existing) {
                folderMap.set(rel, existing.joplinId);
                pushedFolderIds.add(existing.joplinId);
              } else {
                dirs.add(rel);
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
            } catch {
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
                  this.plugin.statusBar.setProgress(done, files.length, "push");
                } catch (e) {
                  fail++;
                  console.error("[joplin-sync] upload fail [" + fail + "]:", file.path, e instanceof Error ? e.message : String(e));
                }
              }));
              await this.plugin.mapping.flush();
            }
          }
          if (!this.plugin.settings.syncFoldersOnly) {
            console.debug("[joplin-sync] force push notes: done=" + done + " fail=" + fail + " pushedNoteIds=" + pushedNoteIds.size);
            this.plugin.logSync("push", done, fail);
          }
          const pushedResourceIds = /* @__PURE__ */ new Set();
          let rDone = 0, rFail = 0;
          if (!this.plugin.settings.syncFoldersOnly) {
            const allFiles = this.plugin.app.vault.getFiles();
            const resourceFiles = allFiles.filter((f) => f.extension !== "md" && !this.shouldExclude(f.path));
            if (resourceFiles.length > 0) {
              for (const batch of chunk(resourceFiles, 5)) {
                await Promise.all(batch.map(async (f) => {
                  try {
                    const rid = await this.resources.uploadResource(f, true);
                    pushedResourceIds.add(rid);
                    rDone++;
                  } catch (e) {
                    rFail++;
                    console.error("[joplin-sync] resource upload fail:", f.path, e instanceof Error ? e.message : String(e));
                  }
                  this.plugin.statusBar.setProgress(rDone + rFail, resourceFiles.length, "files");
                }));
                await this.plugin.mapping.flush();
              }
            }
            if (rDone || rFail)
              console.debug("[joplin-sync] force push files: " + rDone + " uploaded, " + rFail + " failed");
          }
          let removed = 0, removedNotes = 0, removedFolders = 0, removedResources = 0;
          const protectedMasterKeys = new Set(this.plugin.e2ee.availableMasterKeys);
          if (this.plugin.mapping.e2eeMasterKeyId)
            protectedMasterKeys.add(this.plugin.mapping.e2eeMasterKeyId);
          const remote = await this.listAllRemoteItems();
          console.debug("[joplin-sync] force push cleanup: scanning " + remote.length + " remote items");
          for (const stat of remote) {
            const noteMatch = stat.name.match(/^([0-9a-f]{32})\.md$/);
            if (noteMatch) {
              const id = noteMatch[1];
              if (protectedMasterKeys.has(id))
                continue;
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
              } else {
                const inPushed = pushedNoteIds.has(id) || pushedFolderIds.has(id) || pushedResourceIds.has(id);
                if (!inPushed && !this.plugin.settings.syncFoldersOnly && ownedIds.has(id)) {
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
              if (resMatch && !this.plugin.settings.syncFoldersOnly && ownedIds.has(resMatch[1])) {
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
            console.debug("[joplin-sync] force push cleaned " + removed + " items (notes=" + removedNotes + " folders=" + removedFolders + " resources=" + removedResources + ")");
          let cursor;
          while (true) {
            const page = await this.plugin.api.delta(cursor);
            cursor = page.cursor;
            if (!page.has_more)
              break;
          }
          this.plugin.mapping.setDeltaCursor(cursor ?? "");
          if (fail || rFail) {
            this.plugin.statusBar.setError("push: " + fail + " note + " + rFail + " resource failed");
          } else {
            this.plugin.statusBar.setOk(Date.now(), done + rDone);
          }
        } finally {
          this.watcher?.resume();
          this.plugin.changeLog.clear();
          this.running = false;
          await this.plugin.mapping.flush();
        }
      }
      // ============ Force Pull: overwrite local with server ============
      async forcePull() {
        if (this.running) {
          new Notice("Sync already in progress");
          return;
        }
        this.running = true;
        this.ensureReady();
        this.watcher?.suspend();
        try {
          await this.forcePullInner();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e ?? "Unknown error");
          console.error("[joplin-sync] force pull failed:", msg);
          this.plugin.statusBar.setError(msg);
          new Notice("Force pull failed: " + msg, 8e3);
        } finally {
          this.watcher?.resume();
          this.plugin.changeLog.clear();
          this.running = false;
          await this.plugin.mapping.flush();
        }
      }
      /** forcePull body WITHOUT the running guard, so InitialSync can call it
       *  inside syncCycle (which already holds the lock) (C2). */
      async forcePullInner() {
        try {
          this.plugin.statusBar.setSyncing("force pull: clearing local...");
          await this.syncInfo.checkOrInit();
          this.e2eeActive = this.syncInfo.e2eeEnabled;
          this.invalidateServerEncryptedCache();
          const pullCompatErr = await this.checkEncryptionCompatibility("forcePull");
          if (pullCompatErr) {
            this.plugin.statusBar.setError(pullCompatErr);
            new Notice("Force pull blocked: " + pullCompatErr, 1e4);
            return;
          }
          await this.enableE2EE();
          this.plugin.mapping.clearAll();
          const adapter = this.plugin.app.vault.adapter;
          const isKept = (p) => this.shouldExclude(p);
          let delCount = 0, delDirCount = 0;
          for (const f of this.plugin.app.vault.getFiles()) {
            if (!isKept(f.path)) {
              const fm = this.plugin.app.fileManager;
              try {
                if (fm?.trashFile)
                  await fm.trashFile(f);
                else
                  await this.plugin.app.vault.remove(f);
                delCount++;
              } catch (e) {
                console.warn("[joplin-sync] force pull file delete failed: " + f.path + " - " + (e instanceof Error ? e.message : String(e)));
              }
            }
          }
          const normDir = (p) => p.replace(/^\.\//, "").replace(/\/+$/, "");
          const listAll = async (dir) => {
            const result = [];
            try {
              if (adapter.list) {
                const listing = await adapter.list(dir);
                for (const sub of listing.folders) {
                  const clean = normDir(sub);
                  if (!clean || clean === "." || clean === "..")
                    continue;
                  const children = await listAll(clean);
                  result.push(...children, clean);
                }
              }
            } catch {
            }
            return result;
          };
          let allLocalDirs = [];
          try {
            if (adapter.list) {
              const root = await adapter.list("");
              for (const d of root.folders) {
                const clean = normDir(d);
                if (!clean || clean === "." || clean === "..")
                  continue;
                if (isKept(clean))
                  continue;
                const subs = await listAll(clean);
                allLocalDirs.push(...subs, clean);
              }
            }
          } catch {
          }
          allLocalDirs = [...new Set(allLocalDirs)];
          allLocalDirs.sort((a, b) => b.split("/").length - a.split("/").length);
          for (const d of allLocalDirs) {
            if (isKept(d))
              continue;
            try {
              if (await adapter.exists(d)) {
                await adapter.rmdir(d, false);
                delDirCount++;
              }
            } catch (e) {
              console.warn("[joplin-sync] force pull rmdir failed: " + d + " - " + (e instanceof Error ? e.message : String(e)));
            }
          }
          this.plugin.mapping.setDeltaCursor("");
          console.debug("[joplin-sync] force pull: deleted " + delCount + " files, " + delDirCount + " dirs");
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
              const allowedPullTypes = /* @__PURE__ */ new Set([1 /* Note */, 2 /* Folder */, 4 /* Resource */, 9 /* MasterKey */]);
              if (!allowedPullTypes.has(item.type_))
                continue;
              if (item.type_ === 9 /* MasterKey */) {
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
          const serverRoot = folders.find((f) => !f.parent_id && (f.title || "").startsWith("_vault_"));
          if (serverRoot && !this.plugin.mapping.rootFolderId) {
            this.plugin.mapping.setRootFolderId(serverRoot.id);
          }
          this.buildForcePullFolderPaths(folders);
          const pullRootId = this.plugin.mapping.rootFolderId;
          for (const f of folders) {
            if (!f.title) {
              skipped++;
              continue;
            }
            if (f.id === pullRootId) {
              this.plugin.mapping.upsert({
                joplinId: f.id,
                path: "",
                type: 2 /* Folder */,
                localHash: "",
                remoteUpdatedTime: f.updated_time,
                syncedAt: Date.now()
              });
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
              console.warn("[joplin-sync] force-pull folder:", f.title, e instanceof Error ? e.message : String(e));
            }
          }
          const notes = allItems.filter((i) => i.type_ === 1 /* Note */);
          const usedPaths = /* @__PURE__ */ new Set();
          for (const item of notes) {
            if (!item.title) {
              skipped++;
              continue;
            }
            try {
              const dir = this.resolveForcePullFolderPath(item.parent_id);
              const sanitized = safeFileName(item.title);
              let path4 = dir + sanitized + ".md";
              if (usedPaths.has(path4)) {
                path4 = dir + sanitized + " (" + item.id.slice(0, 7) + ").md";
              }
              usedPaths.add(path4);
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
              const stamped = stampFrontmatter(body || "", item.id);
              if (existing instanceof TFile) {
                await this.plugin.app.vault.modify(existing, stamped);
              } else if (!existing) {
                await this.plugin.app.vault.create(path4, stamped);
              }
              const hash = await sha256(stamped);
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
              const msg = e instanceof Error ? e.message : String(e);
              if (msg.includes("401"))
                try {
                  await this.plugin.api.login(true);
                } catch {
                }
              if (failed <= 3)
                console.error("[joplin-sync] force-pull:", item.title, msg);
            }
            this.plugin.statusBar.setProgress(done, notes.length, "pull");
          }
          let cursor;
          while (true) {
            const page = await this.plugin.api.delta(cursor);
            if (page.has_more && !page.cursor)
              break;
            cursor = page.cursor;
            if (!page.has_more)
              break;
          }
          this.plugin.mapping.setDeltaCursor(cursor ?? "");
          await this.plugin.mapping.flush();
          const resources = allItems.filter((i) => i.type_ === 4 /* Resource */);
          const downloadedPaths = /* @__PURE__ */ new Set();
          let rDone = 0, rFail = 0;
          if (resources.length > 0) {
            for (const r of resources) {
              try {
                const p = await this.resources.downloadResource(r);
                if (p)
                  downloadedPaths.add(p);
                rDone++;
              } catch (e) {
                rFail++;
                if (rFail <= 3)
                  console.error("[joplin-sync] force-pull resource:", r.id, e instanceof Error ? e.message : String(e));
              }
              this.plugin.statusBar.setProgress(rDone + rFail, resources.length, "files");
            }
          }
          if (rDone || rFail)
            console.debug("[joplin-sync] force pull attachments: " + rDone + " downloaded, " + rFail + " failed");
          const totalSynced = done + rDone;
          const totalFail = failed + rFail;
          if (totalFail) {
            this.plugin.statusBar.setError("pull: " + totalFail + " failed");
          } else {
            this.plugin.statusBar.setOk(Date.now(), totalSynced);
          }
          new Notice("Force pull: " + totalSynced + " items" + (totalFail ? ", " + totalFail + " failed" : ""));
          this.plugin.logSync("pull", totalSynced, totalFail);
          let localRemoved = 0;
          for (const f of this.plugin.app.vault.getFiles()) {
            if (f.extension === "md")
              continue;
            if (this.shouldExclude(f.path))
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
            console.debug("[joplin-sync] force pull removed " + localRemoved + " stale local files");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e ?? "Unknown error");
          console.error("[joplin-sync] force pull failed:", msg);
          this.plugin.statusBar.setError(msg);
          new Notice("Force pull failed: " + msg, 8e3);
        } finally {
          await this.plugin.mapping.flush();
        }
      }
      async removeEmptyDirs(deletedPaths) {
        const dirs = /* @__PURE__ */ new Set();
        for (const p of deletedPaths) {
          const parts = p.split("/");
          for (let i = parts.length - 1; i > 0; i--) {
            dirs.add(parts.slice(0, i).join("/"));
          }
        }
        const sorted = [...dirs].sort((a, b) => b.split("/").length - a.split("/").length);
        let count = 0;
        const adapter = this.plugin.app.vault.adapter;
        for (const d of sorted) {
          try {
            if (await adapter.exists(d)) {
              await adapter.rmdir(d, false).catch(() => {
              });
              count++;
            }
          } catch {
          }
        }
        if (count)
          console.debug("[joplin-sync] force pull: removed " + count + " empty dirs");
        return count;
      }
      buildForcePullFolderPaths(folders) {
        this.forcePullFolderPaths.clear();
        const sanitize = (t) => safeFileName(t);
        const paths = /* @__PURE__ */ new Map();
        const rootId = this.plugin.mapping.rootFolderId;
        if (rootId)
          paths.set(rootId, "");
        let remaining = [...folders];
        while (remaining.length > 0) {
          const next = [];
          for (const f of remaining) {
            let parentPath;
            if (f.parent_id) {
              if (f.parent_id === rootId) {
                parentPath = "";
              } else {
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
        if (parentId === this.plugin.mapping.rootFolderId)
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
            out.push(it);
          }
          cursor = page.cursor;
          if (!page.has_more)
            break;
          if (!cursor)
            break;
        }
        return out;
      }
      /** Actual server E2EE state from item bodies — master key present or any
       *  item carries encryption_applied: 1. Does NOT trust the info.json flag
       *  (it can be stale: left `e2ee:true` from an earlier aborted migration
       *  while the server holds no master key and only plaintext items).
       *  Result is cached per session (C6): a full GET scan on every cycle is
       *  O(n) requests. */
      async serverIsEncrypted() {
        if (this.serverEncryptedCache !== null)
          return this.serverEncryptedCache;
        const localEncrypted = this.plugin.settings.e2eeEnabled && !!this.plugin.settings.e2eePassword;
        if (!localEncrypted) {
          this.serverEncryptedCache = false;
          return false;
        }
        const remote = await this.listAllRemoteItems();
        for (const stat of remote) {
          if (!/^[0-9a-f]{32}\.md$/.test(stat.name))
            continue;
          try {
            const raw = await this.plugin.api.getItem(stat.name);
            if (!raw)
              continue;
            const item = this.serializer.unserialize(raw);
            if (item.type_ === 9 /* MasterKey */ || item.encryption_applied === 1) {
              this.serverEncryptedCache = true;
              return true;
            }
          } catch {
          }
        }
        this.serverEncryptedCache = false;
        return false;
      }
      /** Invalidate the cached server E2EE state (settings changed / force op). */
      invalidateServerEncryptedCache() {
        this.serverEncryptedCache = null;
      }
      /**
       * E2EE compatibility rule: an encrypted vault may only sync with an
       * encrypted target, a plaintext vault only with a plaintext target.
       * Mixing them corrupts or silently loses data. Returns null when states
       * match (or the mismatch is allowed for the action), else an error
       * message the caller should surface and abort with.
       */
      async checkEncryptionCompatibility(action) {
        const localEncrypted = this.plugin.settings.e2eeEnabled && !!this.plugin.settings.e2eePassword;
        const serverEncrypted = await this.serverIsEncrypted();
        if (localEncrypted === serverEncrypted)
          return null;
        if (localEncrypted && !serverEncrypted) {
          if (action === "forcePush")
            return null;
          return "Local vault has E2EE enabled but the server is a plaintext target. Encrypted and unencrypted vaults cannot sync. Run Force Push to migrate the server to E2EE first.";
        }
        if (action === "forcePush") {
          return "Server is E2EE-encrypted but this vault is not. Force Push would overwrite encrypted data with plaintext \u2014 aborted. Enable E2EE + enter the password on this vault first.";
        }
        return "Server is E2EE-encrypted but this vault is not. Encrypted and unencrypted vaults cannot sync. Enable E2EE + enter the password, then sync.";
      }
      confirmMigration() {
        return new Promise((resolve) => {
          const modal = new Modal(this.plugin.app);
          modal.titleEl.setText("Migrate to E2EE");
          modal.contentEl.createEl("p", {
            text: "This vault has E2EE enabled but the server is plaintext. Force Push will re-upload EVERYTHING as encrypted data and mark the server as E2EE \u2014 other plaintext clients will no longer be able to sync. Continue?"
          });
          const btns = modal.contentEl.createDiv();
          const okBtn = btns.createEl("button", { text: "Migrate (encrypt server)" });
          okBtn.addClass("mod-cta");
          okBtn.onclick = () => {
            modal.close();
            resolve(true);
          };
          const cancelBtn = btns.createEl("button", { text: "Cancel" });
          cancelBtn.onclick = () => {
            modal.close();
            resolve(false);
          };
          modal.open();
        });
      }
    };
  }
});

// src/e2ee/EncryptionService.ts
var EncryptionService_exports = {};
__export(EncryptionService_exports, {
  EncryptionMethod: () => EncryptionMethod,
  EncryptionService: () => EncryptionService,
  MasterKeyNotLoadedError: () => MasterKeyNotLoadedError
});
var EncryptionMethod, HEADER_IDENTIFIER, GCM_TAG_BITS, NONCE_BYTES, KEY_BYTES, SALT_BYTES, KEYV1_ITERATIONS, CHUNK_ITERATIONS, CHUNK_SIZES, EncryptionService, MasterKeyNotLoadedError;
var init_EncryptionService = __esm({
  "src/e2ee/EncryptionService.ts"() {
    "use strict";
    init_models();
    EncryptionMethod = /* @__PURE__ */ ((EncryptionMethod2) => {
      EncryptionMethod2[EncryptionMethod2["SJCL"] = 1] = "SJCL";
      EncryptionMethod2[EncryptionMethod2["SJCL2"] = 2] = "SJCL2";
      EncryptionMethod2[EncryptionMethod2["SJCL3"] = 3] = "SJCL3";
      EncryptionMethod2[EncryptionMethod2["SJCL4"] = 4] = "SJCL4";
      EncryptionMethod2[EncryptionMethod2["SJCL1a"] = 5] = "SJCL1a";
      EncryptionMethod2[EncryptionMethod2["Custom"] = 6] = "Custom";
      EncryptionMethod2[EncryptionMethod2["SJCL1b"] = 7] = "SJCL1b";
      EncryptionMethod2[EncryptionMethod2["KeyV1"] = 8] = "KeyV1";
      EncryptionMethod2[EncryptionMethod2["FileV1"] = 9] = "FileV1";
      EncryptionMethod2[EncryptionMethod2["StringV1"] = 10] = "StringV1";
      return EncryptionMethod2;
    })(EncryptionMethod || {});
    HEADER_IDENTIFIER = "JED01";
    GCM_TAG_BITS = 128;
    NONCE_BYTES = 12;
    KEY_BYTES = 32;
    SALT_BYTES = 16;
    KEYV1_ITERATIONS = 22e4;
    CHUNK_ITERATIONS = 3;
    CHUNK_SIZES = {
      [1 /* SJCL */]: 5e3,
      [2 /* SJCL2 */]: 5e3,
      [3 /* SJCL3 */]: 5e3,
      [4 /* SJCL4 */]: 5e3,
      [5 /* SJCL1a */]: 5e3,
      [7 /* SJCL1b */]: 5e3,
      [8 /* KeyV1 */]: 5e3,
      [9 /* FileV1 */]: 131072,
      [10 /* StringV1 */]: 65536
    };
    EncryptionService = class {
      constructor() {
        /** masterKeyId → decrypted master key plain text (512 hex chars) */
        this.masterKeyPlainTexts = /* @__PURE__ */ new Map();
        this.masterKeyItems = /* @__PURE__ */ new Map();
        this.activeMasterKeyId = null;
      }
      /** Feed a MasterKey item (type_=9) so it can be used for decryption. */
      feedMasterKey(item) {
        if (item.type_ !== 9 /* MasterKey */)
          return;
        const candidates = [
          item.content ?? "",
          item.body ?? "",
          item.encryption_cipher_text ?? ""
        ];
        let encryptedContent = "";
        for (const c of candidates) {
          if (!c)
            continue;
          try {
            const p = JSON.parse(c);
            if (p && p.iv && p.ct && p.salt) {
              encryptedContent = c;
              break;
            }
          } catch {
          }
        }
        if (!encryptedContent)
          encryptedContent = candidates.find((c) => !!c) ?? "";
        this.masterKeyItems.set(item.id, {
          id: item.id,
          encryptionMethod: item.encryption_method ?? 8 /* KeyV1 */,
          checksum: item.checksum ?? "",
          encryptedContent
        });
      }
      /** Generate a fresh master key (KeyV1) from a password. Returns the wrapped key entity. */
      async generateMasterKey(password, id) {
        if (!password)
          throw new Error("Password required to generate a master key");
        const keyBytes = crypto.getRandomValues(new Uint8Array(256));
        const hexKey = this.bytesToHex(keyBytes);
        const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
        const result = await this.encryptAesGcm(password, salt, this.buf(new TextEncoder().encode(hexKey)), KEYV1_ITERATIONS);
        return {
          id,
          encryptionMethod: 8 /* KeyV1 */,
          checksum: "",
          encryptedContent: JSON.stringify(result)
        };
      }
      /** Load a master key into memory by decrypting its content with the user password. */
      async loadMasterKey(masterKeyId, password) {
        const mk = this.masterKeyItems.get(masterKeyId);
        if (!mk)
          throw new Error("Master key item not found: " + masterKeyId);
        if (!password)
          throw new Error("Password required");
        let result;
        try {
          result = JSON.parse(mk.encryptedContent);
        } catch {
          throw new Error("Master key " + masterKeyId + " has invalid encrypted content (not JSON)");
        }
        if (!result.salt || !result.iv || !result.ct) {
          throw new Error("Master key " + masterKeyId + " has invalid encrypted content (missing salt/iv/ct)");
        }
        const plainBuf = await this.decryptAesGcm(
          password,
          this.base64ToBytes(result.salt),
          this.base64ToBytes(result.iv),
          this.base64ToBytes(result.ct),
          KEYV1_ITERATIONS
        );
        const hexKey = new TextDecoder().decode(plainBuf).trim();
        if (!/^[0-9a-f]+$/i.test(hexKey)) {
          throw new Error("Master key " + masterKeyId + " decrypted to invalid key material (wrong password?)");
        }
        this.masterKeyPlainTexts.set(masterKeyId, hexKey);
        this.activeMasterKeyId = masterKeyId;
      }
      isEncrypted(item) {
        return item.encryption_applied === 1;
      }
      async tryDecrypt(item) {
        if (!this.isEncrypted(item))
          return item.body ?? "";
        return this.decryptItem(item);
      }
      /** Decrypt an item's `encryption_cipher_text` → serialized (plain) item text. */
      async decryptItem(item) {
        if (!this.isEncrypted(item))
          return item.body ?? "";
        const header = this.parseHeader(item.encryption_cipher_text);
        if (header.method !== 10 /* StringV1 */) {
          throw new Error("Item encryption method " + header.method + " not supported (only StringV1=10)");
        }
        const masterKeyHex = this.masterKeyPlainTexts.get(header.masterKeyId);
        if (!masterKeyHex)
          throw new Error("Master key not loaded: " + header.masterKeyId + " \u2014 enter password");
        return this.decryptChunks(item.encryption_cipher_text, header.method, masterKeyHex, "utf16le");
      }
      /** Encrypt a serialized item string → `encryption_cipher_text` (StringV1). */
      async encryptItem(serialized, masterKeyId) {
        const masterKeyHex = this.masterKeyPlainTexts.get(masterKeyId);
        if (!masterKeyHex)
          throw new Error("Master key not loaded: " + masterKeyId);
        const chunks = await this.encryptChunks(serialized, 10 /* StringV1 */, masterKeyHex, "utf16le");
        return this.buildCipherText(10 /* StringV1 */, masterKeyId, chunks);
      }
      /** Encrypt binary resource data (FileV1) → hex cipher text string. */
      async encryptBlob(data, masterKeyId) {
        const masterKeyHex = this.masterKeyPlainTexts.get(masterKeyId);
        if (!masterKeyHex)
          throw new Error("Master key not loaded: " + masterKeyId);
        const b64 = this.arrayBufferToBase64(data);
        const chunks = await this.encryptChunks(b64, 9 /* FileV1 */, masterKeyHex, "base64");
        return this.buildCipherText(9 /* FileV1 */, masterKeyId, chunks);
      }
      /** Decrypt a resource blob cipher text (FileV1) → binary. */
      async decryptBlob(data, _masterKeyId) {
        const header = this.parseHeader(data);
        if (header.method !== 9 /* FileV1 */) {
          throw new Error("Resource encryption method " + header.method + " not supported (only FileV1=9)");
        }
        const masterKeyHex = this.masterKeyPlainTexts.get(header.masterKeyId);
        if (!masterKeyHex)
          throw new Error("Master key not loaded: " + header.masterKeyId + " \u2014 enter password");
        const b64 = await this.decryptChunks(data, header.method, masterKeyHex, "base64");
        return this.base64ToBytes(b64).buffer;
      }
      /** Encrypt binary data → ArrayBuffer (JED01 cipher text bytes, for direct upload). */
      async encryptBlobData(data, masterKeyId) {
        const hex = await this.encryptBlob(data, masterKeyId);
        return new TextEncoder().encode(hex).buffer;
      }
      /** Decrypt a JED01 cipher text blob (ArrayBuffer from server) → plaintext ArrayBuffer. */
      async decryptBlobData(data, masterKeyId) {
        const hex = new TextDecoder().decode(data);
        return this.decryptBlob(hex, masterKeyId);
      }
      // === Chunked encryption (StringV1 / FileV1) ===
      async encryptChunks(plain, method, masterKeyHex, encoding) {
        const chunkSize = CHUNK_SIZES[method] ?? 65536;
        const chunks = [];
        for (let i = 0; i < plain.length; i += chunkSize) {
          const block = plain.slice(i, i + chunkSize);
          chunks.push(await this.encryptBlock(block, masterKeyHex, encoding));
        }
        return chunks;
      }
      async decryptChunks(cipherText, method, masterKeyHex, encoding) {
        const headerLenHex = cipherText.slice(HEADER_IDENTIFIER.length, HEADER_IDENTIFIER.length + 6);
        const headerLen = parseInt(headerLenHex, 16);
        let pos = HEADER_IDENTIFIER.length + 6 + headerLen;
        const parts = [];
        while (pos < cipherText.length) {
          const chunkLenHex = cipherText.slice(pos, pos + 6);
          if (chunkLenHex.length < 6)
            break;
          const chunkLen = parseInt(chunkLenHex, 16);
          pos += 6;
          if (isNaN(chunkLen) || chunkLen <= 0)
            break;
          const block = cipherText.slice(pos, pos + chunkLen);
          pos += chunkLen;
          parts.push(await this.decryptBlock(block, masterKeyHex, encoding));
        }
        return parts.join("");
      }
      /** Encrypt one block → JSON {salt, iv, ct} base64 */
      async encryptBlock(plain, masterKeyHex, encoding) {
        const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
        const data = encoding === "utf16le" ? this.utf16leEncode(plain) : this.base64ToBytes(plain);
        const result = await this.encryptAesGcm(masterKeyHex, salt, this.buf(data), CHUNK_ITERATIONS);
        return JSON.stringify(result);
      }
      /** Decrypt one JSON block → plain string */
      async decryptBlock(block, masterKeyHex, encoding) {
        let result;
        try {
          result = JSON.parse(block);
        } catch {
          throw new Error("Invalid encrypted block (not JSON): " + block.slice(0, 32) + "\u2026");
        }
        if (!result.salt || !result.iv || !result.ct) {
          throw new Error("Invalid encrypted block (missing salt/iv/ct)");
        }
        const plainBuf = await this.decryptAesGcm(
          masterKeyHex,
          this.base64ToBytes(result.salt),
          this.base64ToBytes(result.iv),
          this.base64ToBytes(result.ct),
          CHUNK_ITERATIONS
        );
        if (encoding === "utf16le")
          return this.utf16leDecode(plainBuf);
        return this.bytesToBase64(new Uint8Array(plainBuf));
      }
      // === AES-GCM + PBKDF2 (matches Joplin native crypto) ===
      async deriveKey(password, salt, iterations, usage) {
        const baseKey = await crypto.subtle.importKey(
          "raw",
          this.buf(new TextEncoder().encode(password)),
          { name: "PBKDF2" },
          false,
          ["deriveKey"]
        );
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: this.buf(salt), iterations, hash: "SHA-512" },
          baseKey,
          { name: "AES-GCM", length: KEY_BYTES * 8 },
          false,
          usage
        );
      }
      async encryptAesGcm(password, salt, data, iterations) {
        const key = await this.deriveKey(password, salt, iterations, ["encrypt"]);
        const iv = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
        const ct = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: this.buf(iv), tagLength: GCM_TAG_BITS },
          key,
          this.buf(data)
        );
        return {
          salt: this.bytesToBase64(salt),
          iv: this.bytesToBase64(iv),
          ct: this.bytesToBase64(new Uint8Array(ct))
        };
      }
      async decryptAesGcm(password, salt, iv, ct, iterations) {
        const key = await this.deriveKey(password, salt, iterations, ["decrypt"]);
        const plain = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: this.buf(iv), tagLength: GCM_TAG_BITS },
          key,
          this.buf(ct)
        );
        return new Uint8Array(plain);
      }
      // === Header parsing/building (JED01) ===
      parseHeader(ct) {
        if (!ct.startsWith(HEADER_IDENTIFIER)) {
          throw new Error("Invalid E2EE header (missing JED01 identifier)");
        }
        const mdSizeHex = ct.slice(HEADER_IDENTIFIER.length, HEADER_IDENTIFIER.length + 6);
        const mdSize = parseInt(mdSizeHex, 16);
        if (isNaN(mdSize) || !mdSize)
          throw new Error("Invalid E2EE header metadata size: " + mdSizeHex);
        const md = ct.slice(HEADER_IDENTIFIER.length + 6, HEADER_IDENTIFIER.length + 6 + mdSize);
        const method = parseInt(md.slice(0, 2), 16);
        const masterKeyId = md.slice(2, 34);
        if (masterKeyId.length !== 32)
          throw new Error("Invalid E2EE header master key ID size");
        return { version: 1, method, masterKeyId };
      }
      buildHeader(method, masterKeyId) {
        if (masterKeyId.length !== 32)
          throw new Error("Invalid master key ID size: " + masterKeyId);
        const metadata = method.toString(16).padStart(2, "0") + masterKeyId;
        const mdSizeHex = metadata.length.toString(16).padStart(6, "0");
        return HEADER_IDENTIFIER + mdSizeHex + metadata;
      }
      buildCipherText(method, masterKeyId, chunks) {
        let out = this.buildHeader(method, masterKeyId);
        for (const chunk2 of chunks) {
          out += chunk2.length.toString(16).padStart(6, "0") + chunk2;
        }
        return out;
      }
      // === Encoding helpers ===
      utf16leEncode(s) {
        const out = new Uint8Array(s.length * 2);
        for (let i = 0; i < s.length; i++) {
          const code = s.charCodeAt(i);
          out[i * 2] = code & 255;
          out[i * 2 + 1] = code >> 8 & 255;
        }
        return out;
      }
      utf16leDecode(bytes) {
        const chars = [];
        for (let i = 0; i + 1 < bytes.length; i += 2) {
          chars.push(String.fromCharCode(bytes[i] | bytes[i + 1] << 8));
        }
        return chars.join("");
      }
      base64ToBytes(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++)
          bytes[i] = bin.charCodeAt(i);
        return new Uint8Array(bytes.buffer);
      }
      bytesToBase64(bytes) {
        let bin = "";
        for (let i = 0; i < bytes.length; i++)
          bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
      }
      arrayBufferToBase64(data) {
        return this.bytesToBase64(new Uint8Array(data));
      }
      hexToBytes(hex) {
        if (!hex)
          return new Uint8Array(0);
        const clean = hex.length % 2 ? "0" + hex : hex;
        const bytes = new Uint8Array(clean.length / 2);
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
        }
        return new Uint8Array(bytes.buffer);
      }
      bytesToHex(bytes) {
        return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      }
      /** Copy into a fresh concrete ArrayBuffer-backed view (BufferSource compat). */
      buf(u8) {
        const out = new Uint8Array(u8.byteLength);
        out.set(u8);
        return new Uint8Array(out.buffer);
      }
      get hasLoadedKeys() {
        return this.masterKeyPlainTexts.size > 0;
      }
      get availableMasterKeys() {
        return [...this.masterKeyItems.keys()];
      }
      get activeKeyId() {
        return this.activeMasterKeyId;
      }
      get firstLoadedKeyId() {
        return this.masterKeyPlainTexts.keys().next().value ?? null;
      }
    };
    MasterKeyNotLoadedError = class extends Error {
      constructor(masterKeyId) {
        super(`Master key ${masterKeyId} not loaded \u2014 password required`);
        this.masterKeyId = masterKeyId;
      }
    };
  }
});

// cli/sync-cli.ts
var fs3 = __toESM(require("fs"));
var path3 = __toESM(require("path"));

// src/api/JoplinServerApi.ts
init_obsidian_real();
var JoplinServerApi = class {
  constructor(getConfig) {
    this.sessionId = null;
    this.loginPromise = null;
    this.execJsonLogCount = 0;
    this.getConfig = getConfig;
  }
  async login(force = false) {
    if (!force && this.sessionId)
      return;
    if (!force && this.loginPromise)
      return this.loginPromise;
    const doLogin = async () => {
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
    };
    if (force) {
      await doLogin();
    } else {
      this.loginPromise = doLogin().finally(() => {
        this.loginPromise = null;
      });
      return this.loginPromise;
    }
  }
  async rawRequest(method, path4, opts = {}) {
    if (!this.sessionId)
      await this.login();
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
        this.sessionId = null;
        await this.login(true);
        continue;
      }
      if (res.status === 429 && attempt < maxRetries) {
        await this.sleep(Math.pow(2, attempt) * 1e3);
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
    const encoded = name.split("/").map(encodeURIComponent).join("/");
    return "/api/items/root:/" + encoded + ":" + suffix;
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
  async listChildrenOf(parentId, cursor, itemType) {
    const base = parentId ? "/api/items/root:/" + parentId + ":/children" : "/api/items/root:/:/children";
    const params = [];
    if (cursor)
      params.push("cursor=" + encodeURIComponent(cursor));
    if (itemType !== void 0)
      params.push("item_type=" + itemType);
    const q = params.length ? "?" + params.join("&") : "";
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
    const items = raw.items ?? [];
    for (const item of items) {
      if (item.item_name)
        item.name = item.item_name;
      if (item.jop_updated_time)
        item.updated_time = item.jop_updated_time;
      if (item.type !== void 0 && item.type !== null)
        item.type = Number(item.type);
      if (item.item_type !== void 0 && item.item_type !== null)
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
      try {
        const tmpPath = this.filePath + ".tmp";
        if (await adapter.exists(tmpPath)) {
          this.data = JSON.parse(await adapter.read(tmpPath));
          await adapter.remove(this.filePath).catch(() => {
          });
          await adapter.rename(tmpPath, this.filePath);
        } else if (await adapter.exists(this.filePath)) {
          this.data = JSON.parse(await adapter.read(this.filePath));
        }
      } catch (e) {
        console.error("[joplin-sync] mapping.json corrupt, rebuilding from empty:", e);
        try {
          await adapter.rename(this.filePath, this.filePath + ".corrupt");
        } catch {
        }
        this.data = { version: 1, deltaCursor: "", rootFolderId: "", entries: [], tombstones: [] };
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
  clearAll() {
    this.data.entries = [];
    this.byId.clear();
    this.byPath.clear();
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
  get e2eeMasterKeyId() {
    return this.data.e2eeMasterKeyId;
  }
  setE2eeMasterKeyId(id) {
    this.data.e2eeMasterKeyId = id;
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

// cli/sync-cli.ts
init_SyncEngine();

// test/mock/vault.ts
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
init_obsidian_real();
var MockVault = class {
  constructor(root) {
    this.root = root;
    this.configDir = ".obsidian";
    this.adapter = new MockAdapter();
    if (!fs2.existsSync(root))
      fs2.mkdirSync(root, { recursive: true });
  }
  getName() {
    return path2.basename(this.root);
  }
  on(_event, _cb) {
    return { unload: () => {
    } };
  }
  off(_event, _cb) {
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
  getAllLoadedFiles() {
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
        if (e.isDirectory()) {
          out.push(new TFolder(rel + "/"));
          rec(full);
        } else
          out.push(new TFile(rel));
      }
    };
    rec(this.root);
    return out;
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
  async remove(file) {
    const p = typeof file === "string" ? file : file.path;
    fs2.rmSync(this.abs(p), { recursive: true, force: true });
  }
  async rename(file, newPath) {
    const oldAbs = this.abs(file.path);
    const newAbs = this.abs(newPath);
    fs2.mkdirSync(path2.dirname(newAbs), { recursive: true });
    fs2.renameSync(oldAbs, newAbs);
    file.path = newPath;
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
  constructor(root) {
    this.root = root;
  }
  async exists(p) {
    try {
      return fs2.existsSync(path2.join(this.root, p));
    } catch {
      return false;
    }
  }
  async read(p) {
    return fs2.readFileSync(path2.join(this.root, p), "utf8");
  }
  async write(p, content) {
    const full = path2.join(this.root, p);
    fs2.mkdirSync(path2.dirname(full), { recursive: true });
    fs2.writeFileSync(full, content);
  }
  async mkdir(p) {
    fs2.mkdirSync(path2.join(this.root, p), { recursive: true });
  }
  async list(p) {
    const abs = path2.join(this.root, p);
    const files = [];
    const folders = [];
    try {
      for (const e of fs2.readdirSync(abs, { withFileTypes: true })) {
        const full = path2.join(abs, e.name);
        const rel = path2.relative(this.root, full);
        if (e.isDirectory())
          folders.push(rel);
        else
          files.push(rel);
      }
    } catch {
    }
    return { files, folders };
  }
  async rename(from, to) {
    const fromAbs = path2.join(this.root, from);
    const toAbs = path2.join(this.root, to);
    fs2.mkdirSync(path2.dirname(toAbs), { recursive: true });
    fs2.renameSync(fromAbs, toAbs);
  }
  async remove(p) {
    fs2.rmSync(path2.join(this.root, p), { force: true });
  }
  async rmdir(p, recursive) {
    if (recursive) {
      fs2.rmSync(path2.join(this.root, p), { recursive: true, force: true });
    } else {
      try {
        fs2.rmdirSync(path2.join(this.root, p));
      } catch {
      }
    }
  }
};

// cli/sync-cli.ts
init_obsidian_real();

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
  e2eeEnabled: false,
  e2eePassword: ""
};

// cli/sync-cli.ts
init_JoplinSerializer();
init_EncryptionService();

// src/core/ChangeLogStore.ts
var ChangeLogStore = class {
  constructor(plugin) {
    this.plugin = plugin;
    this.data = { entries: [] };
    this.dirty = false;
    this.persistTimer = null;
  }
  get filePath() {
    return this.plugin.manifest.dir + "/data/changelog.json";
  }
  async load() {
    const adapter = this.plugin.app.vault.adapter;
    if (adapter.exists && await adapter.exists(this.filePath)) {
      try {
        this.data = JSON.parse(await adapter.read(this.filePath));
      } catch {
        this.data = { entries: [] };
      }
    }
  }
  /** Append or merge a change for a fileId (coalesce rapid successive ops). */
  push(entry) {
    const now = Date.now();
    const existingIdx = this.data.entries.findIndex((e) => e.fileId === entry.fileId && e.status === "pending");
    if (existingIdx >= 0) {
      const prev = this.data.entries[existingIdx];
      if (prev.op === "create" && entry.op === "delete") {
        this.data.entries.splice(existingIdx, 1);
      } else if (prev.op === "create" && entry.op === "update") {
        this.data.entries[existingIdx] = { ...prev, path: entry.path, hash: entry.hash, timestamp: now };
      } else {
        this.data.entries[existingIdx] = { ...prev, op: entry.op, path: entry.path, oldPath: entry.oldPath ?? prev.oldPath, hash: entry.hash ?? prev.hash, timestamp: now };
      }
    } else {
      this.data.entries.push({ ...entry, timestamp: now, status: "pending" });
    }
    this.dirty = true;
    void this.persist();
  }
  pending() {
    return this.data.entries.filter((e) => e.status === "pending");
  }
  all() {
    return this.data.entries;
  }
  markSynced(fileId) {
    const e = this.data.entries.find((x) => x.fileId === fileId && x.status === "pending");
    if (e) {
      e.status = "synced";
      this.dirty = true;
    }
  }
  /** Drop every pending entry. Used after a force operation rebuilt the
   *  vault — the deluge of watcher events it generated must not replay (C3). */
  clear() {
    this.data.entries = [];
    this.dirty = true;
  }
  /** Remove synced entries older than the retention window. */
  prune(maxAgeMs = 7 * 24 * 3600 * 1e3) {
    const cutoff = Date.now() - maxAgeMs;
    const before = this.data.entries.length;
    this.data.entries = this.data.entries.filter((e) => e.status === "pending" || e.timestamp >= cutoff);
    if (this.data.entries.length !== before) {
      this.dirty = true;
      void this.persist();
    }
  }
  async persist() {
    if (this.persistTimer)
      return;
    this.persistTimer = window.setTimeout(async () => {
      this.persistTimer = null;
      try {
        const adapter = this.plugin.app.vault.adapter;
        const dir = this.plugin.manifest.dir + "/data";
        if (!await adapter.exists(dir))
          await adapter.mkdir(dir);
        await adapter.write(this.filePath, JSON.stringify(this.data));
        this.dirty = false;
      } catch {
      }
    }, 500);
  }
  async flush() {
    if (!this.dirty)
      return;
    const adapter = this.plugin.app.vault.adapter;
    try {
      const dir = this.plugin.manifest.dir + "/data";
      if (!await adapter.exists(dir))
        await adapter.mkdir(dir);
      await adapter.write(this.filePath, JSON.stringify(this.data));
      this.dirty = false;
    } catch {
    }
  }
};

// cli/sync-cli.ts
init_FileIdentity();
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
    excludePatterns: d.excludePatterns || [],
    e2eeEnabled: d.e2eeEnabled === true,
    e2eePassword: d.e2eePassword || ""
  };
}
function makePlugin(vaultRoot2, creds) {
  const vault = new MockVault(vaultRoot2);
  vault.adapter = new DiskAdapter(vaultRoot2);
  const api = new JoplinServerApi(() => ({
    baseUrl: creds.serverUrl,
    email: creds.email,
    password: creds.password
  }));
  const plugin = {
    app: { vault, fileManager: new MockFileManager(vault) },
    api,
    settings: { ...DEFAULT_SETTINGS, attachmentFolder: creds.attachmentFolder, excludePatterns: creds.excludePatterns, e2eeEnabled: creds.e2eeEnabled === true, e2eePassword: creds.e2eePassword || "" },
    manifest: { dir: ".obsidian/plugins/joplin-server-sync" },
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
    registerEvent(_ref) {
      return _ref;
    },
    e2ee: new EncryptionService()
  };
  plugin.mapping = new MappingStore(plugin);
  plugin.changeLog = new ChangeLogStore(plugin);
  plugin.identity = new FileIdentity(plugin);
  return plugin;
}
async function main() {
  const [mode, vaultPath] = process.argv.slice(2);
  const noVaultModes = ["e2eetest", "deltaprobe", "lsroot", "rt", "probe2", "diag"];
  if (!mode || !vaultPath && !noVaultModes.includes(mode)) {
    console.log("Usage: node cli/sync-cli.cjs <push|pull|sync|e2eetest|e2eeserver|e2eesync|verifyenc|verifycount|diag|deltaprobe|lsroot|rt|probe2> [vaultPath]");
    process.exit(1);
  }
  let creds = { serverUrl: "", email: "", password: "", attachmentFolder: "attachments", excludePatterns: [] };
  if (vaultPath)
    creds = loadCreds(vaultPath);
  setVaultRoot(vaultPath || "");
  const plugin = makePlugin(vaultPath || process.cwd(), creds);
  if (vaultPath) {
    await plugin.mapping.load();
    await plugin.changeLog.load();
  }
  const engine = new SyncEngine(plugin);
  plugin.engine = engine;
  console.log(`== ${mode} ==`);
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
  } else if (mode === "e2eetest") {
    const { EncryptionService: EncryptionService2, EncryptionMethod: EncryptionMethod2 } = (init_EncryptionService(), __toCommonJS(EncryptionService_exports));
    const enc = new EncryptionService2();
    const password = "test-password-123";
    const mkId = (init_IdGenerator(), __toCommonJS(IdGenerator_exports)).createJoplinId();
    let failures = 0;
    const assert = (cond, msg) => {
      if (cond)
        console.log("  PASS:", msg);
      else {
        failures++;
        console.log("  FAIL:", msg);
      }
    };
    console.log("== E2EE protocol self-test ==");
    const mk = await enc.generateMasterKey(password, mkId);
    enc.feedMasterKey({ id: mk.id, type_: 9, encryption_cipher_text: mk.encryptedContent });
    await enc.loadMasterKey(mkId, password);
    assert(enc.hasLoadedKeys, "master key loaded from password");
    const note = "# Secret\n\nThis is end-to-end encrypted content. \u4E2D\u6587\u6D4B\u8BD5 \u{1F512}\n";
    const cipher = await enc.encryptItem(note, mkId);
    let noteOk = false;
    try {
      const plain = await enc.decryptItem({ encryption_applied: 1, encryption_cipher_text: cipher });
      noteOk = plain === note;
    } catch {
    }
    assert(noteOk, "note encrypt\u2192decrypt round-trip is lossless");
    const blob = new Uint8Array([0, 1, 2, 3, 255, 254, 128, 7, 42, 9, 11, 200, 0, 0, 1]);
    const blobCipher = await enc.encryptBlob(blob.buffer, mkId);
    let blobOk = false;
    try {
      const blobPlain = new Uint8Array(await enc.decryptBlob(blobCipher, mkId));
      blobOk = blobPlain.length === blob.length && blobPlain.every((b, i) => b === blob[i]);
    } catch {
    }
    assert(blobOk, "blob encrypt\u2192decrypt round-trip is lossless");
    let wrongFailed = false;
    try {
      const enc2 = new EncryptionService2();
      enc2.feedMasterKey({ id: mk.id, type_: 9, encryption_cipher_text: mk.encryptedContent });
      await enc2.loadMasterKey(mkId, "wrong-password");
    } catch {
      wrongFailed = true;
    }
    assert(wrongFailed, "wrong password is rejected (GCM auth fails)");
    const headerLen = parseInt(cipher.slice(0, 6), 16);
    const headerBytes = enc["hexToBytes"](cipher.slice(6, 6 + headerLen * 2));
    assert(headerBytes[0] === 1, "header version = 1");
    assert((headerBytes[1] << 8 | headerBytes[2]) === EncryptionMethod2.StringV1, "header method = StringV1(9)");
    const hdrMkId = enc["bytesToHex"](headerBytes.slice(3, 19));
    assert(hdrMkId === mkId, "header carries correct masterKeyId");
    const firstChunkOff = 6 + headerLen * 2;
    const chunkLen = parseInt(cipher.slice(firstChunkOff, firstChunkOff + 6), 16);
    const chunkBytes = enc["hexToBytes"](cipher.slice(firstChunkOff + 6, firstChunkOff + 6 + chunkLen * 2));
    assert(chunkBytes.length > 12 && chunkBytes.length % 2 === 0, "chunk has IV(12) + GCM ciphertext+tag");
    assert(chunkBytes.slice(0, 12).length === 12, "chunk IV is 12 bytes (AES-GCM nonce)");
    const big = "x".repeat(2e4);
    const bigCipher = await enc.encryptItem(big, mkId);
    const bigPlain = await enc.decryptItem({ encryption_applied: 1, encryption_cipher_text: bigCipher });
    assert(bigPlain === big, "large (multi-chunk) note round-trip is lossless");
    console.log(failures === 0 ? "\n=== E2EE SELF-TEST PASSED \u2705 ===" : `
=== E2EE SELF-TEST FAILED \u274C (${failures}) ===`);
    process.exit(failures === 0 ? 0 : 1);
  } else if (mode === "e2eeserver") {
    const { EncryptionService: EncryptionService2, EncryptionMethod: EncryptionMethod2 } = (init_EncryptionService(), __toCommonJS(EncryptionService_exports));
    const { JoplinSerializer: JoplinSerializer2 } = (init_JoplinSerializer(), __toCommonJS(JoplinSerializer_exports));
    const { ModelType: ModelType2 } = (init_models(), __toCommonJS(models_exports));
    const { createJoplinId: createJoplinId2 } = (init_IdGenerator(), __toCommonJS(IdGenerator_exports));
    await plugin.api.login();
    const enc = new EncryptionService2();
    const ser = new JoplinSerializer2();
    const password = "e2ee-server-test-\u{1F512}";
    let failures = 0;
    const assert = (c, m) => {
      console.log((c ? "  PASS: " : "  FAIL: ") + m);
      if (!c)
        failures++;
    };
    const ids = [];
    console.log("== E2EE end-to-end through REAL Joplin Server ==");
    const mkId = createJoplinId2();
    const mk = await enc.generateMasterKey(password, mkId);
    await plugin.api.putItem(mkId + ".md", ser.serialize({
      id: mkId,
      type_: ModelType2.MasterKey,
      body: mk.encryptedContent,
      content: mk.encryptedContent,
      encryption_cipher_text: "",
      encryption_applied: 0
    }), true);
    ids.push(mkId);
    enc.feedMasterKey({ id: mkId, type_: 9, body: mk.encryptedContent });
    await enc.loadMasterKey(mkId, password);
    assert(enc.hasLoadedKeys, "master key uploaded + loaded from server");
    const rawMk = await plugin.api.getItem(mkId + ".md");
    const srvMk = ser.unserialize(rawMk);
    const enc2 = new EncryptionService2();
    enc2.feedMasterKey(srvMk);
    let mkRoundTrip = false;
    try {
      await enc2.loadMasterKey(mkId, password);
      mkRoundTrip = true;
    } catch (e) {
    }
    assert(mkRoundTrip, "master key reloads from server (round-trip) and decrypts with password");
    const noteId = createJoplinId2();
    const originalBody = "# E2EE Note\n\nsecret body \u4E2D\u6587\u{1F512} end-to-end\n";
    const serialized = ser.serialize({ id: noteId, parent_id: "", title: "E2EE Note", body: originalBody, type_: ModelType2.Note, created_time: Date.now(), updated_time: Date.now(), user_created_time: Date.now(), user_updated_time: Date.now(), markup_language: 1, encryption_applied: 0, encryption_cipher_text: "" });
    const cipherText = await enc.encryptItem(serialized, mkId);
    await plugin.api.putItem(noteId + ".md", ser.serialize({ id: noteId, type_: ModelType2.Note, encryption_applied: 1, encryption_cipher_text: cipherText, title: "", body: "" }), true);
    ids.push(noteId);
    const pulledRaw = await plugin.api.getItem(noteId + ".md");
    const pulledItem = ser.unserialize(pulledRaw);
    assert(pulledItem.encryption_applied === 1, "server stored encryption_applied=1");
    enc.feedMasterKey({ id: mkId, type_: 9, encryption_cipher_text: mk.encryptedContent });
    const decryptedSerialized = await enc.decryptItem(pulledItem);
    const decryptedNote = ser.unserialize(decryptedSerialized);
    assert(decryptedNote.body === originalBody, "pulled note decrypts to original body (server round-trip)");
    const resId = createJoplinId2();
    const blob = new Uint8Array([1, 2, 3, 255, 0, 128, 200, 9, 42, 7, 11, 3, 200, 1]);
    const blobCipherText = await enc.encryptBlob(blob.buffer, mkId);
    const blobCipherBytes = new TextEncoder().encode(blobCipherText);
    await plugin.api.putItem(".resource/" + resId, blobCipherBytes.buffer);
    await plugin.api.putItem(resId + ".md", ser.serialize({ id: resId, type_: ModelType2.Resource, title: "secret.png", mime: "image/png", size: blob.length, filename: "secret.png", encryption_applied: 1, encryption_cipher_text: await enc.encryptItem(ser.serialize({ id: resId, title: "secret.png", mime: "image/png", size: blob.length, filename: "secret.png" }), mkId) }), true);
    ids.push(resId);
    const pulledBlob = await plugin.api.getItemBinary(".resource/" + resId);
    const pulledBlobText = new TextDecoder().decode(pulledBlob);
    const decryptedBlob = new Uint8Array(await enc.decryptBlob(pulledBlobText, mkId));
    assert(decryptedBlob.length === blob.length && decryptedBlob.every((b, i) => b === blob[i]), "pulled resource blob decrypts to original bytes (server round-trip)");
    const encBad = new EncryptionService2();
    encBad.feedMasterKey({ id: mkId, type_: 9, encryption_cipher_text: mk.encryptedContent });
    let badFailed = false;
    try {
      await encBad.loadMasterKey(mkId, "totally-wrong");
      await encBad.decryptItem(pulledItem);
    } catch {
      badFailed = true;
    }
    assert(badFailed, "wrong password cannot decrypt server-stored note");
    for (const id of ids) {
      try {
        await plugin.api.deleteItem(id + ".md");
      } catch {
      }
      try {
        await plugin.api.deleteItem(".resource/" + id);
      } catch {
      }
    }
    console.log("cleaned up", ids.length, "test items");
    console.log(failures === 0 ? "\n=== E2EE SERVER ROUND-TRIP PASSED \u2705 ===" : `
=== E2EE SERVER ROUND-TRIP FAILED \u274C (${failures}) ===`);
    process.exit(failures === 0 ? 0 : 1);
  } else if (mode === "mkprobe") {
    await plugin.api.login();
    const ser = new (init_JoplinSerializer(), __toCommonJS(JoplinSerializer_exports)).JoplinSerializer();
    let cursor;
    let total = 0, mkCount = 0;
    while (true) {
      const page = await plugin.api.listChildrenOf("", cursor);
      for (const stat of page.items) {
        total++;
        if (!/^[0-9a-f]{32}\.md$/.test(stat.name) || stat.name.startsWith(".resource/"))
          continue;
        const raw = await plugin.api.getItem(stat.name);
        if (!raw)
          continue;
        const item = ser.unserialize(raw);
        if (item.type_ === 9 || item.encryption_cipher_text && item.encryption_cipher_text.length > 0) {
          mkCount++;
          console.log("--- MK/ENC", stat.name, "---");
          console.log("type_:", item.type_, "| encryption_applied:", item.encryption_applied);
          console.log("encryption_cipher_text:", JSON.stringify(item.encryption_cipher_text));
        }
      }
      cursor = page.cursor;
      if (!page.has_more || !cursor)
        break;
    }
    console.log("total items scanned:", total, "| master/encrypted items:", mkCount);
    console.log("== mkprobe done ==");
  } else if (mode === "mkclean") {
    await plugin.api.login();
    const ser = new (init_JoplinSerializer(), __toCommonJS(JoplinSerializer_exports)).JoplinSerializer();
    let cursor;
    let scanned = 0, removed = 0;
    while (true) {
      const page = await plugin.api.listChildrenOf("", cursor);
      for (const stat of page.items) {
        if (!/^[0-9a-f]{32}\.md$/.test(stat.name) || stat.name.startsWith(".resource/"))
          continue;
        scanned++;
        const raw = await plugin.api.getItem(stat.name);
        if (!raw)
          continue;
        const item = ser.unserialize(raw);
        if (item.type_ === 9) {
          try {
            await plugin.api.deleteItem(stat.name);
            removed++;
            console.log("removed MK", stat.name);
          } catch {
          }
        }
      }
      cursor = page.cursor;
      if (!page.has_more || !cursor)
        break;
    }
    console.log("mkclean scanned=" + scanned + " removed master keys=" + removed);
  } else if (mode === "e2eesync") {
    const { EncryptionService: EncryptionService2 } = (init_EncryptionService(), __toCommonJS(EncryptionService_exports));
    const { SyncEngine: SyncEngine2 } = (init_SyncEngine(), __toCommonJS(SyncEngine_exports));
    const os = require("os");
    const pw = "E2EE-live-path-\u{1F512}-2026";
    const tmpBase = fs3.mkdtempSync(path3.join(os.tmpdir(), "joplin-e2ee-"));
    const pushVault = path3.join(tmpBase, "push");
    const pullVault = path3.join(tmpBase, "pull");
    fs3.mkdirSync(pushVault, { recursive: true });
    fs3.mkdirSync(pullVault, { recursive: true });
    const secret = "# Live E2EE Note\n\nsecret \u4E2D\u6587\u{1F512} end-to-end through forcePush+forcePull\n";
    fs3.writeFileSync(path3.join(pushVault, "live-e2ee-note.md"), secret);
    const bin = Buffer.from([1, 2, 3, 255, 0, 128, 200, 9, 42, 7, 11, 3, 200, 1]);
    fs3.mkdirSync(path3.join(pushVault, "assets"), { recursive: true });
    fs3.writeFileSync(path3.join(pushVault, "assets", "secret.bin"), bin);
    let failures = 0;
    const assert = (c, m) => {
      console.log((c ? "  PASS: " : "  FAIL: ") + m);
      if (!c)
        failures++;
    };
    let noteId, resId, mkId;
    try {
      console.log("== E2EE live sync-path test ==");
      const pluginP = makePlugin(pushVault, creds);
      pluginP.e2ee = new EncryptionService2();
      pluginP.settings.e2eePassword = pw;
      pluginP.settings.e2eeEnabled = true;
      pluginP.settings.excludePatterns = [];
      const engP = new SyncEngine2(pluginP);
      pluginP.engine = engP;
      await pluginP.mapping.load();
      await engP.enableE2EE();
      assert(engP.e2eeActive, "enableE2EE provisioned + loaded a master key (live)");
      const vaultP = pluginP.app.vault;
      const noteFile = vaultP.getMarkdownFiles().find((f) => f.path.endsWith("live-e2ee-note.md"));
      const resFile = vaultP.getFiles().find((f) => f.path.endsWith("secret.bin"));
      await engP.uploadNote(noteFile, "", true);
      await engP.resources.uploadResource(resFile, true);
      await pluginP.mapping.flush();
      await pluginP.api.login();
      const noteEntry = pluginP.mapping.getByPath(noteFile.path);
      const resEntry = pluginP.mapping.getByPath(resFile.path);
      noteId = noteEntry?.joplinId;
      resId = resEntry?.joplinId;
      mkId = pluginP.e2ee.activeKeyId ?? void 0;
      const ser = new JoplinSerializer();
      const rawNote = await pluginP.api.getItem(noteId + ".md");
      const noteItem = ser.unserialize(rawNote);
      assert(noteItem.encryption_applied === 1, "server stored note with encryption_applied=1 (live)");
      assert(!rawNote.includes("Live E2EE Note"), "server stored CIPHERTEXT \u2014 plaintext secret absent (live)");
      const rawRes = await pluginP.api.getItem(resId + ".md");
      const resItem = ser.unserialize(rawRes);
      assert(resItem.encryption_applied === 1, "server stored resource with encryption_applied=1 (live)");
      assert(!rawRes.includes("secret.bin"), "server stored resource CIPHERTEXT \u2014 plaintext metadata absent (live)");
      const pluginQ = makePlugin(pullVault, creds);
      pluginQ.e2ee = new EncryptionService2();
      pluginQ.settings.e2eePassword = pw;
      pluginQ.settings.e2eeEnabled = true;
      pluginQ.settings.excludePatterns = [];
      const engQ = new SyncEngine2(pluginQ);
      pluginQ.engine = engQ;
      await pluginQ.mapping.load();
      if (mkId)
        pluginQ.mapping.setE2eeMasterKeyId(mkId);
      await engQ.enableE2EE();
      assert(engQ.e2eeActive, "pull engine loaded master key via cached id (fast path)");
      const rawNotePull = await pluginQ.api.getItem(noteId + ".md");
      const srvNote = ser.unserialize(rawNotePull);
      const decSerialized = await pluginQ.e2ee.decryptItem(srvNote);
      const decNote = ser.unserialize(decSerialized);
      assert(decNote.body === secret, "pulled note decrypts to original plaintext (engine decryptItem)");
      const rawResPull = await pluginQ.api.getItem(resId + ".md");
      const srvRes = ser.unserialize(rawResPull);
      const outPath = await engQ.resources.downloadResource(srvRes);
      const pulledBin = fs3.readFileSync(path3.join(pullVault, outPath));
      assert(Buffer.compare(pulledBin, bin) === 0, "pulled resource decrypts to original bytes (ResourceManager.downloadResource)");
    } catch (e) {
      failures++;
      console.error("  [ERROR]", e instanceof Error ? e.message : String(e));
    } finally {
      try {
        const pluginC = makePlugin(pushVault, creds);
        pluginC.e2ee = new EncryptionService2();
        await pluginC.api.login();
        for (const id of [noteId, resId, mkId]) {
          if (!id)
            continue;
          try {
            await pluginC.api.deleteItem(id + ".md");
          } catch {
          }
          try {
            await pluginC.api.deleteItem(".resource/" + id);
          } catch {
          }
        }
      } catch {
      }
      fs3.rmSync(tmpBase, { recursive: true, force: true });
    }
    console.log(failures === 0 ? "\n=== E2EE LIVE SYNC-PATH PASSED \u2705 ===" : `
=== E2EE LIVE SYNC-PATH FAILED \u274C (${failures}) ===`);
    process.exit(failures === 0 ? 0 : 1);
  } else if (mode === "verifyenc") {
    console.log("== verifyenc ==");
    const plugin2 = makePlugin(vaultPath, creds);
    plugin2.e2ee = new EncryptionService();
    const eng = new SyncEngine(plugin2);
    plugin2.engine = eng;
    await plugin2.mapping.load();
    await eng.enableE2EE();
    let failures = 0;
    const assert = (c, m) => {
      console.log((c ? "  PASS: " : "  FAIL: ") + m);
      if (!c)
        failures++;
    };
    let noteId;
    try {
      assert(eng.e2eeActive, "deployed engine enabled E2EE from vault config (e2eePassword set)");
      const vault = plugin2.app.vault;
      const file = vault.getMarkdownFiles().find((f) => f.path.endsWith("e2ee-verify-tmp.md"));
      if (!file)
        throw new Error("sentinel note e2ee-verify-tmp.md not found in vault");
      await eng.uploadNote(file, "", true);
      await plugin2.mapping.flush();
      const entry = plugin2.mapping.getByPath(file.path);
      noteId = entry?.joplinId;
      if (!noteId)
        throw new Error("sentinel note was not assigned a joplin id");
      await plugin2.api.login();
      const ser2 = new JoplinSerializer();
      const raw = await plugin2.api.getItem(noteId + ".md");
      const item = ser2.unserialize(raw);
      assert(item.encryption_applied === 1, "server stored sentinel note with encryption_applied=1 (deployed engine)");
      assert(!raw.includes("This note proves the deployed plugin encrypts"), "server stored CIPHERTEXT \u2014 plaintext sentinel absent (deployed engine)");
    } catch (e) {
      failures++;
      console.error("  [ERROR]", e instanceof Error ? e.message : String(e));
    } finally {
      try {
        const pluginC = makePlugin(vaultPath, creds);
        pluginC.e2ee = new EncryptionService();
        await pluginC.api.login();
        if (noteId)
          await pluginC.api.deleteItem(noteId + ".md");
        const m2 = pluginC.mapping.getByPath("e2ee-verify-tmp.md");
        if (m2)
          pluginC.mapping.remove(m2.joplinId);
        await pluginC.mapping.flush();
      } catch {
      }
      try {
        fs3.unlinkSync(path3.join(vaultPath, "e2ee-verify-tmp.md"));
      } catch {
      }
    }
    console.log(failures === 0 ? "\n=== DEPLOYED E2EE ENCRYPTION VERIFIED \u2705 ===" : `
=== DEPLOYED E2EE ENCRYPTION FAILED \u274C (${failures}) ===`);
    process.exit(failures === 0 ? 0 : 1);
  } else if (mode === "verifycount") {
    console.log("== verifycount ==");
    const plugin2 = makePlugin(vaultPath, creds);
    plugin2.e2ee = new EncryptionService();
    const eng = new SyncEngine(plugin2);
    plugin2.engine = eng;
    await plugin2.mapping.load();
    await plugin2.api.login();
    let failures = 0;
    const assert = (c, m) => {
      console.log((c ? "  PASS: " : "  FAIL: ") + m);
      if (!c)
        failures++;
    };
    const excludes = creds.excludePatterns || [];
    const isExcluded = (p) => excludes.some((e) => p.startsWith(e)) || p.startsWith(".obsidian/");
    const localMd = [];
    const localNonMd = [];
    const fs4 = require("fs");
    const pathMod = require("path");
    const walkFs = (dir) => {
      let ents;
      try {
        ents = fs4.readdirSync(pathMod.join(vaultPath, dir), { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of ents) {
        const rel = dir ? dir + "/" + e.name : e.name;
        if (e.isDirectory()) {
          if (e.name.startsWith(".") || excludes.some((x) => (rel + "/").startsWith(x)))
            continue;
          walkFs(rel);
        } else if (e.isFile()) {
          if (isExcluded(rel))
            continue;
          if (rel.endsWith(".md"))
            localMd.push(rel);
          else
            localNonMd.push(rel);
        }
      }
    };
    walkFs("");
    const localTotal = localMd.length + localNonMd.length;
    const localDirs = /* @__PURE__ */ new Set();
    for (const f of [...localMd, ...localNonMd]) {
      if (!f.includes("/"))
        continue;
      const parts = f.split("/").slice(0, -1);
      for (let i = 1; i <= parts.length; i++)
        localDirs.add(parts.slice(0, i).join("/"));
    }
    let remoteNotes = 0, remoteFolders = 0, remoteResources = 0, remoteBlobs = 0, remoteMk = 0, remoteInfo = 0;
    let cursor;
    while (true) {
      const page = await plugin2.api.listChildrenOf("", cursor);
      for (const it of page.items) {
        if (it.name === "info.json") {
          remoteInfo++;
          continue;
        }
        if (it.name.startsWith(".resource/")) {
          remoteBlobs++;
          continue;
        }
        const m = it.name.match(/^([0-9a-f]{32})\.md$/);
        if (!m)
          continue;
        try {
          const raw = await plugin2.api.getItem(it.name);
          if (!raw)
            continue;
          const item = new JoplinSerializer().unserialize(raw);
          if (item.type_ === 1)
            remoteNotes++;
          else if (item.type_ === 2)
            remoteFolders++;
          else if (item.type_ === 4)
            remoteResources++;
          else if (item.type_ === 9)
            remoteMk++;
        } catch {
        }
      }
      cursor = page.cursor;
      if (!page.has_more || !cursor)
        break;
    }
    console.log("  local:  " + localTotal + " files (" + localMd.length + " md, " + localNonMd.length + " non-md) in " + localDirs.size + " dirs");
    console.log("  remote: " + (remoteNotes + remoteFolders + remoteResources + remoteBlobs) + " content items");
    console.log("         " + remoteNotes + " notes, " + remoteFolders + " folders, " + remoteResources + " resource-metas, " + remoteBlobs + " blobs");
    console.log("  infra:  " + remoteMk + " master key(s), " + remoteInfo + " info.json");
    const remoteContent = remoteNotes + remoteFolders + remoteResources + remoteBlobs;
    assert(remoteNotes === localMd.length, "note count matches (" + localMd.length + " local vs " + remoteNotes + " remote)");
    assert(remoteFolders === localDirs.size, "folder count matches (" + localDirs.size + " local dirs vs " + remoteFolders + " remote folders)");
    assert(localNonMd.length === 0 ? true : remoteBlobs >= localNonMd.length, "resource blobs cover non-md files (" + localNonMd.length + " local vs " + remoteBlobs + " remote)");
    assert(remoteContent <= localTotal + remoteMk + remoteFolders + 2, "no runaway duplicates on server (remote " + remoteContent + " \u2264 local " + localTotal + " + infra)");
    if (creds.e2eeEnabled && creds.e2eePassword) {
      console.log("  E2EE: enabled + password set \u2014 checking ciphertext...");
      let sampleChecked = 0, sampleEncrypted = 0, plaintextLeak = 0;
      cursor = void 0;
      while (true) {
        const page = await plugin2.api.listChildrenOf("", cursor);
        for (const it of page.items) {
          if (!/^[0-9a-f]{32}\.md$/.test(it.name) || sampleChecked >= 10)
            continue;
          try {
            const raw = await plugin2.api.getItem(it.name);
            if (!raw)
              continue;
            const item = new JoplinSerializer().unserialize(raw);
            if (item.type_ !== 1 || item.encryption_applied === 0)
              continue;
            sampleChecked++;
            if (item.encryption_applied === 1 && (item.encryption_cipher_text || "").startsWith("JED01"))
              sampleEncrypted++;
            if ((item.body || "") !== "")
              plaintextLeak++;
          } catch {
          }
        }
        cursor = page.cursor;
        if (!page.has_more || !cursor || sampleChecked >= 10)
          break;
      }
      if (sampleChecked > 0) {
        assert(sampleEncrypted === sampleChecked, "sampled notes are JED01-encrypted (" + sampleEncrypted + "/" + sampleChecked + ")");
        assert(plaintextLeak === 0, "no plaintext body leaked on server");
      } else {
        console.log("  (no encrypted notes found on server to sample)");
      }
    } else {
      console.log("  E2EE: disabled or no password \u2014 skipping ciphertext check");
    }
    console.log(failures === 0 ? "\n=== VERIFYCOUNT PASSED \u2705 ===" : `
=== VERIFYCOUNT FAILED \u274C (${failures}) ===`);
    process.exit(failures === 0 ? 0 : 1);
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
