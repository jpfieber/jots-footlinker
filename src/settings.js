import { PluginSettingTab, Setting } from 'obsidian';
import { FolderSuggest } from './foldersuggester';

export const DEFAULT_SETTINGS = {
  relatedFiles: Array(5).fill().map((_, i) => ({
    id: (i + 1).toString(),
    label: '',
    path: ''
  })),
  pathSettings: []  // Will store array of {path: string, enabledCategories: string[], showBacklinks: boolean}
};

export class FootLinkerSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'FootLinker Settings' });

    // Create tabs container
    const tabsContainer = containerEl.createEl('div', { cls: 'jots-settings-tabs' });

    // Create tab buttons
    const relatedFilesBtn = tabsContainer.createEl('div', {
      cls: 'jots-settings-tab is-active',
      text: 'Related Files'
    });

    const footerNotesBtn = tabsContainer.createEl('div', {
      cls: 'jots-settings-tab',
      text: 'Notes with Footers'
    });

    // Create content containers
    const relatedFilesContent = containerEl.createEl('div', {
      cls: 'jots-settings-content is-active'
    });

    const footerNotesContent = containerEl.createEl('div', {
      cls: 'jots-settings-content'
    });

    // Add click handlers for tabs
    relatedFilesBtn.addEventListener('click', () => {
      relatedFilesBtn.addClass('is-active');
      footerNotesBtn.removeClass('is-active');
      relatedFilesContent.addClass('is-active');
      footerNotesContent.removeClass('is-active');
    });

    footerNotesBtn.addEventListener('click', () => {
      footerNotesBtn.addClass('is-active');
      relatedFilesBtn.removeClass('is-active');
      footerNotesContent.addClass('is-active');
      relatedFilesContent.removeClass('is-active');
    });

    // Add content to tabs
    this.displayRelatedFilesSettings(relatedFilesContent);
    this.displayFooterNotesSettings(footerNotesContent);
  }

  displayRelatedFilesSettings(containerEl) {
    containerEl.createEl('h3', { text: 'Related Files' });
    containerEl.createEl('p', { text: 'Configure up to 5 related file categories. Each category needs a label and a path.' });

    this.plugin.settings.relatedFiles.forEach((section, index) => {
      const sectionNum = index + 1;

      new Setting(containerEl)
        .setName(`Category ${sectionNum}`)
        .setDesc(`Configure category ${sectionNum} label and path`)
        .addText(text => text
          .setPlaceholder('Enter category label')
          .setValue(section.label)
          .onChange(async (value) => {
            this.plugin.settings.relatedFiles[index].label = value;
            await this.plugin.saveSettings();
          }))
        .addText(text => {
          text
            .setPlaceholder('Enter path')
            .setValue(section.path);

          new FolderSuggest(this.app, text.inputEl);

          text.onChange(async (value) => {
            this.plugin.settings.relatedFiles[index].path = value;
            await this.plugin.saveSettings();
          });
        });
    });
  }

  displayFooterNotesSettings(containerEl) {
    containerEl.createEl('h3', { text: 'Notes with Footers' });
    containerEl.createEl('p', { text: 'Configure which folders should display footers and what to show in each.' });

    // Add New Path Button
    new Setting(containerEl)
      .setName('Add Note Type')
      .setDesc('Add a new folder path to show footers in')
      .addButton(button => button
        .setButtonText('Add Note Type')
        .onClick(async () => {
          if (!this.plugin.settings.pathSettings) {
            this.plugin.settings.pathSettings = [];
          }
          this.plugin.settings.pathSettings.push({
            path: '',
            enabledCategories: [],
            showBacklinks: true
          });
          await this.plugin.saveSettings();
          this.display();
        }));

    // Existing Paths
    if (this.plugin.settings.pathSettings?.length > 0) {
      this.plugin.settings.pathSettings.forEach((pathSetting, index) => {
        const pathSettingContainer = containerEl.createDiv('path-setting-container');

        // Path input with folder suggester
        new Setting(pathSettingContainer)
          .setName(`Note Type ${index + 1}`)
          .addText(text => {
            text
              .setPlaceholder('Enter folder path')
              .setValue(pathSetting.path);

            new FolderSuggest(this.app, text.inputEl);

            text.onChange(async (value) => {
              this.plugin.settings.pathSettings[index].path = value;
              await this.plugin.saveSettings();
            });
          })
          .addExtraButton(button => button
            .setIcon('cross')
            .setTooltip('Delete')
            .onClick(async () => {
              this.plugin.settings.pathSettings.splice(index, 1);
              await this.plugin.saveSettings();
              this.display();
            }));

        // Settings for this path type
        const availableCategories = this.plugin.settings.relatedFiles.filter(rf => rf.label);

        // Categories Dropdown
        new Setting(pathSettingContainer)
          .setName('Show in Footer')
          .setDesc('Select which elements to show in the footer for this note type')
          .addDropdown(dropdown => {
            // Add Backlinks option
            dropdown.addOption('backlinks', 'Backlinks');
            // Add all categories
            availableCategories.forEach(cat => {
              dropdown.addOption(cat.id, cat.label);
            });

            // Set selected items
            const selectedValue = pathSetting.showBacklinks ? 'backlinks' : availableCategories[0]?.id || '';
            dropdown.setValue(selectedValue);

            // Update selection and display current selections
            dropdown.onChange(async (value) => {
              if (value === 'backlinks') {
                pathSetting.showBacklinks = true;
              } else {
                const category = availableCategories.find(c => c.id === value);
                if (category && !pathSetting.enabledCategories.includes(category.id)) {
                  pathSetting.enabledCategories.push(category.id);
                }
              }
              await this.plugin.saveSettings();
              this.updateSelectionDisplay(pathSettingContainer, pathSetting, availableCategories);
            });
          });

        // Display current selections
        this.updateSelectionDisplay(pathSettingContainer, pathSetting, availableCategories);
      });
    }
  }

  updateSelectionDisplay(container, pathSetting, availableCategories) {
    // Remove existing display if any
    const existingDisplay = container.querySelector('.selected-items');
    if (existingDisplay) {
      existingDisplay.remove();
    }

    // Create new display
    const displayDiv = container.createDiv('selected-items');

    // Show backlinks if enabled
    if (pathSetting.showBacklinks) {
      this.createSelectionTag(displayDiv, 'Backlinks', () => {
        pathSetting.showBacklinks = false;
        this.plugin.saveSettings();
        this.updateSelectionDisplay(container, pathSetting, availableCategories);
      });
    }

    // Show selected categories
    pathSetting.enabledCategories.forEach(id => {
      const category = availableCategories.find(c => c.id === id);
      if (category) {
        this.createSelectionTag(displayDiv, category.label, () => {
          pathSetting.enabledCategories = pathSetting.enabledCategories.filter(cid => cid !== id);
          this.plugin.saveSettings();
          this.updateSelectionDisplay(container, pathSetting, availableCategories);
        });
      }
    });
  }

  createSelectionTag(container, label, onRemove) {
    const tag = container.createSpan('selection-tag');
    tag.setText(label);
    const removeButton = tag.createSpan('remove-button');
    removeButton.setText('×');
    removeButton.addEventListener('click', onRemove);
    return tag;
  }
}