import { App, PluginSettingTab, Setting } from 'obsidian';
import { FolderSuggest } from './foldersuggester';
import FootLinkerPlugin from './main';

interface RelatedFile {
  id: string;
  label: string;
  path: string;
}

interface PathSetting {
  path: string;
  enabledCategories: string[];
  showBacklinks: boolean;
}

interface JotItem {
  id: string;
  label: string;
  taskChar: string;
}

export const DEFAULT_SETTINGS = {
  relatedFiles: Array(5).fill(null).map((_, i) => ({
    id: (i + 1).toString(),
    label: '',
    path: ''
  })),
  pathSettings: [] as PathSetting[],
  jotItems: [] as JotItem[],
  activeTab: 'related-files' as 'related-files' | 'footer-notes' | 'jots'
};

type PluginSettings = typeof DEFAULT_SETTINGS;

export class FootLinkerSettingTab extends PluginSettingTab {
  plugin: FootLinkerPlugin;

  constructor(app: App, plugin: FootLinkerPlugin) {
    console.log("[FootLinker] Constructing settings tab");
    super(app, plugin);
    this.plugin = plugin;
  }

  async saveAndRefresh() {
    try {
      await this.plugin.saveSettings();
      await this.plugin.removeExistingFooters();
      await this.plugin.updateFootLinker();
    } catch (error) {
      console.error('Error in saveAndRefresh:', error);
    }
  }

