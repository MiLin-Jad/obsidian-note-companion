"use strict";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"]);

function vaultFolder(value) {
  const path = String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = path.split("/");
  if (!path || path.startsWith("/") || /[:\x00-\x1f]/.test(path) ||
      parts.some(part => !part || part === "." || part === ".." || part.startsWith("."))) {
    throw new Error("请输入笔记库内的相对文件夹路径，例如 附件/图片。路径不能包含隐藏目录或 ..。");
  }
  return path;
}

function isWithin(path, folder) {
  return path === folder || path.startsWith(folder + "/");
}

function validateFolders(images, assistant) {
  const imageFolder = vaultFolder(images);
  const assistantFolder = vaultFolder(assistant);
  if (isWithin(imageFolder, assistantFolder) || isWithin(assistantFolder, imageFolder)) {
    throw new Error("图片目录和 AI 助手目录需要分开，不能互相包含。");
  }
  return { imageFolder, assistantFolder };
}

function isImage(path) {
  return IMAGE_EXTENSIONS.has(path.split(".").pop().toLowerCase());
}

function nextImagePath(folder, extension, existingPaths, sourcePath) {
  const filename = sourcePath.split("/").pop();
  const dot = filename.lastIndexOf(".");
  const prefix = dot > 0 ? filename.slice(0, dot) : filename;
  // 所有图片后缀共用序号，删除旧图片后也不会把新图片插入现有序列中间。
  let maximum = 0;
  for (const path of existingPaths) {
    if (path.slice(0, path.lastIndexOf("/")) !== folder || !isImage(path)) continue;
    const stem = path.slice(path.lastIndexOf("/") + 1, path.lastIndexOf("."));
    if (!stem.startsWith(prefix + "-")) continue;
    const suffix = stem.slice(prefix.length + 1);
    if (/^\d+$/.test(suffix)) maximum = Math.max(maximum, Number(suffix));
  }
  return `${folder}/${prefix}-${String(maximum + 1).padStart(2, "0")}.${extension.toLowerCase()}`;
}

function cleanLink(value) {
  let target = value.trim();
  if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
  if (!target || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target)) return null;
  target = target.split("|")[0].split("#")[0];
  try { target = decodeURIComponent(target); } catch (_) { /* 保留未编码路径。 */ }
  return target.replace(/\\([ ()])/g, "$1");
}

function extractLinks(text) {
  const links = new Set();
  const add = value => { const link = cleanLink(value); if (link) links.add(link); };
  // 扫描全文也会保留代码块中的引用，清理时优先保留可能仍有用途的文件。
  for (const match of text.matchAll(/!?\[\[([^\]\n]+)\]\]/g)) add(match[1]);
  for (const match of text.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|(?:\\.|[^\s()\\]|\([^()]*\))+)\s*(?:["'][^\n]*?["'])?\s*\)/g)) add(match[1]);
  for (const match of text.matchAll(/^\s*\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)/gm)) add(match[1]);
  for (const match of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) add(match[1]);
  return links;
}

function sourceLinks(path, text) {
  const links = extractLinks(text);
  if (path.endsWith(".canvas")) {
    const canvas = JSON.parse(text);
    for (const node of canvas.nodes || []) {
      if (typeof node.file === "string") links.add(node.file);
      if (node.type === "group" && typeof node.background === "string") links.add(node.background);
      if (typeof node.text === "string") for (const link of extractLinks(node.text)) links.add(link);
    }
  }
  return links;
}

function colorRules(text) {
  const rules = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = line.trim().match(/^\.?([\w-]+)\s*[=＝]\s*(#[a-f\d]{6}|#[a-f\d]{3})$/i);
    if (!match) throw new Error("颜色规则每行填写 后缀=#颜色，例如 pdf=#e06c75。");
    rules.push({ extension: match[1].toLowerCase(), color: match[2] });
  }
  return rules;
}

function completionUrl(value) {
  const url = new URL(String(value).trim());
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("API 地址需要是 HTTP 或 HTTPS 地址，密钥请填写在 apiKey 字段。");
  }
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/chat/completions") ? path : path + "/chat/completions";
  return url.toString();
}

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseAnswer(content) {
  const plain = String(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const result = JSON.parse(plain);
    if (typeof result.reply !== "string" || !result.reply.trim()) throw new Error("缺少回复");
    const progress = {};
    for (const key of ["done", "pending", "next", "blocked"]) {
      progress[key] = Array.isArray(result.progress?.[key])
        ? result.progress[key].filter(item => typeof item === "string").slice(0, 30) : [];
    }
    return {
      reply: result.reply,
      progress,
      memories: Array.isArray(result.memories)
        ? result.memories.filter(item => typeof item === "string").slice(0, 10) : []
    };
  } catch (_) {
    // 兼容未遵守 JSON 格式的模型，保留回答和对话记录，不据此更新长期记忆。
    return { reply: String(content), progress: null, memories: [] };
  }
}

function redact(text, secret) {
  return secret ? String(text).split(secret).join("[已隐藏密钥]") : String(text);
}

module.exports = {
  IMAGE_EXTENSIONS, vaultFolder, isWithin, validateFolders, isImage, nextImagePath,
  extractLinks, sourceLinks, colorRules, completionUrl, localDate, parseAnswer, redact
};
