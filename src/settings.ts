import { App, PluginSettingTab, Setting } from "obsidian";
import type BlockcraftPlugin from "./main";
import { TINTS, FONTS } from "./sidebar";

export class BlockcraftSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: BlockcraftPlugin) { super(app, plugin); }

  display() {
    const { containerEl } = this; containerEl.empty();
    const s = this.plugin.settings;
    const save = () => void this.plugin.applyAndSave();

    new Setting(containerEl).setName("Appearance").setHeading();

    new Setting(containerEl)
      .setName("OLED black mode")
      .setDesc("Turns the whole app pure black (window, sidebars, editor, menus, dialogs). Switches Obsidian to its dark scheme while on and restores your previous scheme when turned off.")
      .addToggle((t) => t.setValue(s.oled).onChange((v) => void this.plugin.setOled(v)));

    const cls = document.body.classList;
    new Setting(containerEl)
      .setName("Status")
      .setDesc(`Blockcraft ${cls.contains("blockcraft-on") ? "active" : "NOT active"} · scheme: ${cls.contains("theme-dark") ? "dark" : "light"} · OLED class: ${cls.contains("blockcraft-oled") ? "on" : "off"} · v${this.plugin.manifest.version}`);

    new Setting(containerEl)
      .setName("Header colour")
      .setDesc("Soft colour wash at the top of the note pane.")
      .addDropdown((d) => {
        for (const [k, [name]] of Object.entries(TINTS)) d.addOption(k, name);
        d.setValue(s.tint).onChange((v) => { s.tint = v; save(); });
      });

    new Setting(containerEl)
      .setName("Font")
      .addDropdown((d) => {
        for (const [k, [name]] of Object.entries(FONTS)) d.addOption(k, name);
        d.setValue(s.font).onChange((v) => { s.font = v; save(); });
      });

    new Setting(containerEl)
      .setName("Wide page")
      .setDesc("Use a wider text column.")
      .addToggle((t) => t.setValue(s.wide).onChange((v) => { s.wide = v; save(); }));

    new Setting(containerEl).setName("Panel").setHeading();

    new Setting(containerEl)
      .setName("Open the Blockcraft panel on start")
      .setDesc("Opens the Insert / Format / Style / Info panel in the right sidebar when Obsidian loads.")
      .addToggle((t) => t.setValue(s.autoOpen).onChange(async (v) => { s.autoOpen = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("Open panel now")
      .addButton((b) => b.setButtonText("Open").onClick(() => void this.plugin.activatePanel(true)));
  }
}
