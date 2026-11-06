"use strict";

const {
  Plugin, PluginSettingTab, Setting, ItemView, MarkdownRenderer, MarkdownView,
  TFile, TFolder, Notice, Component
} = require("obsidian");
const { validateFolders, vaultFolder, colorRules, localDate } = require("./core");
const { ImageManager } = require("./images");
const { AssistantService } = require("./assistant");
const { MINDMAP_VIEW_TYPE, MindMapView } = require("./mindmap");
const { t, bindUi, refreshUi } = require("./i18n");

const VIEW_TYPE = "note-companion-assistant";
const DEFAULT_SETTINGS = {
  language: "zh",
  imageFolder: "90-附件/图片",
  renameImages: true,
  cleanupImages: true,
  hideMode: "images",
  extensionColors: "md=#61afef\npdf=#e06c75\ncanvas=#c678dd",
  assistantFolder: "90-附件/Ai助手",
  aiScope: "all",
  aiFolders: "",
  contextLimit: 40000
};

class NoteCompanion extends Plugin {
  async onload() {
    this.stopped = false;
    this.queue = Promise.resolve();
    const stored = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...(stored || {}) };
    if (!["zh", "en"].includes(this.settings.language)) this.settings.language = "zh";
    this.localizedCommands = [];
    this.lastNoteFile = this.app.workspace.getActiveFile();
    this.registerEvent(this.app.workspace.on("file-open", file => {
      if (file?.extension === "md" && !file.path.startsWith(this.settings.assistantFolder + "/")) {
        this.lastNoteFile = file;
      }
    }));
    try {
      validateFolders(this.settings.imageFolder, this.settings.assistantFolder);
      colorRules(this.settings.extensionColors);
      if (!["none", "images", "folder"].includes(this.settings.hideMode) ||
          !["all", "current", "folders"].includes(this.settings.aiScope) ||
          typeof this.settings.aiFolders !== "string" ||
          !Number.isFinite(this.settings.contextLimit)) throw new Error("配置格式不正确");
      this.settings.contextLimit = Math.min(200000, Math.max(4000, this.settings.contextLimit));
    } catch (_) {
      this.settings = { ...DEFAULT_SETTINGS };
      new Notice(t(this, "笔记伴侣的设置格式无效，本次使用默认设置。请在设置中核对目录。"));
    }
    this.assistant = new AssistantService(this);
    this.registerView(VIEW_TYPE, leaf => new AssistantView(leaf, this));
    this.registerView(MINDMAP_VIEW_TYPE, leaf => new MindMapView(leaf, this));
    this.assistantButton = this.addRibbonIcon("bot", "AI 助手", () => this.toggleAssistant());
    this.mindmapButton = this.addRibbonIcon("git-fork", "思维导图", () => this.openMindMap());
    for (const [button, label, activate] of [
      [this.assistantButton, "打开或收起 AI 助手", () => this.toggleAssistant()],
      [this.mindmapButton, "将当前 Markdown 笔记转为思维导图", () => this.openMindMap()]
    ]) {
      button.addClass("nc-assistant-launcher");
      button.setAttribute("role", "button");
      button.setAttribute("aria-label", label);
      button.tabIndex = 0;
      bindUi(button, this);
      this.registerDomEvent(button, "keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      });
    }
    this.app.workspace.onLayoutReady(() => this.placeAssistantButton());
    this.registerEvent(this.app.workspace.on("layout-change", () => this.placeAssistantButton()));
    this.registerEvent(this.app.workspace.on("window-frame-change", () => this.placeAssistantButton()));
    this.addLocalizedCommand({ id: "open-assistant", name: "打开日志与 AI 助手", callback: () => this.openAssistant() });
    this.addLocalizedCommand({ id: "open-mindmap", name: "将当前 Markdown 笔记转为思维导图", callback: () => this.openMindMap() });
    this.addLocalizedCommand({ id: "refresh-progress", name: "更新进展", callback: async () => {
      const view = await this.openAssistant();
      if (view) await view.send(t(this, "请根据笔记整理最近完成的工作、待办、现在可以推进的下一步，以及卡住的事情。"));
    } });
    this.addLocalizedCommand({ id: "open-api-config", name: "打开 AI 接口配置", callback: () => this.openAssistantFile("配置.md") });
    this.addLocalizedCommand({ id: "toggle-image-visibility", name: "切换图片列表显示", callback: async () => {
      this.settings.hideMode = this.settings.hideMode === "none" ? "images" : "none";
      await this.saveSettings();
      new Notice(t(this, this.settings.hideMode === "none" ? "已显示图片列表。" : "已隐藏图片列表。"));
    } });
    this.addSettingTab(new CompanionSettings(this.app, this));
    this.styleElement = document.createElement("style");
    this.styleElement.dataset.noteCompanion = "true";
    document.head.appendChild(this.styleElement);
    this.register(() => this.styleElement.remove());
    this.applyExplorerStyle();
    this.images = new ImageManager(this);
    this.images.start();
  }

