import { Plugin, PluginSettingTab, debounce, MarkdownView } from 'obsidian';
import { DEFAULT_SETTINGS, FootLinkerSettingTab } from './settings.ts';
import { formatDate } from './utils/formatDate';
import { addBacklinks } from './sections/backlinks';
import { addFootLinks } from './sections/relatedfiles';
import { addJots } from './sections/jots';
import { addTasks, clearTaskQueries } from './sections/tasks';

function aliasesContains(fileName, aliases) {
  return aliases.some(alias => fileName.includes(alias));
}

export default class FootLinkerPlugin extends Plugin {
  async onload() {
    console.log("Loading FootLinker plugin...");

    // Load settings first before anything else
    await this.loadSettings();

    // Initialize update functions
    const updateFootLinkerCallback = async () => {
      try {
        await this.updateFootLinker();
      } catch (error) {
        console.error("Error in updateFootLinkerCallback:", error);
      }
    };

    this.immediateUpdateFootLinker = updateFootLinkerCallback;
    this.debouncedUpdateFootLinker = debounce(updateFootLinkerCallback, 1000, true);

    // Load CSS file
    await this.injectCSSFromFile();

    // Add settings tab
    this.addSettingTab(new FootLinkerSettingTab(this.app, this));

    // Register event handlers
    this.registerEventHandlers();

    // Update footer after everything is ready
    this.app.workspace.onLayoutReady(() => this.immediateUpdateFootLinker());
  }

  async injectCSSFromFile() {
    try {
      // Use plugin directory path instead of dist/
      const cssPath = `${this.app.vault.configDir}/plugins/${this.manifest.id}/styles.css`;
      const css = await this.app.vault.adapter.read(cssPath);

      // Remove any existing style element for styles.css
      const existingStyle = document.getElementById("footlinker-styles-css");
      if (existingStyle) {
        existingStyle.remove();
      }

      // Create a new style element for styles.css
      const style = document.createElement("style");
      style.id = "footlinker-styles-css";
      style.textContent = css;

      // Append the style element to the document head
      document.head.appendChild(style);
    } catch (error) {
      console.error("Error injecting CSS from file:", error);
    }
  }

  removeCSS() {
    // Remove the dynamically injected CSS
    const dynamicStyle = document.getElementById("footlinker-dynamic-css");
    if (dynamicStyle) {
      dynamicStyle.remove();
    }

    // Remove the CSS injected from styles.css
    const fileStyle = document.getElementById("footlinker-styles-css");
    if (fileStyle) {
      fileStyle.remove();
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Initialize settings if they don't exist
    if (!this.settings.relatedFiles || this.settings.relatedFiles.length !== 5) {
      this.settings.relatedFiles = Array(5).fill().map((_, i) => ({
        id: (i + 1).toString(),
        label: '',
        path: ''
      }));
    }

    if (!Array.isArray(this.settings.pathSettings)) {
      this.settings.pathSettings = [];
    }

    if (!this.settings.jotItems) {
      this.settings.jotItems = [];
    }

    if (!this.settings.tasksSettings) {
      this.settings.tasksSettings = {
        headerName: 'Tasks',
        query: ''
      };
    }

    await this.saveSettings();
    console.log("Settings loaded:", this.settings);
  }

  async saveSettings() {
    // Ensure sectionSettings exists before saving
    if (!this.settings.sectionSettings) {
      this.settings.sectionSettings = {};
    }
    await this.saveData(this.settings);
    // Refresh footers after settings change
    await this.removeExistingFooters();
    await this.immediateUpdateFootLinker();
  }

  registerEventHandlers() {
    // A single, debounced handler for all content changes
    const handleContentChange = () => {
      if (this.isEditMode()) {
        this.debouncedUpdateFootLinker();
      } else {
        this.immediateUpdateFootLinker();
      }
    };

    // Only register essential events
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", handleContentChange)
    );

    this.registerEvent(
      this.app.workspace.on("file-open", handleContentChange)
    );

    // Use a more aggressive debounce for editor changes
    const debouncedEditorHandler = debounce(handleContentChange, 2000, true);
    this.registerEvent(
      this.app.workspace.on("editor-change", debouncedEditorHandler)
    );
  }

  async updateFootLinker() {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (activeLeaf?.view instanceof MarkdownView) {
      await this.addFootLinker(activeLeaf.view);
    }
  }

