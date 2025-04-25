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

    enabledCategories.forEach(category => {
        const sectionPath = `${category.path}/${year}/${year}-${month}`;
        const sectionFiles = app.vault.getFiles()
            .filter((f: TFile) => f.path.includes(sectionPath) && f.name.includes(newdate))
            .sort((a: TFile, b: TFile) => a.name.localeCompare(b.name))
            .map((f: TFile) => f.path);

        if (sectionFiles.length > 0) {
            createSectionElement(footLinker, category, sectionFiles, file, setupLinkBehavior, isEditMode);
        }
    });
}

function addRegularLinks(
    footLinker: HTMLElement,
    file: TFile,
    app: App,
    enabledCategories: RelatedFile[],
    setupLinkBehavior: (link: HTMLElement, linkPath: string, file: TFile) => void,
    isEditMode: () => boolean
): void {
    enabledCategories.forEach(category => {
        const activeFile = app.workspace.getActiveFile();
        if (!activeFile) return;

        app.vault.read(activeFile).then((fileContent: string) => {
            const cache = app.metadataCache.getFileCache(activeFile);
            const frontMatter = cache?.frontmatter;
            const aliases = Array.isArray(frontMatter?.aliases)
                ? frontMatter.aliases.map((alias: string) => alias.replace(/^- /, '').trim())
                : [];

            const sectionFiles = app.vault.getFiles()
                .filter((f: TFile) =>
                    f.path.includes(category.path) &&
                    (f.name.includes(activeFile.basename) || aliasesContains(f.name, aliases)))
                .sort((a: TFile, b: TFile) => b.name.localeCompare(a.name))
                .map((f: TFile) => f.path);

            if (sectionFiles.length > 0) {
                createSectionElement(footLinker, category, sectionFiles, activeFile, setupLinkBehavior, isEditMode);
            }
        });
    });
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

    // Add the H2 header with the category label
    sectionDiv.createEl('h2', { text: category.label });

    const sectionUl = sectionDiv.createEl("ul");
    sectionFiles.forEach(linkPath => {
        const li = sectionUl.createEl("li");
        const link = li.createEl("a", {
            href: linkPath,
            text: linkPath.split("/").pop() || '',
            cls: isEditMode() ? "cm-hmd-internal-link cm-underline" : "internal-link"
        });
        link.dataset.href = linkPath;
        link.dataset.sourcePath = file.path;
        setupLinkBehavior(link, linkPath, file);
    });
}