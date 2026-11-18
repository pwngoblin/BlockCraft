import { EditorView, ViewPlugin, Decoration, DecorationSet, ViewUpdate } from "@codemirror/view";
import { StateEffect, StateField, Extension } from "@codemirror/state";
import { Menu } from "obsidian";
import {
  Block, parseBlocks, planMove, wrapLines, groupIntoColumns, lineStarts, TextChange,
} from "./blocks";

/* ---------- source-block fade while dragging (line decorations driven by an effect) ---------- */
const setDragging = StateEffect.define<{ from: number; to: number } | null>();
const draggingField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setDragging)) continue;
      if (!e.value) return Decoration.none;
      const ranges = [];
      let pos = e.value.from;
      while (pos <= e.value.to) {
        const line = tr.state.doc.lineAt(pos);
        ranges.push(Decoration.line({ class: "blockcraft-dragging" }).range(line.from));
        pos = line.to + 1;
      }
      return Decoration.set(ranges);
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const DRAG_THRESHOLD = 4;

class BlockEngine {
  private blocks: Block[] = [];
  private starts: number[] = [];
  private text = "";
  private active = -1; // hovered block index
  private handle: HTMLElement;
  private more: HTMLElement;
  private dropLine: HTMLElement;
  private ghost: HTMLElement | null = null;
  private drag: { idx: number; startY: number; moving: boolean; target: number } | null = null;
  private menuOpen = false;

  constructor(private view: EditorView) {
    this.handle = this.el("blockcraft-handle", "Drag to move • click for menu");
    this.more = this.el("blockcraft-more", "Block actions");
    this.dropLine = this.el("blockcraft-drop-line");
    this.dropLine.style.display = "none";
    view.dom.append(this.handle, this.more, this.dropLine);
    view.dom.addEventListener("mousemove", this.onMove);
    view.dom.addEventListener("mouseleave", this.onLeave);
    view.scrollDOM.addEventListener("scroll", this.reposition, { passive: true });
    this.handle.addEventListener("pointerdown", this.onHandleDown);
    this.more.addEventListener("click", (e) => { e.preventDefault(); this.openMenu(this.active, e); });
    this.refresh();
  }

  private el(cls: string, title?: string) {
    const d = document.createElement("div");
    d.className = cls;
    if (title) d.title = title;
    d.style.position = "absolute";
    d.style.zIndex = "5";
    return d;
  }

  destroy() {
    this.handle.remove(); this.more.remove(); this.dropLine.remove(); this.ghost?.remove();
    this.view.dom.removeEventListener("mousemove", this.onMove);
    this.view.dom.removeEventListener("mouseleave", this.onLeave);
    this.view.scrollDOM.removeEventListener("scroll", this.reposition);
  }

  update(u: ViewUpdate) {
    if (u.docChanged) { this.refresh(); this.hide(); }
    else if (u.geometryChanged || u.viewportChanged) this.reposition();
  }

  /* ---------- block model ---------- */
  private refresh() {
    this.text = this.view.state.doc.toString();
    this.blocks = parseBlocks(this.text.split("\n"));
    this.starts = lineStarts(this.text);
  }
  private blockStart(b: Block) { return this.starts[b.from]; }
  private blockEnd(b: Block) { return b.to + 1 < this.starts.length ? this.starts[b.to + 1] - 1 : this.text.length; }
  private blockLines(b: Block) { return this.text.slice(this.blockStart(b), this.blockEnd(b)).split("\n"); }
  private indexAtLine(line0: number) { return this.blocks.findIndex((b) => line0 >= b.from && line0 <= b.to); }

  /* ---------- geometry (document coords -> positions inside view.dom) ---------- */
  private top(pos: number) { return this.view.lineBlockAt(pos).top + this.view.documentTop - this.view.dom.getBoundingClientRect().top; }
  private bottom(pos: number) { return this.view.lineBlockAt(pos).bottom + this.view.documentTop - this.view.dom.getBoundingClientRect().top; }

  /** Position grip/`···` next to the active block. Uses CM6's measure phase (read, then write) to avoid layout thrash. */
  private reposition = () => {
    if (this.active < 0 || !this.blocks[this.active]) return;
    const b = this.blocks[this.active];
    const startPos = this.blockStart(b);
    this.view.requestMeasure({
      key: this,
      read: (view) => {
        const dom = view.dom.getBoundingClientRect();
        const c = view.contentDOM.getBoundingClientRect();
        const y = view.lineBlockAt(startPos).top + view.documentTop - dom.top;
        return { y, left: Math.max(2, c.left - dom.left - 28), right: Math.min(dom.width - 32, c.right - dom.left + 6) };
      },
      write: (m) => {
        this.handle.style.top = `${m.y + 2}px`;
        this.handle.style.left = `${m.left}px`;
        this.more.style.top = `${m.y + 2}px`;
        this.more.style.left = `${m.right}px`;
      },
    });
  };

