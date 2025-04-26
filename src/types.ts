import { TFile } from "obsidian";

export interface RelatedFile {
    id: string;
    label: string;
    path: string;
    isBuiltIn?: boolean;
}

export interface PathSetting {
    path: string;
    enabledCategories: string[];
}

export interface Section {
    id: string;
    type: string;
    title: string;
    content: string[];
    iterate?: boolean;
    renderType?: string;
}

export interface FootLinkerSettings {
    sections: Section[];
    sectionOrder: string[];
}