"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core");

test("按粘贴目标文件名命名，跨后缀递增并支持三位序号", () => {
  assert.equal(core.nextImagePath("90-附件/图片", "PNG", [], "YX-01无线充电/测试.canvas"), "90-附件/图片/测试-01.png");
  assert.equal(core.nextImagePath("附件/图片", "jpg", [
    "附件/图片/测试-01.png", "附件/图片/测试-09.webp", "附件/图片/子目录/测试-99.png",
    "附件/图片/其他笔记-99.png", "附件/图片/图片-99.png"
  ], "项目/测试.md"), "附件/图片/测试-10.jpg");
  assert.equal(core.nextImagePath("附件/图片", "png", ["附件/图片/测试-99.png"], "测试.canvas"), "附件/图片/测试-100.png");
  assert.equal(core.nextImagePath("附件/图片", "png", [], "项目/计划.v2.md"), "附件/图片/计划.v2-01.png");
});

test("目录校验拒绝越界和配置目录与图片目录重叠", () => {
  for (const path of ["", "../notes", "AI/../笔记", "C:/notes", "/notes", ".obsidian", "AI/.hidden", "AI//日志"]) {
    assert.throws(() => core.vaultFolder(path));
  }
  assert.equal(core.vaultFolder("AI助手\\日志/"), "AI助手/日志");
  assert.throws(() => core.validateFolders("附件", "附件/AI助手"));
  assert.throws(() => core.validateFolders("AI助手/图片", "AI助手"));
  assert.deepEqual(core.validateFolders("附件/图片", "AI助手"), { imageFolder: "附件/图片", assistantFolder: "AI助手" });
});

test("引用检测覆盖 Wiki、Markdown、编码路径、参考链接和 HTML", () => {
  const links = core.extractLinks([
    "![[附件/a.png|200]]", "[文件](附件/b.png)", "![图](<附件/c d.png>)",
    '![图](附件/e%20f.png "标题")', "![图](附件/g(1).png)",
    '[ref]: 附件/h.png', '<img src="附件/i.png">',
    "![网络](https://example.com/a.png)", "[[笔记#标题]]"
  ].join("\n"));
  for (const link of ["附件/a.png", "附件/b.png", "附件/c d.png", "附件/e f.png", "附件/g(1).png", "附件/h.png", "附件/i.png", "笔记"]) {
    assert.ok(links.has(link), link);
  }
  assert.ok(!links.has("https://example.com/a.png"));
});

test("Canvas 文件节点和文本卡片均参与图片引用保护", () => {
  const links = core.sourceLinks("画布.canvas", JSON.stringify({ nodes: [
    { type: "file", file: "附件/a.png" }, { type: "text", text: "![[附件/b.png]]" },
    { type: "group", background: "附件/背景.png" }
  ] }));
  assert.ok(links.has("附件/a.png"));
  assert.ok(links.has("附件/b.png"));
  assert.ok(links.has("附件/背景.png"));
  assert.throws(() => core.sourceLinks("画布.canvas", "{malformed"));
});

test("颜色规则阻止 CSS 注入并允许清空", () => {
  assert.deepEqual(core.colorRules(".pdf=#e06c75\nmd=#abc"), [
    { extension: "pdf", color: "#e06c75" }, { extension: "md", color: "#abc" }
  ]);
  assert.deepEqual(core.colorRules(""), []);
  assert.throws(() => core.colorRules("pdf=red;display:none"));
});

test("接口地址兼容基础路径和完整路径", () => {
  assert.equal(core.completionUrl("https://api.example.com/v1/"), "https://api.example.com/v1/chat/completions");
  assert.equal(core.completionUrl("http://localhost:1234/v1/chat/completions"), "http://localhost:1234/v1/chat/completions");
  assert.throws(() => core.completionUrl("file:///keys"));
  assert.throws(() => core.completionUrl("https://user:secret@example.com"));
});

test("结构化回答校验以及非 JSON 回退", () => {
  const answer = core.parseAnswer('```json\n{"reply":"你好","progress":{"next":["下一步",1]},"memories":["偏好",null]}\n```');
  assert.deepEqual(answer.progress.next, ["下一步"]);
  assert.deepEqual(answer.memories, ["偏好"]);
  assert.equal(core.parseAnswer("普通回复").reply, "普通回复");
  assert.equal(core.parseAnswer("普通回复").progress, null);
  assert.equal(core.redact("test key-value test key-value", "key-value"), "test [已隐藏密钥] test [已隐藏密钥]");
});
