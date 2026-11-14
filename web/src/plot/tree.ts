import { syncSort } from "@/lib/genome"
import type { TreeNode } from "@/lib/types"

export function parseNewick(newick: string, ladderize = false): TreeNode {
  const tokens = newickTokens(newick)
  const tree = parseTokens(tokens, { value: tokens.next().value })
  if (ladderize) {
    ladderizeSubtree(tree)
  }
  return tree
}

/** Orders children by the number of taxa beneath them. */
function ladderizeSubtree(node: TreeNode): number {
  if (!node.children.length) {
    return 1
  }
  const subtreeSizes = node.children.map(ladderizeSubtree)
  node.children = syncSort(node.children, subtreeSizes)
  return subtreeSizes.reduce((a, b) => a + b, 0)
}

function parseTokens(
  tokens: Iterator<string, undefined>,
  current: { value: string | undefined }
): TreeNode {
  const output: TreeNode = { children: [] }

  if (current.value === "(") {
    // Interior node. Also stops at the end of input, so a truncated tree
    // cannot loop forever.
    while (current.value !== ")" && current.value !== undefined) {
      current.value = tokens.next().value
      output.children.push(parseTokens(tokens, current))
    }
    current.value = tokens.next().value
  }
  if (current.value !== "," && current.value !== ")" && current.value !== ":") {
    // Named node
    if (current.value !== undefined) {
      output.taxon = { name: current.value }
      current.value = tokens.next().value
    }
  }
  if (current.value === ":") {
    // Length specified
    output.length = parseFloat(tokens.next().value ?? "")
    current.value = tokens.next().value
  }
  return output
}

function* newickTokens(newick: string): Generator<string, undefined> {
  for (const token of newick.split(/\s*(,|:|;|\(|\))\s*/)) {
    if (token === "" || token === ";") {
      continue
    }
    yield token.replace(/^'+|'+$/g, "")
  }
  return undefined
}

/**
 * Accessions in the order they appear top to bottom in a drawn tree.
 */
export function treeToOrderedList(tree: TreeNode): string[] {
  const output: string[] = []
  const visit = (node: TreeNode) => {
    if (node.children.length) {
      node.children.forEach(visit)
    } else if (node.taxon) {
      output.push(node.taxon.name)
    }
  }
  visit(tree)
  return output
}

/** Depth of the tree in summed branch lengths. */
export function getTreeDepthLinear(tree: TreeNode): number {
  let max = 0
  const visit = (node: TreeNode, depth: number) => {
    if (node.children.length) {
      node.children.forEach((child) =>
        visit(child, depth + (child.length ?? 0))
      )
    } else if (depth > max) {
      max = depth
    }
  }
  visit(tree, 0)
  return max
}

/** Depth of the tree in number of edges. */
export function getTreeDepth(tree: TreeNode): number {
  let max = 0
  const visit = (node: TreeNode, depth: number) => {
    if (node.children.length) {
      node.children.forEach((child) => visit(child, depth + 1))
    } else if (depth > max) {
      max = depth
    }
  }
  visit(tree, 0)
  return max
}
