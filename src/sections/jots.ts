import { TFile, App } from 'obsidian';

export interface JotItem {
    id: string;
    label: string;
    taskChar: string;
}

export function addJots(
    footLinker: HTMLElement,
    file: TFile,
    app: App,
    jotItems: JotItem[],
    isEditMode: () => boolean
) {
    if (!file || !jotItems.length) return;

    app.vault.read(file).then((content: string) => {
        const lines = content.split('\n');
        const jotGroups = new Map<string, string[]>();

        // Initialize groups for each jot item
        jotItems.forEach(item => jotGroups.set(item.label, []));

        // Process each line
        lines.forEach(line => {
            const trimmedLine = line.replace(/^>+\s*/, ''); // Remove callout markers
            jotItems.forEach(item => {
                if (trimmedLine.includes(`[${item.taskChar}]`)) {
                    const tasks = jotGroups.get(item.label) || [];
                    tasks.push(trimmedLine.trim());
                    jotGroups.set(item.label, tasks);
                }
            });
        });

        // Create sections for non-empty groups
        jotGroups.forEach((tasks, label) => {
            if (tasks.length > 0) {
                const sectionDiv = footLinker.createDiv({ cls: 'footlinker--jots' });
                sectionDiv.createEl('h2', { text: label });

                const tasksList = sectionDiv.createEl('ul');
                tasks.forEach(task => {
                    tasksList.createEl('li', { text: task });
                });
            }
        });
    });
}