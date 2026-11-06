"use strict";

function imageContent(raw) {
  const images = [];
  const add = (target, alt) => {
    images.push({ target: target.trim(), alt: alt || "" });
    return "";
  };
  let text = raw.replace(/!\[\[([^\]\n]+)\]\]/g, (_, value) => {
    const [target, ...options] = value.split("|");
    const alt = options.filter(option => !/^\d+(?:x\d+)?$/.test(option.trim())).join("|");
    return add(target, alt);
  });
  text = text.replace(/!\[([^\]\n]*)\]\(\s*(<[^>\n]+>|(?:\\.|[^\s()\\]|\([^()]*\))+)\s*(?:["'][^\n]*?["'])?\s*\)/g,
    (_, alt, target) => add(target.startsWith("<") ? target.slice(1, -1) : target, alt));
  text = text.replace(/<img\b[^>]*>/gi, tag => {
    const target = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    return target ? add(target, tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1]) : tag;
  });
  return { text: text.trim(), images };
}

function flattenTree(root) {
  const result = [];
  const visit = node => { result.push(node); for (const child of node.children) visit(child); };
  visit(root);
  return result;
}

function sourceUpdate(text, start, end, replacement) {
  const position = offset => {
    const lines = text.slice(0, offset).split(/\r?\n/);
    return { line: lines.length - 1, ch: lines[lines.length - 1].length };
  };
  return { text: text.slice(0, start) + replacement + text.slice(end), replacement,
    from: position(start), to: position(end) };
}

function insertMarkdownNodes(text, root, id, relation, values, images = false) {
  if (!Array.isArray(values) || !values.length || values.some(value => typeof value !== "string" || !value.trim() || /[\r\n]/.test(value))) {
    throw new Error("请输入单行节点内容。");
  }
  const node = flattenTree(root).find(node => node.id === id);
  if (!node) throw new Error("节点位置已失效，请刷新导图后重试。");
  const breaks = [...text.matchAll(/\r?\n/g)];
  const newline = breaks[0]?.[0] || "\n";
  const startOf = line => line <= 0 ? 0 : line > breaks.length ? text.length : breaks[line - 1].index + breaks[line - 1][0].length;
  const endOf = line => breaks[line]?.index ?? text.length;
  const insert = (line, rows) => {
    let offset = startOf(line);
    if (offset === 0 && text.startsWith("\uFEFF")) offset = 1;
    const before = offset > 0 && text[offset - 1] !== "\n" && text[offset - 1] !== "\uFEFF" ? newline : "";
    const replacement = before + rows.join(newline) + newline;
    const update = sourceUpdate(text, offset, offset, replacement);
    return { ...update, selectedLine: update.from.line + (before ? 1 : 0) };
  };
  const after = source => (source.blockEndLine ?? source.endLine) + 1;
  if (node.id === "0") {
    const headings = root.children.filter(child => child.source?.kind === "heading");
    if (images && headings.length) {
      return insert(headings[0].source.startLine, values.map(value => "- " + value));
    }
    const level = headings.length ? Math.min(...headings.map(child => child.source.level)) : 0;
    const prefix = level ? "#".repeat(level) + " " : "- ";
    return insert(breaks.length + 1, values.map(value => prefix + value));
  }
  const source = node.source;
  if (source.kind === "heading") {
    if (relation === "sibling") {
      return insert(after(source), values.map(value => "#".repeat(source.level) + " " + value));
    }
    if (images || source.level === 6) {
      return insert((source.syntaxEndLine ?? source.endLine) + 1, values.map(value => "- " + value));
    }
    return insert(after(source), values.map(value => "#".repeat(source.level + 1) + " " + value));
  }
  if (source.kind === "list") {
    let prefix;
    if (relation === "child") prefix = " ".repeat(source.contentIndent) + "- ";
    else {
      const ordered = source.marker.match(/^(\d+)([.)])$/);
      prefix = source.indentPrefix + (ordered ? String(Number(ordered[1]) + 1) + ordered[2] : source.marker) + " ";
    }
    return insert(after(source), values.map(value => prefix + value));
  }
  // 普通段落转为列表节点，保留其正文，并用缩进表达新增的父子关系。
  const raw = source.raw.split(/\r?\n/);
  const indent = raw[0].match(/^\s*/)[0];
  const parent = indent + "- " + raw[0].slice(indent.length);
  const continuation = raw.slice(1).map(line => indent + "  " + (line.startsWith(indent) ? line.slice(indent.length) : line));
  const prefix = indent + (relation === "child" ? "  - " : "- ");
  const rows = [parent, ...continuation, ...values.map(value => prefix + value)];
  let replacement = rows.join(newline);
  if (source.startLine === 0 && text.startsWith("\uFEFF")) replacement = "\uFEFF" + replacement;
  const result = sourceUpdate(text, startOf(source.startLine), endOf(source.endLine), replacement);
  return { ...result, selectedLine: source.startLine + raw.length };
}

module.exports = { imageContent, flattenTree, sourceUpdate, insertMarkdownNodes };
