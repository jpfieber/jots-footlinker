import { Plugin, PluginSettingTab, debounce, MarkdownView, TFile, App, MetadataCache } from 'obsidian';
import { DEFAULT_SETTINGS, FootLinkerSettingTab } from './settings';
import { formatDate } from './utils/formatDate';
import { addBacklinks, BacklinksSection } from './sections/backlinks';
import { addFootLinks } from './sections/relatedfiles';
import { addJots } from './sections/jots';

// Define interfaces for the plugin settings
interface RelatedFile {
  id: string;
  label: string;
  path: string;
}

interface PathSetting {
  path: string;
  enabledCategories: string[];
}

interface JotItem {
  id: string;
  label: string;
  taskChar: string;
}

interface PluginSettings {
  relatedFiles: RelatedFile[];
  pathSettings: PathSetting[];
  jotItems: JotItem[];
  activeTab: 'related-files' | 'footer-notes';
  excludedParentSelectors?: string[];
  excludedFolders?: string[];
  footerOrder?: number;
  showBacklinks: boolean;
}

// Import ObsidianApp interface from backlinks module
export interface ObsidianApp extends App {
    metadataCache: MetadataCache;
}

function aliasesContains(fileName: string, aliases: string[]): boolean {
  return aliases.some((alias: string) => fileName.includes(alias));
}

export default class FootLinkerPlugin extends Plugin {
  settings!: PluginSettings;
  private immediateUpdateFootLinker: () => Promise<void> = async () => { };
  private debouncedUpdateFootLinker: () => void = () => { };
  private contentObserver: MutationObserver | null = null;
  private containerObserver: MutationObserver | null = null;
  private settingTab: FootLinkerSettingTab | null = null;

  async onload() {
    console.log("FootLinker: Loading Plugin...");

    try {
      await this.loadSettings();

      if (!this.settings) {
        throw new Error("Failed to initialize plugin settings");
      }

      const updateFootLinkerCallback = async () => {
        try {
          await this.updateFootLinker();
        } catch (error) {
          console.error("[FootLinker] Error in updateFootLinkerCallback:", error);
        }
      };

      this.immediateUpdateFootLinker = updateFootLinkerCallback;
      this.debouncedUpdateFootLinker = debounce(updateFootLinkerCallback, 1000, true);

      this.settingTab = new FootLinkerSettingTab(this.app, this);
      this.addSettingTab(this.settingTab);

      this.registerEventHandlers();

      this.app.workspace.onLayoutReady(async () => {
        try {
          await this.loadStylesheet();
          await this.immediateUpdateFootLinker();
        } catch (error) {
          console.error("[FootLinker] Error during layout ready:", error);
        }
      });

    } catch (error) {
      console.error("[FootLinker] Critical error during plugin load:", error);
    }
  }

  onunload() {
    console.log("FootLinker: Unloading plugin...");
    this.disconnectObservers();
    this.unloadStylesheet();
    this.settingTab = null;
  }

  private async loadStylesheet() {
    try {
      const possiblePaths = [
        `${this.app.vault.configDir}/plugins/${this.manifest.id}/styles.css`,
        `${this.app.vault.configDir}/plugins/${this.manifest.id}/dist/styles.css`,
        `${this.app.vault.configDir}/plugins/${this.manifest.id}/src/styles/styles.css`
      ];

      let css = '';
      for (const path of possiblePaths) {
        try {
          css = await this.app.vault.adapter.read(path);
          if (css) break;
        } catch (e) {
          continue;
        }
      }

      if (!css) {
        // Use default styles as fallback
        css = DEFAULT_STYLES;
      }

      const existingStyle = document.getElementById("footlinker-styles-css");
      if (existingStyle) {
        existingStyle.remove();
      }

      const style = document.createElement("style");
      style.id = "footlinker-styles-css";
      style.textContent = css;
      document.head.appendChild(style);

    } catch (error) {
      console.error("[FootLinker] Critical error loading stylesheet:", error);
    }
  }

