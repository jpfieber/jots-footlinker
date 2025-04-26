import { App, Modal, Setting } from "obsidian";
import type { RelatedFile, PathSetting } from "../types";

export class SectionManagerModal extends Modal {
    private pathSetting: PathSetting;
    private availableCategories: RelatedFile[];
    private onSave: (pathSetting: PathSetting) => void;
    private selectedCategories: RelatedFile[];

    constructor(
        app: App,
        pathSetting: PathSetting,
        availableCategories: RelatedFile[],
        onSave: (pathSetting: PathSetting) => void
    ) {
        super(app);
        this.pathSetting = { ...pathSetting };
        // Ensure backlinks section is available
        const backlinkSection: RelatedFile = {
            id: "backlinks",
            label: "Backlinks",
            path: "",  // Built-in sections don't need a path
            isBuiltIn: true
        };
        this.availableCategories = [backlinkSection, ...availableCategories];
        this.onSave = onSave;
        this.selectedCategories = this.pathSetting.enabledCategories
            .map((id: string) => this.availableCategories.find(cat => cat.id === id))
            .filter((cat): cat is RelatedFile => cat !== undefined);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // Modal title
        contentEl.createEl("h2", { text: "Manage Footer Sections" });

        // Available sections
        const sectionsEl = contentEl.createDiv("section-manager");

        // Available sections list
        const availableEl = sectionsEl.createDiv("available-sections");
        availableEl.createEl("h3", { text: "Available Sections" });
        const availableList = availableEl.createEl("ul", { cls: "section-list" });

        this.availableCategories
            .filter(cat => !this.selectedCategories.some(s => s.id === cat.id))
            .forEach(category => {
                const li = availableList.createEl("li", { cls: "section-item" });
                li.createSpan({ text: category.label });
                li.createEl("button", { text: "Add" })
                    .addEventListener("click", () => {
                        this.selectedCategories.push(category);
                        this.updateLists();
                    });
            });

        // Selected sections list with drag to reorder
        const selectedEl = sectionsEl.createDiv("selected-sections");
        selectedEl.createEl("h3", { text: "Selected Sections" });
        this.createSelectedList(selectedEl);

        // Save button
        new Setting(contentEl)
            .addButton(btn =>
                btn
                    .setButtonText("Save")
                    .setCta()
                    .onClick(() => {
                        this.pathSetting.enabledCategories = this.selectedCategories.map(c => c.id);
                        this.onSave(this.pathSetting);
                        this.close();
                    })
            );
    }

    private createSelectedList(container: HTMLElement) {
        container.empty();
        const list = container.createEl("ul", { cls: "section-list selected" });

        this.selectedCategories.forEach((category, index) => {
            const li = list.createEl("li", { cls: "section-item" });
            li.setAttribute("draggable", "true");

            // Drag handle
            li.createSpan({ text: "⋮⋮", cls: "drag-handle" });

            // Label
            li.createSpan({ text: category.label });

            // Remove button
            li.createEl("button", { text: "Remove" })
                .addEventListener("click", () => {
                    this.selectedCategories.splice(index, 1);
                    this.updateLists();
                });

            // Drag and drop handling
            li.addEventListener("dragstart", (e) => {
                if (e.dataTransfer) {
                    e.dataTransfer.setData("text/plain", index.toString());
                }
                li.classList.add("dragging");
            });

            li.addEventListener("dragend", () => {
                li.classList.remove("dragging");
            });
        });

        list.addEventListener("dragover", (e) => {
            e.preventDefault();
            const dragging = list.querySelector(".dragging") as HTMLElement | null;
            if (!dragging) return;

            const siblings = Array.from(list.querySelectorAll(".section-item:not(.dragging)")) as HTMLElement[];
            const nextSibling = siblings.find(sibling => {
                const rect = sibling.getBoundingClientRect();
                return e.clientY < rect.top + rect.height / 2;
            });

            if (nextSibling) {
                list.insertBefore(dragging, nextSibling);
            } else {
                list.appendChild(dragging);
            }
        });

        list.addEventListener("drop", (e) => {
            e.preventDefault();
            const items = Array.from(list.querySelectorAll(".section-item"));
            this.selectedCategories = items.map(item =>
                this.availableCategories.find(cat =>
                    cat.label === item.textContent?.replace("⋮⋮Remove", "")
                )
            ).filter((cat): cat is RelatedFile => cat !== undefined);
        });
    }

    private updateLists() {
        this.onOpen();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}