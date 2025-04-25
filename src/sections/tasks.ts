import { TFile, App, setIcon } from 'obsidian';

interface TaskSettings {
    headerName: string;
    query: string;
}

// Keep track of active queries
const activeQueries = new Set<string>();

export function clearTaskQueries() {
    activeQueries.clear();
}

interface Task {
    text: string;
    checked: boolean;
    path: string;
    line: number;
    rawContent?: string;
    position?: {
        start: { line: number; col: number; };
        end: { line: number; col: number; };
    };
}

export async function addTasks(
    footLinker: HTMLElement,
    file: TFile,
    app: App,
    settings: TaskSettings,
    isEditMode: () => boolean
) {
    if (!settings.query) return;

    // Check if Tasks plugin is available - try different possible API locations
    const tasksPlugin = app.plugins.plugins["obsidian-tasks-plugin"];
    if (!tasksPlugin) {
        console.log("Tasks plugin is not available");
        return;
    }

    const queryId = `${file.path}-${settings.query}`;
    if (activeQueries.has(queryId)) return;
    activeQueries.add(queryId);

    try {
        // Use the Tasks plugin API
        const tasks = await executeTasksQuery(tasksPlugin, settings.query, file);

        if (tasks.length > 0) {
            const tasksDiv = footLinker.createDiv({ cls: 'footlinker--tasks' });
            tasksDiv.createEl('h2', { text: settings.headerName || 'Tasks' });
            const tasksList = tasksDiv.createEl('ul', { cls: 'task-list' });

            tasks.forEach(task => {
                const li = tasksList.createEl('li', { cls: 'task-list-item' });
                const checkbox = li.createEl('div', { cls: 'task-list-item-checkbox' });
                checkbox.setAttribute('aria-label', task.checked ? 'Toggle task complete' : 'Toggle task incomplete');

                // Set the checkbox state
                if (task.checked) {
                    checkbox.addClass('is-checked');
                    setIcon(checkbox, 'check-square');
                } else {
                    setIcon(checkbox, 'square');
                }

                // Add click handler to toggle task state
                checkbox.addEventListener('click', async () => {
                    try {
                        // Get the file that contains the task
                        const taskFile = app.vault.getAbstractFileByPath(task.path);
                        if (!(taskFile instanceof TFile)) return;

                        // Read the file content
                        const content = await app.vault.read(taskFile);
                        const lines = content.split('\n');
                        const taskLine = lines[task.line];

                        // Toggle the checkbox in the task text
                        const newTaskLine = taskLine.replace(
                            /^(\s*-\s*\[)([x ])(\])/,
                            (_, start, check) => `${start}${check === 'x' ? ' ' : 'x'}]`
                        );
                        lines[task.line] = newTaskLine;

                        // Save the modified file
                        await app.vault.modify(taskFile, lines.join('\n'));

                        // Update the checkbox UI
                        const isNowChecked = !task.checked;
                        checkbox.toggleClass('is-checked', isNowChecked);
                        setIcon(checkbox, isNowChecked ? 'check-square' : 'square');
                        task.checked = isNowChecked;
                    } catch (error) {
                        console.error('Error toggling task:', error);
                    }
                });

                // Add the task text with proper formatting
                const textSpan = li.createSpan({ cls: 'task-list-item-text' });
                formatTaskContent(task.rawContent || task.text, textSpan, file, app, isEditMode);
            });
        }
    } catch (error) {
        console.error('Error executing task query:', error);
    } finally {
        activeQueries.delete(queryId);
    }
}

async function executeTasksQuery(tasksPlugin: any, query: string, file: TFile): Promise<Task[]> {
    try {
        // Get the plugin's task list from the cache for better performance
        const allTasks = tasksPlugin.cache?.getTasks() || [];

        // Parse natural language query into filter conditions
        const conditions = {
            notDone: query.includes('not done'),
            dueBefore: query.includes('due before tomorrow'),
            pathIncludes: query.includes('path includes') ?
                query.split('path includes')[1].trim() : null
        };

        // Apply filters
        const tasks = allTasks
            .filter((task: any) => {
                // Not done filter
                if (conditions.notDone && task.checked) return false;

                // Due before tomorrow filter
                if (conditions.dueBefore) {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrow.setHours(0, 0, 0, 0);
                    if (!task.due || new Date(task.due) >= tomorrow) return false;
                }

                // Path includes filter
                if (conditions.pathIncludes && !task.path.includes(conditions.pathIncludes)) {
                    return false;
                }

                return true;
            })
            .map((task: any) => ({
                text: task.text || '',
                checked: task.checked || false,
                path: task.filePath || task.path,
                line: task.lineNumber || task.line || 0,
                rawContent: task.description || task.text || '',
                position: task.position || null
            }));

        return tasks;
    } catch (error) {
        console.error('Tasks query error:', error);
        return [];
    }
}

function formatTaskContent(content: string, el: HTMLElement, file: TFile, app: App, isEditMode: () => boolean): void {
    // Remove task marker and checkbox
    const textContent = content.replace(/^\s*-?\s*\[[x ]\]\s*/, '');

    // Split the content into segments
    const segments = textContent.split(/(\[\[.*?\]\])/g);

    segments.forEach(segment => {
        if (segment.startsWith('[[') && segment.endsWith(']]')) {
            // Handle wiki links
            const linkText = segment.slice(2, -2);
            const link = el.createEl('a', {
                cls: isEditMode() ? 'cm-hmd-internal-link cm-underline' : 'internal-link',
                text: linkText
            });
            link.addEventListener('click', (e) => {
                e.preventDefault();
                app.workspace.openLinkText(linkText, file.path);
            });
        } else if (segment.trim()) {
            // Handle regular text
            el.createSpan({ text: segment });
        }
    });
}