  onunload() {
    this.stopped = true;
  }

  addLocalizedCommand(command) {
    const name = command.name;
    command.name = t(this, name);
    const registered = this.addCommand(command) || command;
    registered.name = `${t(this, "笔记伴侣")}: ${t(this, name)}`;
    this.localizedCommands.push({ command: registered, name });
  }

  async setLanguage(language) {
    if (!["zh", "en"].includes(language)) return;
    if (this.assistant.busy) throw new Error("助手正在回复，请稍候。");
    const views = [...this.app.workspace.getLeavesOfType(VIEW_TYPE), ...this.app.workspace.getLeavesOfType(MINDMAP_VIEW_TYPE)];
    if (views.some(leaf => leaf.view.editorModal)) throw new Error("请先保存或关闭节点编辑，再切换语言。");
    const previous = this.settings.language;
    this.settings.language = language;
    try { await this.saveSettings(); }
    catch (error) { this.settings.language = previous; throw error; }
    refreshUi(this.settingsContainer, this);
    refreshUi(this.assistantButton, this);
    refreshUi(this.mindmapButton, this);
    for (const { command, name } of this.localizedCommands) command.name = `${t(this, "笔记伴侣")}: ${t(this, name)}`;
    for (const { view } of views) {
      refreshUi(view.contentEl, this);
      if (view.statusEl) view.setStatus(view.statusEl.textContent);
      if (view.getViewType() === MINDMAP_VIEW_TYPE) view.draw();
      view.leaf.updateHeader?.();
    }
  }

  enqueue(work) {
    const result = this.queue.then(() => this.stopped ? undefined : work());
    this.queue = result.catch(error => {
      if (!this.stopped) new Notice(t(this, `笔记伴侣：${error.message || "操作失败，请重试。"}`));
    });
    return this.queue;
  }

  async ensureFolder(path) {
    const parts = vaultFolder(path).split("/");
    let current = "";
    for (const part of parts) {
      current = current ? current + "/" + part : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing && !(existing instanceof TFolder)) throw new Error(`${current} 已存在同名文件。`);
      if (!existing) {
        try { await this.app.vault.createFolder(current); } catch (error) {
          if (!(this.app.vault.getAbstractFileByPath(current) instanceof TFolder)) throw error;
        }
      }
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.applyExplorerStyle();
  }

  applyExplorerStyle() {
    const rules = [];
    const explorer = '.workspace-leaf-content[data-type="file-explorer"]';
    const folder = CSS.escape(this.settings.imageFolder);
    if (this.settings.hideMode === "folder") {
      rules.push(`${explorer} .nav-folder:has(> .nav-folder-title[data-path="${folder}"]) { display: none !important; }`);
    } else if (this.settings.hideMode === "images") {
      for (const extension of require("./core").IMAGE_EXTENSIONS) {
        rules.push(`${explorer} .nav-file:has(> .nav-file-title[data-path^="${folder}/"][data-path$=".${extension}" i]) { display: none !important; }`);
      }
    }
    for (const rule of colorRules(this.settings.extensionColors)) {
      rules.push(`${explorer} .nav-file-title[data-path$=".${rule.extension}" i] .nav-file-title-content { color: ${rule.color} !important; }`);
    }
    this.styleElement.textContent = rules.join("\n");
  }

