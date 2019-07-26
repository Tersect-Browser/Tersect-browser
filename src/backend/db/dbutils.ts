import { PhyloTree } from './phylotree';

export async function cleanDatabase() {
    // Clean up unfinished trees.
    await PhyloTree.deleteMany({ 'status': { $ne: 'ready' }}, (err, out) => {
        if (err) {
            console.log(err);
            process.exit(0);
        }
        if (out.deletedCount) {
            console.log(`Removed ${out.deletedCount} incomplete tree(s).`);
        }
    });
}
