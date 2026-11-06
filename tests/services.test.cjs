"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

global.window = global;
global.document = {};

class TFile {
  constructor(path) {
    this.path = path;
    this.name = path.split("/").pop();
    this.extension = path.split(".").pop();
    this.stat = { mtime: Date.now() };
  }
}
class MarkdownView {}
const requests = [];
let response = { status: 200, json: { choices: [{ message: { content: JSON.stringify({
  reply: "可以推进 [[项目/计划.md]]。", progress: { next: ["继续完成 [[项目/计划.md]] 中的步骤。"] }, memories: ["用户希望简洁沟通。"]
}) } }] } };
const obsidian = {
  TFile, MarkdownView, Notice: class {},
  parseYaml(text) {
    return Object.fromEntries(text.trim().split("\n").map(line => {
      const index = line.indexOf(":");
      return [line.slice(0, index).trim(), JSON.parse(line.slice(index + 1).trim())];
    }));
  },
  async requestUrl(options) {
    requests.push(options);
    if (response instanceof Error) throw response;
    return response;
  }
};
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  return id === "obsidian" ? obsidian : originalLoad.call(this, id, ...args);
};
const { ImageManager } = require("../images");
const { AssistantService } = require("../assistant");
Module._load = originalLoad;

function fixture(initial = {}) {
  const content = new Map(Object.entries(initial));
  const files = new Map(Object.keys(initial).map(path => [path, new TFile(path)]));
  const writes = [];
  const trashed = [];
  const openViews = [];
  const domListeners = [];
  const vaultListeners = new Map();
  const vault = {
    on(event, handler) {
      if (!vaultListeners.has(event)) vaultListeners.set(event, []);
      vaultListeners.get(event).push(handler);
    },
    emit(event, ...args) {
      for (const handler of vaultListeners.get(event) || []) handler(...args);
    },
    getFiles: () => [...files.values()],
    getMarkdownFiles: () => [...files.values()].filter(file => file.extension === "md"),
    getAbstractFileByPath: path => files.get(path),
    async read(file) {
      if (!content.has(file.path)) throw new Error("missing");
      return content.get(file.path);
    },
    async create(path, text) {
      if (files.has(path)) throw new Error("exists");
      const file = new TFile(path);
      files.set(path, file);
      content.set(path, text);
      writes.push(path);
      this.emit("create", file);
      return file;
    },
    async createBinary(path, bytes) { return this.create(path, bytes); },
    async modify(file, text) {
      content.set(file.path, text);
      writes.push(file.path);
      this.emit("modify", file);
    },
    async process(file, callback) { return this.modify(file, callback(content.get(file.path))); },
    async trash(file, system) {
      assert.equal(system, false);
      trashed.push(file.path);
      content.delete(file.path);
      files.delete(file.path);
      this.emit("delete", file);
    }
  };
  const plugin = {
    settings: {
      assistantFolder: "AI助手", imageFolder: "附件/图片", renameImages: true,
      cleanupImages: true, aiScope: "all", aiFolders: "", contextLimit: 4000
    },
    stopped: false,
    queue: Promise.resolve(),
    enqueue(work) { this.queue = this.queue.then(work); return this.queue; },
    registerEvent() {},
    register() {},
    registerDomEvent(target, event, handler, capture) { domListeners.push({ target, event, handler, capture }); },
    async ensureFolder() {},
    app: {
      vault,
      workspace: {
        on() {},
        onLayoutReady() {},
        getLeavesOfType: type => openViews.filter(leaf =>
          type === "markdown" ? leaf.view instanceof MarkdownView : type === "canvas" && leaf.view.canvas
        )
      },
      metadataCache: {
        getFirstLinkpathDest: path => files.get(path) || [...files.values()].find(file => file.name === path)
      },
      fileManager: { generateMarkdownLink: file => `[[${file.path}]]` }
    }
  };
  return { plugin, content, files, writes, trashed, openViews, domListeners };
}

