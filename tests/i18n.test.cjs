"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { t, languageOf, ENGLISH } = require("../i18n");

test("语言偏好支持插件和视图，缺少设置时默认中文", () => {
  assert.equal(languageOf({ settings: { language: "en" } }), "en");
  assert.equal(languageOf({ plugin: { settings: { language: "en" } } }), "en");
  assert.equal(languageOf({}), "zh");
  assert.equal(t("en", "编辑节点"), "Edit node");
  assert.equal(t("zh", "Edit node"), "编辑节点");
  assert.equal(t("en", "用户自己的中文内容"), "用户自己的中文内容");
});

test("动态提示双向翻译，保持路径、计数和 HTTP 状态", () => {
  assert.equal(t("en", "本次读取 3/12 篇笔记，内容已截取。"), "Read 3/12 notes. Content truncated.");
  assert.equal(t("en", "正在回复 · 已读取 2/5 篇笔记 · 内容已截取"), "Responding · Read 2/5 notes · Content truncated");
  assert.equal(t("zh", "Responding · Read 2/5 notes · Content truncated"), "正在回复 · 已读取 2/5 篇笔记 · 内容已截取");
  assert.equal(t("en", "笔记伴侣：节点内容不能为空。"), "Note Journal Companion: Node content cannot be empty.");
  assert.equal(t("en", "图片已保存到 90-附件/图片/测试-01.png，笔记已切换，请手动插入。"),
    "Image saved to 90-附件/图片/测试-01.png. The note has changed. Insert the image manually.");
  assert.equal(t("en", "笔记伴侣：3 张已移除引用的图片已移入笔记库回收站。"),
    "Note Journal Companion: 3 unreferenced images moved to the vault trash.");
  assert.equal(t("en", "接口返回 HTTP 401，请检查配置、额度和模型名称。"),
    "The API returned HTTP 401. Check configuration, credit and model name.");
});

test("每条英文翻译都有内容，切换回中文时保留原绑定键", () => {
  for (const [key, value] of Object.entries(ENGLISH)) {
    assert.ok(value.trim(), key);
    assert.ok(!/[\u4e00-\u9fff]/.test(value.replaceAll("配置.md", "")), key);
  }
});

test("语言设置持久化并即时更新命令，不重新打开视图或清空草稿", async () => {
  const Module = require("node:module");
  const originalLoad = Module._load;
  Module._load = function (id, ...args) {
    return id === "obsidian" ? { Plugin: class {}, PluginSettingTab: class {}, ItemView: class {} }
      : originalLoad.call(this, id, ...args);
  };
  let Plugin;
  try { Plugin = require("../main"); } finally { Module._load = originalLoad; }
  const plugin = Object.create(Plugin.prototype);
  plugin.settings = { language: "zh", imageFolder: "90-附件/图片" };
  plugin.assistant = { busy: false };
  const command = { name: "中文" };
  plugin.localizedCommands = [{ command, name: "更新进展" }];
  let stored;
  plugin.saveSettings = async () => { stored = { ...plugin.settings }; };
  const view = {
    inputEl: { value: "尚未发送的消息" },
    leaf: { updateHeader() {} },
    getViewType: () => "note-companion-assistant",
    onOpen() { throw new Error("不应重建视图"); }
  };
  plugin.app = { workspace: { getLeavesOfType: type => type === "note-companion-assistant" ? [{ view }] : [] } };
  await plugin.setLanguage("en");
  assert.equal(stored.language, "en");
  assert.equal(stored.imageFolder, "90-附件/图片");
  assert.equal(command.name, "Note Journal Companion: Update progress");
  assert.equal(view.inputEl.value, "尚未发送的消息");
  await plugin.setLanguage("zh");
  assert.equal(command.name, "笔记伴侣: 更新进展");
  view.editorModal = {};
  await assert.rejects(plugin.setLanguage("en"), /节点编辑/);
  assert.equal(plugin.settings.language, "zh");
});
