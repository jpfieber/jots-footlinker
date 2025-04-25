import { PluginSettingTab, Setting } from 'obsidian';
import { FolderSuggest } from './foldersuggester';

export const DEFAULT_SETTINGS = {
  relatedFiles: Array(5).fill().map((_, i) => ({
    id: (i + 1).toString(),
    label: '',
    path: ''
  })),
  pathSettings: [],  // Will store array of {path: string, enabledCategories: string[], showBacklinks: boolean}
  jotItems: [],  // Will store array of {id: string, label: string, taskChar: string}
  tasksSettings: {
    headerName: 'Tasks',
    query: ''
  },
  activeTab: 'related-files'  // Store active tab state
};

export class FootLinkerSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async saveAndRefresh() {
    await this.plugin.saveSettings();
    await this.plugin.removeExistingFooters();
    await this.plugin.immediateUpdateFootLinker();
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'FootLinker Settings' });

    // Create tabs container
    const tabsContainer = containerEl.createEl('div', { cls: 'jots-settings-tabs' });

    // Create tab buttons
    const relatedFilesBtn = tabsContainer.createEl('div', {
      cls: 'jots-settings-tab',
      text: 'Related Files'
    });

    const footerNotesBtn = tabsContainer.createEl('div', {
      cls: 'jots-settings-tab',
      text: 'Notes with Footers'
    });

    const jotsBtn = tabsContainer.createEl('div', {
      cls: 'jots-settings-tab',
      text: 'Jots'
    });

    const tasksBtn = tabsContainer.createEl('div', {
      cls: 'jots-settings-tab',
      text: 'Tasks'
    });

    // Create content containers
    const relatedFilesContent = containerEl.createEl('div', {
      cls: 'jots-settings-content'
    });

    const footerNotesContent = containerEl.createEl('div', {
      cls: 'jots-settings-content'
    });

    const jotsContent = containerEl.createEl('div', {
      cls: 'jots-settings-content'
    });

    const tasksContent = containerEl.createEl('div', {
      cls: 'jots-settings-content'
    });

    // Add click handlers for tabs
    const setActiveTab = async (tabId, activeBtn, activeContent) => {
      [relatedFilesBtn, footerNotesBtn, jotsBtn, tasksBtn].forEach(btn =>
        btn.removeClass('is-active'));
      [relatedFilesContent, footerNotesContent, jotsContent, tasksContent].forEach(content =>
        content.removeClass('is-active'));
      activeBtn.addClass('is-active');
      activeContent.addClass('is-active');
      this.plugin.settings.activeTab = tabId;
      await this.plugin.saveSettings();
    };

    relatedFilesBtn.addEventListener('click', () =>
      setActiveTab('related-files', relatedFilesBtn, relatedFilesContent));
    footerNotesBtn.addEventListener('click', () =>
      setActiveTab('footer-notes', footerNotesBtn, footerNotesContent));
    jotsBtn.addEventListener('click', () =>
      setActiveTab('jots', jotsBtn, jotsContent));
    tasksBtn.addEventListener('click', () =>
      setActiveTab('tasks', tasksBtn, tasksContent));

    // Set initial active tab based on stored setting
    switch (this.plugin.settings.activeTab) {
      case 'footer-notes':
        setActiveTab('footer-notes', footerNotesBtn, footerNotesContent);
        break;
      case 'jots':
        setActiveTab('jots', jotsBtn, jotsContent);
        break;
      case 'tasks':
        setActiveTab('tasks', tasksBtn, tasksContent);
        break;  // Missing break statement
      default:
        setActiveTab('related-files', relatedFilesBtn, relatedFilesContent);
    }

    // Add content to tabs
    this.displayRelatedFilesSettings(relatedFilesContent);
    this.displayFooterNotesSettings(footerNotesContent);
    this.displayJotsSettings(jotsContent);
    this.displayTasksSettings(tasksContent);
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
            await this.saveAndRefresh();
          }))
        .addText(text => {
          text
            .setPlaceholder('Enter path')
            .setValue(section.path);

          new FolderSuggest(this.app, text.inputEl);

          text.onChange(async (value) => {
            this.plugin.settings.relatedFiles[index].path = value;
            await this.saveAndRefresh();
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
          await this.saveAndRefresh();
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
              await this.saveAndRefresh();
            });
          })
          .addExtraButton(button => button
            .setIcon('cross')
            .setTooltip('Delete')
            .onClick(async () => {
              this.plugin.settings.pathSettings.splice(index, 1);
              await this.saveAndRefresh();
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
              await this.saveAndRefresh();
              this.updateSelectionDisplay(pathSettingContainer, pathSetting, availableCategories);
            });
          });

        // Display current selections
        this.updateSelectionDisplay(pathSettingContainer, pathSetting, availableCategories);
      });
    }
  }

  displayJotsSettings(containerEl) {
    containerEl.createEl('h3', { text: 'Jots Settings' });
    containerEl.createEl('p', { text: 'Configure task groupings for the footer. Each group needs a label and a character that marks the tasks to be included.' });

    // Add New Jot Group Button
    new Setting(containerEl)
      .setName('Add Jot Group')
      .setDesc('Add a new task grouping')
      .addButton(button => button
        .setButtonText('Add Group')
        .onClick(async () => {
          if (!this.plugin.settings.jotItems) {
            this.plugin.settings.jotItems = [];
          }
          this.plugin.settings.jotItems.push({
            id: String(Date.now()),
            label: '',
            taskChar: ''
          });
          await this.saveAndRefresh();
          this.display();
        }));

    // Existing Jot Groups
    if (this.plugin.settings.jotItems?.length > 0) {
      this.plugin.settings.jotItems.forEach((jot, index) => {
        const jotContainer = containerEl.createDiv('path-setting-container');

        new Setting(jotContainer)
          .setName(`Group ${index + 1}`)
          .addText(text => text
            .setPlaceholder('Enter group label')
            .setValue(jot.label)
            .onChange(async (value) => {
              this.plugin.settings.jotItems[index].label = value;
              await this.saveAndRefresh();
            }))
          .addText(text => text
            .setPlaceholder('Task char')
            .setValue(jot.taskChar)
            .onChange(async (value) => {
              this.plugin.settings.jotItems[index].taskChar = value;
              await this.saveAndRefresh();
            }))
          .addExtraButton(button => button
            .setIcon('cross')
            .setTooltip('Delete')
            .onClick(async () => {
              this.plugin.settings.jotItems.splice(index, 1);
              await this.saveAndRefresh();
              this.display();
            }));
      });
    }
  }

  displayTasksSettings(containerEl) {
    containerEl.createEl('h3', { text: 'Tasks Settings' });
    containerEl.createEl('p', { text: 'Configure the Tasks section of the footer. Works with either Dataview or Tasks plugin - at least one must be installed and enabled for tasks to appear.' });

    // Add settings
    new Setting(containerEl)
      .setName('Section Header')
      .setDesc('The name of the tasks section in the footer')
      .addText(text => text
        .setPlaceholder('Tasks')
        .setValue(this.plugin.settings.tasksSettings.headerName)
        .onChange(async (value) => {
          this.plugin.settings.tasksSettings.headerName = value;
          await this.saveAndRefresh();
        }));

    new Setting(containerEl)
      .setName('Tasks Query')
      .setDesc('Enter a query in either Dataview or Tasks format. The plugin will automatically handle the correct syntax.')
      .addTextArea(text => text
        .setPlaceholder('Enter your query here...')
        .setValue(this.plugin.settings.tasksSettings.query)
        .onChange(async (value) => {
          this.plugin.settings.tasksSettings.query = value;
          await this.saveAndRefresh();
        }));

    // Add example queries info
    const examplesDiv = containerEl.createDiv('path-setting-container');
    examplesDiv.createEl('h4', { text: 'Example Queries' });

    const dataviewExample = examplesDiv.createEl('p');
    dataviewExample.innerHTML = '<strong>Dataview examples:</strong><br>' +
      '• due before tomorrow (converted to "due < date(tomorrow)")<br>' +
      '• due after today and !completed<br>' +
      '• due = date(today)<br>' +
      '• contains(tags, "#project")';

    const tasksExample = examplesDiv.createEl('p');
    tasksExample.innerHTML = '<strong>Tasks examples:</strong><br>' +
      '• not done<br>' +
      '• due before tomorrow<br>' +
      '• path includes Daily';
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
      this.createSelectionTag(displayDiv, 'Backlinks', async () => {
        pathSetting.showBacklinks = false;
        await this.saveAndRefresh();
        this.updateSelectionDisplay(container, pathSetting, availableCategories);
      });
    }

    // Show selected categories
    pathSetting.enabledCategories.forEach(id => {
      const category = availableCategories.find(c => c.id === id);
      if (category) {
        this.createSelectionTag(displayDiv, category.label, async () => {
          pathSetting.enabledCategories = pathSetting.enabledCategories.filter(cid => cid !== id);
          await this.saveAndRefresh();
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