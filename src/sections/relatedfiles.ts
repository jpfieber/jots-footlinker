import { TFile, App } from 'obsidian';

export interface RelatedFile {
    id: string;
    label: string;
    path: string;
}

export interface RelatedFilesOptions {
    enabledCategories: string[];
}

function aliasesContains(fileName: string, aliases: string[]): boolean {
    return aliases.some(alias => fileName.includes(alias));
}

export function addFootLinks(
    footLinker: HTMLElement,
    file: TFile,
    app: App,
    enabledCategories: RelatedFile[],
    setupLinkBehavior: (link: HTMLElement, linkPath: string, file: TFile) => void,
    isEditMode: () => boolean
): void {
    // Handle journal entries specifically
    if (file.path.includes("Chrono/Journals")) {
        addJournalLinks(footLinker, file, app, enabledCategories, setupLinkBehavior, isEditMode);
    } else {
        addRegularLinks(footLinker, file, app, enabledCategories, setupLinkBehavior, isEditMode);
    }
}

function addJournalLinks(
    footLinker: HTMLElement,
    file: TFile,
    app: App,
    enabledCategories: RelatedFile[],
    setupLinkBehavior: (link: HTMLElement, linkPath: string, file: TFile) => void,
    isEditMode: () => boolean
): void {
    const grabdate = file.name.split("_");
    const grabparts = grabdate[0].split("-");
    const [year, month, day] = grabparts;
    const newdate = year + month + day;

    // Process categories in chunks to prevent UI blocking
    let currentCategory = 0;
    const processNextCategory = () => {
        if (currentCategory >= enabledCategories.length) return;

        const category = enabledCategories[currentCategory];
        const sectionPath = `${category.path}/${year}/${year}-${month}`;

        // Use cached files instead of doing a full vault search
        const sectionFiles = app.vault.getFiles()
            .filter((f: TFile) => f.path.includes(sectionPath) && f.name.includes(newdate))
            .sort((a: TFile, b: TFile) => a.name.localeCompare(b.name))
            .map((f: TFile) => f.path);

        if (sectionFiles.length > 0) {
            createSectionElement(footLinker, category, sectionFiles, file, setupLinkBehavior, isEditMode);
        }

        currentCategory++;
        if (currentCategory < enabledCategories.length) {
            requestAnimationFrame(processNextCategory);
        }
    };

    processNextCategory();
}

function addRegularLinks(
    footLinker: HTMLElement,
    file: TFile,
    app: App,
    enabledCategories: RelatedFile[],
    setupLinkBehavior: (link: HTMLElement, linkPath: string, file: TFile) => void,
    isEditMode: () => boolean
): void {
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) return;

    // Get cache once instead of per category
    const cache = app.metadataCache.getFileCache(activeFile);
    const frontMatter = cache?.frontmatter;
    const aliases: string[] = [];

    // Properly handle different possible formats of aliases in frontmatter
    if (frontMatter?.aliases) {
        if (Array.isArray(frontMatter.aliases)) {
            aliases.push(...frontMatter.aliases.map(alias =>
                typeof alias === 'string' ? alias.replace(/^- /, '').trim() : ''
            ).filter(Boolean));
        } else if (typeof frontMatter.aliases === 'string') {
            // Handle single alias as string
            aliases.push(frontMatter.aliases.trim());
        }
    }

    // Get all files once and cache the result
    const allFiles = app.vault.getFiles();

    // Process categories in chunks
    let currentCategory = 0;
    const processNextCategory = () => {
        if (currentCategory >= enabledCategories.length) return;

        const category = enabledCategories[currentCategory];

        // Filter files for this category
        const sectionFiles = allFiles
            .filter((f: TFile) =>
                f.path.includes(category.path) &&
                (f.name.includes(activeFile.basename) || aliasesContains(f.name, aliases)))
            .sort((a: TFile, b: TFile) => b.name.localeCompare(a.name))
            .map((f: TFile) => f.path);

        if (sectionFiles.length > 0) {
            createSectionElement(footLinker, category, sectionFiles, activeFile, setupLinkBehavior, isEditMode);
        }

        currentCategory++;
        if (currentCategory < enabledCategories.length) {
            requestAnimationFrame(processNextCategory);
        }
    };

    processNextCategory();
}

function createSectionElement(
    footLinker: HTMLElement,
    category: RelatedFile,
    sectionFiles: string[],
    file: TFile,
    setupLinkBehavior: (link: HTMLElement, linkPath: string, file: TFile) => void,
    isEditMode: () => boolean
): void {
    const sectionDiv = footLinker.createDiv({ cls: `footlinker--${category.id}` });
    sectionDiv.createEl('h2', { text: category.label });
    const sectionUl = sectionDiv.createEl("ul");

    // Process files in chunks
    const chunkSize = 20;
    let currentChunk = 0;
    const totalChunks = Math.ceil(sectionFiles.length / chunkSize);

    const processChunk = () => {
        const start = currentChunk * chunkSize;
        const end = Math.min(start + chunkSize, sectionFiles.length);

        for (let i = start; i < end; i++) {
            const linkPath = sectionFiles[i];
            const li = sectionUl.createEl("li");
            const link = li.createEl("a", {
                href: linkPath,
                text: linkPath.split("/").pop() || '',
                cls: isEditMode() ? "cm-hmd-internal-link cm-underline" : "internal-link"
            });
            link.dataset.href = linkPath;
            link.dataset.sourcePath = file.path;
            setupLinkBehavior(link, linkPath, file);
        }

        currentChunk++;
        if (currentChunk < totalChunks) {
            requestAnimationFrame(processChunk);
        }
    };

    // Start processing if there are files
    if (sectionFiles.length > 0) {
        processChunk();
    } else {
        sectionDiv.remove();
    }
}