  async addFootLinker(view) {
    try {
      const file = view.file;
      if (!file) {
        await this.removeExistingFootLinker(view.contentEl);
        return;
      }

      const container = this.getContainer(view);
      if (!container || this.isExcludedBySelector(container)) {
        await this.removeExistingFootLinker(view.contentEl);
        return;
      }

      // Always disconnect observers before any DOM operations
      this.disconnectObservers();

      // Remove any existing footers and wait for the animation to complete
      await this.removeExistingFootLinker(view.contentEl);

      const footLinker = await this.createFootLinker(file);

      // Double check no footers exist before adding the new one
      container.querySelectorAll(".footlinker").forEach(el => el.remove());

      container.appendChild(footLinker);
      this.observeContainer(container);
    } catch (error) {
      console.error("Error in addFootLinker:", error);
    }
  }

  async createFootLinker(file) {
    const footLinker = createDiv({ cls: "footlinker footlinker--hidden" });

    // Set CSS custom properties for ordering using the setting
    footLinker.style.setProperty('--footlinker-z-index', String(this.settings.footerOrder));
    footLinker.style.setProperty('--footlinker-order', String(this.settings.footerOrder));

    footLinker.createDiv({ cls: "footlinker--dashed-line" });

    const pathSetting = this.findMatchingPathSetting(file.path);

    if (pathSetting?.showBacklinks) {
      addBacklinks(footLinker, file, this.app, this.setupLinkBehavior.bind(this), this.isEditMode.bind(this));
    }

    // Add tasks section if query is configured
    if (this.settings.tasksSettings?.query) {
      await addTasks(footLinker, file, this.app, this.settings.tasksSettings, this.isEditMode.bind(this));
    }

    // Add jots section if there are any configured jot items
    if (this.settings.jotItems?.length > 0) {
      addJots(footLinker, file, this.app, this.settings.jotItems, this.isEditMode.bind(this));
    }

    if (pathSetting?.enabledCategories?.length) {
      const enabledCategories = pathSetting.enabledCategories
        .map(id => this.settings.relatedFiles.find(rf => rf.id === id))
        .filter(category => category && category.label && category.path);

      addFootLinks(footLinker, file, this.app, enabledCategories, this.setupLinkBehavior.bind(this), this.isEditMode.bind(this));
    }

    setTimeout(() => footLinker.removeClass("footlinker--hidden"), 10);
    return footLinker;
  }

  getContainer(view) {
    const content = view.contentEl;
    if (this.isPreviewMode(view)) {
      return Array.from(content.querySelectorAll(".markdown-preview-section")).find(
        (section) => !section.closest(".internal-embed")
      );
    } else if (this.isEditMode(view)) {
      return content.querySelector(".cm-sizer");
    }
    return null;
  }

  isPreviewMode(view) {
    return view.getMode?.() === "preview" || view.mode === "preview";
  }

  isEditMode(view) {
    const activeView = view || this.app.workspace.getActiveViewOfType(MarkdownView);
    return activeView?.getMode?.() === "source" || activeView?.mode === "source";
  }

  isExcludedBySelector(container) {
    return this.settings.excludedParentSelectors?.some((selector) => {
      try {
        return container.matches(selector) || container.querySelector(selector);
      } catch (e) {
        console.error(`Invalid selector in settings: ${selector}`);
        return false;
      }
    });
  }

  async removeExistingFooters() {
    // Remove footers from all markdown views
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    await Promise.all(leaves.map(leaf => {
      if (leaf.view instanceof MarkdownView) {
        return this.removeExistingFootLinker(leaf.view.contentEl);
      }
      return Promise.resolve();
    }));
  }

  removeExistingFootLinker(container) {
    return new Promise((resolve) => {
      // Disconnect any existing observers first
      this.disconnectObservers();

      const footers = container.querySelectorAll(".footlinker");
      if (footers.length === 0) {
        resolve();
        return;
      }

      let remainingFooters = footers.length;

      // Remove all footlinker elements with fade animation
      footers.forEach((el) => {
        el.addClass("footlinker--hidden");
        setTimeout(() => {
          el.remove();
          remainingFooters--;
          if (remainingFooters === 0) {
            resolve();
          }
        }, 600);
      });
    });
  }

  disconnectObservers() {
    this.contentObserver?.disconnect();
    this.containerObserver?.disconnect();
  }

  observeContainer(container) {
    // Add a rate limit to prevent rapid successive updates
    let updateTimeout = null;
    const UPDATE_DELAY = 1000; // 1 second minimum between updates

    this.containerObserver = new MutationObserver(() => {
      if (!container.querySelector(".footlinker")) {
        // Clear any pending update
        if (updateTimeout) {
          clearTimeout(updateTimeout);
        }

        // Schedule new update with delay
        updateTimeout = setTimeout(async () => {
          const view = this.app.workspace.activeLeaf?.view;
          if (view instanceof MarkdownView) {
            await this.addFootLinker(view);
          }
          updateTimeout = null;
        }, UPDATE_DELAY);
      }
    });

    // Only observe necessary changes
    this.containerObserver.observe(container, {
      childList: true,
      subtree: false // Don't observe deep changes
    });
  }

