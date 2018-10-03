import { DistanceMatrix } from '../models/DistanceMatrix';
import * as nj from 'neighbor-joining';

/**
 * Return a list of accessions in the order they appear in a Newick tree format
 * string
 * @param newick_tree
 */
function newickToSortedList(newick_tree: string): string[] {
    const sorted_accessions = newick_tree.split(',').map(accession => {
        // Remove leading opening parentheses and anything after a colon
        accession = accession.substr(accession.lastIndexOf('(') + 1);
        return accession.substr(0, accession.indexOf(':'));
    });
    return sorted_accessions;
}

export function njTreeSortAccessions(distance_matrix: DistanceMatrix,
                                     accessions_to_plot: string[]): string[] {
    // console.log(accessions_to_plot);
    // console.log(distance_matrix.matrix);

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

    /*console.log(plotted_indices);
    console.log(filtered_matrices);
    console.log(filtered_accession_names);*/

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
    return newickToSortedList(RNJ.getAsNewick());
}