  async openAssistant() {
    try {
      let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
      if (!leaf) {
        leaf = this.app.workspace.getRightLeaf(false);
        if (!leaf) throw new Error("无法打开助手侧边栏。");
        await leaf.setViewState({ type: VIEW_TYPE, active: true });
      }
      await this.app.workspace.revealLeaf(leaf);
      return leaf.view;
    } catch (error) {
      new Notice(t(this, error.message));
      return null;
    }
  }

  placeAssistantButton() {
    if (this.stopped || !this.assistantButton) return;
    const header = document.querySelector(".workspace-tabs.mod-top-right-space > .workspace-tab-header-container");
    if (!header) return;
    const tabList = header.querySelector(".workspace-tab-header-tab-list");
    let next = tabList;
    for (const button of [this.assistantButton, this.mindmapButton]) {
      if (!button) continue;
      if (button.parentElement !== header || button.nextElementSibling !== next) header.insertBefore(button, next);
      button.removeClass("side-dock-ribbon-action");
      button.addClass("clickable-icon");
      next = button;
    }
  }

  async openMindMap() {
    try {
      const activeView = this.app.workspace.activeLeaf?.view;
      let file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
      if (!file && activeView?.getViewType() === MINDMAP_VIEW_TYPE) {
        file = this.app.vault.getAbstractFileByPath(activeView.sourcePath);
      }
      if (!file && activeView?.getViewType() === VIEW_TYPE) file = this.lastNoteFile;
      if (!(file instanceof TFile) || file.extension !== "md") {
        new Notice(t(this, "请先打开一篇 Markdown 笔记，再点击思维导图按钮。"));
        return;
      }
      const leaf = this.app.workspace.getLeavesOfType(MINDMAP_VIEW_TYPE)
        .find(leaf => leaf.view.sourcePath === file.path) || this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: MINDMAP_VIEW_TYPE, active: true, state: { sourcePath: file.path } });
      await this.app.workspace.revealLeaf(leaf);
    } catch (error) { new Notice(t(this, error.message)); }
  }

  async toggleAssistant() {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    const rightSplit = this.app.workspace.rightSplit;
    if (leaf && rightSplit && leaf.getRoot() === rightSplit && !rightSplit.collapsed &&
        leaf.containerEl.getClientRects().length) {
      rightSplit.collapse();
      return;
    }
    await this.openAssistant();
  }

  async openAssistantFile(name) {
    try {
      await this.assistant.initialize();
      const path = this.assistant.path(name);
      if (!this.app.vault.getAbstractFileByPath(path) && name.startsWith("日志/")) {
        await this.assistant.write(name, `# ${localDate()} 日志\n`);
      }
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
    } catch (error) { new Notice(t(this, error.message)); }
  }
}