  findMostSpecificPathPattern(filePath) {
    const normalizedFilePath = filePath.replace(/\/+/g, '/').trim();
    const patterns = Object.keys(this.settings.pathSettings || {});

    // Sort patterns by specificity (length and number of path segments)
    const sortedPatterns = patterns.sort((a, b) => {
      const aNorm = a.replace(/\/+/g, '/').trim();
      const bNorm = b.replace(/\/+/g, '/').trim();
      // Compare number of segments first
      const aSegments = aNorm.split('/').length;
      const bSegments = bNorm.split('/').length;
      if (aSegments !== bSegments) {
        return bSegments - aSegments; // More segments = more specific
      }
      // If same number of segments, longer path = more specific
      return bNorm.length - aNorm.length;
    });

    // Find the first (most specific) matching pattern
    return sortedPatterns.find(pattern => {
      const normalizedPattern = pattern.replace(/\/+/g, '/').trim();
      return normalizedFilePath.includes(normalizedPattern);
    });
  }

  getSectionPath(sectionId, pathPattern) {
    const pathSettings = this.settings.pathSettings[pathPattern];
    // Check if there's a custom path for this section in the path settings
    if (pathSettings?.sectionPaths?.[sectionId]) {
      return pathSettings.sectionPaths[sectionId];
    }
    // Otherwise use the default path from availableSections
    const section = this.settings.availableSections.find(s => s.id === sectionId);
    return section?.defaultPath;
  }

  findMatchingPathSetting(filePath) {
    if (!this.settings.pathSettings) return null;

    // Find the most specific (longest) matching path
    return this.settings.pathSettings
      .filter(ps => filePath.startsWith(ps.path))
      .sort((a, b) => b.path.length - a.path.length)[0];
  }

  setupLinkBehavior(link, linkPath, file) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      this.app.workspace.openLinkText(linkPath, file.path);
    });
  }

  async generateFooter(file) {
    const footer = document.createElement('div');
    footer.classList.add('foot-links');

    // Get active sections for this file path
    const pathSettings = this.getPathSettings(file.path);
    if (!pathSettings || !pathSettings.enabled) {
      return footer;
    }

    const activeSections = pathSettings.sections;

    // Generate related files section
    const relatedLinks = await this.getRelatedLinks(file, activeSections);
    if (relatedLinks && relatedLinks.childNodes.length > 0) {
      footer.appendChild(relatedLinks);
    }

    // ...existing code for dates and backlinks...

    return footer;
  }

  async getRelatedLinks(file, activeSections) {
    const container = document.createElement('div');
    container.classList.add('related-links');

    const allFiles = this.app.vault.getFiles();
    let hasContent = false;

    // Process each active section
    for (const sectionId of activeSections) {
      const section = this.settings.relatedFiles.find(s => s.id === sectionId);
      if (!section || !section.label || !section.path) continue;

      const sectionFiles = allFiles.filter(f =>
        f.path.startsWith(section.path) &&
        f.path !== file.path &&
        !this.settings.excludedFolders.some(folder => f.path.startsWith(folder))
      );

      if (sectionFiles.length > 0) {
        hasContent = true;
        const sectionDiv = document.createElement('div');
        sectionDiv.classList.add('related-section');

        const header = document.createElement('div');
        header.classList.add('related-header');
        header.textContent = section.label;
        sectionDiv.appendChild(header);

        const linkList = document.createElement('div');
        linkList.classList.add('related-list');

        sectionFiles.forEach(relatedFile => {
          const link = this.createFileLink(relatedFile);
          linkList.appendChild(link);
        });

        sectionDiv.appendChild(linkList);
        container.appendChild(sectionDiv);
      }
    }

    return hasContent ? container : null;
  }

  async onunload() {
    console.log("Unloading FootLinker plugin...");
    // First disconnect all observers
    this.disconnectObservers();

    // Clear any pending task queries
    clearTaskQueries();

    // Then remove all footers and wait for them to be cleaned up
    await Promise.all(
      this.app.workspace.getLeavesOfType("markdown")
        .map(leaf => {
          if (leaf.view instanceof MarkdownView) {
            return this.removeExistingFootLinker(leaf.view.contentEl);
          }
          return Promise.resolve();
        })
    );

    // Finally remove CSS
    this.removeCSS();
  }
}