  private unloadStylesheet() {
    const style = document.getElementById("footlinker-styles-css");
    if (style) {
      style.remove();
    }
  }

  async loadSettings() {
    try {
      console.debug("[FootLinker] Loading settings...");
      const loadedData = await this.loadData();
      if (loadedData) {
        // Start with default settings to ensure all fields exist
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...loadedData
        };

        // Re-map relatedFiles to preserve IDs
        if (Array.isArray(loadedData.relatedFiles)) {
          this.settings.relatedFiles = loadedData.relatedFiles.map((rf: any) => ({
            id: rf.id || String(Date.now()),
            label: rf.label || '',
            path: rf.path || ''
          }));
        }

        // Explicitly handle showBacklinks setting
        this.settings.showBacklinks = loadedData.showBacklinks ?? DEFAULT_SETTINGS.showBacklinks;

        console.debug("[FootLinker] Settings loaded:", {
          backlinksEnabled: this.settings.showBacklinks,
          pathSettingsCount: this.settings.pathSettings?.length,
          relatedFilesCount: this.settings.relatedFiles.length
        });
      } else {
        console.debug("[FootLinker] No saved settings found, using defaults");
        this.settings = { ...DEFAULT_SETTINGS };
      }
    } catch (error) {
      console.error('[FootLinker] Failed to load settings:', error);
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings() {
    try {
      // Save settings
      await this.saveData(this.settings);

      // Instead of removing and recreating all footers,
      // just update the active one
      const activeLeaf = this.app.workspace.activeLeaf;
      if (activeLeaf?.view instanceof MarkdownView) {
        await this.updateFootLinker();
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  registerEventHandlers() {
    // A single, debounced handler for all content changes
    const handleContentChange = () => {
      if (this.isEditMode(null)) {  // Pass null explicitly
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

  async createFootLinker(file: TFile) {
    console.debug("[FootLinker] Creating footer for file:", file.path);
    const footLinker = createDiv({ cls: "footlinker footlinker--hidden" });

    // Set CSS custom properties for ordering using the setting
    footLinker.style.setProperty('--footlinker-z-index', String(this.settings.footerOrder));
    footLinker.style.setProperty('--footlinker-order', String(this.settings.footerOrder));

    footLinker.createDiv({ cls: "footlinker--dashed-line" });

    let hasContent = false;

    // Add backlinks section if enabled globally
    if (this.settings.showBacklinks) {
      console.debug("[FootLinker] Adding backlinks section...");
      const backlinksSection = new BacklinksSection();
      const obsidianApp = this.app as unknown as ObsidianApp;
      try {
        await addBacklinks(backlinksSection, footLinker, file, obsidianApp);
        const hasBacklinksContent = footLinker.querySelector(".footlinker--backlinks") !== null;
        hasContent = hasContent || hasBacklinksContent;
        console.debug("[FootLinker] Backlinks section added:", { hasBacklinksContent });
      } catch (error) {
        console.error("[FootLinker] Error adding backlinks:", error);
      }
    } else {
      console.debug("[FootLinker] Backlinks are disabled in settings");
    }

    // Add other sections based on path settings
    const pathSetting = this.findMatchingPathSetting(file.path);
    if (pathSetting?.enabledCategories?.length) {
      console.debug("[FootLinker] Adding enabled categories from path settings...");
      // Filter out backlinks from enabledCategories since we handle it separately now
      let categories = pathSetting.enabledCategories.filter(id => id !== 'backlinks');

      const enabledCategories = categories
        .map(id => this.settings.relatedFiles.find(rf => rf.id === id))
        .filter((category): category is RelatedFile =>
          category !== undefined && !!category.label && !!category.path);

      if (enabledCategories.length > 0) {
        try {
          addFootLinks(
            footLinker,
            file,
            this.app,
            enabledCategories,
            this.setupLinkBehavior.bind(this),
            () => this.isEditMode(null)
          );
          hasContent = hasContent || true;
        } catch (error) {
          console.error("[FootLinker] Error adding foot links:", error);
        }
      }
    }

    // Add jots section if there are any configured jot items
    if (this.settings.jotItems?.length > 0) {
      console.debug("[FootLinker] Adding jots section...");
      try {
        await addJots(
          footLinker,
          file,
          this.app,
          this.settings.jotItems,
          () => this.isEditMode(null)
        );
        hasContent = hasContent || footLinker.querySelector(".footlinker--jots") !== null;
      } catch (error) {
        console.error("[FootLinker] Error adding jots:", error);
      }
    }

    // Only show the footer if it has content
    if (hasContent) {
      console.debug("[FootLinker] Footer has content, showing after delay");
      setTimeout(() => footLinker.removeClass("footlinker--hidden"), 50);
    } else {
      console.debug("[FootLinker] Footer has no content, removing");
      footLinker.remove();
      return null;
    }

    return footLinker;
  }

  async addFootLinker(view: MarkdownView) {
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

      this.disconnectObservers();
      await this.removeExistingFootLinker(view.contentEl);      const footLinker = await this.createFootLinker(file);
      container.querySelectorAll(".footlinker").forEach((el: Element) => el.remove());
      if (footLinker) {
        container.appendChild(footLinker);
        this.observeContainer(container);
      }
    } catch (error) {
      console.error("Error in addFootLinker:", error);
    }
  }

  getContainer(view: MarkdownView): HTMLElement | null {
    const content = view.contentEl;
    if (this.isPreviewMode(view)) {
      return Array.from(content.querySelectorAll(".markdown-preview-section")).find(
        (section: Element) => !section.closest(".internal-embed")
      ) as HTMLElement || null;
    } else if (this.isEditMode(view)) {
      return content.querySelector(".cm-sizer");
    }
    return null;
  }

  isPreviewMode(view: MarkdownView | null): boolean {
    return view?.getMode?.() === "preview" || false;  // Remove mode check
  }

  isEditMode(view: MarkdownView | null): boolean {
    const activeView = view || this.app.workspace.getActiveViewOfType(MarkdownView);
    return activeView?.getMode?.() === "source" || false;  // Remove mode check
  }

  isExcludedBySelector(container: HTMLElement): boolean {
    return this.settings.excludedParentSelectors?.some((selector: string) => {
      try {
        return container.matches(selector) || !!container.querySelector(selector);
      } catch (e) {
        console.error(`Invalid selector in settings: ${selector}`);
        return false;
      }
    }) || false;
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

  removeExistingFootLinker(container: HTMLElement): Promise<void> {
    return new Promise<void>((resolve) => {
      this.disconnectObservers();

      const footers = container.querySelectorAll(".footlinker");
      if (footers.length === 0) {
        resolve();
        return;
      }

      let remainingFooters = footers.length;

      footers.forEach((el: Element) => {
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

  observeContainer(container: HTMLElement): void {
    let updateTimeout: NodeJS.Timeout | null = null;
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

  findMostSpecificPathPattern(filePath: string) {
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

  findMatchingPathSetting(filePath: string): PathSetting | undefined {
    if (!this.settings.pathSettings) return undefined;

    // Find the most specific (longest) matching path
    return this.settings.pathSettings
      .filter((ps: PathSetting) => filePath.startsWith(ps.path))
      .sort((a: PathSetting, b: PathSetting) => b.path.length - a.path.length)[0];
  }

  setupLinkBehavior(link: HTMLElement, linkPath: string, file: TFile): void {
    link.addEventListener("click", (event: MouseEvent) => {
      event.preventDefault();
      this.app.workspace.openLinkText(linkPath, file.path);
    });
  }

  // Remove unused methods
  getSectionPath = undefined;
  generateFooter = undefined;
  getRelatedLinks = undefined;
}

// Default minimal styles to ensure basic functionality
const DEFAULT_STYLES = `
.footlinker {
    margin: 30px 0 20px;
    padding-top: 10px;
    opacity: 1;
    transition: opacity 600ms ease-in-out;
}
.footlinker--hidden { opacity: 0; }
.footlinker--dashed-line {
    border-top: 1px dashed var(--text-accent);
}
`;