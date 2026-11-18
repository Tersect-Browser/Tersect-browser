export interface TersectBrowserConfig {
    serverPort: number;
    serverHost: string;
    baseHref?: string;
    mongoHost: string;
    dbName: string;
    localDbPath: string;
    indexPartitions: number[];
}
