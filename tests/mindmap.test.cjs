"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
class TFile {
  constructor(path) { this.path = path; this.extension = "md"; }
}
class MarkdownView {}
class ItemView {
  constructor(leaf) { this.app = leaf.app; this.leaf = leaf; }
}
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  return id === "obsidian" ? { ItemView, TFile, MarkdownView, Notice: class {} } : originalLoad.call(this, id, ...args);
};
const { markdownTree, editMarkdownNode, MindMapView, layoutTree, wrapLabel } = require("../mindmap");
Module._load = originalLoad;

test("标题、嵌套列表和任务按 Markdown 层级转换", () => {
  const { root } = markdownTree([
    "# 目标", "## 实施", "- [ ] **设计**", "  - 原理图", "  - PCB",
    "- [x] 验证", "## 记录", "第一行", "接着说明", "", "另一个段落"
  ].join("\n"), "项目计划");
  assert.equal(root.label, "项目计划");
  const target = root.children[0];
  assert.equal(target.label, "目标");
  const implementation = target.children[0];
  assert.equal(implementation.label, "实施");
  assert.equal(implementation.children[0].label, "☐ 设计");
  assert.deepEqual(implementation.children[0].children.map(node => node.label), ["原理图", "PCB"]);
  assert.equal(implementation.children[1].label, "☑ 验证");
  assert.deepEqual(target.children[1].children.map(node => node.label), ["第一行 接着说明", "另一个段落"]);
});

test("排除 YAML 和围栏代码内容，识别下划线标题和链接文字", () => {
  const { root } = markdownTree([
    "---", "secret: value", "---", "概览", "===", "~~~js", "# 假标题", "~~~",
    "- [[项目/笔记|说明]]", "- [文档](https://example.com)", "- my_file_name"
  ].join("\n"), "标题");
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].label, "概览");
  assert.deepEqual(root.children[0].children.map(node => node.label), ["说明", "文档", "my_file_name"]);
});

test("节点限制明确标记截取，空文档保留根节点", () => {
  const result = markdownTree("- A\n- B\n- C", "根", 3);
  assert.equal(result.count, 3);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.root.children.map(node => node.label), ["A", "B"]);
  assert.deepEqual(markdownTree("", "空笔记").root, { id: "0", label: "空笔记", children: [] });
});

test("导图布局的同层节点不重叠，折叠只影响对应分支", () => {
  const { root } = markdownTree("# A\n- A1\n- A2\n# B\n- B1\n- B2\n- B3", "根");
  const layout = layoutTree(root);
  assert.equal(layout.edges.length, layout.nodes.length - 1);
  for (const a of layout.nodes) {
    for (const b of layout.nodes) {
      if (a.x !== b.x || a.node.id >= b.node.id) continue;
      assert.ok(a.y + a.height <= b.y || b.y + b.height <= a.y);
    }
  }
  const collapsed = layoutTree(root, new Set([root.children[0].id]));
  const labels = collapsed.nodes.map(item => item.node.label);
  assert.ok(labels.includes("A"));
  assert.ok(!labels.includes("A1"));
  assert.ok(labels.includes("B3"));
  assert.equal(layoutTree(root, new Set([root.id])).nodes.length, 1);
});

test("长标签限制显示行数，完整内容仍保留在树中", () => {
  const label = "很长的中文节点".repeat(30);
  const lines = wrapLabel(label);
  assert.equal(lines.length, 4);
  assert.ok(lines[3].endsWith("…"));
  const { root } = markdownTree("- " + label, "根");
  assert.equal(root.children[0].label, label);
});

test("编辑节点只替换对应内容，保留标题、缩进编号、任务标记和换行", () => {
  const original = '\uFEFF---\r\ntags: [项目]\r\n---\r\n## 设计 ##\r\n  1. [ ] **原理图**\r\n  2. 验证\r\n';
  let tree = markdownTree(original, "文件");
  const heading = tree.root.children[0];
  const changed = editMarkdownNode(original, heading.source, "硬件方案").text;
  assert.equal(changed, original.replace("## 设计 ##", "## 硬件方案 ##"));
  tree = markdownTree(changed, "文件");
  const task = tree.root.children[0].children[0];
  const updated = editMarkdownNode(changed, task.source, "**完成原理图**", true);
  assert.equal(updated.text, changed.replace("  1. [ ] **原理图**", "  1. [x] **完成原理图**"));
  assert.deepEqual(updated.from, { line: 4, ch: 0 });
  assert.equal(updated.to.line, 4);
});

