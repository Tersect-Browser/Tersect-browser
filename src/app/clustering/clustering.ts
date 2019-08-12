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
