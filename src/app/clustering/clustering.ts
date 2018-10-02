import { DistanceMatrix } from '../models/DistanceMatrix';
import nj = require('neighbor-joining');

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

export function njTreeSortAccessions(distance_matrix: DistanceMatrix): string[] {
    const accessions = distance_matrix.samples.map((x) => {
        return { name: x };
    });
    const RNJ = new nj.RapidNeighborJoining(distance_matrix.matrix, accessions);
    RNJ.run();
    // return distance_matrix.samples; // all samples
    return newickToSortedList(RNJ.getAsNewick());
}