test("多行段落编辑保留其他段落和原始换行，下划线标题仍保留", () => {
  const original = "标题\n===\n第一行\n第二行\r\n\r\n- 后续列表\r\n";
  const tree = markdownTree(original, "文件");
  const paragraph = tree.root.children[0].children[0];
  const updated = editMarkdownNode(original, paragraph.source, "修改一\n修改二");
  assert.equal(updated.text, "标题\n===\n修改一\n修改二\r\n\r\n- 后续列表\r\n");
  assert.equal(editMarkdownNode(original, tree.root.children[0].source, "新标题").text,
    original.replace("标题", "新标题"));
  assert.throws(() => editMarkdownNode(original, paragraph.source, " "), /不能为空/);
});

function editingFixture(text) {
  const file = new TFile("项目/笔记.md");
  let document = text;
  let editors = [];
  const app = {
    vault: {
      getAbstractFileByPath: path => path === file.path ? file : null,
      read: async () => document,
      process: async (_, callback) => { document = callback(document); }
    },
    workspace: { getLeavesOfType: () => editors.map(editor => {
      const view = new MarkdownView(); view.file = file; view.editor = editor; return { view };
    }) }
  };
  const view = new MindMapView({ app }, {});
  view.sourcePath = file.path;
  view.loadSource = async () => {};
  const node = markdownTree(text, "笔记").root.children[0];
  return {
    view, node, file, snapshot: { path: file.path, text },
    getDocument: () => document,
    setDocument: value => { document = value; },
    setEditors: value => { editors = value; }
  };
}

test("导图保存通过原文 process 原子更新，遇到新修改拒绝覆盖", async () => {
  const f = editingFixture("# 原标题\n其他内容\n");
  await f.view.saveNodeEdit(f.node, "新标题", undefined, f.snapshot);
  assert.equal(f.getDocument(), "# 新标题\n其他内容\n");
  f.setDocument("# 别处修改\n其他内容\n");
  await assert.rejects(f.view.saveNodeEdit(f.node, "覆盖尝试", undefined, f.snapshot), /原文已有新修改/);
  assert.equal(f.getDocument(), "# 别处修改\n其他内容\n");
});

test("打开编辑器时只替换节点范围，并保护尚未保存的新内容", async () => {
  const f = editingFixture("# 原标题\n其他内容\n");
  let replace;
  const editor = {
    getValue: () => f.snapshot.text,
    replaceRange: (...args) => { replace = args; }
  };
  f.setEditors([editor]);
  await f.view.saveNodeEdit(f.node, "新标题", undefined, f.snapshot);
  assert.deepEqual(replace, ["# 新标题", { line: 0, ch: 0 }, { line: 0, ch: 5 }]);
  assert.equal(f.getDocument(), f.snapshot.text);
  editor.getValue = () => "# 未保存的新内容\n其他内容\n";
  await assert.rejects(f.view.saveNodeEdit(f.node, "覆盖尝试", undefined, f.snapshot), /原文已有新修改/);
});

test("根节点重命名保留笔记所在目录，并拒绝目录穿越", async () => {
  const f = editingFixture("# 内容\n");
  let renamed;
  f.view.app.fileManager = { renameFile: async (file, path) => { renamed = path; file.path = path; } };
  await assert.rejects(f.view.saveNodeEdit({ id: "0" }, "../其他", undefined, f.snapshot), /有效的笔记名称/);
  assert.equal(renamed, undefined);
  await f.view.saveNodeEdit({ id: "0" }, "新名称", undefined, f.snapshot);
  assert.equal(renamed, "项目/新名称.md");
  assert.equal(f.view.sourcePath, renamed);
});

const { imageContent, insertMarkdownNodes } = require("../mindmap-content");

test("图片语法提取保留正文及多个图片，尺寸参数不作为说明", () => {
  const media = imageContent('正文 ![[附件/图.png|200x100]] ![说明](<附件/第二 图.jpg>) <img src="a.webp" alt="图">');
  assert.equal(media.text, "正文");
  assert.deepEqual(media.images.map(image => image.target), ["附件/图.png", "附件/第二 图.jpg", "a.webp"]);
  assert.equal(media.images[0].alt, "");
  const tree = markdownTree("![[一.png]]\n![[二.png]]\n- 分支\n  - ![[三.png]]", "文件");
  assert.equal(tree.root.children.length, 3);
  assert.equal(tree.root.children[2].children[0].images[0].target, "三.png");
  const layout = layoutTree(tree.root);
  assert.equal(layout.nodes[1].thumbnails.length, 1);
  assert.ok(layout.nodes[1].height > 100);
});

