import { DistanceMatrix } from '../models/DistanceMatrix';
import { isNullOrUndefined } from 'util';
import * as nj from 'neighbor-joining';
import * as newick_parser from 'biojs-io-newick';

export type TreeNode = {
    taxon?: { name: string, genotype?: string },
    length?: number,
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
                            accessions_to_plot: string[]): TreeNode {
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

/**
 * Nodes as output by the biojs-io-newick parser.
 */
interface RapidNJNode {
    name: string;
    children?: RapidNJNode[];
    branch_length?: number;
}

function _convertNode(rnjNode: RapidNJNode): TreeNode {
    const output: TreeNode = {
        children: isNullOrUndefined(rnjNode.children)
                    ? [] : rnjNode.children.map(child => _convertNode(child))
    };
    if (!isNullOrUndefined(rnjNode.branch_length)) {
        output.length = rnjNode.branch_length;
    }
    if (!isNullOrUndefined(rnjNode.name) && rnjNode.name !== '') {
        output.taxon = { name: rnjNode.name };
    }
    return output;
}

/**
 * Converts a Newick-format output of RapidNJ to a TreeNode tree.
 */
export function newickToTree(newick: string): TreeNode {
    const parsed = newick_parser.parse_newick(newick.replace(/'/g, ''));
    return _convertNode(parsed);
}
