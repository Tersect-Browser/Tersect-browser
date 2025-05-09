export interface TersectBrowserConfig {
    serverPort: number;
    serverHost: string;
    vcfLocation: string;
    datasetName: string;
    fileLoadingRoute: string;
    bcftoolsLocation: string;
    frontendHost: string;
    baseHref?: string;
    mongoHost: string;
    dbName: string;
    localDbPath: string;
    indexPartitions: number[];
    tsiPath: string;
    fastaName: string;
}
