"use strict";

const { ItemView, MarkdownView, TFile, Notice, Modal } = require("obsidian");
const { t, bindUi } = require("./i18n");

const MINDMAP_VIEW_TYPE = "note-companion-mindmap";
const NODE_WIDTH = 280;
const COLUMN_GAP = 80;
const ROW_GAP = 20;

function plainLabel(text) {
  return text
    .replace(/!?\[\[([^\]]+)\]\]/g, (_, link) => link.includes("|") ? link.split("|").pop() : link)
    .replace(/!?\[([^\]]*)\]\([^\n]*?\)/g, (_, label) => label || "图片")
    .replace(/<[^>]*>/g, "")
    .replace(/(\*\*|__|~~|`+)(.+?)\1/g, "$2")
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=$|\s|[,.!?，。！？])/g, "$1$2")
    .replace(/\\([\\`*{}\[\]()#+.!_>-])/g, "$1")
    .replace(/\s+/g, " ").trim();
}

function markdownTree(markdown, title, limit = 1500) {
  let count = 1;
  let truncated = false;
  const root = { id: "0", label: title, children: [] };
  const headings = [{ level: 0, node: root }];
  const lists = [];
  const lines = String(markdown).replace(/^\uFEFF/, "").split(/\r?\n/);
  let start = 0;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)\s*$/.test(line));
    if (end >= 0) start = end + 1;
  }
  let fence = null;
  let paragraph = null;
  const add = (parent, text, source) => {
    const label = plainLabel(text);
    if (!label) return null;
    if (count >= limit) { truncated = true; return null; }
    const node = { id: String(count++), label, children: [], source };
    parent.children.push(node);
    return node;
  };
  for (let index = start; index < lines.length; index++) {
    const line = lines[index];
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length &&
          line.trim() === fenceMatch[1]) fence = null;
      continue;
    }
    if (fenceMatch) { fence = fenceMatch[1]; paragraph = null; continue; }
    if (!line.trim()) { paragraph = null; continue; }
    if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) { paragraph = null; continue; }
    const heading = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/);
    const underline = lines[index + 1]?.match(/^ {0,3}(=+|-+)\s*$/);
    if (heading || (underline && !/^\s*(?:[-+*]|\d+[.)])\s/.test(line))) {
      const level = heading ? heading[1].length : underline[1][0] === "=" ? 1 : 2;
      while (headings.length > 1 && headings[headings.length - 1].level >= level) headings.pop();
      const raw = heading ? heading[2] : line.trim();
      const prefix = heading ? line.match(/^\s*#{1,6}[ \t]+/)[0] : line.match(/^\s*/)[0];
      const node = add(headings[headings.length - 1].node, raw, {
        kind: "heading", startLine: index, endLine: index, raw, prefix,
        suffix: line.slice(prefix.length + raw.length)
      });
      if (node) headings.push({ level, node });
      lists.length = 0;
      paragraph = null;
      if (!heading) index++;
      continue;
    }
    const item = line.match(/^(\s*)(?:[-+*]|\d+[.)])\s+(.+)$/);
    if (item) {
      const indent = item[1].replace(/\t/g, "    ").length;
      while (lists.length && lists[lists.length - 1].indent >= indent) lists.pop();
      const parent = lists.length ? lists[lists.length - 1].node : headings[headings.length - 1].node;
      const marker = line.match(/^(\s*(?:[-+*]|\d+[.)])\s+)(\[[ xX]\]\s+)?/);
      const prefix = marker[0];
      const raw = line.slice(prefix.length);
      const task = Boolean(marker[2]);
      const checked = task && /\[[xX]\]/.test(marker[2]);
      const text = (task ? checked ? "☑ " : "☐ " : "") + raw;
      const node = add(parent, text, { kind: "list", startLine: index, endLine: index, raw, prefix, suffix: "", task, checked });
      if (node) lists.push({ indent, node });
      paragraph = null;
      continue;
    }
    const indent = line.match(/^\s*/)[0].replace(/\t/g, "    ").length;
    while (lists.length && indent <= lists[lists.length - 1].indent) lists.pop();
    const parent = lists.length ? lists[lists.length - 1].node : headings[headings.length - 1].node;
    const label = plainLabel(line.replace(/^\s*>\s?/, ""));
    if (paragraph?.parent === parent) {
      paragraph.node.label += " " + label;
      paragraph.node.source.endLine = index;
      paragraph.node.source.raw += "\n" + line;
    }
    else {
      const node = add(parent, label, { kind: "paragraph", startLine: index, endLine: index, raw: line });
      paragraph = node ? { parent, node } : null;
    }
  }
  return { root, count, truncated };
}

