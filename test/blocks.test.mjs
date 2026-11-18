// Run: npm test   (Node strips TS types; uses the synthetic notes in test/fixtures)
import fs from "node:fs";
import assert from "node:assert/strict";
import { parseBlocks, planMove, minimalChange, wrapLines, groupIntoColumns } from "../src/blocks.ts";

const dir = new URL("./fixtures/", import.meta.url).pathname;
let fails = 0;
const ok = (name, fn) => { try { fn(); console.log("  ok  ", name); } catch (e) { fails++; console.log("  FAIL", name, "\n      ", e.message.split("\n")[0]); } };
const apply = (t, c) => t.slice(0, c.from) + c.insert + t.slice(c.to);
const norm = (s) => s.split("\n").filter((l) => l.trim()).sort().join("\n");

console.log("unit");
ok("minimalChange round-trips", () => {
  for (const [a, b] of [["abc", "abd"], ["", "x"], ["x", ""], ["aXbXc", "aXXc"], ["same", "same"]]) {
    const c = minimalChange(a, b);
    assert.equal(c ? apply(a, c) : a, b);
  }
});
ok("wrapLines quotes blank lines as '>'", () => {
  assert.deepEqual(wrapLines(["a", "", "b"], "card"), ["> [!card]", "> a", ">", "> b"]);
});
ok("groupIntoColumns nests a plain block in a card; keeps an existing card", () => {
  assert.deepEqual(groupIntoColumns(["hi"]), ["> [!columns]", "> > [!card]", "> > hi"]);
  assert.deepEqual(groupIntoColumns(["> [!card] T", "> x"]), ["> [!columns]", "> > [!card] T", "> > x"]);
});
ok("wrapped output re-parses as one callout block", () => {
  const w = wrapLines(["```", "a", "", "b", "```"], "card");
  const bl = parseBlocks(w);
  assert.equal(bl.length, 1); assert.equal(bl[0].type, "callout");
});

for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith(".md")).sort() : []) {
  const text = fs.readFileSync(dir + f, "utf8");
  const lines = text.split("\n");
  const blocks = parseBlocks(lines);
  console.log(`\n${f}: ${blocks.length} blocks`);
  ok("ordered, non-overlapping, no blank edges, full coverage", () => {
    const cov = new Set();
    blocks.forEach((b, k) => {
      if (k) assert.ok(b.from > blocks[k - 1].to);
      assert.ok(lines[b.from].trim() && lines[b.to].trim());
      for (let x = b.from; x <= b.to; x++) cov.add(x);
    });
    lines.forEach((l, k) => l.trim() && assert.ok(cov.has(k), `uncovered ${k + 1}`));
  });
  ok("planMove: every accepted move keeps all lines + block structure (single change)", () => {
    let acc = 0, rej = 0;
    for (let i = 0; i < blocks.length; i++) for (let t = 0; t <= blocks.length; t++) {
      const c = planMove(text, blocks, i, t);
      if (!c) { rej++; continue; }
      acc++;
      const out = apply(text, c);
      assert.equal(norm(out), norm(text), `move ${i}->${t} changed content`);
      assert.equal(parseBlocks(out.split("\n")).length, blocks.length, `move ${i}->${t} changed block count`);
    }
    console.log(`         accepted ${acc}, rejected/no-op ${rej}`);
  });
  ok("frontmatter never moves and nothing lands above it", () => {
    if (blocks[0].type !== "frontmatter") return;
    for (let t = 0; t <= blocks.length; t++) assert.equal(planMove(text, blocks, 0, t), null);
    for (let i = 1; i < blocks.length; i++) assert.equal(planMove(text, blocks, i, 0), null);
  });
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
