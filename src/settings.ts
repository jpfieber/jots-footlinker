import { App, PluginSettingTab, Setting } from 'obsidian';
import { FolderSuggest } from './foldersuggester';
import FootLinkerPlugin from './main';
import { SectionManagerModal } from './modals/sections';

interface RelatedFile {
  id: string;
  label: string;
  path: string;
}

export interface PathSetting {
  path: string;
  enabledCategories: string[];
}

interface JotItem {
  id: string;
  label: string;
  taskChar: string;
}

export const DEFAULT_SETTINGS = {
  relatedFiles: [] as RelatedFile[],
  pathSettings: [{
    path: '',
    enabledCategories: ['backlinks', 'related-files', 'jots']
  }],
  jotItems: [] as JotItem[],
  activeTab: 'related-files' as 'related-files' | 'footer-notes',
  showBacklinks: true
};

type PluginSettings = typeof DEFAULT_SETTINGS;

export class FootLinkerSettingTab extends PluginSettingTab {
  plugin: FootLinkerPlugin;

  constructor(app: App, plugin: FootLinkerPlugin) {
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
    const { containerEl } = this;
    containerEl.empty();

    this.createUI();
  }

  private createUI() {
    const container = this.containerEl;

    // Create tabs container
    const tabsContainer = container.createEl('div', { cls: 'jots-settings-tabs' });

    // Create tab buttons - renamed Related Files to Sections
    const sectionsBtn = tabsContainer.createEl('div', {
      cls: ['jots-settings-tab', this.plugin.settings.activeTab === 'related-files' ? 'is-active' : ''].join(' '),
      text: 'Sections'
    });

    const footerNotesBtn = tabsContainer.createEl('div', {
      cls: ['jots-settings-tab', this.plugin.settings.activeTab === 'footer-notes' ? 'is-active' : ''].join(' '),
      text: 'Notes with Footers'
    });

    // Create content containers with initial active state
    const sectionsContent = container.createEl('div', {
      cls: ['jots-settings-content', this.plugin.settings.activeTab === 'related-files' ? 'is-active' : ''].join(' ')
    });

    const footerNotesContent = container.createEl('div', {
      cls: ['jots-settings-content', this.plugin.settings.activeTab === 'footer-notes' ? 'is-active' : ''].join(' ')
    });

    // Add click handlers for tabs
    const setActiveTab = async (
      tabId: typeof DEFAULT_SETTINGS.activeTab,
      activeBtn: HTMLElement,
      activeContent: HTMLElement
    ) => {
      [sectionsBtn, footerNotesBtn].forEach(btn =>
        btn.removeClass('is-active'));
      [sectionsContent, footerNotesContent].forEach(content =>
        content.removeClass('is-active'));
      activeBtn.addClass('is-active');
      activeContent.addClass('is-active');
      this.plugin.settings.activeTab = tabId;
      await this.plugin.saveSettings();
    };

    sectionsBtn.addEventListener('click', () =>
      setActiveTab('related-files', sectionsBtn, sectionsContent));
    footerNotesBtn.addEventListener('click', () =>
      setActiveTab('footer-notes', footerNotesBtn, footerNotesContent));

    // Set initial active tab based on stored setting
    switch (this.plugin.settings.activeTab) {
      case 'footer-notes':
        setActiveTab('footer-notes', footerNotesBtn, footerNotesContent);
        break;
      default:
        setActiveTab('related-files', sectionsBtn, sectionsContent);
    }

    // Add content to tabs
    this.displayRelatedFilesSettings(sectionsContent);
    this.displayFooterNotesSettings(footerNotesContent);
  }

  displayRelatedFilesSettings(containerEl: HTMLElement) {
    containerEl.createEl('h3', { text: 'Date Related' });
    containerEl.createEl('p', { text: 'Sections of files grouped by folder and related by date.' });

    // Create column headers container
    const headerContainer = containerEl.createDiv({ cls: 'jots-settings-columns-header' });
    headerContainer.createSpan({ text: 'File Path', cls: 'jots-column-header' });
    headerContainer.createSpan({ text: 'Header', cls: 'jots-column-header' });

    // Existing Categories
    if (this.plugin.settings.relatedFiles?.length > 0) {
      this.plugin.settings.relatedFiles.forEach((section: RelatedFile, index: number) => {
        const setting = new Setting(containerEl);
        setting.settingEl.addClass('no-label');

        setting
          .addText(text => {
            text
              .setPlaceholder('Enter path')
              .setValue(section.path);

            new FolderSuggest(this.app, text.inputEl);

            text.onChange(async (value) => {
              this.plugin.settings.relatedFiles[index].path = value;
              await this.saveAndRefresh();
            });
          })
          .addText(text => text
            .setPlaceholder('Enter header')
            .setValue(section.label)
            .onChange(async (value) => {
              this.plugin.settings.relatedFiles[index].label = value;
              await this.saveAndRefresh();
            }))
          .addExtraButton(button => button
            .setIcon('trash')
            .setTooltip('Delete')
            .onClick(async () => {
              this.plugin.settings.relatedFiles.splice(index, 1);
              await this.saveAndRefresh();
              this.display();
            }));
      });
    }

    // Add Category button at bottom
    new Setting(containerEl)
      .addButton(button => button
        .setButtonText('Add Category')
        .onClick(async () => {
          if (!this.plugin.settings.relatedFiles) {
            this.plugin.settings.relatedFiles = [];
          }
          this.plugin.settings.relatedFiles.push({
            id: String(Date.now()),
            label: '',
            path: ''
          });
          await this.saveAndRefresh();
          this.display();
        }));

    // Add Jots Settings section
    containerEl.createEl('h3', { text: 'Jots Groupings' });
    containerEl.createEl('p', { text: 'Sections of Jots from the current file, grouped by Prefix.' });

    // Create column headers container for Jots
    const jotsHeaderContainer = containerEl.createDiv({ cls: 'settings-columns-header' });
    jotsHeaderContainer.createSpan({ text: 'Prefix', cls: 'column-header' });
    jotsHeaderContainer.createSpan({ text: 'Header', cls: 'column-header' });

    // Existing Jot Groups
    if (this.plugin.settings.jotItems?.length > 0) {
      this.plugin.settings.jotItems.forEach((jot: JotItem, index: number) => {
        const setting = new Setting(containerEl);
        setting.settingEl.addClass('no-label');

        setting
          .addText(text => text
            .setPlaceholder('Task char')
            .setValue(jot.taskChar)
            .onChange(async (value) => {
              this.plugin.settings.jotItems[index].taskChar = value;
              await this.saveAndRefresh();
            }))
          .addText(text => text
            .setPlaceholder('Enter header')
            .setValue(jot.label)
            .onChange(async (value) => {
              this.plugin.settings.jotItems[index].label = value;
              await this.saveAndRefresh();
            }))
          .addExtraButton(button => button
            .setIcon('trash')
            .setTooltip('Delete')
            .onClick(async () => {
              this.plugin.settings.jotItems.splice(index, 1);
              await this.saveAndRefresh();
              this.display();
            }));
      });
    }

    // Add Group button moved to bottom
    new Setting(containerEl)
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
  }

