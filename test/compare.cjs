"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// test/compare.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
function walkMd(root) {
  const out = /* @__PURE__ */ new Map();
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
      if (e.isDirectory())
        rec(full);
      else if (e.name.endsWith(".md"))
        out.set(path.relative(root, full).split(path.sep).join("/"), fs.readFileSync(full, "utf8"));
    }
  };
  rec(root);
  return out;
}
var a = walkMd("/home/wang/\u6587\u6863/test");
var b = walkMd("/home/wang/\u6587\u6863/test1");
var ak = new Set(a.keys());
var bk = new Set(b.keys());
var missingInB = [];
for (const k of ak)
  if (!bk.has(k))
    missingInB.push(k);
var extraInB = [];
for (const k of bk)
  if (!ak.has(k))
    extraInB.push(k);
var contentDiff = [];
for (const k of ak)
  if (bk.has(k) && a.get(k) !== b.get(k))
    contentDiff.push(k);
var onlyTrailingNl = contentDiff.filter((k) => a.get(k).replace(/\n+$/, "") === b.get(k).replace(/\n+$/, ""));
console.log("test/  .md files:", a.size);
console.log("test1/ .md files:", b.size);
console.log("MISSING in test1 (in test, not test1):", missingInB.length);
console.log("EXTRA   in test1 (in test1, not test):", extraInB.length);
console.log("CONTENT DIFF (same path, different bytes):", contentDiff.length, "| of which only trailing-newline diffs:", onlyTrailingNl.length);
console.log("\n--- sample MISSING in test1 (first 30) ---");
console.log(missingInB.slice(0, 30).join("\n"));
console.log("\n--- sample EXTRA in test1 (first 30) ---");
console.log(extraInB.slice(0, 30).join("\n"));
console.log("\n--- sample CONTENT DIFF (first 20) ---");
console.log(contentDiff.slice(0, 20).join("\n"));