class AssistantView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.sending = false;
    this.renderers = [];
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return t(this, "笔记伴侣"); }
  getIcon() { return "bot"; }

  renderer() {
    const component = new Component();
    component.load();
    this.renderers.push(component);
    return component;
  }

  clearRenderers() {
    for (const component of this.renderers) component.unload();
    this.renderers = [];
  }

  async markdown(text, element, path) {
    await MarkdownRenderer.render(this.app, text, element, path, this.renderer());
  }

  async onOpen() {
    this.closed = false;
    this.contentEl.empty();
    this.contentEl.addClass("nc-assistant");
    const header = this.contentEl.createDiv({ cls: "nc-header" });
    header.createEl("h3", { text: "笔记伴侣" });
    const helpButton = header.createEl("button", {
      text: "帮助", attr: { "aria-expanded": "false", "aria-label": "显示或隐藏功能说明" }
    });
    const helpEl = this.contentEl.createDiv({ cls: "nc-help" });
    helpEl.hidden = true;
    helpEl.createEl("p", { text: "更新进展：整理已完成、待办、下一步和阻塞，点击来源可打开笔记。" });
    helpEl.createEl("p", { text: "聊天时读取设置范围内的笔记和本地记忆，连接你配置的 API。" });
    helpEl.createEl("p", { text: "对话、记忆和进展保存到助手目录的 Markdown 文件中，支持手动编辑。AI 的写入权限仅限助手目录。" });
    helpEl.createEl("p", { text: "首次使用请打开“接口配置”。Enter 发送，Shift + Enter 换行。" });
    helpButton.addEventListener("click", () => {
      helpEl.hidden = !helpEl.hidden;
      helpButton.setAttribute("aria-expanded", String(!helpEl.hidden));
    });
    const actions = this.contentEl.createDiv({ cls: "nc-actions" });
    this.refreshButton = actions.createEl("button", { text: "更新进展", cls: "mod-cta" });
    this.refreshButton.addEventListener("click", () => this.send(t(this, "请整理最近完成的工作、待办、现在可以推进的下一步，以及卡住的事情。")));
    for (const [text, name] of [["记忆", "记忆.md"], ["今日日志", `日志/${localDate()}.md`], ["接口配置", "配置.md"]]) {
      const button = actions.createEl("button", { text });
      button.addEventListener("click", () => this.plugin.openAssistantFile(name));
    }
    this.statusEl = this.contentEl.createDiv({ cls: "nc-status" });
    this.statusEl.setAttribute("role", "status");
    this.scrollEl = this.contentEl.createDiv({ cls: "nc-scroll" });
    this.progressEl = this.scrollEl.createDiv({ cls: "nc-progress" });
    this.chatEl = this.scrollEl.createDiv({ cls: "nc-chat" });
    const shortcuts = this.contentEl.createDiv({ cls: "nc-shortcuts" });
    for (const text of ["最近做了什么？", "接下来做什么？", "还有哪些待办？"]) {
      const button = shortcuts.createEl("button", { text });
      button.addEventListener("click", () => this.send(t(this, text)));
    }
    const composer = this.contentEl.createDiv({ cls: "nc-composer" });
    this.inputEl = composer.createEl("textarea", {
      placeholder: "输入消息…",
      attr: { "aria-label": "发给 AI 助手的消息", rows: "3" }
    });
    this.inputEl.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.send();
      }
    });
    this.sendButton = composer.createEl("button", { text: "发送", cls: "mod-cta" });
    this.sendButton.addEventListener("click", () => this.send());
    bindUi(this.contentEl, this);
    try {
      await this.plugin.assistant.initialize();
      if (this.closed) return;
      await this.loadLocal();
      this.setStatus("");
    } catch (error) { this.setStatus(error.message); }
  }

  async loadLocal() {
    this.clearRenderers();
    this.progressEl.empty();
    this.chatEl.empty();
    const sourcePath = this.plugin.assistant.path("项目进展.md");
    const progress = (await this.plugin.assistant.read("项目进展.md")).trim();
    const legacyPlaceholder = "# 项目进展\n\n点击助手面板中的“更新进展”，查看已完成、待办、下一步和阻塞。";
    if (progress && progress !== "# 项目进展" && progress !== legacyPlaceholder) {
      await this.markdown(progress, this.progressEl, sourcePath);
    }
    const journal = await this.plugin.assistant.read(`日志/${localDate()}.md`);
    if (journal) {
      bindUi(this.chatEl.createEl("h4", { text: "今天的对话" }), this);
      await this.markdown(journal.slice(-30000), this.chatEl, this.plugin.assistant.path(`日志/${localDate()}.md`));
    }
  }

  async send(preset) {
    if (this.sending || this.plugin.assistant.busy) {
      new Notice(t(this, "助手正在回复，请稍候。"));
      return;
    }
    const question = (preset || this.inputEl.value).trim();
    if (!question) return;
    const activeFile = this.app.workspace.getActiveViewOfType(MarkdownView)?.file || this.plugin.lastNoteFile;
    this.sending = true;
    this.sendButton.disabled = true;
    this.refreshButton.disabled = true;
    this.inputEl.disabled = true;
    this.setStatus("正在读取笔记与本地记忆…");
    try {
      const answer = await this.plugin.assistant.talk(question, activeFile?.path, context => {
        if (this.closed) return;
        this.setStatus(`正在回复 · 已读取 ${context.sources.length}/${context.total} 篇笔记` +
          (context.truncated ? " · 内容已截取" : ""));
      });
      if (this.closed) return;
      if (!preset) this.inputEl.value = "";
      await this.loadLocal();
      this.scrollEl.scrollTop = this.scrollEl.scrollHeight;
      this.setStatus(answer.storageWarning || (answer.context.truncated
        ? `本次读取 ${answer.context.sources.length}/${answer.context.total} 篇笔记，内容已截取。` : ""));
    } catch (error) {
      if (!this.closed) this.setStatus(error.message);
      new Notice(t(this, error.message));
    } finally {
      this.sending = false;
      if (!this.closed) {
        this.sendButton.disabled = false;
        this.refreshButton.disabled = false;
        this.inputEl.disabled = false;
        this.inputEl.focus();
      }
    }
  }

  async onClose() {
    this.closed = true;
    this.clearRenderers();
  }

  setStatus(message) { this.statusEl?.setText(t(this, message)); }
}

