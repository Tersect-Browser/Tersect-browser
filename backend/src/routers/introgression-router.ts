// file: routes/introgression.ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import pLimit = require("p-limit");
import { ensureBuildSpeciesTree } from "../utils/dbutils";
import {
    accessionsKey,
    moveFile,
    randomId,
    runIntrogressionAnalysis,
    runPhylonetAnalysis,
    sanitizeTreeStr,
} from "../utils/utils";
import SpeciesTreeCache from "../models/SpeciesTreeCache";
import { NewickTree } from "../models/newicktree";
import { generateTreeAsync } from "../controllers/generateTree";
import { tbConfig } from "../load-config";
import { publishSSE, sseKey } from "./sse";
import {
    accessionsOf,
    integer,
    regionOf,
    ValidationError,
} from "../utils/validate";

/** Upper limit on gene-tree windows per analysis. */
const MAX_WINDOWS = 5000;

const introgressionController = async (req, res) => {
    const tmpBase = await mkdtemp(path.join(os.tmpdir(), "introgress-"));
    const windowsDir = path.join(tmpBase, "windows");
    const keyId = randomId();
    const key = sseKey(req.params.datasetId, keyId);
    const windowsCsvPath = path.join(windowsDir, "windows.csv");
    const speciesTreePath = path.join(tmpBase, "species_tree_astral.tre");
    const cleanup = async () => {
        try {
            await rm(tmpBase, { recursive: true, force: true });
        } catch (_) {}
    };
    const onFatal = async (e: unknown) => {
        console.log(e);
        await cleanup();
        publishSSE(key, "pipeline:error", {
            at: Date.now(),
            stage: "fatal",
            message: "Pipeline crashed",
            details: (e as Error)?.message ?? String(e),
        });
    };

    try {
        // Loaded (and its index path resolved) by the /query/:datasetId
        // middleware.
        const dataset = res.locals.dataset;
        const datasetId: string = dataset._id;
        const body = req.body ?? {};
        const mu = body.mu ?? 7e-9;
        const ne = body.ne ?? 1.5e4;

        // These values are passed to the analysis scripts, so they are
        // checked against the dataset before anything runs.
        let chromosome: string, interval: [number, number];
        let accessions: string[], wholeAccessions: string[], outgroup: string;
        let step: number, blockSize: number, maxReticulations: number;
        try {
            chromosome = body.chromosome;
            interval = await regionOf(dataset, chromosome, body.interval);
            accessions = await accessionsOf(dataset, body.accessions,
                                            "accessions", 4, 4);
            wholeAccessions = await accessionsOf(dataset, body.wholeAccessions,
                                                 "wholeAccessions", 4);
            if (typeof body.outgroup !== "string"
                || !accessions.includes(body.outgroup)) {
                throw new ValidationError(
                    "outgroup must be one of the four accessions");
            }
            outgroup = body.outgroup;
            step = integer(body.step ?? 50000, "step", 1000, 100_000_000);
            blockSize = integer(body.blockSize ?? 50, "blockSize", 2, 1000);
            maxReticulations = integer(body.maxReticulations ?? 2,
                                       "maxReticulations", 1, 5);
            if ((interval[1] - interval[0]) / step > MAX_WINDOWS) {
                throw new ValidationError(
                    `The interval would need more than ${MAX_WINDOWS} windows; `
                    + "use a larger step or a smaller interval");
            }
        } catch (error) {
            await cleanup();
            if (error instanceof ValidationError) {
                return res.status(400).json({ error: error.message });
            }
            throw error;
        }

        res.status(202).json({ datasetId, accKey: key });
        const runPipeline = async () => {
            await new Promise((r) => setTimeout(r, 1000)); // let client connect
            publishSSE(key, "pipeline:start", {
                at: Date.now(),
                stage: "introgression",
                message: "Introgression analysis started",
            });

            const accKey = accessionsKey(wholeAccessions);
            publishSSE(key, "pipeline:start", {
                at: Date.now(),
                stage: "introgression",
                message: "Generating species tree",
            });
            const findSpeciesTree = async () => {
                const cached: any = await SpeciesTreeCache.findOne({
                    datasetId,
                    accessionsKey: accKey,
                    kind: "astral",
                    status: "ready",
                })
                    .lean()
                    .exec();
                return cached?.tree as string | undefined;
            };

            // The species tree is built once per set of accessions and cached.
            let speciesTree = await findSpeciesTree();
            if (!speciesTree) {
                await ensureBuildSpeciesTree({
                    datasetId: dataset.id,
                    dataset,
                    accessions: wholeAccessions,
                });
                speciesTree = await findSpeciesTree();
            }
            if (!speciesTree) {
                throw new Error("The species tree could not be built");
            }

            await writeFile(
                speciesTreePath,
                String(speciesTree).trim() + "\n",
                "utf8"
            );

            // ---------- STEP 2: Generate gene trees for requested windows + CSV (parallel) ----------
            const [start, end] = interval;
            publishSSE(key, "pipeline:start", {
                at: Date.now(),
                stage: "introgression",
                message: "Generating gene trees",
            });

            await mkdir(windowsDir, { recursive: true });
            const windows: Array<[number, number]> = [];
            for (let s = start; s < end; s += step) {
                const e = Math.min(s + step, end);
                windows.push([s, e]);
            }

            // Pick a safe concurrency:
            const concurrency = Math.min(
                8,
                Math.max(2, os.availableParallelism() - 1)
            );
            const limit = pLimit(concurrency);

            const tasks = windows.map(([s, e]) =>
                limit(async () => {
                    const dbQuery: any = {
                        datasetId,
                        "query.chromosomeName": chromosome,
                        "query.interval": [s, e],
                        "query.accessions": accessions,
                    };

                    let rec: any = await NewickTree.findOne(dbQuery)
                        .lean()
                        .exec();
                    if (!rec) {
                        await new (NewickTree as any)({
                            datasetId,
                            query: {
                                chromosomeName: chromosome,
                                interval: [s, e],
                                accessions,
                            },
                            status: "Collating data...",
                        }).save();

                        const response = await generateTreeAsync(
                            dataset.tsi_location,
                            {
                                chromosomeName: chromosome,
                                interval: [s, e],
                                accessions,
                            },
                            dbQuery
                        );

                        rec = await NewickTree.findOne(dbQuery).lean().exec();
                        console.log(
                            "got rec",
                            JSON.stringify(response, null, 2)
                        );
                    }

                    if (!rec) return null;

                    const fileName = `tree_${s}_${e}.nwk`;
                    const filePath = path.join(windowsDir, fileName);
                    await writeFile(
                        filePath,
                        sanitizeTreeStr(rec.tree),
                        "utf8"
                    );
                    return `${filePath},${s},${e}`;
                })
            );

            const results = await Promise.all(tasks);
            const rows = [
                "tree,start,end",
                ...(results.filter(Boolean) as string[]),
            ];
            publishSSE(key, "pipeline:start", {
                at: Date.now(),
                stage: "introgression",
                message: "gene tree generation completed",
            });
            await writeFile(windowsCsvPath, rows.join("\n") + "\n", "utf8");
            console.log("Windows CSV written:", windowsCsvPath);
            const jsonPath = path.resolve(tmpBase, "scan.json");
            const phyloTextPath = path.resolve(tmpBase, "phylo.txt");
            const phyloPlotPath = path.resolve(tmpBase, "phylo_plot.png");
            const phyloIntroPlotPath = path.resolve(
                tmpBase,
                "phylo_intro_plot.png"
            );

            try {
                await runIntrogressionAnalysis({
                    windowsCsvPath,
                    speciesTreePath,
                    mu,
                    ne,
                    blockSize,
                    outgroup,
                    jsonPath,
                    tmpBase,
                    accessions,
                });
                const text = await readFile(jsonPath, "utf8");
                let data;
                try {
                    data = JSON.parse(text);
                } catch (err) {
                    // helpful server-side context if the JSON was truncated or invalid
                    throw new Error(
                        `Failed to parse scan JSON at ${jsonPath}: ${
                            (err as Error).message
                        }`
                    );
                }
                publishSSE(key, "introgression:result", {
                    at: Date.now(),
                    type: "topology_scan",
                    data,
                });
            } catch (error) {
                console.error(
                    "Error occurred during introgression analysis:",
                    error
                );
                publishSSE(key, "pipeline:error", {
                    at: Date.now(),
                    stage: "introgression",
                    message: "Introgression analysis failed",
                    details: (error as Error)?.message ?? String(error),
                });
            }

            publishSSE(key, "pipeline:progress", {
                at: Date.now(),
                stage: "introgression",
                message: "PhyloNet analysis started",
            });
            await runPhylonetAnalysis({
                tmpBase,
                treeDirectory: windowsDir,
                phyloTextPath,
                phyloPlotPath,
                phyloIntroPlotPath,
                speciesTreePath,
                maxReticulations,
            });
            const id = randomId(); // opaque, unguessable
            const fileName = `${id}.png`;
            const textFileName = `${id}.txt`;
            const networkFileName = `${id}.png`;
            const PLOT_ROOT = tbConfig.localDbPath + "/gp_data_copy/plots/";
            const TEXT_ROOT = tbConfig.localDbPath + "/gp_data_copy/text/";
            const NETWORK_ROOT =
                tbConfig.localDbPath + "/gp_data_copy/networks/";
            await mkdir(TEXT_ROOT, { recursive: true });
            await mkdir(PLOT_ROOT, { recursive: true });
            await mkdir(NETWORK_ROOT, { recursive: true });
            const finalPath = path.join(PLOT_ROOT, fileName);
            const finalTextPath = path.join(TEXT_ROOT, textFileName);
            const finalNetworkPath = path.join(NETWORK_ROOT, networkFileName);
            await moveFile(phyloPlotPath, finalPath);
            await moveFile(phyloTextPath, finalTextPath);
            await moveFile(phyloIntroPlotPath, finalNetworkPath);
            const downloadableTextURL = `${tbConfig.serverHost}/datafiles/text/${textFileName}`;
            const downloadableURL = `${tbConfig.serverHost}/datafiles/plots/${fileName}`;
            const downloadableNetworkURL = `${tbConfig.serverHost}/datafiles/networks/${networkFileName}`;

            publishSSE(key, "introgression:result", {
                at: Date.now(),
                type: "phylonet_result",
                data: {
                    phyloText: downloadableTextURL,
                    phyloPlot: downloadableURL,
                    phyloIntroPlot: downloadableNetworkURL,
                },
            });

            publishSSE(key, "pipeline:done", {
                at: Date.now(),
                message: "All analyses completed",
            });
            await cleanup();
        };
        // The pipeline outlives the request. A rejection left unhandled here
        // would terminate the process, so route it to the SSE error channel.
        setTimeout(() => {
            runPipeline().catch(onFatal);
        });
    } catch (e) {
        await onFatal(e);
        // res.status(500).json({ error: String(e) });
    }
};

export default introgressionController;
