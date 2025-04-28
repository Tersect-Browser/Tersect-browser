export interface TersectBrowserConfig {
    serverPort: number;
    baseHref?: string;
    mongoHost: string;
    dbName: string;
    localDbPath: string;
    indexPartitions: number[];
    frontendPort : string;
    frontendHost: string;
    bcftoolsLocation: string;
}
