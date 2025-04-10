const { Plugin, PluginSettingTab, debounce, MarkdownView } = require('obsidian');
const { DEFAULT_SETTINGS, FootLinkerSettingTab } = require('./settings');
const { formatDate } = require('./utils/formatDate');

function aliasesContains(fileName, aliases) {
  return aliases.some(alias => fileName.includes(alias));
}


class FootLinkerPlugin extends Plugin {
  async onload() {
    console.log("Loading FootLinker plugin...");
    // Load the plugin's CSS file
    this.injectCSSFromFile();

    await this.loadSettings();

    const updateFootLinkerCallback = async () => {
      try {
        await this.updateFootLinker();
      } catch (error) {
        console.error("Error in updateFootLinkerCallback:", error);
      }
    };

    this.debouncedUpdateFootLinker = debounce(updateFootLinkerCallback, this.settings.updateDelay, true);
    this.immediateUpdateFootLinker = updateFootLinkerCallback;

    this.addSettingTab(new FootLinkerSettingTab(this.app, this));

    this.registerEventHandlers();
    this.app.workspace.onLayoutReady(() => this.immediateUpdateFootLinker());
  }

  async injectCSSFromFile() {
    try {
      const cssPath = `.obsidian/plugins/${this.manifest.id}/styles.css`;
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
    if (!Array.isArray(this.settings.excludedFolders)) {
      this.settings.excludedFolders = [];
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  registerEventHandlers() {
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache?.frontmatter) {
          const { customCreatedDateProp, customModifiedDateProp } = this.settings;
          if (customCreatedDateProp in cache.frontmatter || customModifiedDateProp in cache.frontmatter) {
            this.isEditMode() ? this.debouncedUpdateFootLinker() : this.immediateUpdateFootLinker();
          }
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.immediateUpdateFootLinker())
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.isEditMode() ? this.debouncedUpdateFootLinker() : this.immediateUpdateFootLinker();
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-open", () => this.immediateUpdateFootLinker())
    );

    this.registerEvent(
      this.app.workspace.on("mode-change", () => this.immediateUpdateFootLinker())
    );

    this.registerEvent(
      this.app.workspace.on("editor-change", () => this.debouncedUpdateFootLinker())
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
        this.removeExistingFootLinker(view.contentEl);
        return;
      }

      const container = this.getContainer(view);
      if (!container || this.isExcludedBySelector(container)) {
        this.removeExistingFootLinker(view.contentEl);
        return;
      }

      this.removeExistingFootLinker(view.contentEl);
      this.disconnectObservers();

      const footLinker = await this.createFootLinker(file);
      container.appendChild(footLinker);
      this.observeContainer(container);
    } catch (error) {
      console.error("Error in addFootLinker:", error);
    }
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

  removeExistingFootLinker(container) {
    container.querySelectorAll(".footlinker").forEach((el) => el.remove());
  }

  disconnectObservers() {
    this.contentObserver?.disconnect();
    this.containerObserver?.disconnect();
  }

  observeContainer(container) {
    this.containerObserver = new MutationObserver(async () => {
      if (!container.querySelector(".footlinker")) {
        const view = this.app.workspace.activeLeaf?.view;
        if (view instanceof MarkdownView) {
          await this.addFootLinker(view);
        }
      }
    });
    this.containerObserver.observe(container, { childList: true, subtree: true });
  }

  async createFootLinker(file) {
    const footLinker = createDiv({ cls: "footlinker footlinker--hidden" });
    footLinker.createDiv({ cls: "footlinker--dashed-line" });

    this.addBacklinks(footLinker, file);
    this.addFootLinks(footLinker, file);

    setTimeout(() => footLinker.removeClass("footlinker--hidden"), 10);
    return footLinker;
  }



  addFootLinks(footLinker, file) {
    let grabdate = file.name.split("_");
    let grabparts = grabdate[0].split("-");
    let year = grabparts[0];
    let month = grabparts[1];
    let day = grabparts[2];
    let newdate = year + month + day;
  
    // Begin Journals
    if (file.path.includes("Chrono/Journals")) {
      const sections = [
        { path: 'Chrono/Documents', cls: 'documents' },
        { path: 'Chrono/Email', cls: 'email' },
        { path: 'Chrono/Photos', cls: 'photo' },
        { path: 'Chrono/Private', cls: 'private' }
      ];
  
      sections.forEach(section => {
        const sectionPath = `${section.path}/${year}/${year}-${month}`;
        const sectionFiles = app.vault.getFiles()
          .filter(file => file.path.includes(sectionPath) && file.name.includes(newdate))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(file => file.path);
        const sectionDiv = footLinker.createDiv({ cls: `footlinker--${section.cls}` }); // Fixed here
        const sectionUl = sectionDiv.createEl("ul");
        for (const linkPath of sectionFiles) {
          const li = sectionUl.createEl("li");
          const link = li.createEl("a", {
            href: linkPath,
            text: linkPath.split("/").pop(),
            cls: this.isEditMode() ? "cm-hmd-internal-link cm-underline" : "internal-link"
          });
          link.dataset.href = linkPath;
          link.dataset.sourcePath = file.path;
          this.setupLinkBehavior(link, linkPath, file);
        }
        if (sectionUl.childElementCount === 0) {
          sectionDiv.remove();
        }
      });
      // End Journals
    } else if (file.path.includes("Notes") || file.path.includes("CRM/People") || file.path.includes("CRM/Places") || file.path.includes("CRM/Organizations")) {
      // Begin Notes
      const sections = [
        { path: 'Chrono/Documents', cls: 'documents' },
        { path: 'Chrono/Email', cls: 'email' },
        { path: 'Chrono/Photos', cls: 'photo' },
        { path: 'Chrono/Private', cls: 'private' }
      ];
  
      sections.forEach(section => {
        const activeFile = this.app.workspace.getActiveFile();
      
        this.app.vault.read(activeFile).then(fileContent => {
          const cache = this.app.metadataCache.getFileCache(activeFile);
          const frontMatter = cache?.frontmatter;
          const aliases = Array.isArray(frontMatter?.aliases) ? frontMatter.aliases.map(alias => alias.replace(/^- /, '').trim()) : [];
          const sectionFiles = this.app.vault.getFiles()
            .filter(file => file.path.includes(section.path) && (file.name.includes(activeFile.basename) || aliasesContains(file.name, aliases)))
            .sort((a, b) => b.name.localeCompare(a.name))
            .map(file => file.path);
          const sectionDiv = footLinker.createDiv({ cls: `footlinker--${section.cls}` });
          const sectionUl = sectionDiv.createEl("ul");
          for (const linkPath of sectionFiles) {
            const li = sectionUl.createEl("li");
            const link = li.createEl("a", {
              href: linkPath,
              text: linkPath.split("/").pop(),
              cls: this.isEditMode() ? "cm-hmd-internal-link cm-underline" : "internal-link"
            });
            link.dataset.href = linkPath;
            link.dataset.sourcePath = activeFile.path;
            this.setupLinkBehavior(link, linkPath, activeFile);
          }
          if (sectionUl.childElementCount === 0) {
            sectionDiv.remove();
          }
        });
      });      // End Notes
    }
  }


  addBacklinks(footLinker, file) {
    const backlinksData = this.app.metadataCache.getBacklinksForFile(file);
    if (!backlinksData?.data?.size) return;

    const backlinksDiv = footLinker.createDiv({ cls: "footlinker--backlinks" });
    const backlinksUl = backlinksDiv.createEl("ul");

    Array.from(backlinksData.data.keys())
      .filter((linkPath) => linkPath.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b))
      .forEach((linkPath) => {
        const li = backlinksUl.createEl("li");
        const link = li.createEl("a", {
          href: linkPath,
          text: linkPath.split("/").pop().slice(0, -3),
          cls: this.isEditMode() ? "cm-hmd-internal-link cm-underline" : "internal-link",
        });
        link.dataset.href = linkPath;
        link.dataset.sourcePath = file.path;
        this.setupLinkBehavior(link, linkPath, file);
      });

    if (!backlinksUl.childElementCount) backlinksDiv.remove();
  }

