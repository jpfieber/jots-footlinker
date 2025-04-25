import { TFile, App } from 'obsidian';

interface TaskSettings {
    headerName: string;
    query: string;
}

// Keep track of active queries
const activeQueries = new Set<string>();

export function clearTaskQueries() {
    activeQueries.clear();
}

export async function addTasks(
    footLinker: HTMLElement,
    file: TFile,
    app: App,
    settings: TaskSettings,
    isEditMode: () => boolean
) {
    if (!settings.query) return;

    // Check if Dataview or Tasks plugin is available
    const dataviewAPI = (app as any).plugins.plugins.dataview?.api;
    const tasksAPI = (app as any).plugins.plugins.tasks?.cache;

    if (!dataviewAPI && !tasksAPI) {
        console.log("Neither Dataview nor Tasks plugin is available");
        return;
    }

    const queryId = `${file.path}-${settings.query}`;
    if (activeQueries.has(queryId)) return;
    activeQueries.add(queryId);

    try {
        let tasks: any[] = [];

        if (dataviewAPI) {
            tasks = await executeDataviewQuery(dataviewAPI, settings.query, file);
        } else if (tasksAPI) {
            tasks = await executeTasksQuery(tasksAPI, settings.query, file);
        }

        if (tasks.length > 0) {
            const tasksDiv = footLinker.createDiv({ cls: 'footlinker--tasks' });
            tasksDiv.createEl('h2', { text: settings.headerName || 'Tasks' });
            const tasksList = tasksDiv.createEl('ul');

            tasks.forEach(task => {
                const li = tasksList.createEl('li');
                if (typeof task === 'string') {
                    li.setText(task);
                } else {
                    // Handle Dataview task object
                    li.setText(task.text || task.content || '');
                }
            });
        }
    } catch (error) {
        console.error('Error executing task query:', error);
    } finally {
        activeQueries.delete(queryId);
    }
}

async function executeDataviewQuery(api: any, query: string, file: TFile): Promise<any[]> {
    try {
        // Convert natural language to Dataview query
        const dql = convertToDataviewQuery(query);
        const result = await api.query(dql, file.path);
        return result.values || [];
    } catch (error) {
        console.error('Dataview query error:', error);
        return [];
    }
}

async function executeTasksQuery(api: any, query: string, file: TFile): Promise<any[]> {
    try {
        // Tasks plugin uses its own query format
        const tasks = api.getTasks().filter((task: any) => {
            // Basic query matching - can be expanded
            if (query.includes('not done') && task.checked) return false;
            if (query.includes('due before tomorrow') && (!task.due || task.due > Date.now() + 86400000)) return false;
            if (query.includes('path includes') && !task.path.includes(query.split('path includes')[1].trim())) return false;
            return true;
        });
        return tasks.map((task: any) => task.text);
    } catch (error) {
        console.error('Tasks query error:', error);
        return [];
    }
}

function convertToDataviewQuery(naturalQuery: string): string {
    // Convert natural language to Dataview Query Language
    let dql = 'TASK';

    if (naturalQuery.includes('due before tomorrow')) {
        dql += ' WHERE due < date(tomorrow)';
    }
    if (naturalQuery.includes('!completed') || naturalQuery.includes('not done')) {
        dql += ' WHERE !completed';
    }
    if (naturalQuery.includes('due = today')) {
        dql += ' WHERE due = date(today)';
    }
    if (naturalQuery.includes('contains(tags,')) {
        dql += ` WHERE ${naturalQuery}`; // Pass through complex queries
    }

    return dql;
}