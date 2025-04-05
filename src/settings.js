const { PluginSettingTab } = require('obsidian');

const DEFAULT_SETTINGS = {
  customCreatedDateProp: "",
  customModifiedDateProp: "",
  dateDisplayFormat: "mmmm dd, yyyy",
  showBacklinks: true,
  showDates: true,
  updateDelay: 3000,
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

    // Add settings UI elements here (e.g., toggles, text inputs, etc.)
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  FootLinkerSettingTab
};