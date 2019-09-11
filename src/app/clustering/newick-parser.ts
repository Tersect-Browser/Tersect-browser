import { TreeNode } from './clustering';

import { syncSort, isNullOrUndefined } from '../utils/utils';

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

export function ladderizeTree(tree: TreeNode, weighted = false): TreeNode {
    _ladderizeSubtree(tree, weighted);
    return tree;
}

function* newickTokens(newick: string, stripQuotes = true): Iterator<string> {
    const tokens = newick.split(/\s*(,|:|;|\(|\))\s*/);
    for (const token of tokens) {
        if (token === '') { continue; }
        if (token === ';') { continue; }
        stripQuotes ? yield token.replace(/^'+|'+$/g, '') : yield token;
    }
}

function _parseNewick(tokens: Iterator<string>,
                      current_token: { value: string } = null): TreeNode {
    const output: TreeNode = { children: [] };

    if (isNullOrUndefined(current_token)) {
        current_token = { value: tokens.next().value };
    }

    if (current_token.value === '(') {
        // Interior node
        while (current_token.value !== ')') {
            current_token.value = tokens.next().value;
            output.children.push(_parseNewick(tokens, current_token));
        }
        current_token.value = tokens.next().value;
    }
    if (current_token.value !== ',' && current_token.value !== ')'
                                    && current_token.value !== ':') {
        // Named node
        if (!isNullOrUndefined(current_token.value)) {
            output.taxon = { name: current_token.value };
            current_token.value = tokens.next().value;
        }
    }
    if (current_token.value === ':') {
        // Length specified
        output.length = parseFloat(tokens.next().value);
        current_token.value = tokens.next().value;
    }
    return output;
}

export function parseNewick(newick: string, ladderize = false) {
    const tokens = newickTokens(newick);
    const tree = _parseNewick(tokens);
    return ladderize ? ladderizeTree(tree, true) : tree;
}