  private show(idx: number) {
    const b = this.blocks[idx];
    if (!b || b.type === "frontmatter") return this.hide();
    this.active = idx;
    this.reposition();
    this.handle.classList.add("is-visible");
    this.more.classList.add("is-visible");
  }
  private hide() {
    if (this.drag?.moving || this.menuOpen) return;
    this.active = -1;
    this.handle.classList.remove("is-visible");
    this.more.classList.remove("is-visible");
  }

  /* ---------- hover ---------- */
  private onMove = (e: MouseEvent) => {
    if (this.drag) return;
    // Only markdown notes (not canvas cards, popovers, etc.). Checked lazily: the DOM may not be attached at construction.
    if (!this.view.dom.closest(".markdown-source-view")) return;
    if (e.target === this.handle || e.target === this.more) return;
    const c = this.view.contentDOM.getBoundingClientRect();
    const pos = this.view.posAtCoords({ x: Math.min(Math.max(e.clientX, c.left + 2), c.right - 2), y: e.clientY }, false);
    if (pos == null) return this.hide();
    const idx = this.indexAtLine(this.view.state.doc.lineAt(pos).number - 1);
    if (idx < 0) return this.hide();
    if (idx !== this.active) this.show(idx);
  };
  private onLeave = (e: MouseEvent) => {
    if (e.relatedTarget === this.handle || e.relatedTarget === this.more) return;
    this.hide();
  };

  /* ---------- drag & drop (pointer events; one transaction on drop) ---------- */
  private onHandleDown = (e: PointerEvent) => {
    if (e.button !== 0 || this.active < 0) return;
    e.preventDefault();
    this.handle.setPointerCapture(e.pointerId);
    this.drag = { idx: this.active, startY: e.clientY, moving: false, target: -1 };
    this.handle.addEventListener("pointermove", this.onDragMove);
    this.handle.addEventListener("pointerup", this.onDragEnd);
    this.handle.addEventListener("pointercancel", this.onDragCancel);
    window.addEventListener("keydown", this.onKey, true);
  };

