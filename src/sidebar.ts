import { ItemView, WorkspaceLeaf, MarkdownView, Editor, setIcon, Notice, TFile } from "obsidian";
import type BlockcraftPlugin from "./main";
import { parseBlocks } from "./blocks";

export const VIEW_TYPE = "blockcraft-panel";
type Tab = "insert" | "format" | "style" | "info";
export const CURSOR = "‸"; // marks where the caret lands after an insert

export interface Tile { label: string; icon: string; md: string }
export interface Section { title?: string; tiles: Tile[] }

const CARD = (variant: string, title: string) => `> [!card${variant}] ${title}\n> ${CURSOR}`;
export const INSERT: Section[] = [
  { tiles: [
    { label: "Table", icon: "table", md: `| ${CURSOR}Column | Column |\n| ------ | ------ |\n|        |        |` },
    { label: "Smart Link", icon: "link", md: `[[${CURSOR}]]` },
    { label: "Code Block", icon: "code", md: "```\n" + CURSOR + "\n```" },
    { label: "Formula", icon: "sigma", md: `$$\n${CURSOR}\n$$` },
    { label: "Mermaid", icon: "workflow", md: "```mermaid\ngraph TD\n  A[Start] --> B[End]\n```" },
    { label: "Callout", icon: "message-square", md: `> [!note] ${CURSOR}Title\n> Text` },
  ] },
  { title: "Nested content", tiles: [
    { label: "Card", icon: "square", md: CARD("", "Title") },
    { label: "Raised card", icon: "layout-template", md: CARD("|raised", "Title") },
    { label: "Accent card", icon: "app-window", md: CARD("|accent", "Title") },
    { label: "Columns", icon: "columns-2", md: "> [!columns]\n> > [!card] Left\n> > Text\n>\n> > [!card] Right\n> > Text" },
    { label: "Page", icon: "file-text", md: `![[${CURSOR}]]` },
  ] },
  { title: "Separators", tiles: [
    { label: "Divider", icon: "ellipsis", md: "---" },
    { label: "Page break", icon: "separator-horizontal", md: '<div style="page-break-after: always"></div>' },
  ] },
  { title: "Lists", tiles: [
    { label: "Task", icon: "square-check", md: `- [ ] ${CURSOR}` },
    { label: "Bullets", icon: "list", md: `- ${CURSOR}` },
    { label: "Numbered", icon: "list-ordered", md: `1. ${CURSOR}` },
    { label: "Quote", icon: "text-quote", md: `> ${CURSOR}` },
  ] },
  { title: "Media", tiles: [
    { label: "Image", icon: "image", md: `![[${CURSOR}]]` },
    { label: "File", icon: "paperclip", md: `![[${CURSOR}]]` },
    { label: "Web image", icon: "globe", md: `![](${CURSOR}https://)` },
  ] },
];

export const TINTS: Record<string, [string, string]> = {
  sky: ["Sky", "rgba(120,170,225,0.35)"], mint: ["Mint", "rgba(110,200,170,0.32)"],
  peach: ["Peach", "rgba(240,160,120,0.32)"], lilac: ["Lilac", "rgba(170,140,230,0.32)"],
  rose: ["Rose", "rgba(235,130,160,0.30)"], none: ["None", "rgba(0,0,0,0)"],
};
export const FONTS: Record<string, [string, string]> = {
  system: ["System", '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif'],
  serif: ["Serif", '"New York", "Iowan Old Style", Georgia, serif'],
  rounded: ["Rounded", '"SF Pro Rounded", ui-rounded, -apple-system, sans-serif'],
  mono: ["Mono", '"SF Mono", ui-monospace, Menlo, monospace'],
};

export interface PanelSettings { tint: string; font: string; wide: boolean; oled: boolean; autoOpen: boolean; prevTheme?: string; tab: Tab }
export const DEFAULT_SETTINGS: PanelSettings = { tint: "sky", font: "system", wide: false, oled: false, autoOpen: true, tab: "insert" };

export function applyPanelSettings(s: PanelSettings) {
  const b = document.body.style;
  b.setProperty("--bc-header-tint", (TINTS[s.tint] ?? TINTS.sky)[1]);
  b.setProperty("--font-text", (FONTS[s.font] ?? FONTS.system)[1]);
  document.body.classList.toggle("blockcraft-oled", !!s.oled);
  if (s.wide) b.setProperty("--file-line-width", "960px"); else b.removeProperty("--file-line-width");
}
export function clearPanelSettings() {
  const b = document.body.style;
  document.body.classList.remove("blockcraft-oled");
  for (const k of ["--bc-header-tint", "--font-text", "--file-line-width"]) b.removeProperty(k);
}

export class BlockcraftView extends ItemView {
  private lastMd: MarkdownView | null = null;
  private body!: HTMLElement;

  constructor(leaf: WorkspaceLeaf, private plugin: BlockcraftPlugin) { super(leaf); }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Blockcraft"; }
  getIcon() { return "layout-grid"; }

