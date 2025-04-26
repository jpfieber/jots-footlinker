import { App, ISuggestOwner, Scope } from "obsidian";
import { createPopper, Instance as PopperInstance } from "@popperjs/core";

class Suggest<T> {
    private owner: ISuggestOwner<T>;
    private values: T[] = [];
    private suggestions: HTMLDivElement[] = [];
    private selectedItem: number = -1;
    private containerEl: HTMLElement;
    private scope: Scope;
    private popper: PopperInstance | undefined;

    constructor(owner: ISuggestOwner<T>, containerEl: HTMLElement, scope: Scope) {
        this.owner = owner;
        this.containerEl = containerEl;
        this.scope = scope;

        // Handle click and mouseover events with proper type checking
        containerEl.on(
            "click",
            ".suggestion-item",
            this.onSuggestionClick.bind(this) as unknown as (
                this: HTMLElement,
                ev: MouseEvent,
                delegateTarget: HTMLElement
            ) => any
        );

        containerEl.on(
            "mouseover",
            ".suggestion-item",
            this.onSuggestionMouseover.bind(this) as unknown as (
                this: HTMLElement,
                ev: MouseEvent,
                delegateTarget: HTMLElement
            ) => any
        );

        scope.register([], "ArrowUp", (event: KeyboardEvent) => {
            if (!event.isComposing) {
                this.setSelectedItem(this.selectedItem - 1, true);
                return false;
            }
        });

        scope.register([], "ArrowDown", (event: KeyboardEvent) => {
            if (!event.isComposing) {
                this.setSelectedItem(this.selectedItem + 1, true);
                return false;
            }
        });

        scope.register([], "Enter", (event: KeyboardEvent) => {
            if (!event.isComposing) {
                this.useSelectedItem(event);
                return false;
            }
        });
    }

    onSuggestionClick(event: MouseEvent, el: HTMLDivElement): void {
        event.preventDefault();
        const item = this.suggestions.indexOf(el);
        this.setSelectedItem(item, false);
        this.useSelectedItem(event);
    }

    onSuggestionMouseover(_event: MouseEvent, el: HTMLDivElement): void {
        const item = this.suggestions.indexOf(el);
        this.setSelectedItem(item, false);
    }

    setSuggestions(values: T[]) {
        this.containerEl.empty();
        const suggestionContainer = this.containerEl.createDiv("suggestion-container");
        this.suggestions = []; // Clear existing suggestions

        values.forEach((value) => {
            const suggestionDiv = suggestionContainer.createDiv();
            this.owner.renderSuggestion(value, suggestionDiv);
            suggestionDiv.classList.add("suggestion-item");
            this.suggestions.push(suggestionDiv);
        });

        this.values = values;

        if (this.popper) {
            this.popper.destroy();
        }

        if (values.length > 0 && 'inputEl' in this.owner) {
            const owner = this.owner as unknown as { inputEl: HTMLElement };
            this.popper = createPopper(owner.inputEl, this.containerEl, {
                placement: "bottom-start",
                modifiers: [
                    {
                        name: "offset",
                        options: {
                            offset: [0, 8],
                        },
                    },
                    {
                        name: "flip",
                        options: {
                            fallbackPlacements: ["top-start"],
                        },
                    },
                    {
                        name: "sameWidth",
                        enabled: true,
                        phase: "beforeWrite",
                        requires: ["computeStyles"],
                        fn: ({ state }: { state: any }) => {
                            state.styles.popper.width = `${state.rects.reference.width}px`;
                        },
                        effect: ({ state }: { state: any }) => {
                            state.elements.popper.style.width = `${state.elements.reference.offsetWidth}px`;
                        },
                    },
                ],
            });
        }

        this.setSelectedItem(0, false);
    }

    useSelectedItem(event: MouseEvent | KeyboardEvent) {
        const currentValue = this.values[this.selectedItem];
        if (currentValue) {
            this.owner.selectSuggestion(currentValue, event);
        }
    }

    setSelectedItem(selectedIndex: number, scrollIntoView: boolean) {
        const normalizedIndex = wrapAround(selectedIndex, this.suggestions.length);
        const prevSelectedSuggestion = this.suggestions[this.selectedItem];
        const selectedSuggestion = this.suggestions[normalizedIndex];

        prevSelectedSuggestion?.removeClass("is-selected");
        selectedSuggestion?.addClass("is-selected");

        this.selectedItem = normalizedIndex;

        if (scrollIntoView) {
            selectedSuggestion?.scrollIntoView(false);
        }
    }

    // Make containerEl public with a getter
    get containerElement(): HTMLElement {
        return this.containerEl;
    }
}

function wrapAround(value: number, size: number): number {
    return ((value % size) + size) % size;
}

export abstract class TextInputSuggest<T> implements ISuggestOwner<T> {
    protected app: App;
    protected inputEl: HTMLInputElement | HTMLTextAreaElement;

    private popper: Suggest<T>;
    private scope: Scope;
    private open = false;

    constructor(app: App, inputEl: HTMLInputElement | HTMLTextAreaElement) {
        this.app = app;
        this.inputEl = inputEl;
        this.scope = new Scope();

        this.inputEl.addEventListener("input", this.onInputChanged.bind(this));
        this.inputEl.addEventListener("focus", this.onInputChanged.bind(this));
        this.inputEl.addEventListener("blur", this.close.bind(this));
        this.scope.register([], "Escape", this.close.bind(this));

        this.popper = new Suggest(this, createDiv("suggestion-container"), this.scope);
    }

    onInputChanged(): void {
        const inputStr = this.inputEl.value;
        const suggestions = this.getSuggestions(inputStr);

        if (!suggestions) {
            this.close();
            return;
        }

        if (suggestions.length > 0) {
            this.popper.setSuggestions(suggestions);
            this.open = true;
            // Access containerElement through the getter
            this.popper.containerElement.style.display = "block";
        } else {
            this.close();
        }
    }

    close(): void {
        this.open = false;
        // Access containerElement through the getter
        this.popper.containerElement.style.display = "none";
    }

    abstract getSuggestions(inputStr: string): T[];
    abstract renderSuggestion(item: T, el: HTMLElement): HTMLDivElement;
    abstract selectSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void;
}

export abstract class TextAreaInputSuggest<T> extends TextInputSuggest<T> {
    getSuggestions(_inputStr: string): T[] {
        throw new Error("getSuggestions not implemented");
    }

    renderSuggestion(_item: T, _el: HTMLElement): HTMLDivElement {
        throw new Error("renderSuggestion not implemented");
    }

    selectSuggestion(_item: T, _evt: MouseEvent | KeyboardEvent): void {
        throw new Error("selectSuggestion not implemented");
    }
}