import { isNullOrUndefined, syncSort } from '../utils/utils';
import { TreeNode } from './clustering';

export function ladderizeTree(tree: TreeNode, weighted = false): TreeNode {
    _ladderizeSubtree(tree, weighted);
    return tree;
}

/**
 * Returns number of taxons in subtree (if weighted is false - the default)
 * or sum of lengths (distances) inside the subtree (if weighted is true)
 */
function _ladderizeSubtree(node: TreeNode, weighted = false): number {
    if (node.children.length) {
        const subtreeSizes = node.children
                                  .map((child) => _ladderizeSubtree(child,
                                                                    weighted));
        node.children = syncSort(node.children, subtreeSizes);
        return subtreeSizes.reduce((a, b) => a + b, 0);
    } else {
        return weighted ? node.length : 1;
    }
}

export function parseNewick(newick: string, ladderize = false) {
    const tokens = newickTokens(newick);
    const tree = _parseNewick(tokens);
    return ladderize ? ladderizeTree(tree, true) : tree;
}

function _parseNewick(tokens: Iterator<string>,
                      currentToken: { value: string } = null): TreeNode {
    const output: TreeNode = { children: [] };

    if (isNullOrUndefined(currentToken)) {
        currentToken = { value: tokens.next().value };
    }

    if (currentToken.value === '(') {
        // Interior node
        while (currentToken.value !== ')') {
            currentToken.value = tokens.next().value;
            output.children.push(_parseNewick(tokens, currentToken));
        }
        currentToken.value = tokens.next().value;
    }
    if (currentToken.value !== ',' && currentToken.value !== ')'
                                   && currentToken.value !== ':') {
        // Named node
        if (!isNullOrUndefined(currentToken.value)) {
            output.taxon = { name: currentToken.value };
            currentToken.value = tokens.next().value;
        }
    }
    if (currentToken.value === ':') {
        // Length specified
        output.length = parseFloat(tokens.next().value);
        currentToken.value = tokens.next().value;
    }
    return output;
}

function* newickTokens(newick: string, stripQuotes = true): Iterator<string> {
    const tokens = newick.split(/\s*(,|:|;|\(|\))\s*/);
    for (const token of tokens) {
        if (token === '') { continue; }
        if (token === ';') { continue; }
        stripQuotes ? yield token.replace(/^'+|'+$/g, '') : yield token;
    }
}
