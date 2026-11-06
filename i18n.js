"use strict";

const ENGLISH = {
  "新增节点无法显示，请检查原文中未闭合的代码块或节点数量限制。": "The new node cannot be displayed. Check for unclosed code fences or the node limit.",
  "子节点": "Child",
  "同级节点": "Sibling",
  "图片": "Image",
  "选择图片": "Choose images",
  "新增子节点": "Add child node",
  "新增同级节点": "Add sibling node",
  "请输入单行节点内容。": "Enter a single line of node content.",
  "请选择支持的图片格式。": "Choose a supported image format.",
  "图片已保留，请从以下位置手动插入。": "Images were preserved. Insert them manually from these locations.",
  "图片无法加载": "Image unavailable",
  "，双击或按 F2 编辑": ", double-click or press F2 to edit",
  "思维导图，右键拖动平移，双击节点编辑，Tab 新增子节点，Enter 新增同级节点": "Mind map. Right-drag to pan, double-click to edit, Tab to add a child, Enter to add a sibling.",

  "笔记伴侣": "Note Journal Companion",
  "AI 助手": "AI Assistant",
  "思维导图": "Mind map",
  "帮助": "Help",
  "打开或收起 AI 助手": "Open or hide AI Assistant",
  "将当前 Markdown 笔记转为思维导图": "Convert the current Markdown note to a mind map",
  "打开日志与 AI 助手": "Open journal and AI Assistant",
  "更新进展": "Update progress",
  "打开 AI 接口配置": "Open AI API configuration",
  "切换图片列表显示": "Toggle image visibility",
  "已显示图片列表。": "Images are now visible.",
  "已隐藏图片列表。": "Images are now hidden.",
  "操作失败，请重试。": "Operation failed. Please try again.",
  "无法打开助手侧边栏。": "Could not open the assistant sidebar.",
  "请先打开一篇 Markdown 笔记，再点击思维导图按钮。": "Open a Markdown note before clicking Mind map.",
  "请先打开一篇 Markdown 笔记，再点击右上角的思维导图按钮。": "Open a Markdown note, then click Mind map in the upper right.",
  "笔记伴侣的设置格式无效，本次使用默认设置。请在设置中核对目录。": "Plugin settings are invalid. Defaults are in use. Check the folder settings.",
  "显示或隐藏功能说明": "Show or hide help",
  "更新进展：整理已完成、待办、下一步和阻塞，点击来源可打开笔记。": "Update progress to review completed work, tasks, next steps and blockers. Click a source to open its note.",
  "聊天时读取设置范围内的笔记和本地记忆，连接你配置的 API。": "Chat uses notes within the selected scope and local memory, through your configured API.",
  "对话、记忆和进展保存到助手目录的 Markdown 文件中，支持手动编辑。AI 的写入权限仅限助手目录。": "Conversations, memory and progress are stored as editable Markdown files. AI writes are limited to the assistant folder.",
  "首次使用请打开“接口配置”。Enter 发送，Shift + Enter 换行。": "Open API configuration to get started. Enter sends a message. Shift + Enter inserts a new line.",
  "请根据笔记整理最近完成的工作、待办、现在可以推进的下一步，以及卡住的事情。": "Review the notes and summarize completed work, pending tasks, actionable next steps and blockers.",
  "请整理最近完成的工作、待办、现在可以推进的下一步，以及卡住的事情。": "Summarize recently completed work, pending tasks, actionable next steps and blockers.",
  "记忆": "Memory",
  "今日日志": "Today's journal",
  "接口配置": "API configuration",
  "最近做了什么？": "What have I done recently?",
  "接下来做什么？": "What should I do next?",
  "还有哪些待办？": "What tasks are still pending?",
  "输入消息…": "Type a message…",
  "发给 AI 助手的消息": "Message to AI Assistant",
  "发送": "Send",
  "今天的对话": "Today's conversation",
  "助手正在回复，请稍候。": "The assistant is responding. Please wait.",
  "正在读取笔记与本地记忆…": "Reading notes and local memory…",
  " · 内容已截取": " · Content truncated",
  "显示或隐藏设置说明": "Show or hide setting descriptions",
  "图片管理": "Image management",
  "图片保存目录": "Image folder",
  "图片按粘贴目标文件的名称命名，例如 测试.canvas → 测试-01.png，并保存到此目录。": "Images are named after the destination note, for example Example.canvas → Example-01.png, and saved here.",
  "粘贴图片自动命名": "Automatically name pasted images",
  "处理剪贴板中的图片文件，保留原始格式。": "Process clipboard images and preserve their original format.",
  "移除图片引用后清理文件": "Clean up images after removing references",
  "笔记保存约 3 秒后检查。仅处理图片保存目录，其他笔记仍有引用时保留，删除目标为笔记库 .trash。删除笔记时也检查其图片。": "Check about 3 seconds after saving. Clean up images in the image folder if no other note references them. Images go to the vault's .trash. Deleting a note also checks its images.",
  "左侧图片列表": "Images in the file explorer",
  "全部显示": "Show all",
  "隐藏目录下的图片文件": "Hide image files in the folder",
  "隐藏整个图片目录": "Hide the entire image folder",
  "按后缀设置文件名颜色": "File name colors by extension",
  "每行一条，例如 pdf=#e06c75。留空可关闭配色。": "One rule per line, such as pdf=#e06c75. Leave blank to disable colors.",
  "保存规则": "Save rules",
  "颜色规则已保存。": "Color rules saved.",
  "日志与 AI 助手": "Journal and AI Assistant",
  "助手文件夹": "Assistant folder",
  "记忆、进展、每日日志和接口配置都保存为 Markdown。切换路径后从新目录读取，原目录内容保留。": "Memory, progress, journals and API configuration are stored as Markdown. Changing this path selects a new folder. Existing files stay in their original folder.",
  "在助手目录的 配置.md 中填写 baseUrl、apiKey 和 model，支持兼容 OpenAI 的 Chat Completions 接口。": "Enter baseUrl, apiKey and model in 配置.md inside the assistant folder. Supports OpenAI-compatible Chat Completions APIs.",
  "打开配置.md": "Open configuration",
  "助手可读取的笔记范围": "Notes the assistant can read",
  "整个笔记库": "Entire vault",
  "当前笔记": "Current note",
  "指定文件夹": "Selected folders",
  "可读取的文件夹": "Readable folders",
  "选择指定文件夹时生效，每行一个笔记库内的路径，包含其子目录。": "Used for selected folders. Enter one vault-relative folder per line, including its subfolders.",
  "保存范围": "Save scope",
  "读取范围已保存。": "Reading scope saved.",
  "单次笔记内容上限": "Note content limit per request",
  "按字符计算，优先当前和最近更新的笔记。默认 40000，范围 4000—200000。历史与记忆另外附加，面板显示实际读取范围。": "Character limit, prioritizing the current and recently updated notes. Default 40000. Range 4000–200000. History and memory are added separately. Actual coverage appears in the panel.",
  "打开助手": "Open assistant",
  "打开侧边栏": "Open sidebar",
  "保存目录": "Save folder",
  "请等助手回复完成后再切换目录。": "Wait for the assistant to finish before changing folders.",
  "目录设置已保存。": "Folder settings saved.",
  "请先保存或关闭节点编辑，再切换语言。": "Save or close the node editor before changing the language.",
  "无法核对打开的画布，本轮图片清理已停止。": "Could not check the open canvas. Image cleanup has stopped for this pass.",
  "画布数据尚未就绪，本轮图片清理已停止。": "Canvas data is not ready. Image cleanup has stopped for this pass.",
  "笔记已切换，请回到原笔记重新粘贴图片。": "The note has changed. Return to the original note and paste the image again.",
  "当前画布版本暂不支持图片自动命名。请先将图片粘贴到 Markdown 笔记，再拖入画布。": "This Canvas version does not support automatic image naming. Paste into a Markdown note, then drag the image onto the canvas.",
  "画布已切换或关闭，请回到原画布重新粘贴图片。": "The canvas has changed or closed. Return to the original canvas and paste again.",
  "剪贴板图片为空，请重新复制原图。": "The clipboard image is empty. Copy the original image again.",
  "图片命名冲突，请重新粘贴。": "Image name conflict. Please paste again.",
  "刷新": "Refresh",
  "适应": "Fit",
  "编辑": "Edit",
  "展开": "Expand",
  "折叠": "Collapse",
  "原文": "Source",
  "放大": "Zoom in",
  "缩小": "Zoom out",
  "思维导图，双击节点编辑，点击节点后的按钮折叠，滚轮缩放，拖动平移": "Mind map. Double-click to edit, use the node button to collapse, scroll to zoom, and drag to pan.",
  "笔记思维导图": "Note mind map",
  "源文件已删除，当前显示上次生成的导图。": "The source file was deleted. Showing the last generated mind map.",
  "，双击或按 Enter 编辑": ", double-click or press Enter to edit",
  "双击编辑": "Double-click to edit",
  "修改笔记名称": "Rename note",
  "编辑节点": "Edit node",
  "保存后重命名源笔记。": "Saving renames the source note.",
  "保存后更新原 Markdown 中的对应内容。": "Saving updates the corresponding content in the source Markdown note.",
  "笔记名称，不含 .md": "Note name, without .md",
  "节点内容": "Node content",
  "已完成": "Completed",
  "取消": "Cancel",
  "重命名笔记": "Rename note",
  "保存到原文": "Save to note",
  "源笔记已切换，请重新打开节点编辑。": "The source note has changed. Reopen the node editor.",
  "源笔记已不存在。": "The source note no longer exists.",
  "原文已有新修改，请先复制这里的内容，再刷新导图后编辑。": "The note has new changes. Copy your input, refresh the mind map, then edit again.",
  "请输入有效的笔记名称，名称中不能包含路径或特殊字符。": "Enter a valid note name without paths or special characters.",
  "已有同名笔记，请换一个名称。": "A note with that name already exists. Choose another name.",
  "节点内容不能为空。": "Node content cannot be empty.",
  "节点位置已失效，请刷新导图后重试。": "The node location is no longer valid. Refresh the mind map and try again.",
  "标题和列表节点请填写单行内容。": "Use a single line for headings and list items.",
  "助手仅能写入指定目录下的 Markdown 文件。": "The assistant can only write Markdown files inside its designated folder.",
  "配置文件由你手动维护。": "The configuration file is maintained manually.",
  "助手目标位置存在同名文件夹。": "A folder already exists at the assistant's destination path.",
  "请保留 配置.md 顶部两行 ---，在其中填写接口配置。": "Keep the two --- delimiters at the top of 配置.md and enter the API configuration between them.",
  "配置.md 的格式有误，请检查双引号和缩进。": "Invalid format in 配置.md. Check quotation marks and indentation.",
  "请先在 配置.md 中填写 baseUrl、apiKey 和 model。": "Enter baseUrl, apiKey and model in 配置.md first.",
  "配置.md 中的 baseUrl 需要填写有效的 HTTP 或 HTTPS 接口地址。": "Set baseUrl in 配置.md to a valid HTTP or HTTPS API address.",
  "请先打开一篇助手目录以外的 Markdown 笔记。": "Open a Markdown note outside the assistant folder first.",
  "请先在设置中填写可读取的笔记文件夹。": "Set the readable note folders in settings first.",
  "接口等待超过 90 秒，请稍后重试。": "The API timed out after 90 seconds. Please try again later.",
  "接口未返回有效的聊天回复，请确认兼容 Chat Completions。": "The API returned no valid reply. Check Chat Completions compatibility.",
  "接口连接失败，请检查 API 地址和网络后重试。": "Could not connect to the API. Check the API address and network, then try again.",
  "请输入想聊的内容。": "Enter a message.",
  "插件已关闭，本次回复尚未写入。请重新打开后重试。": "The plugin was closed before the reply was saved. Reopen it and try again.",
  "回复已保存到日志，部分进展或记忆未写入，请检查相关文件。": "The reply was saved to the journal, but some progress or memory updates failed. Check the relevant files.",
  "请输入笔记库内的相对文件夹路径，例如 附件/图片。路径不能包含隐藏目录或 ..。": "Enter a vault-relative folder path, such as Attachments/Images. Hidden folders and .. are not allowed.",
  "图片目录和 AI 助手目录需要分开，不能互相包含。": "The image and assistant folders must be separate and cannot contain one another.",
  "颜色规则每行填写 后缀=#颜色，例如 pdf=#e06c75。": "Enter one extension=#color rule per line, such as pdf=#e06c75.",
  "API 地址需要是 HTTP 或 HTTPS 地址，密钥请填写在 apiKey 字段。": "Use an HTTP or HTTPS API address and put the key in the apiKey field.",
  "待办": "Pending",
  "可以推进": "Next steps",
  "卡住的事情": "Blockers",
  "暂无明确记录。": "No confirmed entries yet.",
  "参考笔记": "Source notes",
  "项目进展": "Project progress",
  "本次参考笔记": "Sources for this reply",
  "我": "Me",
  "助手": "Assistant",
  "无": "None",
  "，内容受长度限制已截取": ", content truncated to fit the limit",
  "笔记伴侣：{message}": "Note Journal Companion: {message}",
  "{path} 已存在同名文件。": "A file already exists at {path}.",
  "{path} 已存在同名文件夹。": "A folder already exists at {path}.",
  "笔记伴侣：{count} 张已移除引用的图片已移入笔记库回收站。": "Note Journal Companion: {count} unreferenced images moved to the vault trash.",
  "图片已保存到 {path}，笔记已切换，请手动插入。": "Image saved to {path}. The note has changed. Insert the image manually.",
  "图片已保存到 {path}，原画布已关闭，请手动拖入图片。": "Images saved to {path}. The original canvas has closed. Drag the images onto it manually.",
  "正在回复 · 已读取 {count}/{total} 篇笔记{suffix}": "Responding · Read {count}/{total} notes{suffix}",
  "本次读取 {count}/{total} 篇笔记，内容已截取。": "Read {count}/{total} notes. Content truncated.",
  "本次读取 {count}/{total} 篇笔记{suffix}。": "Read {count}/{total} notes{suffix}.",
  "笔记较长，当前显示前 {count} 个节点。": "This note is long. Showing the first {count} nodes.",
  "接口返回 HTTP {status}，请检查配置、额度和模型名称。": "The API returned HTTP {status}. Check configuration, credit and model name.",
  "本次请求未完成。{message}": "This request did not complete. {message}"
};

