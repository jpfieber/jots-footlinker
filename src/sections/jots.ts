import { TFile, App } from 'obsidian';

export interface JotItem {
    id: string;
    label: string;
    taskChar: string; // Now can contain multiple characters separated by commas
}

interface TaskItem {
    text: string;
    time?: string; // Optional time property
    prefix?: string; // First letter of the task
}

function createWikiLink(linkText: string, el: HTMLElement, file: TFile, app: App, isEditMode: () => boolean): void {
    const linkEl = el.createEl("a", {
        href: linkText,
        cls: isEditMode() ? "cm-hmd-internal-link cm-underline" : "internal-link",
    });
    linkEl.setText(linkText);
    linkEl.dataset.href = linkText;
    linkEl.dataset.sourcePath = file.path;
    linkEl.addEventListener("click", (event) => {
        event.preventDefault();
        app.workspace.openLinkText(linkText, file.path);
    });
}

function processTextSegment(text: string, li: HTMLElement, file: TFile, app: App, isEditMode: () => boolean, addSpace: boolean): boolean {
    if (!text.trim()) return addSpace;

    const wikiLinkPattern = /\[\[([^\]]+?)(?:\|([^\]]+))?\]\]/g;
    let lastIndex = 0;
    let match;
    let hasContent = false;

    while ((match = wikiLinkPattern.exec(text)) !== null) {
        // Add text before the wiki link
        const beforeText = text.slice(lastIndex, match.index);
        if (beforeText.trim()) {
            if (addSpace) {
                const spaceSpan = li.createSpan();
                spaceSpan.textContent = ' ';
            }
            const textSpan = li.createSpan();
            textSpan.textContent = beforeText.replace(/\s*-\s*/g, ' - ');
            hasContent = true;
            addSpace = true;
        } if (addSpace) {
            const spaceSpan = li.createSpan();
            spaceSpan.textContent = ' ';
        }
        // Use display text if provided, otherwise use the path
        const linkPath = match[1];
        const displayText = match[2] || linkPath.split('/').pop()?.replace('.md', '') || linkPath;
        createWikiLink(displayText, li, file, app, isEditMode);

        lastIndex = match.index + match[0].length;
        hasContent = true;
        addSpace = true;
    }

    // Add remaining text
    const remainingText = text.slice(lastIndex);
    if (remainingText.trim()) {
        if (addSpace) {
            const spaceSpan = li.createSpan();
            spaceSpan.textContent = ' ';
        }
        const textSpan = li.createSpan();
        textSpan.textContent = remainingText.replace(/\s*-\s*/g, ' - ');
        hasContent = true;
        addSpace = true;
    }

    return addSpace;
}

function formatTaskText(taskText: string, li: HTMLElement, file: TFile, app: App, isEditMode: () => boolean): void {
    let text = taskText;
    let addSpace = false;

    // Handle parenthesized inline fields first
    const parenFieldPattern = /\(([\w-]+)::\s*([^\)]+)\)/g;
    let lastIndex = 0;
    let parenMatch;

    while ((parenMatch = parenFieldPattern.exec(text)) !== null) {
        // Process text before the field
        const beforeText = text.slice(lastIndex, parenMatch.index);
        if (beforeText.trim()) {
            addSpace = processTextSegment(beforeText, li, file, app, isEditMode, addSpace);
        }

        // Add field value
        const [_, key, value] = parenMatch;
        if (addSpace) {
            const spaceSpan = li.createSpan();
            spaceSpan.textContent = ' ';
        }

        // Process the field value for wiki links
        addSpace = processTextSegment(value, li, file, app, isEditMode, false);

        lastIndex = parenMatch.index + parenMatch[0].length;
    }

    // Process remaining text
    const remainingText = text.slice(lastIndex);
    if (remainingText.trim()) {
        const squareBracketPattern = /\[([\w-]+)::\s*([^\]]+)\]/g;
        const processedText = remainingText.replace(squareBracketPattern, (_, key, value) => `${key}: ${value}`);
        if (processedText.trim()) {
            processTextSegment(processedText, li, file, app, isEditMode, addSpace);
        }
    }
}

// Extract time from a task if it exists using common time patterns
function extractTime(text: string): string | undefined {
    const timePattern = /\b(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)\b|\(\s*time::\s*([^\)]+)\)/;
    const match = text.match(timePattern);
    return match ? (match[1] || match[2]) : undefined;
}

// Sort tasks based on time or prefix
function sortTasks(tasks: TaskItem[]): TaskItem[] {
    return tasks.sort((a, b) => {
        // If both items have time, sort by time
        if (a.time && b.time) {
            return a.time.localeCompare(b.time);
        }
        // If only one has time, prioritize the one with time
        if (a.time) return -1;
        if (b.time) return 1;
        // If neither has time, sort by prefix
        return (a.prefix || '').localeCompare(b.prefix || '');
    });
}

export async function addJots(
    footLinker: HTMLElement,
    file: TFile,
    app: App,
    jotItems: JotItem[],
    isEditMode: () => boolean
) {
    if (!file || !jotItems.length) return;

    function processContent(content: string) {
        const lines = content.split('\n');
        const jotGroups = new Map<string, TaskItem[]>();

        // Initialize groups for each jot item
        jotItems.forEach(item => jotGroups.set(item.label, []));

        // Process in chunks to prevent blocking
        const chunkSize = 100;
        let currentChunk = 0;

        const processChunk = () => {
            const start = currentChunk * chunkSize;
            const end = Math.min(start + chunkSize, lines.length);

            for (let i = start; i < end; i++) {
                const line = lines[i];
                const trimmedLine = line.replace(/^>+\s*/, '');

                jotItems.forEach(item => {
                    const taskChars = item.taskChar.split(',').map(char => char.trim());
                    const taskCharPattern = taskChars.map(char => `\\[${char}\\]`).join('|');
                    const taskRegex = new RegExp(`^\\s*-\\s*(${taskCharPattern})\\s*`);

                    if (taskRegex.test(trimmedLine)) {
                        const taskText = trimmedLine.replace(/^\s*-\s*\[.\]\s*/, '');
                        const time = extractTime(taskText);
                        const prefix = taskText.trim()[0] || '';
                        const tasks = jotGroups.get(item.label) || [];
                        tasks.push({ text: taskText, time, prefix });
                        jotGroups.set(item.label, tasks);
                    }
                });
            }

            // Process next chunk or render if done
            currentChunk++;
            if (currentChunk * chunkSize < lines.length) {
                setTimeout(processChunk, 0); // Use microtask for better performance
            } else {
                renderJotGroups();
            }
        };

        const renderJotGroups = () => {
            jotGroups.forEach((tasks, label) => {
                if (tasks.length > 0) {
                    const sectionDiv = footLinker.createDiv({ cls: 'footlinker--jots' });
                    sectionDiv.createEl('h2', { text: label });

                    const tasksList = sectionDiv.createEl('ul');
                    const sortedTasks = sortTasks(tasks);
                    sortedTasks.forEach(task => {
                        const li = tasksList.createEl('li');
                        formatTaskText(task.text, li, file, app, isEditMode);
                    });
                }
            });

            // Remove hidden class after rendering
            footLinker.removeClass('footlinker--hidden');
        };

        // Start processing
        processChunk();
    }

    try {
        // Read the file content directly
        const content = await app.vault.cachedRead(file);
        processContent(content);
    } catch (error) {
        console.error('[FootLinker] Error reading file content:', error);
    }
}