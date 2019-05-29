import { DistanceMatrix } from '../models/DistanceMatrix';
import * as nj from 'neighbor-joining';

/**
 * Extract am ordered list of accessions from a tree object. The order
 * represents the vertical position (top to bottom) of the accession in a drawn
 * tree.
 */
function treeToSortedList(tree): string[] {
    const output: string[] = [];
    _treeToSortedList(tree, output);
    return output;
}

function _treeToSortedList(subtree, output: string[]) {
    if (subtree.children.length) {
        for (const child of subtree.children) {
            _treeToSortedList(child, output);
        }
    } else {
        output.push(subtree.taxon.name);
    }
}

export function njTreeSortAccessions(distance_matrix: DistanceMatrix,
                                     accessions_to_plot: string[]): string[] {
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

    /*const accessions = distance_matrix.samples.map((x) => {
        return { name: x };
    });
    const RNJ = new nj.RapidNeighborJoining(distance_matrix.matrix, accessions);*/
    const accessions = filtered_accession_names.map((x) => {
        return { name: x };
    });
    const RNJ = new nj.RapidNeighborJoining(filtered_matrices, accessions);
    RNJ.run();
    // return distance_matrix.samples; // all samples
    return treeToSortedList(RNJ.getAsObject());
}
