import { TFile, App, MetadataCache } from 'obsidian';

export interface BacklinksOptions {
    showBacklinks: boolean;
}

interface ObsidianApp extends App {
    metadataCache: MetadataCache & {
        getBacklinksForFile(file: TFile): {
            data: Map<string, any>;
        };
    };
}

export function addBacklinks(
    footLinker: HTMLElement,
    file: TFile,
    app: ObsidianApp,
    setupLinkBehavior: (link: HTMLElement, linkPath: string, file: TFile) => void,
    isEditMode: () => boolean
) {
    const backlinksData = app.metadataCache.getBacklinksForFile(file);
    if (!backlinksData?.data?.size) return;

    const backlinksDiv = footLinker.createDiv({ cls: "footlinker--backlinks" });

    // Add the H2 header for backlinks
    backlinksDiv.createEl('h2', { text: 'Backlinks' });

    const backlinksUl = backlinksDiv.createEl("ul");

    const links = Array.from(backlinksData.data.keys()) as string[];
    links
        .filter(linkPath => linkPath.endsWith(".md"))
        .sort((a, b) => a.localeCompare(b))
        .forEach(linkPath => {
            const li = backlinksUl.createEl("li");
            const link = li.createEl("a", {
                href: linkPath,
                text: linkPath.split("/").pop()?.slice(0, -3) || '',
                cls: isEditMode() ? "cm-hmd-internal-link cm-underline" : "internal-link",
            });
            link.dataset.href = linkPath;
            link.dataset.sourcePath = file.path;
            setupLinkBehavior(link, linkPath, file);
        });

    if (!backlinksUl.childElementCount) backlinksDiv.remove();
}