test("新增标题子节点和同级节点保留其他章节、代码与 YAML", () => {
  const text = "---\r\ntags: [工作]\r\n---\r\n# A\r\n```js\r\nconst a = 1;\r\n```\r\n## 已有\r\n- 内容\r\n# B";
  const root = markdownTree(text, "文件").root;
  const added = insertMarkdownNodes(text, root, root.children[0].id, "child", ["新增"]);
  assert.equal(added.text, text.replace("# B", "## 新增\r\n# B"));
  const sibling = insertMarkdownNodes(text, root, root.children[0].id, "sibling", ["同级"]);
  assert.equal(sibling.text, text.replace("# B", "# 同级\r\n# B"));
  const image = insertMarkdownNodes(text, root, root.children[0].id, "child", ["![[图.png]]"], true);
  assert.equal(markdownTree(image.text, "文件").root.children[0].children[0].images[0].target, "图.png");
});

test("列表、段落、下划线标题和 EOF 新节点能再次解析为目标关系", () => {
  for (const text of ["1. 父\n   - 原子", "正文\n连续正文", "标题\n===", "\uFEFF- 父", "###### 标题"]) {
    const root = markdownTree(text, "文件").root;
    const update = insertMarkdownNodes(text, root, root.children[0].id, "child", ["新增"]);
    const parsed = markdownTree(update.text, "文件").root;
    assert.ok(parsed.children[0].children.some(child => child.label === "新增"), update.text);
    assert.ok(update.text.startsWith("\uFEFF") === text.startsWith("\uFEFF"));
    assert.ok(parsed.children[0].children.some(child => child.source.startLine === update.selectedLine));
  }
  const empty = insertMarkdownNodes("", markdownTree("", "文件").root, "0", "child", ["开始"]);
  assert.equal(empty.text, "- 开始\n");
});

test("新增节点保存入口拒绝冲突并立即更新图片引用基线", async () => {
  const f = editingFixture("# 标题\n");
  const root = markdownTree(f.snapshot.text, "文件").root;
  const update = insertMarkdownNodes(f.snapshot.text, root, "0", "child", ["![[图.png]]"], true);
  const snapshots = new Map();
  f.view.plugin.images = { snapshots, resolveLinks: () => new Set(["图.png"]) };
  await f.view.writeSource(f.snapshot, update);
  assert.equal(f.getDocument(), update.text);
  assert.ok(snapshots.get(f.file.path).has("图.png"));
  await assert.rejects(f.view.writeSource(f.snapshot, update), /原文已有新修改/);
});

test("导图多图部分失败仍插入成功文件，写回冲突时保留文件", async () => {
  const f = editingFixture("# 标题\n");
  f.view.sourceText = f.snapshot.text;
  f.view.tree = markdownTree(f.snapshot.text, "文件");
  f.view.selectNode = () => {};
  f.view.plugin.settings = { imageFolder: "附件" };
  f.view.plugin.enqueue = work => work();
  f.view.plugin.ensureFolder = async () => {};
  f.view.app.fileManager = { generateMarkdownLink: file => "[[" + file.path + "]]" };
  let count = 0;
  f.view.plugin.images = {
    extensionFor: () => "png", snapshots: new Map(), resolveLinks: () => new Set(["附件/文件-01.png"]),
    saveImage: async () => { if (count++) throw Error("导入失败"); return { path: "附件/文件-01.png" }; }
  };
  await assert.rejects(f.view.importImages([{}, {}]), /导入失败/);
  assert.ok(f.getDocument().includes("![[附件/文件-01.png]]"));
  f.setDocument(f.snapshot.text);
  f.view.plugin.images.saveImage = async () => { f.setDocument("外部修改"); return { path: "附件/保留.png" }; };
  await assert.rejects(f.view.importImages([{}]), /原文已有新修改/);
  assert.equal(f.getDocument(), "外部修改");
});


test("新增节点不会静默写入未闭合代码块中", async () => {
  const f = editingFixture("# 标题\n```js\nconst a = 1;");
  const root = markdownTree(f.snapshot.text, "文件").root;
  const update = insertMarkdownNodes(f.snapshot.text, root, "0", "child", ["新增"]);
  await assert.rejects(f.view.writeSource(f.snapshot, update), /新增节点无法显示/);
  assert.equal(f.getDocument(), f.snapshot.text);
});