function editMarkdownNode(text, source, value, checked) {
  if (typeof value !== "string" || !value.trim()) throw new Error("节点内容不能为空。");
  const breaks = [...text.matchAll(/\r?\n/g)];
  if (!source || !Number.isInteger(source.startLine) || !Number.isInteger(source.endLine) ||
      source.startLine < 0 || source.endLine < source.startLine || source.endLine > breaks.length) {
    throw new Error("节点位置已失效，请刷新导图后重试。");
  }
  const lineStart = line => line === 0 ? 0 : breaks[line - 1].index + breaks[line - 1][0].length;
  const start = lineStart(source.startLine);
  const end = breaks[source.endLine]?.index ?? text.length;
  const newline = breaks[0]?.[0] || "\n";
  let replacement;
  if (source.kind === "paragraph") replacement = value.replace(/\r?\n/g, newline);
  else {
    if (/[\r\n]/.test(value)) throw new Error("标题和列表节点请填写单行内容。");
    let prefix = source.prefix;
    if (source.task && typeof checked === "boolean") prefix = prefix.replace(/\[[ xX]\]/, checked ? "[x]" : "[ ]");
    replacement = prefix + value.trim() + source.suffix;
  }
  if (start === 0 && text.startsWith("\uFEFF")) replacement = "\uFEFF" + replacement;
  return {
    text: text.slice(0, start) + replacement + text.slice(end), replacement,
    from: { line: source.startLine, ch: 0 },
    to: { line: source.endLine, ch: end - lineStart(source.endLine) }
  };
}

function wrapLabel(label) {
  const lines = [];
  let current = "";
  let columns = 0;
  const characters = Array.from(label);
  for (let index = 0; index < characters.length; index++) {
    const character = characters[index];
    const width = character.charCodeAt(0) <= 255 ? 1 : 2;
    if (columns + width > 36) {
      lines.push(current);
      if (lines.length === 4) {
        lines[3] = lines[3].slice(0, -1) + "…";
        return lines;
      }
      current = "";
      columns = 0;
    }
    current += character;
    columns += width;
  }
  if (current || !lines.length) lines.push(current);
  return lines;
}

function layoutTree(root, collapsed = new Set()) {
  const sizes = new Map();
  const measure = node => {
    const lines = wrapLabel(node.label);
    const height = lines.length * 18 + 24;
    const children = collapsed.has(node.id) ? [] : node.children;
    const childrenHeight = children.reduce((total, child) => total + measure(child), 0) +
      Math.max(0, children.length - 1) * ROW_GAP;
    const size = { lines, height, subtree: Math.max(height, childrenHeight), children };
    sizes.set(node.id, size);
    return size.subtree;
  };
  const totalHeight = measure(root);
  const nodes = [];
  const edges = [];
  let width = NODE_WIDTH;
  const place = (node, depth, top, branch) => {
    const size = sizes.get(node.id);
    const item = { node, branch, lines: size.lines, x: depth * (NODE_WIDTH + COLUMN_GAP),
      y: top + size.subtree / 2 - size.height / 2, width: NODE_WIDTH, height: size.height };
    nodes.push(item);
    width = Math.max(width, item.x + item.width);
    const childrenHeight = size.children.reduce((total, child) => total + sizes.get(child.id).subtree, 0) +
      Math.max(0, size.children.length - 1) * ROW_GAP;
    let childTop = top + (size.subtree - childrenHeight) / 2;
    size.children.forEach((child, index) => {
      const next = place(child, depth + 1, childTop, depth === 0 ? index : branch);
      edges.push({ parent: item, child: next, branch: next.branch });
      childTop += sizes.get(child.id).subtree + ROW_GAP;
    });
    return item;
  };
  place(root, 0, 0, 0);
  return { nodes, edges, width, height: totalHeight };
}