  async onOpen() {
    this.contentEl.addClass("blockcraft-panel");
    this.lastMd = this.app.workspace.getActiveViewOfType(MarkdownView);
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      if (leaf?.view instanceof MarkdownView) { this.lastMd = leaf.view; if (this.plugin.settings.tab === "info") this.render(); }
    }));
    this.render();
  }

  private get editor(): Editor | null {
    const v = this.lastMd && this.lastMd.leaf.view === this.lastMd ? this.lastMd : this.app.workspace.getActiveViewOfType(MarkdownView);
    return v?.editor ?? null;
  }
  private need(): Editor | null { const e = this.editor; if (!e) new Notice("Open a note first"); return e; }

  /* ---------- UI ---------- */
  refresh() { this.render(); }
  private render() {
    const el = this.contentEl; el.empty();
    const tabs = el.createDiv("bc-tabs");
    (["insert", "format", "style", "info"] as Tab[]).forEach((t) => {
      const b = tabs.createDiv({ cls: "bc-tab" + (this.plugin.settings.tab === t ? " is-active" : ""), text: t[0].toUpperCase() + t.slice(1) });
      b.onclick = () => { this.plugin.settings.tab = t; void this.plugin.saveSettings(); this.render(); };
    });
    this.body = el.createDiv("bc-body");
    ({ insert: () => this.renderInsert(), format: () => this.renderFormat(), style: () => this.renderStyle(), info: () => this.renderInfo() })[this.plugin.settings.tab]();
  }

  private renderInsert() {
    for (const sec of INSERT) {
      if (sec.title) this.body.createDiv({ cls: "bc-section", text: sec.title });
      const grid = this.body.createDiv("bc-grid");
      for (const t of sec.tiles) {
        const tile = grid.createDiv("bc-tile");
        const ico = tile.createDiv("bc-tile-icon"); setIcon(ico, t.icon);
        tile.createDiv({ cls: "bc-tile-label", text: t.label });
        tile.onclick = () => this.insertBlock(t.md);
      }
    }
  }

  private btn(parent: HTMLElement, label: string, icon: string | null, fn: () => void, cls = "") {
    const b = parent.createDiv({ cls: "bc-btn " + cls });
    if (icon) { const i = b.createSpan("bc-btn-icon"); setIcon(i, icon); }
    if (label) b.createSpan({ text: label });
    b.onclick = fn; return b;
  }

  private renderFormat() {
    const b = this.body;
    b.createDiv({ cls: "bc-section", text: "Text style" });
    const styles: [string, number][] = [["Title", 1], ["Heading", 2], ["Subheading", 3], ["Strong", 4], ["Body", 0]];
    const col = b.createDiv("bc-stack");
    for (const [label, level] of styles) this.btn(col, label, null, () => this.setHeading(level), "bc-wide bc-h" + level);
    b.createDiv({ cls: "bc-section", text: "Inline" });
    const row = b.createDiv("bc-row");
    this.btn(row, "", "bold", () => this.wrap("**"), "bc-sq");
    this.btn(row, "", "italic", () => this.wrap("*"), "bc-sq");
    this.btn(row, "", "strikethrough", () => this.wrap("~~"), "bc-sq");
    this.btn(row, "", "highlighter", () => this.wrap("=="), "bc-sq");
    this.btn(row, "", "code", () => this.wrap("`"), "bc-sq");
    this.btn(row, "", "link", () => this.link(), "bc-sq");
    b.createDiv({ cls: "bc-section", text: "Lists & blocks" });
    const row2 = b.createDiv("bc-row");
    this.btn(row2, "", "list", () => this.prefixLines("- "), "bc-sq");
    this.btn(row2, "", "list-ordered", () => this.prefixLines("1. "), "bc-sq");
    this.btn(row2, "", "square-check", () => this.prefixLines("- [ ] "), "bc-sq");
    this.btn(row2, "", "text-quote", () => this.prefixLines("> "), "bc-sq");
    this.btn(row2, "", "indent-increase", () => this.indent(1), "bc-sq");
    this.btn(row2, "", "indent-decrease", () => this.indent(-1), "bc-sq");
  }

  private renderStyle() {
    const s = this.plugin.settings; const b = this.body;
    const save = () => { applyPanelSettings(s); void this.plugin.saveSettings(); this.render(); };
    b.createDiv({ cls: "bc-section", text: "Header colour" });
    const sw = b.createDiv("bc-row bc-swatches");
    for (const [k, [name, col]] of Object.entries(TINTS)) {
      const d = sw.createDiv({ cls: "bc-swatch" + (s.tint === k ? " is-active" : ""), attr: { title: name } });
      d.style.background = k === "none" ? "var(--background-secondary)" : col.replace(/[\d.]+\)$/, "0.8)");
      d.onclick = () => { s.tint = k; save(); };
    }
    b.createDiv({ cls: "bc-section", text: "Font" });
    const fonts = b.createDiv("bc-stack");
    for (const [k, [name, fam]] of Object.entries(FONTS)) {
      const f = this.btn(fonts, name, null, () => { s.font = k; save(); }, "bc-wide" + (s.font === k ? " is-active" : ""));
      f.style.fontFamily = fam;
    }
    b.createDiv({ cls: "bc-section", text: "Appearance" });
    const oled = this.btn(b, "OLED black mode", "moon", () => { void this.plugin.setOled(!s.oled).then(() => this.render()); }, "bc-wide" + (s.oled ? " is-active" : ""));
    oled.setAttr("title", "Pure-black app (switches Obsidian to dark). Also in Settings -> Blockcraft.");
    b.createDiv({ cls: "bc-section", text: "Page" });
    const wide = this.btn(b, "Wide page", null, () => { s.wide = !s.wide; save(); }, "bc-wide" + (s.wide ? " is-active" : ""));
    wide.setAttr("title", "Use a wider text column");
  }

  private renderInfo() {
    const ed = this.editor; const b = this.body;
    if (!ed) { b.createDiv({ cls: "bc-empty", text: "Open a note to see its info." }); return; }
    const text = ed.getValue();
    const words = (text.match(/\S+/g) ?? []).length;
    const blocks = parseBlocks(text.split("\n")).filter((x) => x.type !== "frontmatter").length;
    const file: TFile | null = this.lastMd?.file ?? null;
    const rows: [string, string][] = [
      ["Words", String(words)], ["Characters", String(text.length)], ["Blocks", String(blocks)],
      ["Reading time", `${Math.max(1, Math.round(words / 220))} min`],
    ];
    if (file) {
      rows.push(["Created", new Date(file.stat.ctime).toLocaleString()], ["Modified", new Date(file.stat.mtime).toLocaleString()]);
      const bl = (this.app.metadataCache as any).getBacklinksForFile?.(file)?.count?.() ?? 0;
      rows.push(["Backlinks", String(bl)]);
    }
    const card = b.createDiv("bc-info");
    for (const [k, v] of rows) { const r = card.createDiv("bc-info-row"); r.createSpan({ text: k }); r.createSpan({ cls: "bc-info-val", text: v }); }
  }

  /* ---------- editor actions ---------- */
  private insertBlock(md: string) { const ed = this.need(); if (ed) insertBlockMd(ed, md); }
  private setHeading(level: number) {
    const ed = this.need(); if (!ed) return;
    const ln = ed.getCursor().line; const line = ed.getLine(ln).replace(/^#{1,6}\s+/, "");
    ed.setLine(ln, (level ? "#".repeat(level) + " " : "") + line); ed.focus();
  }
  private wrap(m: string) {
    const ed = this.need(); if (!ed) return;
    const sel = ed.getSelection();
    if (sel) ed.replaceSelection(`${m}${sel}${m}`);
    else { const c = ed.getCursor(); ed.replaceRange(m + m, c); ed.setCursor({ line: c.line, ch: c.ch + m.length }); }
    ed.focus();
  }
  private link() {
    const ed = this.need(); if (!ed) return;
    const sel = ed.getSelection(); ed.replaceSelection(`[${sel || "text"}](https://)`); ed.focus();
  }
  private prefixLines(p: string) {
    const ed = this.need(); if (!ed) return;
    const a = ed.getCursor("from").line, z = ed.getCursor("to").line;
    const all = []; for (let i = a; i <= z; i++) all.push(ed.getLine(i));
    const has = all.every((l) => l.startsWith(p));
    for (let i = a; i <= z; i++) ed.setLine(i, has ? ed.getLine(i).slice(p.length) : p + ed.getLine(i));
    ed.focus();
  }
  private indent(dir: number) {
    const ed = this.need(); if (!ed) return;
    const a = ed.getCursor("from").line, z = ed.getCursor("to").line;
    for (let i = a; i <= z; i++) { const l = ed.getLine(i); ed.setLine(i, dir > 0 ? "\t" + l : l.replace(/^(\t| {1,4})/, "")); }
    ed.focus();
  }
}

/** Insert Markdown after the block under the cursor (or in place if the cursor line is blank). `\u2038` marks the caret. */
export function insertBlockMd(ed: Editor, md: string) {
  const caret = md.indexOf(CURSOR);
  const text = md.replace(CURSOR, "");
  const lines = ed.getValue().split("\n");
  const cur = ed.getCursor().line;
  const blocks = parseBlocks(lines);
  const b = blocks.find((x) => cur >= x.from && cur <= x.to);
  let offset: number, prefix: string;
  if (b) { offset = ed.posToOffset({ line: b.to, ch: lines[b.to].length }); prefix = "\n\n"; }
  else { offset = ed.posToOffset({ line: cur, ch: lines[cur]?.length ?? 0 }); prefix = lines[cur]?.trim() ? "\n\n" : ""; }
  const at = ed.offsetToPos(offset);
  ed.replaceRange(prefix + text + "\n", at);
  ed.setCursor(ed.offsetToPos(offset + prefix.length + (caret >= 0 ? caret : text.length)));
  ed.focus();
}