  private slotAt(clientY: number): number {
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      const top = this.view.lineBlockAt(this.blockStart(b)).top + this.view.documentTop;
      const bot = this.view.lineBlockAt(this.blockEnd(b)).bottom + this.view.documentTop;
      if (clientY < (top + bot) / 2) return i;
    }
    return this.blocks.length;
  }

  private onDragMove = (e: PointerEvent) => {
    const d = this.drag; if (!d) return;
    if (!d.moving) {
      if (Math.abs(e.clientY - d.startY) < DRAG_THRESHOLD) return;
      d.moving = true;
      const b = this.blocks[d.idx];
      this.view.dispatch({ effects: setDragging.of({ from: this.blockStart(b), to: this.blockEnd(b) }) });
      this.makeGhost(b);
    }
    if (this.ghost) { this.ghost.style.left = `${e.clientX + 12}px`; this.ghost.style.top = `${e.clientY + 8}px`; }
    // edge auto-scroll
    const r = this.view.scrollDOM.getBoundingClientRect();
    if (e.clientY < r.top + 40) this.view.scrollDOM.scrollTop -= 14;
    else if (e.clientY > r.bottom - 40) this.view.scrollDOM.scrollTop += 14;

    const slot = this.slotAt(e.clientY);
    d.target = planMove(this.text, this.blocks, d.idx, slot) ? slot : -1; // unsafe/no-op => no indicator
    if (d.target < 0) { this.dropLine.style.display = "none"; return; }
    const c = this.view.contentDOM.getBoundingClientRect();
    const dom = this.view.dom.getBoundingClientRect();
    const y = slot < this.blocks.length
      ? this.top(this.blockStart(this.blocks[slot]))
      : this.bottom(this.blockEnd(this.blocks[this.blocks.length - 1]));
    Object.assign(this.dropLine.style, {
      display: "block", top: `${y - 2}px`, left: `${c.left - dom.left}px`, width: `${c.width}px`,
    });
  };

  private onDragEnd = (e: PointerEvent) => {
    const d = this.drag; if (!d) return;
    this.stopDrag();
    if (!d.moving) { this.openMenu(d.idx, e); return; } // a plain click on the grip opens the menu
    if (d.target >= 0) {
      const change = planMove(this.text, this.blocks, d.idx, d.target);
      if (change) this.view.dispatch({ changes: change, userEvent: "move.blockcraft", effects: setDragging.of(null) });
      else this.view.dispatch({ effects: setDragging.of(null) });
    } else this.view.dispatch({ effects: setDragging.of(null) });
    this.view.focus(); // the grip swallows mousedown; give keyboard focus (Cmd+Z!) back to the editor
  };
  private onDragCancel = () => { this.stopDrag(); this.view.dispatch({ effects: setDragging.of(null) }); this.view.focus(); };
  private onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); this.onDragCancel(); } };

  private stopDrag() {
    this.drag = null;
    this.dropLine.style.display = "none";
    this.ghost?.remove(); this.ghost = null;
    this.handle.removeEventListener("pointermove", this.onDragMove);
    this.handle.removeEventListener("pointerup", this.onDragEnd);
    this.handle.removeEventListener("pointercancel", this.onDragCancel);
    window.removeEventListener("keydown", this.onKey, true);
  }

  private makeGhost(b: Block) {
    const g = document.createElement("div");
    g.className = "blockcraft-drag-ghost";
    g.textContent = this.blockLines(b).slice(0, 3).join("\n");
    Object.assign(g.style, { padding: "8px 12px", maxWidth: "420px", maxHeight: "5em", overflow: "hidden", whiteSpace: "pre-wrap", font: "inherit", fontSize: "0.9em" });
    document.body.append(g);
    this.ghost = g;
  }

  /* ---------- action menu ---------- */
  private replaceBlock(idx: number, lines: string[]) {
    const b = this.blocks[idx];
    this.view.dispatch({ changes: { from: this.blockStart(b), to: this.blockEnd(b), insert: lines.join("\n") }, userEvent: "input.blockcraft" });
    this.view.focus();
  }
  private move(idx: number, target: number) {
    const c = planMove(this.text, this.blocks, idx, target);
    if (c) this.view.dispatch({ changes: c, userEvent: "move.blockcraft" });
    this.view.focus();
  }
  private deleteBlock(idx: number) {
    const b = this.blocks[idx], next = this.blocks[idx + 1];
    let from = this.blockStart(b), to: number;
    if (next) to = this.starts[next.from];
    else { to = this.text.length; while (from > 0 && /\s/.test(this.text[from - 1])) from--; }
    this.view.dispatch({ changes: { from, to, insert: "" }, userEvent: "delete.blockcraft" });
    this.view.focus();
  }
  private duplicateBlock(idx: number) {
    const b = this.blocks[idx];
    const body = this.blockLines(b).join("\n");
    this.view.dispatch({ changes: { from: this.blockEnd(b), insert: `\n\n${body}` }, userEvent: "input.blockcraft" });
    this.view.focus();
  }

  private openMenu(idx: number, e: MouseEvent | PointerEvent) {
    const b = this.blocks[idx]; if (!b || b.type === "frontmatter") return;
    const menu = new Menu();
    const lines = this.blockLines(b);
    menu.addItem((i) => i.setTitle("Wrap in Card").setIcon("square").onClick(() => this.replaceBlock(idx, wrapLines(lines, "card"))));
    menu.addItem((i) => i.setTitle("Group into Columns").setIcon("columns-2").onClick(() => this.replaceBlock(idx, groupIntoColumns(lines))));
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("Duplicate").setIcon("copy").onClick(() => this.duplicateBlock(idx)));
    menu.addItem((i) => i.setTitle("Move up").setIcon("arrow-up").setDisabled(!planMove(this.text, this.blocks, idx, idx - 1)).onClick(() => this.move(idx, idx - 1)));
    menu.addItem((i) => i.setTitle("Move down").setIcon("arrow-down").setDisabled(!planMove(this.text, this.blocks, idx, idx + 2)).onClick(() => this.move(idx, idx + 2)));
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("Delete").setIcon("trash-2").onClick(() => this.deleteBlock(idx)));
    this.menuOpen = true;
    this.handle.classList.add("is-active"); this.more.classList.add("is-active");
    menu.onHide(() => { this.menuOpen = false; this.handle.classList.remove("is-active"); this.more.classList.remove("is-active"); });
    menu.showAtMouseEvent(e as MouseEvent);
  }
}

export function blockEngine(): Extension {
  return [draggingField, ViewPlugin.fromClass(BlockEngine)];
}