function languageOf(owner) {
  if (typeof owner === "string") return owner === "en" ? "en" : "zh";
  return (owner?.settings || owner?.plugin?.settings)?.language === "en" ? "en" : "zh";
}

function pattern(text) {
  const names = [];
  let expression = "";
  let previous = 0;
  for (const match of text.matchAll(/\{(\w+)\}/g)) {
    expression += text.slice(previous, match.index).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([\\s\\S]*?)";
    names.push(match[1]);
    previous = match.index + match[0].length;
  }
  expression += text.slice(previous).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { regex: new RegExp("^" + expression + "$"), names };
}

const REVERSE = new Map(Object.entries(ENGLISH).map(([zh, en]) => [en, zh]));
// 更具体的模板优先于包含整条消息的通用前缀模板。
const TEMPLATES = Object.entries(ENGLISH).filter(([key]) => key.includes("{"))
  .sort((a, b) => b[0].replace(/\{\w+\}/g, "").length - a[0].replace(/\{\w+\}/g, "").length)
  .map(([zh, en]) => ({ zh, en, zhPattern: pattern(zh), enPattern: pattern(en) }));

function t(owner, message) {
  const text = String(message ?? "");
  const language = languageOf(owner);
  if (language === "en" && Object.hasOwn(ENGLISH, text)) return ENGLISH[text];
  if (language === "zh" && REVERSE.has(text)) return REVERSE.get(text);
  for (const template of TEMPLATES) {
    const source = language === "en" ? template.zhPattern : template.enPattern;
    const match = text.match(source.regex);
    if (!match) continue;
    const values = Object.fromEntries(source.names.map((name, index) => [name, match[index + 1]]));
    const target = language === "en" ? template.en : template.zh;
    return target.replace(/\{(\w+)\}/g, (_, name) => {
      if (name === "message" || name === "suffix") return t(owner, values[name]);
      return values[name];
    });
  }
  return text;
}