  display(): void {
    console.log("[FootLinker] Displaying settings tab");
    try {
      const { containerEl } = this;
      if (!containerEl) {
        console.error("[FootLinker] No container element found!");
        return;
      }

      if (!this.plugin?.settings) {
        console.error("[FootLinker] Plugin settings not initialized!");
        return;
      }

      containerEl.empty();
      console.log("[FootLinker] Container cleared, creating UI...");

      // Create tabs container
      const tabsContainer = containerEl.createEl('div', { cls: 'jots-settings-tabs' });

      // Create tab buttons
      const relatedFilesBtn = tabsContainer.createEl('div', {
        cls: ['jots-settings-tab', this.plugin.settings.activeTab === 'related-files' ? 'is-active' : ''].join(' '),
        text: 'Related Files'
      });

      const footerNotesBtn = tabsContainer.createEl('div', {
        cls: ['jots-settings-tab', this.plugin.settings.activeTab === 'footer-notes' ? 'is-active' : ''].join(' '),
        text: 'Notes with Footers'
      });

      const jotsBtn = tabsContainer.createEl('div', {
        cls: ['jots-settings-tab', this.plugin.settings.activeTab === 'jots' ? 'is-active' : ''].join(' '),
        text: 'Jots'
      });

      // Create content containers with initial active state
      const relatedFilesContent = containerEl.createEl('div', {
        cls: ['jots-settings-content', this.plugin.settings.activeTab === 'related-files' ? 'is-active' : ''].join(' ')
      });

      const footerNotesContent = containerEl.createEl('div', {
        cls: ['jots-settings-content', this.plugin.settings.activeTab === 'footer-notes' ? 'is-active' : ''].join(' ')
      });

      const jotsContent = containerEl.createEl('div', {
        cls: ['jots-settings-content', this.plugin.settings.activeTab === 'jots' ? 'is-active' : ''].join(' ')
      });

      // Add click handlers for tabs
      const setActiveTab = async (
        tabId: typeof DEFAULT_SETTINGS.activeTab,
        activeBtn: HTMLElement,
        activeContent: HTMLElement
      ) => {
        [relatedFilesBtn, footerNotesBtn, jotsBtn].forEach(btn =>
          btn.removeClass('is-active'));
        [relatedFilesContent, footerNotesContent, jotsContent].forEach(content =>
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

      // Set initial active tab based on stored setting
      switch (this.plugin.settings.activeTab) {
        case 'footer-notes':
          setActiveTab('footer-notes', footerNotesBtn, footerNotesContent);
          break;
        case 'jots':
          setActiveTab('jots', jotsBtn, jotsContent);
          break;
        default:
          setActiveTab('related-files', relatedFilesBtn, relatedFilesContent);
      }

      // Add content to tabs
      this.displayRelatedFilesSettings(relatedFilesContent);
      this.displayFooterNotesSettings(footerNotesContent);
      this.displayJotsSettings(jotsContent);
    } catch (error) {
      console.error('Error in display:', error);
    }
  }

  displayRelatedFilesSettings(containerEl: HTMLElement) {
    containerEl.createEl('h3', { text: 'Related Files' });
    containerEl.createEl('p', { text: 'Configure up to 5 related file categories. Each category needs a label and a path.' });

    this.plugin.settings.relatedFiles.forEach((section: RelatedFile, index: number) => {
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

  displayFooterNotesSettings(containerEl: HTMLElement) {
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
      this.plugin.settings.pathSettings.forEach((pathSetting: PathSetting, index: number) => {
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
        const availableCategories = this.plugin.settings.relatedFiles.filter((rf: RelatedFile) => rf.label);

        // Categories Dropdown
        new Setting(pathSettingContainer)
          .setName('Show in Footer')
          .setDesc('Select which elements to show in the footer for this note type')
          .addDropdown(dropdown => {
            // Clear any existing options first
            dropdown.selectEl.empty();

            // Add Backlinks option
            dropdown.addOption('backlinks', 'Backlinks');

            // Add all valid categories
            availableCategories.forEach((cat: RelatedFile) => {
              if (cat && cat.label && cat.path) {  // Only add valid categories
                dropdown.addOption(cat.id, cat.label);
              }
            });

            // Set selected value
            const selectedValue = pathSetting.showBacklinks ? 'backlinks' : availableCategories[0]?.id || '';
            dropdown.setValue(selectedValue);

            // Update selection and display current selections
            dropdown.onChange(async (value) => {
              if (value === 'backlinks') {
                pathSetting.showBacklinks = true;
              } else {
                pathSetting.showBacklinks = false;  // Disable backlinks when selecting a category
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

  displayJotsSettings(containerEl: HTMLElement) {
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
      this.plugin.settings.jotItems.forEach((jot: JotItem, index: number) => {
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

  private setupDragAndDrop(container: HTMLElement, pathSetting: PathSetting): void {
    const list = container.querySelector('.selection-tag-list');
    if (!list || pathSetting.enabledCategories.length <= 1) return;

    const getTags = () => Array.from(list.querySelectorAll('.selection-tag')) as HTMLElement[];

    // Event handler functions
    const onDragStart = (e: DragEvent, tag: HTMLElement) => {
      if (!e.dataTransfer) return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
      tag.classList.add('dragging');
    };

    const onDragOver = (e: Event) => {
      const dragEvent = e as DragEvent;
      dragEvent.preventDefault();
      const draggingEl = list.querySelector('.dragging') as HTMLElement;
      if (!draggingEl) return;

      const siblings = getTags().filter(t => !t.classList.contains('dragging'));
      const nextSibling = siblings.find(sibling => {
        const rect = sibling.getBoundingClientRect();
        return dragEvent.clientY <= rect.top + rect.height / 2;
      });

      if (nextSibling) {
        list.insertBefore(draggingEl, nextSibling);
      } else {
        list.appendChild(draggingEl);
      }
    };

    const onDragEnd = async (tag: HTMLElement) => {
      tag.classList.remove('dragging');
      const newOrder = getTags().map(t => t.querySelector('.selection-tag-label')?.textContent);

      // Update enabled categories order
      pathSetting.enabledCategories = newOrder
        .filter((label): label is string => !!label)
        .map(label => {
          const category = this.plugin.settings.relatedFiles.find(rf => rf.label === label);
          return category?.id || '';
        })
        .filter(id => id !== '');

      await this.plugin.saveSettings();
    };

    // Add event listeners to each tag
    getTags().forEach(tag => {
      tag.setAttribute('draggable', 'true');
      tag.addEventListener('dragstart', (e) => onDragStart(e as DragEvent, tag));
      tag.addEventListener('dragend', () => onDragEnd(tag));
    });

    // Add dragover listener to list
    list.addEventListener('dragover', onDragOver as EventListener);
  }

  private updateSelectionDisplay(container: HTMLElement, pathSetting: PathSetting, availableCategories: RelatedFile[]): void {
    // Remove existing display if any
    const existingDisplay = container.querySelector('.selected-items');
    if (existingDisplay) existingDisplay.remove();

    // Create new display
    const displayDiv = container.createDiv({ cls: 'selected-items' });
    const tagList = displayDiv.createDiv({ cls: 'selection-tag-list' });

    // Show backlinks if enabled
    if (pathSetting.showBacklinks) {
      this.createSelectionTag(tagList, 'Backlinks', async () => {
        pathSetting.showBacklinks = false;
        await this.plugin.saveSettings();
        this.updateSelectionDisplay(container, pathSetting, availableCategories);
      });
    }

    // Show selected categories
    pathSetting.enabledCategories.forEach((id: string) => {
      const category = availableCategories.find(c => c.id === id);
      if (category) {
        this.createSelectionTag(tagList, category.label, async () => {
          pathSetting.enabledCategories = pathSetting.enabledCategories.filter(cid => cid !== id);
          await this.plugin.saveSettings();
          this.updateSelectionDisplay(container, pathSetting, availableCategories);
        });
      }
    });

    // Setup drag and drop
    this.setupDragAndDrop(displayDiv, pathSetting);
  }

  private createSelectionTag(container: HTMLElement, label: string, onRemove: () => void): HTMLElement {
    const tag = container.createEl('div', {
      cls: 'selection-tag',
      attr: { draggable: 'true' }
    });

    // Simple grip handle
    tag.createSpan({
      cls: 'selection-tag-grip',
      text: '⋮'
    });

    tag.createSpan({
      cls: 'selection-tag-label',
      text: label
    });

    const removeBtn = tag.createSpan({
      cls: 'remove-button',
      text: '×'
    });
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onRemove();
    });

    return tag;
  }
}