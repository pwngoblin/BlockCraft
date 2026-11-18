import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile, setIcon } from "obsidian";
import { INSERT, CURSOR, insertBlockMd } from "./sidebar";
import { parseBlocks } from "./blocks";

interface Cmd { label: string; icon: string; group: string; keys: string; run: (ed: Editor) => void }

const pad = (n: number) => String(n).padStart(2, "0");
const now = () => new Date();
const fmtDate = () => { const d = now(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtTime = () => { const d = now(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** Replace the (now empty) trigger line content with `text`, caret at end or at CURSOR. */
function setLine(ed: Editor, text: string) {
  const ln = ed.getCursor().line;
  const caret = text.indexOf(CURSOR);
  const clean = text.replace(CURSOR, "");
  ed.setLine(ln, clean);
  ed.setCursor({ line: ln, ch: caret >= 0 ? caret : clean.length });
  ed.focus();
}
const heading = (n: number) => (ed: Editor) => setLine(ed, "#".repeat(n) + " " + CURSOR);

function buildCommands(): Cmd[] {
  const out: Cmd[] = [
    { label: "Title", icon: "heading-1", group: "Text", keys: "h1 heading title", run: heading(1) },
    { label: "Heading", icon: "heading-2", group: "Text", keys: "h2 heading", run: heading(2) },
    { label: "Subheading", icon: "heading-3", group: "Text", keys: "h3 subheading", run: heading(3) },
    { label: "Strong", icon: "heading-4", group: "Text", keys: "h4 strong", run: heading(4) },
    { label: "Date", icon: "calendar", group: "Date & Time", keys: "date today", run: (ed) => { ed.replaceSelection(fmtDate()); } },
    { label: "Time", icon: "clock", group: "Date & Time", keys: "time now", run: (ed) => { ed.replaceSelection(fmtTime()); } },
    { label: "Date & Time", icon: "calendar-clock", group: "Date & Time", keys: "datetime now", run: (ed) => { ed.replaceSelection(`${fmtDate()} ${fmtTime()}`); } },
  ];
  for (const sec of INSERT) {
    for (const t of sec.tiles) {
      out.push({ label: t.label, icon: t.icon, group: sec.title ? sec.title.replace(/^./, (c) => c.toUpperCase()) : "Insert", keys: (t.label + " " + (sec.title ?? "")).toLowerCase(), run: (ed) => insertBlockMd(ed, t.md) });
    }
  }
  return out;
}

export class SlashSuggest extends EditorSuggest<Cmd> {
  private cmds = buildCommands();
  constructor(app: App) {
    super(app);
    this.limit = 40;
    this.setInstructions([{ command: "↑↓", purpose: "to navigate" }, { command: "↵", purpose: "to insert" }, { command: "esc", purpose: "to dismiss" }]);
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
    const before = editor.getLine(cursor.line).slice(0, cursor.ch);
    const m = /(?:^|\s)\/([\w-]*)$/.exec(before);
    if (!m) return null;
    // not inside fenced code / math / frontmatter
    const b = parseBlocks(editor.getValue().split("\n")).find((x) => cursor.line >= x.from && cursor.line <= x.to);
    if (b && (b.type === "code" || b.type === "math" || b.type === "frontmatter" || b.type === "comment")) return null;
    return { start: { line: cursor.line, ch: cursor.ch - m[1].length - 1 }, end: cursor, query: m[1] };
  }

  getSuggestions(ctx: EditorSuggestContext): Cmd[] {
    const q = ctx.query.toLowerCase();
    if (!q) return this.cmds;
    return this.cmds.filter((c) => c.label.toLowerCase().includes(q) || c.keys.includes(q))
      .sort((a, b) => Number(b.label.toLowerCase().startsWith(q)) - Number(a.label.toLowerCase().startsWith(q)));
  }

  renderSuggestion(c: Cmd, el: HTMLElement) {
    el.addClass("bc-slash-item");
    const ico = el.createSpan("bc-slash-icon"); setIcon(ico, c.icon);
    el.createSpan({ cls: "bc-slash-label", text: c.label });
    el.createSpan({ cls: "bc-slash-group", text: c.group });
  }

  selectSuggestion(c: Cmd, _evt: MouseEvent | KeyboardEvent) {
    const ctx = this.context; if (!ctx) return;
    const { editor, start, end } = ctx;
    editor.replaceRange("", start, end); // remove "/query"
    c.run(editor);
  }
}