class CompanionSettings extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl, plugin } = this;
    const settings = plugin.settings;
    plugin.settingsContainer = containerEl;
    containerEl.empty();
    containerEl.addClass("nc-settings");
    containerEl.removeClass("nc-show-help");
    containerEl.createEl("h2", { text: "笔记伴侣" });
    new Setting(containerEl).setName("语言 / Language")
      .addDropdown(dropdown => dropdown.addOptions({ zh: "中文", en: "English" })
        .setValue(settings.language).onChange(async value => {
          try { await plugin.setLanguage(value); }
          catch (error) { dropdown.setValue(settings.language); new Notice(t(this, error.message)); }
        }));
    const helpButton = containerEl.createEl("button", {
      text: "帮助", attr: { "aria-expanded": "false", "aria-label": "显示或隐藏设置说明" }
    });
    helpButton.addEventListener("click", () => {
      const showHelp = !containerEl.hasClass("nc-show-help");
      containerEl.toggleClass("nc-show-help", showHelp);
      helpButton.setAttribute("aria-expanded", String(showHelp));
    });
    containerEl.createEl("h3", { text: "图片管理" });
    this.folderSetting("图片保存目录", "图片按粘贴目标文件的名称命名，例如 测试.canvas → 测试-01.png，并保存到此目录。", "imageFolder");
    new Setting(containerEl).setName("粘贴图片自动命名")
      .setDesc("处理剪贴板中的图片文件，保留原始格式。")
      .addToggle(toggle => toggle.setValue(settings.renameImages).onChange(async value => {
        settings.renameImages = value;
        await plugin.saveSettings();
      }));
    new Setting(containerEl).setName("移除图片引用后清理文件")
      .setDesc("笔记保存约 3 秒后检查。仅处理图片保存目录，其他笔记仍有引用时保留，删除目标为笔记库 .trash。删除笔记时也检查其图片。")
      .addToggle(toggle => toggle.setValue(settings.cleanupImages).onChange(async value => {
        settings.cleanupImages = value;
        await plugin.saveSettings();
        await plugin.enqueue(() => plugin.images.initialize());
      }));
    new Setting(containerEl).setName("左侧图片列表")
      .addDropdown(dropdown => dropdown.addOptions({ none: "全部显示", images: "隐藏目录下的图片文件", folder: "隐藏整个图片目录" })
        .setValue(settings.hideMode).onChange(async value => {
          settings.hideMode = value;
          await plugin.saveSettings();
        }));
    const colors = new Setting(containerEl).setName("按后缀设置文件名颜色")
      .setDesc("每行一条，例如 pdf=#e06c75。留空可关闭配色。");
    let colorInput;
    colors.addTextArea(input => {
      colorInput = input;
      input.setValue(settings.extensionColors);
      input.inputEl.rows = 5;
    }).addButton(button => button.setButtonText("保存规则").onClick(async () => {
      try {
        colorRules(colorInput.getValue());
        settings.extensionColors = colorInput.getValue();
        await plugin.saveSettings();
        new Notice(t(this, "颜色规则已保存。"));
      } catch (error) { new Notice(t(this, error.message)); }
    }));

    containerEl.createEl("h3", { text: "日志与 AI 助手" });
    this.folderSetting("助手文件夹", "记忆、进展、每日日志和接口配置都保存为 Markdown。切换路径后从新目录读取，原目录内容保留。", "assistantFolder");
    new Setting(containerEl).setName("接口配置")
      .setDesc("在助手目录的 配置.md 中填写 baseUrl、apiKey 和 model，支持兼容 OpenAI 的 Chat Completions 接口。")
      .addButton(button => button.setButtonText("打开配置.md").onClick(() => plugin.openAssistantFile("配置.md")));
    new Setting(containerEl).setName("助手可读取的笔记范围")
      .addDropdown(dropdown => dropdown.addOptions({ all: "整个笔记库", current: "当前笔记", folders: "指定文件夹" })
        .setValue(settings.aiScope).onChange(async value => {
          settings.aiScope = value;
          await plugin.saveSettings();
        }));
    const folders = new Setting(containerEl).setName("可读取的文件夹")
      .setDesc("选择指定文件夹时生效，每行一个笔记库内的路径，包含其子目录。");
    let foldersInput;
    folders.addTextArea(input => {
      foldersInput = input;
      input.setValue(settings.aiFolders);
      input.inputEl.rows = 3;
    }).addButton(button => button.setButtonText("保存范围").onClick(async () => {
      try {
        const value = foldersInput.getValue();
        for (const folder of value.split(/\r?\n/).filter(line => line.trim())) vaultFolder(folder);
        settings.aiFolders = value;
        await plugin.saveSettings();
        new Notice(t(this, "读取范围已保存。"));
      } catch (error) { new Notice(t(this, error.message)); }
    }));
    new Setting(containerEl).setName("单次笔记内容上限")
      .setDesc("按字符计算，优先当前和最近更新的笔记。默认 40000，范围 4000—200000。历史与记忆另外附加，面板显示实际读取范围。")
      .addText(input => input.setValue(String(settings.contextLimit)).onChange(async value => {
        const number = Number(value);
        if (Number.isInteger(number) && number >= 4000 && number <= 200000) {
          settings.contextLimit = number;
          await plugin.saveSettings();
        }
      }));
    new Setting(containerEl).setName("打开助手")
      .addButton(button => button.setButtonText("打开侧边栏").setCta().onClick(() => plugin.openAssistant()));
    bindUi(containerEl, this);
  }

  folderSetting(name, description, key) {
    const setting = new Setting(this.containerEl).setName(name).setDesc(description);
    let input;
    setting.addText(component => {
      input = component;
      component.setValue(this.plugin.settings[key]);
    }).addButton(button => button.setButtonText("保存目录").onClick(async () => {
      try {
        if (this.plugin.assistant.busy) throw new Error("请等助手回复完成后再切换目录。");
        const value = vaultFolder(input.getValue());
        const next = { ...this.plugin.settings, [key]: value };
        validateFolders(next.imageFolder, next.assistantFolder);
        this.plugin.settings[key] = value;
        await this.plugin.saveSettings();
        if (key === "imageFolder") await this.plugin.enqueue(() => this.plugin.images.initialize());
        if (key === "assistantFolder") {
          for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
            await leaf.view.onClose();
            await leaf.view.onOpen();
          }
        }
        new Notice(t(this, "目录设置已保存。"));
      } catch (error) { new Notice(t(this, error.message)); }
    }));
  }
}

module.exports = NoteCompanion;
