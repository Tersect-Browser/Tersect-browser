export interface TersectBrowserConfig {
    serverPort: number;
    baseHref?: string;
    mongoHost: string;
    dbName: string;
    localDbPath: string;
    indexPartitions: number[];
}