class MindMapView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.sourcePath = "";
    this.sourceName = "";
    this.collapsed = new Set();
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.loadVersion = 0;
  }

  getViewType() { return MINDMAP_VIEW_TYPE; }
  getDisplayText() { return this.sourceName ? `${this.sourceName} · ${t(this, "思维导图")}` : t(this, "思维导图"); }
  getIcon() { return "git-fork"; }
  getState() { return { sourcePath: this.sourcePath }; }

  async setState(state, result) {
    this.sourcePath = typeof state?.sourcePath === "string" ? state.sourcePath : "";
    await this.loadSource();
    await super.setState(state, result);
  }

  async onOpen() {
    this.closed = false;
    this.contentEl.empty();
    this.contentEl.addClass("nc-mindmap");
    this.win = this.contentEl.ownerDocument.defaultView;
    const toolbar = this.contentEl.createDiv({ cls: "nc-map-toolbar" });
    this.titleEl = toolbar.createSpan({ cls: "nc-map-title", text: t(this, "思维导图") });
    for (const [text, action] of [
      ["刷新", () => this.loadSource()], ["适应", () => this.fit()],
      ["编辑", () => this.openNodeEditor(this.selectedId || "0")],
      ["＋", () => this.scaleAt(1.2)], ["−", () => this.scaleAt(1 / 1.2)],
      ["展开", () => { this.collapsed.clear(); this.draw(); this.fit(); }],
      ["折叠", () => {
        if (!this.tree) return;
        this.collapsed = new Set(this.tree.root.children.map(node => node.id));
        this.draw(); this.fit();
      }],
      ["原文", () => this.openSource()]
    ]) {
      const button = toolbar.createEl("button", { text, attr: { "aria-label": text === "＋" ? "放大" : text === "−" ? "缩小" : text } });
      button.addEventListener("click", action);
    }
    this.statusEl = this.contentEl.createDiv({ cls: "nc-status" });
    this.stageEl = this.contentEl.createDiv({ cls: "nc-map-stage", attr: { "aria-label": "思维导图，双击节点编辑，点击节点后的按钮折叠，滚轮缩放，拖动平移" } });
    this.svg = this.svgElement("svg", { width: "100%", height: "100%", role: "group", "aria-label": "笔记思维导图" });
    this.stageEl.appendChild(this.svg);
    this.layer = this.svgElement("g");
    this.svg.appendChild(this.layer);
    this.registerDomEvent(this.stageEl, "wheel", event => {
      event.preventDefault();
      const bounds = this.stageEl.getBoundingClientRect();
      this.scaleAt(Math.exp(-event.deltaY * 0.0015), event.clientX - bounds.left, event.clientY - bounds.top);
    }, { passive: false });
    this.registerDomEvent(this.stageEl, "pointerdown", event => {
      if (event.button !== 0) return;
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, panX: this.panX, panY: this.panY,
        nodeId: event.target.closest?.("[data-node-id]")?.dataset.nodeId,
        toggle: Boolean(event.target.closest?.("[data-map-toggle]")) };
      this.didPan = false;
      this.stageEl.setPointerCapture(event.pointerId);
    });
    this.registerDomEvent(this.stageEl, "pointermove", event => {
      if (!this.drag || this.drag.id !== event.pointerId) return;
      const x = event.clientX - this.drag.x;
      const y = event.clientY - this.drag.y;
      if (Math.abs(x) + Math.abs(y) > 4) this.didPan = true;
      this.panX = this.drag.panX + x;
      this.panY = this.drag.panY + y;
      this.transform();
    });
    this.registerDomEvent(this.stageEl, "pointerup", event => {
      if (!this.drag || this.drag.id !== event.pointerId) return;
      const { nodeId: id, toggle } = this.drag;
      this.drag = null;
      if (this.didPan || !id) return;
      if (toggle) { this.lastNodeClick = null; this.toggleNode(id); return; }
      this.selectNode(id);
      // 指针捕获会改变浏览器 dblclick 的目标，使用原始节点 ID 判断双击。
      if (this.lastNodeClick?.id === id && event.timeStamp - this.lastNodeClick.time < 450) {
        this.lastNodeClick = null;
        this.openNodeEditor(id);
      } else this.lastNodeClick = { id, time: event.timeStamp };
    });
    this.registerDomEvent(this.stageEl, "pointercancel", () => { this.drag = null; });
    this.registerDomEvent(this.stageEl, "keydown", event => {
      const id = event.target.closest?.("[data-node-id]")?.dataset.nodeId;
      if (!id) return;
      if (event.key === "Enter" || event.key === "F2") {
        event.preventDefault(); this.openNodeEditor(id);
      } else if (event.key === " ") {
        event.preventDefault(); this.toggleNode(id);
      }
    });
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (oldPath === this.sourcePath) { this.sourcePath = file.path; this.loadSource(); }
    }));
    this.registerEvent(this.app.vault.on("delete", file => {
      if (file.path === this.sourcePath) this.setStatus("源文件已删除，当前显示上次生成的导图。");
    }));
    bindUi(this.contentEl, this);
    if (this.sourcePath) await this.loadSource();
  }

  svgElement(tag, attributes = {}) {
    const element = this.contentEl.ownerDocument.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
    return element;
  }

  async loadSource(keepViewport = false) {
    const version = ++this.loadVersion;
    try {
      const file = this.app.vault.getAbstractFileByPath(this.sourcePath);
      if (!(file instanceof TFile) || file.extension !== "md") throw new Error("请先打开一篇 Markdown 笔记，再点击右上角的思维导图按钮。");
      const editor = this.app.workspace.getLeavesOfType("markdown").map(leaf => leaf.view)
        .find(view => view instanceof MarkdownView && view.file?.path === file.path)?.editor;
      const text = editor ? editor.getValue() : await this.app.vault.read(file);
      if (this.closed || version !== this.loadVersion) return;
      this.sourceName = file.basename || file.name.replace(/\.md$/, "");
      this.sourceText = text;
      this.tree = markdownTree(text, this.sourceName);
      this.collapsed.clear();
      this.titleEl.setText(this.sourceName);
      this.titleEl.title = this.sourcePath;
      this.leaf.updateHeader?.();
      this.setStatus(this.tree.truncated ? `笔记较长，当前显示前 ${this.tree.count} 个节点。` : "");
      this.draw();
      if (this.frame) this.win.cancelAnimationFrame(this.frame);
      if (!keepViewport) this.frame = this.win.requestAnimationFrame(() => { this.frame = null; if (!this.closed) this.fit(); });
    } catch (error) {
      if (!this.closed && version === this.loadVersion) this.setStatus(error.message);
    }
  }

  draw() {
    if (!this.tree) return;
    this.layout = layoutTree(this.tree.root, this.collapsed);
    this.layer.replaceChildren();
    for (const edge of this.layout.edges) {
      const x1 = edge.parent.x + edge.parent.width;
      const y1 = edge.parent.y + edge.parent.height / 2;
      const x2 = edge.child.x;
      const y2 = edge.child.y + edge.child.height / 2;
      const middle = (x1 + x2) / 2;
      this.layer.appendChild(this.svgElement("path", {
        d: `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`,
        class: "nc-map-edge",
        stroke: this.branchColor(edge.branch)
      }));
    }
    for (const item of this.layout.nodes) {
      const expandable = item.node.children.length > 0;
      const group = this.svgElement("g", {
        transform: `translate(${item.x},${item.y})`, class: "nc-map-node" + (this.selectedId === item.node.id ? " is-selected" : ""),
        "data-node-id": item.node.id, tabindex: "0", role: "button",
        "aria-label": item.node.label + t(this, "，双击或按 Enter 编辑")
      });
      if (expandable) group.setAttribute("aria-expanded", String(!this.collapsed.has(item.node.id)));
      const title = this.svgElement("title");
      title.textContent = item.node.label + "\n" + t(this, "双击编辑");
      group.appendChild(title);
      group.appendChild(this.svgElement("rect", { width: item.width, height: item.height, rx: "10", class: "nc-map-box", stroke: this.branchColor(item.branch) }));
      const label = this.svgElement("text", { x: "14", y: "25", class: "nc-map-label" });
      item.lines.forEach((line, index) => {
        const span = this.svgElement("tspan", { x: "14", dy: index ? "18" : "0" });
        span.textContent = line;
        label.appendChild(span);
      });
      group.appendChild(label);
      if (expandable) {
        const badge = this.svgElement("g", { "data-map-toggle": "true", class: "nc-map-toggle" });
        badge.appendChild(this.svgElement("circle", { cx: item.width - 4, cy: item.height / 2, r: 11 }));
        const symbol = this.svgElement("text", { x: item.width - 4, y: item.height / 2 + 4 });
        symbol.textContent = this.collapsed.has(item.node.id) ? "+" : "−";
        badge.appendChild(symbol);
        group.appendChild(badge);
      }
      this.layer.appendChild(group);
    }
    this.transform();
  }

  branchColor(branch) {
    return ["var(--color-blue)", "var(--color-green)", "var(--color-orange)",
      "var(--color-purple)", "var(--color-cyan)", "var(--color-pink)"][branch % 6];
  }

  selectNode(id) {
    this.selectedId = id;
    for (const node of this.layer.querySelectorAll(".nc-map-node")) {
      node.classList.toggle("is-selected", node.dataset.nodeId === id);
    }
  }

  openNodeEditor(id) {
    const node = this.layout?.nodes.find(item => item.node.id === id)?.node;
    if (!node || this.closed) return;
    this.editorModal?.close();
    const snapshot = { path: this.sourcePath, text: this.sourceText };
    const root = id === "0";
    const modal = new Modal(this.app);
    this.editorModal = modal;
    modal.titleEl.setText(root ? "修改笔记名称" : "编辑节点");
    modal.contentEl.addClass("nc-map-editor");
    modal.contentEl.createEl("p", { text: root ? "保存后重命名源笔记。" : "保存后更新原 Markdown 中的对应内容。", cls: "nc-status" });
    const multiline = node.source?.kind === "paragraph";
    const input = modal.contentEl.createEl(multiline ? "textarea" : "input", {
      cls: "nc-map-edit-input", attr: { "aria-label": root ? "笔记名称，不含 .md" : "节点内容" }
    });
    input.value = root ? node.label : node.source.raw;
    if (multiline) input.rows = 6;
    let checkbox;
    if (node.source?.task) {
      const task = modal.contentEl.createEl("label", { cls: "nc-map-task-toggle" });
      checkbox = task.createEl("input", { attr: { type: "checkbox" } });
      checkbox.checked = node.source.checked;
      task.createSpan({ text: "已完成" });
    }
    const errorEl = modal.contentEl.createDiv({ cls: "nc-status" });
    const actions = modal.contentEl.createDiv({ cls: "nc-map-edit-actions" });
    const cancel = actions.createEl("button", { text: "取消" });
    const save = actions.createEl("button", { text: root ? "重命名笔记" : "保存到原文", cls: "mod-cta" });
    cancel.addEventListener("click", () => modal.close());
    const submit = async () => {
      if (save.disabled) return;
      save.disabled = true;
      input.disabled = true;
      cancel.disabled = true;
      try {
        await this.saveNodeEdit(node, input.value, checkbox?.checked, snapshot);
        modal.close();
      } catch (error) {
        errorEl.setText(t(this, error.message));
        save.disabled = false; input.disabled = false; cancel.disabled = false;
      }
    };
    save.addEventListener("click", submit);
    input.addEventListener("keydown", event => {
      if (!event.isComposing && event.key === "Enter" && (!multiline || event.ctrlKey || event.metaKey)) {
        event.preventDefault(); submit();
      }
    });
    modal.onClose = () => { if (this.editorModal === modal) this.editorModal = null; };
    bindUi(modal.titleEl, this);
    bindUi(modal.contentEl, this);
    modal.open();
    input.focus();
    input.select();
  }

  async saveNodeEdit(node, value, checked, snapshot) {
    if (this.closed || this.sourcePath !== snapshot.path) throw new Error("源笔记已切换，请重新打开节点编辑。");
    const file = this.app.vault.getAbstractFileByPath(snapshot.path);
    if (!(file instanceof TFile) || file.extension !== "md") throw new Error("源笔记已不存在。");
    const editors = this.app.workspace.getLeavesOfType("markdown").map(leaf => leaf.view)
      .filter(view => view instanceof MarkdownView && view.file?.path === file.path).map(view => view.editor);
    const conflict = () => new Error("原文已有新修改，请先复制这里的内容，再刷新导图后编辑。");
    if (editors.some(editor => editor.getValue() !== snapshot.text)) throw conflict();
    if (node.id === "0") {
      if (!editors.length && await this.app.vault.read(file) !== snapshot.text) throw conflict();
      if (file.path !== snapshot.path) throw conflict();
      const name = value.trim();
      if (!name || /^[.]/.test(name) || /[. ]$/.test(name) || /[\\/:*?"<>|\x00-\x1f]/.test(name)) {
        throw new Error("请输入有效的笔记名称，名称中不能包含路径或特殊字符。");
      }
      const directory = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/") + 1) : "";
      const path = directory + name + ".md";
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing && existing !== file) throw new Error("已有同名笔记，请换一个名称。");
      if (path !== file.path) await this.app.fileManager.renameFile(file, path);
      this.sourcePath = path;
    } else if (editors.length) {
      const update = editMarkdownNode(snapshot.text, node.source, value, checked);
      editors[0].replaceRange(update.replacement, update.from, update.to);
    } else {
      await this.app.vault.process(file, current => {
        if (current !== snapshot.text) throw conflict();
        return editMarkdownNode(current, node.source, value, checked).text;
      });
    }
    await this.loadSource(true);
  }

  toggleNode(id) {
    if (!id || !this.layout?.nodes.some(item => item.node.id === id && item.node.children.length)) return;
    if (this.collapsed.has(id)) this.collapsed.delete(id);
    else this.collapsed.add(id);
    this.draw();
  }

  transform() {
    this.layer?.setAttribute("transform", `translate(${this.panX},${this.panY}) scale(${this.zoom})`);
  }

  scaleAt(factor, x = this.stageEl.clientWidth / 2, y = this.stageEl.clientHeight / 2) {
    const previous = this.zoom;
    this.zoom = Math.max(0.08, Math.min(4, this.zoom * factor));
    this.panX = x - (x - this.panX) * this.zoom / previous;
    this.panY = y - (y - this.panY) * this.zoom / previous;
    this.transform();
  }

  fit() {
    if (!this.layout || !this.stageEl.clientWidth || !this.stageEl.clientHeight) return;
    const width = this.stageEl.clientWidth;
    const height = this.stageEl.clientHeight;
    this.zoom = Math.max(0.08, Math.min(1, (width - 64) / this.layout.width, (height - 64) / this.layout.height));
    this.panX = (width - this.layout.width * this.zoom) / 2;
    this.panY = (height - this.layout.height * this.zoom) / 2;
    this.transform();
  }

  async openSource() {
    const file = this.app.vault.getAbstractFileByPath(this.sourcePath);
    if (!(file instanceof TFile)) { new Notice(t(this, "源笔记已不存在。")); return; }
    const existing = this.app.workspace.getLeavesOfType("markdown").find(leaf => leaf.view.file?.path === file.path);
    if (existing) await this.app.workspace.revealLeaf(existing);
    else await this.app.workspace.getLeaf("tab").openFile(file);
  }

  onResize() { this.fit(); }

  setStatus(message) { this.statusEl?.setText(t(this, message)); }

  async onClose() {
    this.closed = true;
    this.editorModal?.close();
    this.loadVersion++;
    if (this.frame) this.win.cancelAnimationFrame(this.frame);
  }
}

module.exports = { MINDMAP_VIEW_TYPE, MindMapView, markdownTree, editMarkdownNode, layoutTree, wrapLabel };
