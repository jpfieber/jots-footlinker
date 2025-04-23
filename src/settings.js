const { PluginSettingTab, Setting } = require('obsidian');

const DEFAULT_SETTINGS = {
  customCreatedDateProp: "",
  customModifiedDateProp: "",
  dateDisplayFormat: "mmmm dd, yyyy",
  showBacklinks: true,
  showDates: true,
  updateDelay: 3000,
  footerOrder: 100, // Add this line
  excludedFolders: [],
  excludedParentSelectors: []
};

class FootLinkerSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("footlinker-settings");

    containerEl.createEl("div", {
      cls: "footlinker-info",
      text: "🦶 FootLinker adds a footer to your notes with useful information such as backlinks, creation date, and last modified date. Use the settings below to customize the appearance."
    });

    new Setting(containerEl)
      .setName("Footer Position")
      .setDesc("Control where this footer appears relative to other footers (higher numbers appear lower)")
      .addText(text => text
        .setPlaceholder("100")
        .setValue(String(this.plugin.settings.footerOrder))
        .onChange(async (value) => {
          const order = parseInt(value) || 100;
          this.plugin.settings.footerOrder = order;
          await this.plugin.saveSettings();
          await this.plugin.updateFootLinker();
        }));

    // Add settings UI elements here (e.g., toggles, text inputs, etc.)
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  FootLinkerSettingTab
};