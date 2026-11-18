import { Plugin } from "obsidian";
import { blockEngine } from "./engine";
import { SlashSuggest } from "./slash";
import { BlockcraftSettingTab } from "./settings";
import { BlockcraftView, VIEW_TYPE, PanelSettings, DEFAULT_SETTINGS, applyPanelSettings, clearPanelSettings } from "./sidebar";

const ROOT_CLASS = "blockcraft-on";

export default class BlockcraftPlugin extends Plugin {
  settings: PanelSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
    document.body.classList.add(ROOT_CLASS);
    applyPanelSettings(this.settings);
    this.register(() => { document.body.classList.remove(ROOT_CLASS); clearPanelSettings(); });

    this.registerEditorExtension(blockEngine());
    this.registerEditorSuggest(new SlashSuggest(this.app));
    const mo = new MutationObserver(this.enforceDark);
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    this.register(() => mo.disconnect());
    this.app.workspace.onLayoutReady(this.enforceDark);
    this.addSettingTab(new BlockcraftSettingTab(this.app, this));
    this.registerView(VIEW_TYPE, (leaf) => new BlockcraftView(leaf, this));
    this.addCommand({ id: "open-panel", name: "Open Blockcraft panel (Insert / Format / Style / Info)", callback: () => void this.activatePanel() });
    this.addRibbonIcon("layout-grid", "Blockcraft panel", () => void this.activatePanel());
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.autoOpen && !this.app.workspace.getLeavesOfType(VIEW_TYPE).length) void this.activatePanel(true);
    });
  }

  async onunload() { this.app.workspace.detachLeavesOfType(VIEW_TYPE); }

  async saveSettings() { await this.saveData(this.settings); }

  /** Re-apply tint/font/width/OLED class and re-render open panels (used by the settings tab). */
  async applyAndSave() {
    applyPanelSettings(this.settings);
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((l) => (l.view as BlockcraftView).refresh());
    await this.saveSettings();
  }

  /** OLED black mode: forces Obsidian to the dark base scheme (remembering the previous one) and adds `blockcraft-oled`. */
  /** Make sure the body carries `theme-dark` while OLED is on (Obsidian may re-apply the light scheme). Idempotent. */
  private enforceDark = () => {
    if (!this.settings.oled) return;
    const b = document.body;
    if (!b.classList.contains("theme-dark")) { b.classList.remove("theme-light"); b.classList.add("theme-dark"); }
  };

  async setOled(on: boolean) {
    const s = this.settings;
    const app = this.app as unknown as { setTheme?: (t: string) => void; vault: { getConfig?: (k: string) => unknown } };
    if (on && !s.oled) { try { s.prevTheme = String(app.vault.getConfig?.("theme") ?? "") || undefined; } catch { s.prevTheme = undefined; } }
    s.oled = on;
    if (on) {
      if (!document.body.classList.contains("theme-dark")) { try { app.setTheme?.("obsidian"); } catch { /* internal API missing */ } }
      this.enforceDark(); // works even if setTheme() is missing or ignored
    } else {
      const prev = s.prevTheme; s.prevTheme = undefined;
      if (prev) { try { app.setTheme?.(prev); } catch { /* ignore */ } }
      if (prev === "moonstone" && document.body.classList.contains("theme-dark")) { document.body.classList.replace("theme-dark", "theme-light"); }
    }
    await this.applyAndSave();
    this.app.workspace.trigger("css-change");
  }

  async activatePanel(reveal = true) {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      const r = ws.getRightLeaf(false);
      if (!r) return;
      await r.setViewState({ type: VIEW_TYPE, active: reveal });
      leaf = r;
    }
    if (reveal) {
      if (ws.rightSplit.collapsed) ws.rightSplit.expand();
      ws.revealLeaf(leaf);
    }
  }
}
