import { PheneticTree } from './phenetictree';

export async function cleanDatabase() {
    // Clean up unfinished trees.
    await PheneticTree.deleteMany({ 'status': { $ne: 'ready' }}, (err, out) => {
        if (err) {
            console.log(err);
            process.exit(0);
        }
        if (out.deletedCount) {
            console.log(`Removed ${out.deletedCount} incomplete tree(s).`);
        }
    });
}