test("图片清理保留其他笔记和 Canvas 的共享引用，清理范围只限配置目录", async () => {
  const f = fixture({
    "笔记.md": "", "另一篇.md": "![[附件/图片/图片-01.png]]",
    "画布.canvas": JSON.stringify({ nodes: [{ file: "附件/图片/图片-02.png" }] }),
    "附件/图片/图片-01.png": "bytes", "附件/图片/图片-02.png": "bytes",
    "附件/图片/图片-03.png": "bytes", "其他/图片.png": "bytes"
  });
  const manager = new ImageManager(f.plugin);
  await manager.cleanup(new Set(["附件/图片/图片-01.png", "附件/图片/图片-02.png", "附件/图片/图片-03.png", "其他/图片.png"]));
  assert.deepEqual(f.trashed, ["附件/图片/图片-03.png"]);
});

test("尚未保存的打开笔记保护图片，Canvas 解析失败中止清理", async () => {
  const f = fixture({ "笔记.md": "", "附件/图片/图片-01.png": "bytes" });
  const view = new MarkdownView();
  view.file = f.files.get("笔记.md");
  view.editor = { getValue: () => "![[附件/图片/图片-01.png]]" };
  f.openViews.push({ view });
  const manager = new ImageManager(f.plugin);
  await manager.cleanup(new Set(["附件/图片/图片-01.png"]));
  assert.deepEqual(f.trashed, []);
  f.openViews.length = 0;
  await f.plugin.app.vault.create("损坏.canvas", "{broken");
  await assert.rejects(manager.cleanup(new Set(["附件/图片/图片-01.png"])));
  assert.deepEqual(f.trashed, []);
});

test("Canvas 尚未保存的图片卡片也能保护图片文件", async () => {
  const f = fixture({ "画布.canvas": '{"nodes":[],"edges":[]}', "附件/图片/图片-01.png": "bytes" });
  f.openViews.push({ view: {
    file: f.files.get("画布.canvas"),
    canvas: { getData: () => ({ nodes: [{ type: "file", file: "附件/图片/图片-01.png" }], edges: [] }) }
  } });
  const manager = new ImageManager(f.plugin);
  await manager.cleanup(new Set(["附件/图片/图片-01.png"]));
  assert.deepEqual(f.trashed, []);
});

test("正文移除图片和画布删除图片卡片，经保存事件触发附件清理", async () => {
  const fixtures = [];
  for (const extension of ["md", "canvas"]) {
    const imagePath = "附件/图片/测试-01.png";
    const path = `测试.${extension}`;
    let nodes = [{ type: "file", file: imagePath }];
    let text = `![[${imagePath}]]`;
    const f = fixture({ [path]: extension === "md" ? text : JSON.stringify({ nodes }), [imagePath]: "bytes" });
    const file = f.files.get(path);
    if (extension === "md") {
      const view = new MarkdownView();
      view.file = file;
      view.editor = { getValue: () => text };
      f.openViews.push({ view });
    } else {
      f.openViews.push({ view: { file, canvas: { getData: () => ({ nodes }) } } });
    }
    const manager = new ImageManager(f.plugin);
    manager.start();
    await manager.initialize();
    nodes = [];
    text = "";
    await f.plugin.app.vault.modify(file, extension === "md" ? text : JSON.stringify({ nodes }));
    fixtures.push(f);
  }
  await new Promise(resolve => setTimeout(resolve, 3100));
  for (const f of fixtures) {
    await f.plugin.queue;
    assert.deepEqual(f.trashed, ["附件/图片/测试-01.png"]);
  }
});

