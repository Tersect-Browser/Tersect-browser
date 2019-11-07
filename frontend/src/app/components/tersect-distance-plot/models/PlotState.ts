export type AccessionDisplayStyle = 'labels' | 'tree_simple' | 'tree_linear';

export interface AccessionDictionary {
    [accessionId: string]: {
        label?: string;
        colors?: string[];
    };
}

export interface AccessionGroup {
    name: string;
    category?: string;
    color?: string;
    accessions: string[];
}

export interface AccessionInfo {
    id: string;
    Label: string;
    [s: string]: string;
}