  displayFooterNotesSettings(containerEl: HTMLElement) {
    containerEl.createEl('h3', { text: 'Notes with Footers' });
    containerEl.createEl('p', { text: 'Configure which folders should display footers and what to show in each.' });

    // Add Global Settings section
    containerEl.createEl('h4', { text: 'Global Settings' });

    // Global Backlinks Toggle
    new Setting(containerEl)
      .setName('Show Backlinks')
      .setDesc('Enable or disable backlinks section in all markdown files')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showBacklinks)
        .onChange(async (value) => {
          this.plugin.settings.showBacklinks = value;
          await this.saveAndRefresh();
        }));

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
          .setName('Manage Footer Sections')
          .setDesc('Configure which sections to show in the footer')
          .addButton(button => button
            .setButtonText('Configure Sections')
            .onClick(() => {
              new SectionManagerModal(
                this.app,
                pathSetting,
                availableCategories,
                async (updatedPathSetting: PathSetting) => {
                  Object.assign(pathSetting, updatedPathSetting);
                  await this.plugin.saveSettings();
                  this.display();
                }
              ).open();
            }));
      });
    }
  }

  private setupDragAndDrop(container: HTMLElement, pathSetting: PathSetting): void {
    const list = container.querySelector('.selection-tag-list');
    if (!list || pathSetting.enabledCategories.length <= 1) return;

    let draggedEl: HTMLElement | null = null;

    const getTags = () => Array.from(list.querySelectorAll('.selection-tag')) as HTMLElement[];

    const onDragStart = (e: DragEvent, tag: HTMLElement) => {
      if (!e.dataTransfer) return;
      draggedEl = tag;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', ''); // Required for Firefox
      requestAnimationFrame(() => tag.classList.add('dragging'));
    };

    const onDragEnd = (tag: HTMLElement) => {
      draggedEl = null;
      requestAnimationFrame(() => tag.classList.remove('dragging'));

      // Get the new order immediately after drag ends
      const newOrder = getTags().map(t => t.querySelector('.selection-tag-label')?.textContent);

      // Update enabled categories order
      pathSetting.enabledCategories = newOrder
        .filter((label): label is string => !!label)
        .map(label => {
          const category = this.plugin.settings.relatedFiles.find(rf => rf.label === label);
          return category?.id || '';
        })
        .filter(id => id !== '');

      this.plugin.saveSettings();
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!draggedEl) return;

      const currentTags = getTags();
      const currentPos = currentTags.indexOf(draggedEl);
      if (currentPos === -1) return;

      const mouseY = e.clientY;
      let targetIndex = currentTags.findIndex(tag => {
        if (tag === draggedEl) return false;
        const rect = tag.getBoundingClientRect();
        return mouseY < (rect.top + rect.bottom) / 2;
      });

      if (targetIndex === -1) {
        targetIndex = currentTags.length;
      }

      if (targetIndex !== currentPos) {
        requestAnimationFrame(() => {
          if (!draggedEl) return;
          if (targetIndex === currentTags.length) {
            list.appendChild(draggedEl);
          } else {
            list.insertBefore(draggedEl, currentTags[targetIndex]);
          }
        });
      }
    };

    // Add event listeners to each tag
    getTags().forEach(tag => {
      tag.setAttribute('draggable', 'true');
      tag.addEventListener('dragstart', (e) => onDragStart(e as DragEvent, tag));
      tag.addEventListener('dragend', () => onDragEnd(tag));
    });

    // Add dragover listener to list
    list.addEventListener('dragover', (e) => onDragOver(e as DragEvent));
  }

  private updateSelectionDisplay(container: HTMLElement, pathSetting: PathSetting, availableCategories: RelatedFile[]): void {
    // Remove existing display if any
    const existingDisplay = container.querySelector('.selected-items');
    if (existingDisplay) existingDisplay.remove();

    // Create new display
    const displayDiv = container.createDiv({ cls: 'selected-items' });
    const tagList = displayDiv.createDiv({ cls: 'selection-tag-list' });

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

export interface FootLinkerSettings {
  pathSettings: PathSetting[];
}

export function migrateSettings(settings: FootLinkerSettings) {
  settings.pathSettings.forEach((pathSetting: PathSetting) => {
    if (!pathSetting.enabledCategories) {
      pathSetting.enabledCategories = ['backlinks', 'related-files', 'jots'];
    }
  });
}