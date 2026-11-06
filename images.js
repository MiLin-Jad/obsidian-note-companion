"use strict";

const { TFile, MarkdownView, Notice } = require("obsidian");
const { isWithin, isImage, nextImagePath, sourceLinks } = require("./core");
const { t } = require("./i18n");

class ImageManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.snapshots = new Map();
    this.timers = new Map();
    this.pendingCleanup = new Set();
    this.revision = 0;
    this.ready = false;
    this.stopped = false;
  }

  start() {
    const { plugin, app } = this;
    for (const event of ["create", "modify", "delete", "rename"]) {
      plugin.registerEvent(app.vault.on(event, file => {
        if (this.isSource(file)) this.revision++;
      }));
    }
    plugin.registerEvent(app.workspace.on("editor-paste", (event, editor, view) => {
      this.onPaste(event, editor, view);
    }));
    // Canvas 画布粘贴不触发 editor-paste，必须在原生 Canvas 处理前接入。
    plugin.registerDomEvent(document, "paste", event => this.onCanvasPaste(event), true);
    plugin.registerEvent(app.vault.on("modify", file => this.schedule(file)));
    plugin.registerEvent(app.vault.on("create", file => this.schedule(file)));
    plugin.registerEvent(app.vault.on("delete", file => {
      if (!(file instanceof TFile) || !this.ready) return;
      plugin.enqueue(async () => {
        const previous = this.snapshots.get(file.path);
        this.snapshots.delete(file.path);
        if (previous && plugin.settings.cleanupImages) await this.cleanup(previous);
      });
    }));
    plugin.registerEvent(app.vault.on("rename", (file, oldPath) => {
      const previous = this.snapshots.get(oldPath);
      this.snapshots.delete(oldPath);
      if (previous) this.snapshots.set(file.path, previous);
      // 图片移动后重新建立基线，移动本身不应触发附件清理。
      if (file instanceof TFile && isImage(file.path)) {
        plugin.enqueue(() => this.initialize());
      } else {
        this.schedule(file);
      }
    }));
    app.workspace.onLayoutReady(() => plugin.enqueue(() => this.initialize()));
    plugin.register(() => {
      this.stopped = true;
      for (const timer of this.timers.values()) window.clearTimeout(timer);
      this.timers.clear();
    });
  }

  isSource(file) {
    return file instanceof TFile && ["md", "canvas", "html", "svg"].includes(file.extension.toLowerCase());
  }

  liveTexts(file) {
    const texts = [];
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file?.path === file.path) texts.push(view.editor.getValue());
    }
    for (const leaf of this.app.workspace.getLeavesOfType("canvas")) {
      const view = leaf.view;
      if (view.file?.path !== file.path) continue;
      // Canvas 自动保存存在延迟，清理必须同时检查正在编辑的画布。
      if (typeof view.canvas?.getData !== "function") throw new Error("无法核对打开的画布，本轮图片清理已停止。");
      const data = view.canvas.getData();
      if (!data || !Array.isArray(data.nodes)) throw new Error("画布数据尚未就绪，本轮图片清理已停止。");
      texts.push(JSON.stringify(data));
    }
    return texts;
  }

  async currentTexts(file) {
    return [await this.app.vault.read(file), ...this.liveTexts(file)];
  }

  imageIndex() {
    const index = new Map();
    for (const image of this.app.vault.getFiles()) {
      if (!isImage(image.path)) continue;
      if (!index.has(image.name)) index.set(image.name, []);
      index.get(image.name).push(image.path);
    }
    return index;
  }

  resolveLinks(file, texts, index = this.imageIndex()) {
    const paths = new Set();
    for (const text of texts) {
      for (const link of sourceLinks(file.path, text)) {
        const target = this.app.metadataCache.getFirstLinkpathDest(link, file.path);
        if (target && isImage(target.path)) paths.add(target.path);
        // 索引暂未刷新或有重名图片时，保留所有同名候选，避免错误删除。
        const basename = link.split("/").pop();
        for (const path of index.get(basename) || []) paths.add(path);
      }
    }
    return paths;
  }

  async references(file, index) {
    return this.resolveLinks(file, await this.currentTexts(file), index);
  }

  async initialize() {
    this.ready = false;
    this.snapshots.clear();
    const index = this.imageIndex();
    for (const file of this.app.vault.getFiles().filter(file => this.isSource(file))) {
      if (this.stopped) return;
      try {
        this.snapshots.set(file.path, await this.references(file, index));
      } catch (_) {
        // 无法解析的 Canvas 不作为清理来源，完整扫描时仍会阻止删除。
      }
    }
    this.ready = true;
  }

  schedule(file) {
    if (!this.ready || !this.isSource(file)) return;
    const path = file.path;
    window.clearTimeout(this.timers.get(path));
    this.timers.set(path, window.setTimeout(() => {
      this.timers.delete(path);
      this.plugin.enqueue(async () => {
        const current = this.app.vault.getAbstractFileByPath(path);
        if (!(current instanceof TFile)) return;
        const references = await this.references(current);
        const previous = this.snapshots.get(path) || new Set();
        this.snapshots.set(path, references);
        if (this.plugin.settings.cleanupImages) {
          await this.cleanup(new Set([...previous].filter(image => !references.has(image))));
        }
      });
    }, 3000));
  }

  async cleanup(candidates) {
    if (this.stopped || !this.plugin.settings.cleanupImages) return;
    const folder = this.plugin.settings.imageFolder;
    const eligible = [...candidates].filter(path => isWithin(path, folder) && isImage(path));
    if (!eligible.length) return;
    const revision = this.revision;
    const index = this.imageIndex();
    const referenced = new Set();
    for (const file of this.app.vault.getFiles().filter(file => this.isSource(file))) {
      // 任意文档无法完整读取时，中止本轮清理。
      for (const path of await this.references(file, index)) referenced.add(path);
    }
    let count = 0;
    for (const path of eligible) {
      if (this.stopped || !this.plugin.settings.cleanupImages) return;
      if (revision !== this.revision) {
        this.retryCleanup(eligible);
        return;
      }
      if (referenced.has(path)) continue;
      // 在删除前再次检查实时编辑器和画布，覆盖扫描期间新增或撤销的引用。
      let inEditor = false;
      const openLeaves = [
        ...this.app.workspace.getLeavesOfType("markdown"),
        ...this.app.workspace.getLeavesOfType("canvas")
      ];
      for (const leaf of openLeaves) {
        const view = leaf.view;
        if (view.file && this.app.vault.getAbstractFileByPath(view.file.path) === view.file &&
            this.resolveLinks(view.file, this.liveTexts(view.file), index).has(path)) {
          inEditor = true;
          break;
        }
      }
      if (inEditor) continue;
      const image = this.app.vault.getAbstractFileByPath(path);
      if (!(image instanceof TFile)) continue;
      await this.app.vault.trash(image, false);
      count++;
    }
    if (count) new Notice(t(this, `笔记伴侣：${count} 张已移除引用的图片已移入笔记库回收站。`));
  }

  retryCleanup(paths) {
    for (const path of paths) this.pendingCleanup.add(path);
    const key = "@cleanup";
    window.clearTimeout(this.timers.get(key));
    this.timers.set(key, window.setTimeout(() => {
      this.timers.delete(key);
      const candidates = new Set(this.pendingCleanup);
      this.pendingCleanup.clear();
      this.plugin.enqueue(() => this.cleanup(candidates));
    }, 3000));
  }

  onPaste(event, editor, view) {
    if (!this.plugin.settings.renameImages || event.defaultPrevented || view?.file?.extension !== "md" ||
        typeof editor?.replaceSelection !== "function" || typeof editor?.getValue !== "function") return;
    const images = this.clipboardImages(event);
    if (!images.length) return;
    event.preventDefault();
    const sourceFile = view.file;
    this.plugin.enqueue(async () => {
      if (view.file !== sourceFile || this.app.vault.getAbstractFileByPath(sourceFile.path) !== sourceFile) {
        new Notice(t(this, "笔记已切换，请回到原笔记重新粘贴图片。"));
        return;
      }
      const folder = this.plugin.settings.imageFolder;
      await this.plugin.ensureFolder(folder);
      for (const image of images) {
        const saved = await this.saveImage(image, folder, sourceFile.path);
        if (view.file !== sourceFile) {
          new Notice(t(this, `图片已保存到 ${saved.path}，笔记已切换，请手动插入。`));
          continue;
        }
        const link = this.app.fileManager.generateMarkdownLink(saved, sourceFile.path);
        editor.replaceSelection((link.startsWith("!") ? link : "!" + link) + "\n");
        // 立即建立基线，即使粘贴后马上删除也能识别移除的引用。
        this.snapshots.set(sourceFile.path, this.resolveLinks(sourceFile, [editor.getValue()]));
      }
    });
  }

  onCanvasPaste(event) {
    if (!this.plugin.settings.renameImages || event.defaultPrevented) return;
    const view = this.app.workspace.getLeavesOfType("canvas").map(leaf => leaf.view)
      .find(view => view.file?.extension === "canvas" && view.canvas?.wrapperEl &&
        (view.canvas.wrapperEl === event.target ||
          view.canvas.wrapperEl.ownerDocument?.activeElement === view.canvas.wrapperEl));
    if (!view || view.canvas.readonly) return;
    const images = this.clipboardImages(event);
    if (!images.length) return;
    const canvas = view.canvas;
    if (!["getData", "createFileNodes", "posCenter", "requestSave"].every(method => typeof canvas[method] === "function")) {
      new Notice(t(this, "当前画布版本暂不支持图片自动命名。请先将图片粘贴到 Markdown 笔记，再拖入画布。"));
      return;
    }
    const sourceFile = view.file;
    const position = canvas.posCenter();
    event.preventDefault();
    // 本次图片粘贴由插件完整处理，阻止后续处理器重复导入和创建旧文件名卡片。
    event.stopImmediatePropagation();
    this.plugin.enqueue(async () => {
      const available = () => !this.stopped && view.file === sourceFile && view.canvas === canvas &&
        !canvas.readonly && this.app.vault.getAbstractFileByPath(sourceFile.path) === sourceFile &&
        this.app.workspace.getLeavesOfType("canvas").some(leaf => leaf.view === view);
      if (!available()) {
        new Notice(t(this, "画布已切换或关闭，请回到原画布重新粘贴图片。"));
        return;
      }
      const folder = this.plugin.settings.imageFolder;
      await this.plugin.ensureFolder(folder);
      const saved = [];
      try {
        for (const image of images) saved.push(await this.saveImage(image, folder, sourceFile.path));
      } finally {
        // 多图粘贴部分失败时，已成功保存的图片仍需插入，保留文件及其真实路径。
        if (saved.length && available()) {
          canvas.createFileNodes(saved, position);
          canvas.requestSave();
          this.snapshots.set(sourceFile.path, this.resolveLinks(sourceFile, [JSON.stringify(canvas.getData())]));
        } else if (saved.length) {
          new Notice(t(this, `图片已保存到 ${folder}，原画布已关闭，请手动拖入图片。`));
        }
      }
    });
  }

  clipboardImages(event) {
    const fileItems = Array.from(event.clipboardData?.items || []).filter(item => item.kind === "file");
    const images = fileItems.length ? fileItems.map(item => item.getAsFile())
      : Array.from(event.clipboardData?.files || []);
    // 混合文件或未知格式交回 Obsidian 自身处理，避免拦截后丢失内容。
    if (images.some(image => !image || !this.extensionFor(image))) return [];
    return images;
  }

  async saveImage(image, folder, sourcePath) {
    const extension = this.extensionFor(image);
    const bytes = await image.arrayBuffer();
    if (!bytes.byteLength) throw new Error("剪贴板图片为空，请重新复制原图。");
    // 所有入口共用顺序队列，防止多图或并发粘贴覆盖文件。
    for (let attempt = 0; attempt < 10; attempt++) {
      const path = nextImagePath(folder, extension, this.app.vault.getFiles().map(file => file.path), sourcePath);
      try {
        return await this.app.vault.createBinary(path, bytes);
      } catch (error) {
        if (!this.app.vault.getAbstractFileByPath(path)) throw error;
      }
    }
    throw new Error("图片命名冲突，请重新粘贴。");
  }

  extensionFor(file) {
    const mimeTypes = {
      "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
      "image/bmp": "bmp", "image/svg+xml": "svg", "image/avif": "avif"
    };
    return mimeTypes[String(file.type || "").toLowerCase()] || null;
  }
}

module.exports = { ImageManager };
