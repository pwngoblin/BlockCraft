import esbuild from "esbuild";
import { builtinModules } from "node:module";

const prod = process.argv[2] === "production";
const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2020",
  platform: "node",
  outfile: "main.js",
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtinModules],
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  minify: prod,
  treeShaking: true,
});
if (prod) { await ctx.rebuild(); await ctx.dispose(); } else { await ctx.watch(); }
