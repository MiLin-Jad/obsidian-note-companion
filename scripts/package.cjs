"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const packageInfo = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const versions = JSON.parse(fs.readFileSync(path.join(root, "versions.json"), "utf8"));
assert.match(manifest.name, /^[A-Za-z0-9][A-Za-z0-9 ()+-]*$/, "社区插件名称需要使用 Basic Latin 字符");
assert.equal(manifest.name, manifest.name.trim(), "插件名称不能包含首尾空格");
assert.equal(manifest.version, packageInfo.version, "清单和工程版本必须一致");
assert.equal(versions[manifest.version], manifest.minAppVersion, "版本兼容表需要包含当前版本");
assert.ok(manifest.description.length <= 250 && manifest.description.endsWith("."), "社区描述应不超过 250 个字符，并以英文句号结尾");
const license = fs.readFileSync(path.join(root, "LICENSE"), "utf8");
const output = path.join(root, "dist", "note-companion");
fs.mkdirSync(output, { recursive: true });
// 生成单一 CommonJS 入口，适配桌面和移动端 Obsidian 的插件加载器。
const modules = ["i18n", "core", "images", "assistant", "mindmap-content", "mindmap", "main"].map(name => {
  const source = fs.readFileSync(path.join(root, name + ".js"), "utf8");
  return `${JSON.stringify("./" + name)}: function(module, exports, require) {\n${source}\n}`;
});
const bundle = `/*\n${license.replace(/\*\//g, "* /")}\n*/\n"use strict";
const noteCompanionModules = {\n${modules.join(",\n")}\n};
const noteCompanionCache = {};
function noteCompanionRequire(id) {
  if (!Object.prototype.hasOwnProperty.call(noteCompanionModules, id)) return require(id);
  if (!noteCompanionCache[id]) {
    const entry = { exports: {} };
    noteCompanionCache[id] = entry;
    noteCompanionModules[id](entry, entry.exports, noteCompanionRequire);
  }
  return noteCompanionCache[id].exports;
}
module.exports = noteCompanionRequire("./main");
`;
const entry = { exports: {} };
vm.runInNewContext(bundle, {
  module: entry,
  require(id) {
    assert.equal(id, "obsidian", "安装包只能依赖 Obsidian 提供的模块");
    return { Plugin: class {}, PluginSettingTab: class {}, ItemView: class {} };
  }
});
assert.equal(typeof entry.exports.prototype.onload, "function", "安装包需要导出 Obsidian 插件类");
fs.writeFileSync(path.join(output, "main.js"), bundle, "utf8");
for (const name of ["manifest.json", "styles.css"]) {
  fs.copyFileSync(path.join(root, name), path.join(output, name));
}
// 只清理此脚本前一版生成的已知模块文件。
for (const name of ["core.js", "images.js", "assistant.js"]) {
  const generatedPath = path.join(output, name);
  if (fs.existsSync(generatedPath)) fs.unlinkSync(generatedPath);
}
console.log("可安装插件目录：" + output);