const TEXT_BINDINGS = new WeakMap();
const ATTRIBUTE_BINDINGS = new WeakMap();

function bindUi(root, owner) {
  if (!root) return;
  const visit = node => {
    if (node.nodeType === 3) {
      const text = node.textContent;
      const key = text.trim();
      if (Object.hasOwn(ENGLISH, key) && !key.includes("{")) {
        TEXT_BINDINGS.set(node, { key, before: text.match(/^\s*/)[0], after: text.match(/\s*$/)[0] });
      }
      return;
    }
    if (node.nodeType !== 1 || node.matches("input, textarea, .nc-map-title")) return;
    const attributes = new Map();
    for (const name of ["aria-label", "placeholder", "title"]) {
      const value = node.getAttribute(name);
      if (value && Object.hasOwn(ENGLISH, value)) attributes.set(name, value);
    }
    if (attributes.size) ATTRIBUTE_BINDINGS.set(node, attributes);
    for (const child of node.childNodes) visit(child);
  };
  visit(root);
  // 输入框只绑定界面属性，绝不翻译其 value。
  for (const element of root.querySelectorAll?.("input, textarea") || []) {
    const attributes = new Map();
    for (const name of ["aria-label", "placeholder"]) {
      const value = element.getAttribute(name);
      if (value && Object.hasOwn(ENGLISH, value)) attributes.set(name, value);
    }
    if (attributes.size) ATTRIBUTE_BINDINGS.set(element, attributes);
  }
  refreshUi(root, owner);
}

function refreshUi(root, owner) {
  if (!root) return;
  const visit = node => {
    const binding = TEXT_BINDINGS.get(node);
    if (binding) node.textContent = binding.before + t(owner, binding.key) + binding.after;
    const attributes = ATTRIBUTE_BINDINGS.get(node);
    if (attributes) for (const [name, key] of attributes) node.setAttribute(name, t(owner, key));
    // 仅更新已登记的界面节点，笔记正文和导图内容从不在此处登记。
    for (const child of node.childNodes || []) visit(child);
  };
  visit(root);
}

module.exports = { t, languageOf, bindUi, refreshUi, ENGLISH };
