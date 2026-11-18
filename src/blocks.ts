// Pure block-boundary parser + safe move. No Obsidian/CodeMirror imports (unit-testable in Node).
// A block is a run of whole lines: { from, to } are inclusive 0-based line indices.

export type BlockType =
  | "frontmatter" | "code" | "math" | "comment" | "heading" | "hr" | "quote" | "callout"
  | "table" | "list" | "footnote" | "html" | "indented-code" | "paragraph";

export interface Block { from: number; to: number; type: BlockType }
export interface TextChange { from: number; to: number; insert: string }

const RE = {
  fence: /^(\s{0,3})(`{3,}|~{3,})/,
  listItem: /^(\s*)([-*+]|\d{1,9}[.)])\s/,
  table: /^\s*\|.*\|?\s*$/,
  tableSep: /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/,
  quote: /^\s{0,3}>/,
  callout: /^\s{0,3}>\s*\[!/,
  heading: /^#{1,6}\s/,
  hr: /^\s{0,3}([-*_])(\s*\1){2,}\s*$/,
  footnote: /^\[\^[^\]]+\]:/,
  blockId: /^\^[A-Za-z0-9-]+\s*$/,
  mathOpen: /^\s*\$\$/,
  htmlOpen: /^\s{0,3}<([A-Za-z][\w-]*)(\s|>|$)/,
};
const blank = (l: string) => l.trim() === "";
const countComments = (l: string) => (l.match(/%%/g) || []).length;

export function parseBlocks(lines: string[]): Block[] {
  const out: Block[] = [];
  const n = lines.length;
  let i = 0;

  if (n && lines[0].trim() === "---") {
    for (let j = 1; j < n; j++) {
      if (lines[j].trim() === "---" || lines[j].trim() === "...") {
        out.push({ from: 0, to: j, type: "frontmatter" });
        i = j + 1;
        break;
      }
    }
  }

  while (i < n) {
    if (blank(lines[i])) { i++; continue; }
    const start = i;
    const l = lines[i];
    let type: BlockType;
    let end: number;
    let m: RegExpExecArray | null;

    if ((m = RE.fence.exec(l))) {
      type = "code";
      const ch = m[2][0], len = m[2].length;
      const close = new RegExp(`^\\s{0,3}\\${ch}{${len},}\\s*$`);
      end = n - 1;
      for (let j = i + 1; j < n; j++) if (close.test(lines[j])) { end = j; break; }
    } else if (RE.mathOpen.test(l)) {
      type = "math";
      end = i;
      if (!(l.trim().length > 2 && l.trim().endsWith("$$"))) {
        end = n - 1;
        for (let j = i + 1; j < n; j++) if (lines[j].includes("$$")) { end = j; break; }
      }
    } else if (countComments(l) % 2 === 1) {
      type = "comment"; end = n - 1;
      for (let j = i + 1; j < n; j++) if (lines[j].includes("%%")) { end = j; break; }
    } else if (RE.heading.test(l)) { type = "heading"; end = i; }
    else if (RE.hr.test(l) && !RE.listItem.test(l)) { type = "hr"; end = i; }
    else if (RE.quote.test(l)) {
      type = RE.callout.test(l) ? "callout" : "quote";
      end = i;
      while (end + 1 < n && RE.quote.test(lines[end + 1])) end++;
    } else if (RE.table.test(l) && i + 1 < n && RE.tableSep.test(lines[i + 1])) {
      type = "table"; end = i;
      while (end + 1 < n && !blank(lines[end + 1]) && RE.table.test(lines[end + 1])) end++;
    } else if (RE.listItem.test(l)) {
      type = "list"; end = i;
      for (;;) {
        let j = end + 1;
        while (j < n && blank(lines[j])) j++;
        if (j >= n) break;
        const nx = lines[j];
        if (RE.listItem.test(nx) || /^(\s{2,}|\t)/.test(nx)) { end = j; continue; }
        if (j === end + 1 && !RE.heading.test(nx) && !RE.quote.test(nx) && !RE.fence.test(nx) && !RE.table.test(nx) && !RE.hr.test(nx)) { end = j; continue; }
        break;
      }
    } else if (RE.footnote.test(l)) {
      type = "footnote"; end = i;
      while (end + 1 < n && !blank(lines[end + 1]) && /^\s{2,}/.test(lines[end + 1])) end++;
    } else if ((m = RE.htmlOpen.exec(l))) {
      type = "html"; end = i;
      const closeRe = new RegExp(`</${m[1]}>\\s*$`);
      if (!closeRe.test(l)) {
        end = n - 1;
        for (let j = i + 1; j < n; j++) if (closeRe.test(lines[j])) { end = j; break; }
      }
    } else if (/^( {4}|\t)/.test(l)) {
      type = "indented-code"; end = i;
      while (end + 1 < n && (/^( {4}|\t)/.test(lines[end + 1]) || (blank(lines[end + 1]) && end + 2 < n && /^( {4}|\t)/.test(lines[end + 2])))) end++;
    } else {
      type = "paragraph"; end = i;
      while (end + 1 < n && !blank(lines[end + 1]) && !RE.heading.test(lines[end + 1]) && !RE.fence.test(lines[end + 1]) &&
             !RE.quote.test(lines[end + 1]) && !RE.listItem.test(lines[end + 1]) && !RE.hr.test(lines[end + 1])) end++;
    }

    if (end + 1 < n && RE.blockId.test(lines[end + 1])) end++;
    else if (RE.blockId.test(l) && out.length && type === "paragraph" && start === end) {
      out[out.length - 1].to = end; i = end + 1; continue;
    }

    out.push({ from: start, to: end, type });
    i = end + 1;
  }
  return out;
}

/** Text after moving block `idx` so it sits before block `target` (target === blocks.length → end). */
export function moveBlockText(text: string, blocks: Block[], idx: number, target: number): string {
  if (target === idx || target === idx + 1) return text;
  const lines = text.split("\n");
  const b = blocks[idx];
  const chunk = lines.slice(b.from, b.to + 1);
  const rest = lines.filter((_, k) => k < b.from || k > b.to);
  let at: number;
  if (target >= blocks.length) at = rest.length;
  else {
    const t = blocks[target];
    at = t.from > b.to ? t.from - chunk.length : t.from;
  }
  const before = rest.slice(0, at), after = rest.slice(at);
  while (before.length && blank(before[before.length - 1])) before.pop();
  while (after.length && blank(after[0])) after.shift();
  const parts: string[] = [];
  if (before.length) parts.push(before.join("\n"));
  parts.push(chunk.join("\n"));
  if (after.length) parts.push(after.join("\n"));
  return parts.join("\n\n") + (text.endsWith("\n") ? "\n" : "");
}

const signature = (text: string) =>
  parseBlocks(text.split("\n")).map((b) => `${b.type}:${b.to - b.from}`).sort().join("|");

/** Smallest single replace turning `a` into `b` (common prefix/suffix). null if equal. */
export function minimalChange(a: string, b: string): TextChange | null {
  if (a === b) return null;
  let s = 0;
  const max = Math.min(a.length, b.length);
  while (s < max && a.charCodeAt(s) === b.charCodeAt(s)) s++;
  let e = 0;
  while (e < max - s && a.charCodeAt(a.length - 1 - e) === b.charCodeAt(b.length - 1 - e)) e++;
  return { from: s, to: a.length - e, insert: b.slice(s, b.length - e) };
}

/** Simulate-then-verify move. Returns a single CM6-ready change, or null if the drop is a no-op or unsafe. */
export function planMove(text: string, blocks: Block[], idx: number, target: number): TextChange | null {
  if (blocks[idx]?.type === "frontmatter") return null;
  if (blocks[0]?.type === "frontmatter" && target <= 0) return null; // never above frontmatter
  const next = moveBlockText(text, blocks, idx, target);
  if (next === text) return null;
  if (signature(next) !== signature(text)) return null;
  return minimalChange(text, next);
}

const quote = (lines: string[]) => lines.map((l) => (l.length ? `> ${l}` : ">"));

/** Wrap whole-line block in a callout. `kind` e.g. "card". */
export function wrapLines(lines: string[], kind: string): string[] {
  return [`> [!${kind}]`, ...quote(lines)];
}

/** Wrap a block into [!columns] holding one card (a card block is nested as-is). */
export function groupIntoColumns(lines: string[]): string[] {
  const isCard = /^\s{0,3}>\s*\[!card/i.test(lines[0] ?? "");
  const inner = isCard ? lines : wrapLines(lines, "card");
  return ["> [!columns]", ...quote(inner)];
}

/** Offsets of each line start in `text` (plus end sentinel). */
export function lineStarts(text: string): number[] {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) out.push(i + 1);
  return out;
}