  addDates(footLinker, file) {
    const datesWrapper = footLinker.createDiv({ cls: "footlinker--dates-wrapper" });
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;

    const modifiedDate = this.getFormattedDate(
      frontmatter?.[this.settings.customModifiedDateProp],
      file.stat.mtime
    );
    datesWrapper.createDiv({ cls: "footlinker--modified-date", text: modifiedDate });

    const createdDate = this.getFormattedDate(
      frontmatter?.[this.settings.customCreatedDateProp],
      file.stat.ctime
    );
    datesWrapper.createDiv({ cls: "footlinker--created-date", text: createdDate });
  }

  getFormattedDate(customDate, fallbackDate) {
    if (customDate && !isNaN(Date.parse(customDate))) {
      return formatDate(new Date(customDate), this.settings.dateDisplayFormat);
    }
    return formatDate(new Date(fallbackDate), this.settings.dateDisplayFormat);
  }


  setupLinkBehavior(link, linkPath, file) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      this.app.workspace.openLinkText(linkPath, file.path);
    });
  }

  onunload() {
    console.log("Unloading FootLinker plugin...");
    this.disconnectObservers();
    document.querySelectorAll(".footlinker").forEach((el) => el.remove());
    this.removeCSS();

  }
}

export default FootLinkerPlugin;