test("删除整篇笔记或画布会清理独占图片，并保留其他笔记引用的图片", async () => {
  for (const extension of ["md", "canvas"]) {
    const owned = "附件/图片/测试-01.png";
    const shared = "附件/图片/测试-02.png";
    const path = `测试.${extension}`;
    const nodes = [owned, shared].map(file => ({ type: "file", file }));
    const text = `![[${owned}]]\n![[${shared}]]`;
    const f = fixture({
      [path]: extension === "md" ? text : JSON.stringify({ nodes }),
      "其他笔记.md": `![[${shared}]]`, [owned]: "bytes", [shared]: "bytes"
    });
    const file = f.files.get(path);
    // 删除通知到达时，原文件的编辑器或画布可能尚未被 Obsidian 关闭。
    if (extension === "md") {
      const view = new MarkdownView();
      view.file = file;
      view.editor = { getValue: () => text };
      f.openViews.push({ view });
    } else {
      f.openViews.push({ view: { file, canvas: { getData: () => ({ nodes }) } } });
    }
    const manager = new ImageManager(f.plugin);
    manager.start();
    await manager.initialize();
    await f.plugin.app.vault.trash(file, false);
    await f.plugin.queue;
    assert.deepEqual(f.trashed, [path, owned]);
    assert.ok(f.files.has(shared));
  }
});

test("Canvas 原生粘贴入口保存命名图片，再以真实路径创建卡片", async () => {
  const f = fixture({ "画布.canvas": '{"nodes":[],"edges":[]}' });
  const wrapper = {};
  const nodes = [];
  let saves = 0;
  const canvas = {
    wrapperEl: wrapper,
    posCenter: () => ({ x: 100, y: 200 }),
    getData: () => ({ nodes, edges: [] }),
    createFileNodes(files, position) {
      assert.deepEqual(position, { x: 100, y: 200 });
      for (const file of files) {
        assert.ok(f.files.has(file.path), "创建卡片之前，图片文件必须已保存");
        nodes.push({ id: String(nodes.length), type: "file", file: file.path });
      }
    },
    requestSave() { saves++; }
  };
  f.openViews.push({ view: { file: f.files.get("画布.canvas"), canvas } });
  let prevented = false;
  let stopped = false;
  const image = { type: "image/png", arrayBuffer: async () => new ArrayBuffer(2) };
  const manager = new ImageManager(f.plugin);
  manager.start();
  const pasteListener = f.domListeners.find(listener => listener.event === "paste");
  assert.equal(pasteListener.target, document);
  assert.equal(pasteListener.capture, true);
  pasteListener.handler({
    target: wrapper,
    defaultPrevented: false,
    clipboardData: { items: [1, 2].map(() => ({ kind: "file", getAsFile: () => image })) },
    preventDefault() { prevented = true; },
    stopImmediatePropagation() { stopped = true; }
  });
  await f.plugin.queue;
  assert.equal(prevented, true);
  assert.equal(stopped, true, "阻止 Canvas 自己重复创建 Pasted image 卡片");
  assert.deepEqual(nodes.map(node => node.file), ["附件/图片/画布-01.png", "附件/图片/画布-02.png"]);
  assert.equal(saves, 1);
  assert.ok(manager.snapshots.get("画布.canvas").has("附件/图片/画布-01.png"));
});

test("打开的 Canvas 无法读取实时状态时，中止图片删除", async () => {
  const f = fixture({ "画布.canvas": '{"nodes":[]}', "附件/图片/图片-01.png": "bytes" });
  f.openViews.push({ view: { file: f.files.get("画布.canvas"), canvas: {} } });
  const manager = new ImageManager(f.plugin);
  await assert.rejects(manager.cleanup(new Set(["附件/图片/图片-01.png"])), /无法核对打开的画布/);
  assert.deepEqual(f.trashed, []);
});

test("Canvas 多图粘贴部分失败，保留并插入已经成功保存的图片", async () => {
  const f = fixture({ "画布.canvas": '{"nodes":[]}' });
  const wrapper = {};
  const nodes = [];
  const canvas = {
    wrapperEl: wrapper,
    posCenter: () => ({ x: 0, y: 0 }),
    getData: () => ({ nodes }),
    createFileNodes: files => { for (const file of files) nodes.push({ type: "file", file: file.path }); },
    requestSave() {}
  };
  f.openViews.push({ view: { file: f.files.get("画布.canvas"), canvas } });
  const images = [
    { type: "image/png", arrayBuffer: async () => new ArrayBuffer(2) },
    { type: "image/png", arrayBuffer: async () => { throw new Error("模拟读取失败"); } }
  ];
  const manager = new ImageManager(f.plugin);
  manager.onCanvasPaste({
    target: wrapper, defaultPrevented: false,
    clipboardData: { items: images.map(image => ({ kind: "file", getAsFile: () => image })) },
    preventDefault() {}, stopImmediatePropagation() {}
  });
  await assert.rejects(f.plugin.queue, /模拟读取失败/);
  assert.deepEqual(nodes, [{ type: "file", file: "附件/图片/画布-01.png" }]);
  assert.ok(f.files.has("附件/图片/画布-01.png"));
  assert.deepEqual(f.trashed, []);
});

