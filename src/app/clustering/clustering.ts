import { isNullOrUndefined } from 'util';
import * as newick_parser from 'biojs-io-newick';
import { syncSort } from '../utils/utils';

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
 * Returns number of taxons in subtree (if weighted is false - the default)
 * or sum of lengths (distances) inside the subtree (if weighted is true)
 */
function _ladderizeSubtree(node: TreeNode, weighted = false): number {
    if (node.children.length) {
        const subtree_sizes = node.children
                                  .map((child) => _ladderizeSubtree(child,
                                                                    weighted));
        node.children = syncSort(node.children, subtree_sizes);
        return subtree_sizes.reduce((a, b) => a + b, 0);
    } else {
        return weighted ? node.length : 1;
    }
}

function ladderizeTree(tree: TreeNode, weighted = false): TreeNode {
    _ladderizeSubtree(tree, weighted);
    return tree;
}

/**
 * Nodes as output by the biojs-io-newick parser.
 */
interface RapidNJNode {
    name: string;
    children?: RapidNJNode[];
    branch_length?: number;
}

function rnjToTreeNode(rnjNode: RapidNJNode): TreeNode {
    const output: TreeNode = {
        children: isNullOrUndefined(rnjNode.children)
                    ? [] : rnjNode.children.map(child => rnjToTreeNode(child))
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
    const newick_string = newick.replace(/'/g, '');
    const parsed: RapidNJNode = newick_parser.parse_newick(newick_string);
    return ladderizeTree(rnjToTreeNode(parsed), true);
}
