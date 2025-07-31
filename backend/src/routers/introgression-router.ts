// file: routes/introgression.ts
import * as fs from "fs";
import * as rimraf from "rimraf";
import { pipeline } from "stream";
import { promisify } from "util";
import * as mkdirp from "mkdirp";
import * as pLimit from "p-limit";
import * as path from "path";
import * as os from "os";

const pipe = promisify(pipeline);
const writeFile = promisify(fs.writeFile);

const mkdtemp = promisify(fs.mkdtemp);

// Reuse your models/helpers:
import { ensureBuildSpeciesTree } from "../utils/dbutils";
import { Dataset } from "../models/dataset";
import {
    accessionsKey,
    execFileLogged,
    moveFile,
    randomId,
    sanitizeTreeStr,
} from "../utils/utils";
import SpeciesTreeCache from "../models/SpeciesTreeCache";
import { NewickTree } from "../models/newicktree";
import { generateTreeAsync } from "../controllers/generateTree";
import { tbConfig } from "../load-config";

type IntrogressionQuery = {
    datasetId: string;
    chromosome: string;
    interval: [number, number];
    accessions: string[];
    step?: number; // default 500_000
    mu?: number; // default 7e-9
    ne?: number; // default 1.5e4
    blockSize?: number; // default 8
    outgroup: string; // required for rooting
};

export const writeFileP = promisify(fs.writeFile);
export const readFileP = promisify(fs.readFile);
export const mkdirpP = promisify(mkdirp);
export const rimrafP = promisify(rimraf);
const mkdtempP = promisify(fs.mkdtemp);

const introgressionController = async (req, res) => {
    const tmpBase = await mkdtempP(path.join(os.tmpdir(), "introgress-"));
    const windowsDir = path.join(tmpBase, "windows");

    const windowsCsvPath = path.join(windowsDir, "windows.csv");
    const speciesTreePath = path.join(tmpBase, "species_tree_astral.tre");
    const pngPath = path.join(tmpBase, "scan.png");
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
            step = 500000,
            mu = 7e-9,
            ne = 1.5e4,
            blockSize = 8,
            outgroup,
        } = req.body;
        const dataset = await Dataset.findById(datasetId).exec();
        if (!dataset)
            return res.status(404).json({ error: "Dataset not found" });

        const accKey = accessionsKey(accessions);
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
                accessions,
            }).catch(() => {});
        }

        await writeFileP(
            speciesTreePath,
            String(existing.tree).trim() + "\n",
            "utf8"
        );

        // ---------- STEP 2: Generate gene trees for requested windows + CSV (parallel) ----------
        const [start, end] = interval;

        await mkdirpP(windowsDir);
        const windows: Array<[number, number]> = [];
        for (let s = start; s < end; s += step) {
            const e = Math.min(s + step, end);
            windows.push([s, e]);
        }

        // Pick a safe concurrency; 4–8 is usually fine. You can tie it to CPUs:
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

                let rec: any = await NewickTree.findOne(dbQuery).lean().exec();
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
                    console.log("got rec", JSON.stringify(response, null, 2));
                }

                if (!rec) return null;

                const fileName = `tree_${s}_${e}.nwk`;
                const filePath = path.join(windowsDir, fileName);
                await writeFileP(filePath, sanitizeTreeStr(rec.tree), "utf8");
                return `${filePath},${s},${e}`;
            })
        );

        const results = await Promise.all(tasks);
        const rows = [
            "tree,start,end",
            ...(results.filter(Boolean) as string[]),
        ];
        await writeFileP(windowsCsvPath, rows.join("\n") + "\n", "utf8");
        console.log("Windows CSV written:", windowsCsvPath);
        const jsonPath = path.resolve(tmpBase, "scan.json");

        await execFileLogged(
            "micromamba",
            [
                "run",
                "-n",
                "tersect",
                "python",
                "-u",
                path.resolve("src/scripts/introgression_scan.py"),
                "--windows-csv",
                windowsCsvPath,
                "--species-tree",
                speciesTreePath,
                "--mu",
                String(mu),
                "--ne",
                String(ne),
                "--block-size",
                String(blockSize),
                "--outgroup",
                outgroup,
                "--alpha",
                "0.05",
                "--out-json",
                jsonPath, // << write results here
            ],
            tmpBase
        );
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

        const status = existing ? existing.status : "building";
        res.status(existing && existing.status === "ready" ? 200 : 202).json({
            datasetId,
            accKey,
            status,
            tree: existing ? existing.tree : null,
            data, // <-- frontend gets D3-ready payload
            // url: undefined,                 // keep or omit for backward compatibility
        });
    } catch (e) {
        await cleanup();
        res.status(500).json({ error: String(e) });
    }
};

export default introgressionController;
