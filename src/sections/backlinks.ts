import { TFile, App, MetadataCache } from 'obsidian';
import { Section } from '../types';

import { ReferenceCache } from 'obsidian';

export interface ObsidianApp extends App {
    metadataCache: MetadataCache;
}

interface FileBacklinks {
    [filePath: string]: ReferenceCache[];
}

export function addBacklinks(section: BacklinksSection, container: HTMLElement, file: TFile, app: ObsidianApp): Promise<void> {
    console.debug("[FootLinker] Adding backlinks section...");
    if (!container || !file || !app) {
        console.warn("[FootLinker] Missing required parameters for backlinks:", {
            hasContainer: !!container,
            hasFile: !!file,
            hasApp: !!app
        });
        return Promise.resolve();
    }
    return section.render(container, file, app, () => { }, () => false)
        .catch(error => {
            console.error("[FootLinker] Error rendering backlinks section:", error);
            throw error;
        });
}

export class BacklinksSection implements Section {
    id = 'backlinks';
    type = 'backlinks';
    title = 'Backlinks';
    content: string[] = [];

    async render(
        container: HTMLElement,
        file: TFile,
        app: ObsidianApp,
        setupLinkBehavior: (link: HTMLElement, linkPath: string, file: TFile) => void,
        isEditMode: () => boolean
    ): Promise<void> {
        try {
            console.debug("[FootLinker] Rendering backlinks section for file:", file.path);

            // Get unresolved and resolved links from metadata cache
            const resolvedLinks = app.metadataCache.resolvedLinks;
            const backlinks: Record<string, number> = {};

            // Find all files that link to current file
            Object.entries(resolvedLinks).forEach(([sourcePath, links]) => {
                if (links && links[file.path]) {
                    backlinks[sourcePath] = links[file.path];
                }
            });

            const backlinksCount = Object.keys(backlinks).length;
            if (backlinksCount === 0) {
                console.debug("[FootLinker] No backlinks found");
                return;
            }

            console.debug("[FootLinker] Found", backlinksCount, "backlinks");

            // Create backlinks section
            const backlinksDiv = container.createDiv({ cls: "footlinker--backlinks" });
            backlinksDiv.createEl('h2', { text: this.title });
            const backlinksUl = backlinksDiv.createEl("ul");

            // Sort backlinks by path
            const sortedPaths = Object.keys(backlinks)
                .filter(path => path.endsWith(".md"))
                .sort((a, b) => a.localeCompare(b));

            // Process links in chunks
            const chunkSize = 20;
            const totalChunks = Math.ceil(sortedPaths.length / chunkSize);
            let currentChunk = 0;

            const processChunk = (): Promise<void> => {
                return new Promise((resolve) => {
                    try {
                        const start = currentChunk * chunkSize;
                        const end = Math.min(start + chunkSize, sortedPaths.length);

                        console.debug("[FootLinker] Processing chunk", currentChunk + 1, "of", totalChunks);

                        for (let i = start; i < end; i++) {
                            const sourcePath = sortedPaths[i];
                            const count = backlinks[sourcePath] || 0;
                            const li = backlinksUl.createEl("li");
                            const fileName = sourcePath.split("/").pop()?.slice(0, -3) || '';

                            // Create link
                            const link = li.createEl("a", {
                                href: sourcePath,
                                text: fileName,
                                cls: isEditMode() ? "cm-hmd-internal-link cm-underline" : "internal-link",
                            });

                            link.dataset.href = sourcePath;
                            link.dataset.sourcePath = file.path;
                            setupLinkBehavior(link, sourcePath, file);

                            // Add reference count if multiple
                            if (count > 1) {
                                li.createSpan({
                                    text: ` (${count})`,
                                    cls: "footlinker--reference-count"
                                });
                            }
                        }

                        currentChunk++;
                        if (currentChunk < totalChunks) {
                            requestAnimationFrame(() => {
                                processChunk().then(resolve);
                            });
                        } else {
                            resolve();
                        }
                    } catch (error) {
                        console.error("[FootLinker] Error processing chunk:", error);
                        resolve(); // Still resolve to continue with other parts
                    }
                });
            };

            if (sortedPaths.length > 0) {
                await processChunk();
                console.debug("[FootLinker] Finished rendering backlinks section");
            } else {
                console.debug("[FootLinker] No valid markdown backlinks found, removing section");
                backlinksDiv.remove();
            }
        } catch (error) {
            console.error("[FootLinker] Error in backlinks section render:", error);
            throw error;
        }
    }
}