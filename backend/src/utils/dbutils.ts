import { NewickTree } from '../models/newicktree';

export async function cleanDatabase() {
    // Clean up unfinished trees.
    await NewickTree.deleteMany({ 'status': { $ne: 'ready' }}, err => {
        if (err) {
            console.log(err);
            process.exit(0);
        }
    }).then(out => {
        if (out.deletedCount) {
            console.log(`Removed ${out.deletedCount} incomplete tree(s).`);
        }
    });
}
