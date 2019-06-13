import { DistanceMatrix } from '../models/DistanceMatrix';
import * as nj from 'neighbor-joining';

export type TreeNode = {
    taxon: { name: string, genotype?: string },
    length: number,
    children: TreeNode[]
};

/**
 * Extract am ordered list of accessions from a tree object. The order
 * represents the vertical position (top to bottom) of the accession in a drawn
 * tree.
 */
export function treeToSortedList(tree: TreeNode): string[] {
    const output: string[] = [];
    _treeToSortedList(tree, output);
    return output;
}

function _treeToSortedList(subtree: TreeNode, output: string[]) {
    if (subtree.children.length) {
        for (const child of subtree.children) {
            _treeToSortedList(child, output);
        }
    } else {
        output.push(subtree.taxon.name);
    }
}

export function getTreeDepthLinear(tree: TreeNode): number {
    const output = { max_depth: 0 };
    _getTreeDepthLinear(tree, 0, output);
    return output.max_depth;
}

function _getTreeDepthLinear(subtree: TreeNode, depth: number,
                             output: { max_depth: number }) {
    if (subtree.children.length) {
        for (const child of subtree.children) {
            _getTreeDepthLinear(child, depth + child.length, output);
        }
    } else {
        if (depth > output.max_depth) {
            output.max_depth = depth;
        }
    }
}

export function getTreeDepth(tree: TreeNode): number {
    const output = { max_depth: 0 };
    _getTreeDepth(tree, 0, output);
    return output.max_depth;
}

function _getTreeDepth(subtree: TreeNode, depth: number,
                       output: { max_depth: number }) {
    if (subtree.children.length) {
        for (const child of subtree.children) {
            _getTreeDepth(child, depth + 1, output);
        }
    } else {
        if (depth > output.max_depth) {
            output.max_depth = depth;
        }
    }
}

/**
 * Build a neighbor-joining tree.
 */
export function buildNJTree(distance_matrix: DistanceMatrix,
                            accessions_to_plot: string[]) {
    // Find indices of accessions to plot
    const plotted_indices = accessions_to_plot.map(acc => {
        return distance_matrix.samples.indexOf(acc);
    });

    const filtered_matrices = plotted_indices.map(ind => {
        return plotted_indices.map(inner_ind => {
            return distance_matrix.matrix[ind][inner_ind];
        });
    });
    const filtered_accession_names = plotted_indices.map(ind => {
        return distance_matrix.samples[ind];
    });

    const accessions = filtered_accession_names.map((x) => {
        return { name: x };
    });
    const RNJ = new nj.RapidNeighborJoining(filtered_matrices, accessions);
    RNJ.run();
    return RNJ.getAsObject();
}
