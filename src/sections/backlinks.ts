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
    backlinksDiv.createEl('h2', { text: 'Backlinks' });
    const backlinksUl = backlinksDiv.createEl("ul");

    // Get links and sort them once
    const links = Array.from(backlinksData.data.keys())
        .filter(linkPath => linkPath.endsWith(".md"))
        .sort((a, b) => a.localeCompare(b));

    // Process links in chunks to prevent UI blocking
    const chunkSize = 20;
    let currentChunk = 0;
    const totalChunks = Math.ceil(links.length / chunkSize);

    const processChunk = () => {
        const start = currentChunk * chunkSize;
        const end = Math.min(start + chunkSize, links.length);

        for (let i = start; i < end; i++) {
            const linkPath = links[i];
            const li = backlinksUl.createEl("li");
            const fileName = linkPath.split("/").pop()?.slice(0, -3) || '';

            const link = li.createEl("a", {
                href: linkPath,
                text: fileName,
                cls: isEditMode() ? "cm-hmd-internal-link cm-underline" : "internal-link",
            });

            link.dataset.href = linkPath;
            link.dataset.sourcePath = file.path;
            setupLinkBehavior(link, linkPath, file);
        }

        currentChunk++;
        if (currentChunk < totalChunks) {
            requestAnimationFrame(processChunk); // Use RAF for smoother rendering
        }
    };

    // Start processing if there are links
    if (links.length > 0) {
        processChunk();
    } else {
        backlinksDiv.remove();
    }
}