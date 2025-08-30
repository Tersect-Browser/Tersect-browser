// file: routes/introgression.ts
import * as fs from "fs";
import * as rimraf from "rimraf";
import { promisify } from "util";
import * as mkdirp from "mkdirp";
import * as pLimit from "p-limit";
import * as path from "path";
import * as os from "os";
import { ensureBuildSpeciesTree } from "../utils/dbutils";
import { Dataset } from "../models/dataset";
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
import { publishSSE, sseKey, subscribeSSE } from "./sse";

export const writeFileP = promisify(fs.writeFile);
export const readFileP = promisify(fs.readFile);
export const mkdirpP = promisify(mkdirp);
export const rimrafP = promisify(rimraf);
const mkdtempP = promisify(fs.mkdtemp);

const introgressionController = async (req, res) => {
    const tmpBase = await mkdtempP(path.join(os.tmpdir(), "introgress-"));
    const windowsDir = path.join(tmpBase, "windows");
    const keyId = randomId();
    const key = sseKey(req.body.datasetId, keyId);
    const windowsCsvPath = path.join(windowsDir, "windows.csv");
    const speciesTreePath = path.join(tmpBase, "species_tree_astral.tre");
    const cleanup = async () => {
        try {
            await rimrafP(tmpBase);
        } catch (_) {}
    };

    try {
        const {
            datasetId,
            chromosome,
            interval,
            accessions,
            wholeAccessions,
            step = 50000,
            mu = 7e-9,
            ne = 1.5e4,
            blockSize = 50,
            maxReticulations = 2,
            outgroup,
        } = req.body;
        const dataset = await Dataset.findById(datasetId).exec();
        if (!dataset)
            return res.status(404).json({ error: "Dataset not found" });

        res.status(202).json({ datasetId, accKey: key });
        setTimeout(async () => {
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
            const existing: any = await SpeciesTreeCache.findOne({
                datasetId,
                accessionsKey: accKey,
                kind: "astral",
            })
                .lean()
                .exec();

            if (!existing && !existing?.tree) {
                // Kick off background build (non‑blocking)
                await ensureBuildSpeciesTree({
                    datasetId: dataset.id,
                    dataset,
                    accessions: wholeAccessions,
                }).catch(() => {});
            }

            await writeFileP(
                speciesTreePath,
                String(existing.tree).trim() + "\n",
                "utf8"
            );

            // ---------- STEP 2: Generate gene trees for requested windows + CSV (parallel) ----------
            const [start, end] = interval;
            publishSSE(key, "pipeline:start", {
                at: Date.now(),
                stage: "introgression",
                message: "Generating gene trees",
            });

            await mkdirpP(windowsDir);
            const windows: Array<[number, number]> = [];
            for (let s = start; s < end; s += step) {
                const e = Math.min(s + step, end);
                windows.push([s, e]);
            }

            // Pick a safe concurrency:
            const concurrency = Math.min(
                8,
                Math.max(2, require("os").cpus().length - 1)
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
                            "/app/gp_data_copy/SGN_aer_hom_snps.tsi",
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
                    await writeFileP(
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
            await writeFileP(windowsCsvPath, rows.join("\n") + "\n", "utf8");
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
                const text = await readFileP(jsonPath, "utf8");
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
            await mkdirpP(TEXT_ROOT);
            await mkdirpP(PLOT_ROOT);
            await mkdirpP(NETWORK_ROOT);
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
        });
    } catch (e) {
        console.log(e);
        await cleanup();
        publishSSE(key, "pipeline:error", {
            at: Date.now(),
            stage: "fatal",
            message: "Pipeline crashed",
            details: (e as Error)?.message ?? String(e),
        });
        // res.status(500).json({ error: String(e) });
    }
};

export default introgressionController;