test("实际粘贴入口顺序保存多张图片并插入嵌入链接", async () => {
  const f = fixture({ "计划.md": "原文\n" });
  const manager = new ImageManager(f.plugin);
  let text = "原文\n";
  const editor = { getValue: () => text, replaceSelection: value => { text += value; } };
  let prevented = false;
  const image = { type: "image/png", arrayBuffer: async () => new ArrayBuffer(2) };
  const event = {
    defaultPrevented: false,
    clipboardData: { items: [1, 2].map(() => ({ kind: "file", getAsFile: () => image })) },
    preventDefault() { prevented = true; }
  };
  manager.onPaste(event, editor, { file: f.files.get("计划.md") });
  await f.plugin.queue;
  assert.equal(prevented, true);
  assert.match(text, /!\[\[附件\/图片\/计划-01.png\]\]/);
  assert.match(text, /!\[\[附件\/图片\/计划-02.png\]\]/);
  assert.ok(manager.snapshots.get("计划.md").has("附件/图片/计划-02.png"));
  assert.equal(f.content.get("计划.md"), "原文\n");
});

test("助手笔记中手动粘贴图片仍保存到独立图片目录", async () => {
  const f = fixture({ "AI助手/记忆.md": "# 记忆\n" });
  const manager = new ImageManager(f.plugin);
  let text = "# 记忆\n";
  const editor = { getValue: () => text, replaceSelection: value => { text += value; } };
  const image = { type: "image/png", arrayBuffer: async () => new ArrayBuffer(1) };
  manager.onPaste({
    defaultPrevented: false,
    clipboardData: { items: [{ kind: "file", getAsFile: () => image }] },
    preventDefault() {}
  }, editor, { file: f.files.get("AI助手/记忆.md") });
  await f.plugin.queue;
  assert.deepEqual(f.writes, ["附件/图片/记忆-01.png"]);
});

test("扫描期间笔记变化会推迟清理，重扫后保留新增引用", async () => {
  const f = fixture({ "笔记.md": "", "附件/图片/图片-01.png": "bytes" });
  const manager = new ImageManager(f.plugin);
  const read = f.plugin.app.vault.read;
  f.plugin.app.vault.read = async file => {
    const text = await read(file);
    if (file.path === "笔记.md") {
      f.content.set("笔记.md", "![[附件/图片/图片-01.png]]");
      manager.revision++;
    }
    return text;
  };
  await manager.cleanup(new Set(["附件/图片/图片-01.png"]));
  assert.deepEqual(f.trashed, []);
  assert.ok(manager.pendingCleanup.has("附件/图片/图片-01.png"));
  for (const timer of manager.timers.values()) clearTimeout(timer);
  f.plugin.app.vault.read = read;
  await manager.cleanup(manager.pendingCleanup);
  assert.deepEqual(f.trashed, []);
});

test("AI 对话正常入口只写助手 Markdown，配置和密钥不进入模型上下文", async () => {
  requests.length = 0;
  const f = fixture({
    "项目/计划.md": "- [ ] 做一个小插件\n", "私人/其他.md": "私人内容",
    "项目/旧助手/配置.md": "旧密钥绝不能发送"
  });
  f.plugin.settings.aiScope = "folders";
  f.plugin.settings.aiFolders = "项目";
  const service = new AssistantService(f.plugin);
  await service.initialize();
  const secret = "test-secret-123";
  await f.plugin.app.vault.modify(f.files.get("AI助手/配置.md"),
    `---\nbaseUrl: "http://localhost:1234/v1"\napiKey: "${secret}"\nmodel: "local-model"\n---\n配置不应发送`);
  f.writes.length = 0;
  let coverage;
  const result = await service.talk("以后请简洁沟通", "项目/计划.md", context => { coverage = context; });
  assert.equal(result.reply, "可以推进 [[项目/计划.md]]。");
  assert.deepEqual(coverage.sources, ["项目/计划.md"]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "http://localhost:1234/v1/chat/completions");
  assert.equal(requests[0].headers.Authorization, `Bearer ${secret}`);
  assert.ok(!requests[0].body.includes(secret));
  assert.ok(!requests[0].body.includes("配置不应发送"));
  assert.ok(!requests[0].body.includes("私人内容"));
  assert.ok(!requests[0].body.includes("旧密钥绝不能发送"));
  assert.ok(f.writes.every(path => path.startsWith("AI助手/") && path.endsWith(".md")));
  assert.ok(!f.writes.includes("AI助手/配置.md"));
  assert.equal(f.content.get("项目/计划.md"), "- [ ] 做一个小插件\n");
  assert.match(f.content.get("AI助手/记忆.md"), /用户希望简洁沟通/);
  assert.match(f.content.get("AI助手/项目进展.md"), /可以推进/);
  assert.ok([...f.content.keys()].some(path => /^AI助手\/日志\/\d{4}-\d{2}-\d{2}\.md$/.test(path)));
  await assert.rejects(service.write("../业务笔记.md", "非法写入"));
  await assert.rejects(service.write("配置.md", "非法写入"));
  await assert.rejects(service.write("记忆.json", "非法写入"));
});

test("英语设置用于 AI 回复指令和新日志标题，笔记及配置路径保留", async () => {
  const previous = response;
  response = { status: 200, json: { choices: [{ message: { content: JSON.stringify({
    reply: "Here is your next step.", progress: { next: ["Continue the project."] }, memories: []
  }) } }] } };
  try {
    const f = fixture({ "项目/计划.md": "用户的原始中文笔记" });
    f.plugin.settings.language = "en";
    const service = new AssistantService(f.plugin);
    await service.initialize();
    await f.plugin.app.vault.modify(f.files.get("AI助手/配置.md"),
      '---\nbaseUrl: "https://api.example.com/v1"\napiKey: "secret-english"\nmodel: "model"\n---\n');
    await service.talk("What is next?", "项目/计划.md", () => {});
    const payload = JSON.parse(requests[requests.length - 1].body);
    assert.match(payload.messages[0].content, /Respond in concise, natural English/);
    assert.ok(payload.messages[1].content.includes("用户的原始中文笔记"));
    assert.equal(f.content.get("项目/计划.md"), "用户的原始中文笔记");
    assert.match(f.content.get("AI助手/项目进展.md"), /^# Project progress/);
    const journal = [...f.content.entries()].find(([path]) => path.startsWith("AI助手/日志/"))[1];
    assert.match(journal, / · Me/);
    assert.match(journal, / · Assistant/);
    assert.ok(!journal.includes("secret-english"));
  } finally { response = previous; }
});

test("API 错误不暴露第三方错误中的密钥，同时保留请求日志", async () => {
  const f = fixture({ "项目/计划.md": "待办" });
  const service = new AssistantService(f.plugin);
  await service.initialize();
  await f.plugin.app.vault.modify(f.files.get("AI助手/配置.md"),
    '---\nbaseUrl: "https://api.example.com/v1"\napiKey: "secret-abc"\nmodel: "model"\n---\n');
  response = new Error("secret-abc request failed");
  await assert.rejects(service.talk("今天做什么？", "项目/计划.md", () => {}), /接口连接失败/);
  assert.equal(service.busy, false);
  const journal = [...f.content.entries()].find(([path]) => path.startsWith("AI助手/日志/"))[1];
  assert.match(journal, /今天做什么/);
  assert.ok(!journal.includes("secret-abc"));
});
