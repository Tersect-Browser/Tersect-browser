import { Component, ElementRef, HostListener, Input, Output, ViewChild } from '@angular/core'
import { debounceTime, Subject } from 'rxjs'
import { ButtonModule } from 'primeng/button'
import { AutoCompleteModule } from 'primeng/autocomplete'
import { OverlayPanelModule } from 'primeng/overlaypanel'
import { FormsModule } from '@angular/forms'

import { searchGene } from './searchGene'
import { CommonModule } from '@angular/common'
import { EventEmitter } from '@angular/core'


@Component({
  selector: 'gene-search',
  templateUrl: './gene-search.component.html',
  styleUrls: ['./gene-search.component.css'],
  standalone: true,
  imports: [
    // Add any necessary Angular modules or components here
    AutoCompleteModule,
    ButtonModule,
    FormsModule,
    OverlayPanelModule,
    CommonModule,
  ],
})
export class GeneSearchComponent {
  @Input() callback!: (position: number) => void;
  @Output() genePositionChanged: EventEmitter<number> = new EventEmitter<number>();
  @Output() geneChromChanged: EventEmitter<string> = new EventEmitter<string>();

  startGenePosition: number | undefined = undefined;
  geneChrom: string | undefined = undefined;


  callParentFunction() {
    if (this.callback && this.startGenePosition !== undefined) {
      this.callback(this.startGenePosition); // ✅ pass the position value
    }
  }

  query = ''
  suggestions: string[] = []
  results: any[] = []
  showPopup = false

  @ViewChild('searchContainer') searchContainer!: ElementRef


  private input$ = new Subject<string>()

  constructor() {
    // Auto-suggestion handling
    this.input$.pipe(debounceTime(200)).subscribe((value) => {
      this.suggest(value)
    })
  }

  onInputChange(event: any) {
    const value = event.query
    this.query = value
    this.input$.next(value)
    console.log('onInputChange registered')
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent) {
    if (
      this.searchContainer &&
      !this.searchContainer.nativeElement.contains(event.target)
    ) {
      this.showPopup = false
      console.log('something clicked')
    }
  }

  async suggest(value: string) {
    // Dummy local autocomplete (replace with actual index if needed)
    const terms = ['BRCA1', 'TP53', 'MYC', 'EGFR', 'CDKN2A']
    this.suggestions = terms.filter((t) => t.toLowerCase().startsWith(value.toLowerCase()))
  }

  parseResult(result: any) {
    const [id, raw] = result
    console.log('parseResult')
    try {
      const decoded = decodeURIComponent(raw)
        .replace(/^\[|\]$/g, '') // remove brackets
        .split('|')

      const [location, source, name, type] = decoded
      console.log('processing result')
      return {
        id,
        location,
        source,
        name,
        type: type?.split('%3A')[0] || 'feature'
      }
    } catch (e) {
      return {
        id,
        location: 'unknown',
        source: 'unknown',
        type: 'unknown'
      }
    }
  }

  async search() {
    if (!this.query) return

    try {
      this.results = await searchGene(this.query);
  
      // Debug: Check the structure of results
      console.log('Results:', this.results);
  
      if (!this.results?.[0]) {
        console.log('No results found');
        return; // Exit early if there's no result
      }
  
    //   const rawMetadata = this.results[0][1]; // Grab the metadata string from the result
    //   if (!rawMetadata) {
    //     console.error('No raw metadata found');
    //     return;
    //   }
  
    //   console.log('Raw Metadata:', rawMetadata); // Log the raw metadata string
  
    //   // Clean and decode the metadata string
    //   const cleaned = rawMetadata.replace(/^\[|\]$/g, ''); // Remove square brackets
    //   const parts: string[] = cleaned.split('|').map((part: string) => 
    //     decodeURIComponent(part.replace(/"/g, '')) // Decode URL-encoded strings and remove quotes
    //   );
  
    //   // Debug: Check if parts are being split correctly
    //   console.log('Parts:', parts);
  
    //   // The first part is the gene position (should be "SL2.50ch01:776048..784378")
    //   const genePosition = parts[0];
    //   console.log('Extracted gene position:', genePosition);

    //       // Extract the gene start position and chromosome using a regular expression
    // const startGenePositionMatch = genePosition.match(/:(\d+)\.\./); // Match numbers between colon and ".."
    // const geneChromMatch = genePosition.match(/^([^:]+)/)

    // let startGenePosition: number | null = null;
    // let geneChrom: string | null = null;

    // if (startGenePositionMatch) {
    //   startGenePosition = parseInt(startGenePositionMatch[1], 10); // Extract the start position
    //   // Emit the startGenePosition back to the parent
    //   this.startGenePosition = startGenePosition;
    //   this.genePositionChanged.emit(this.startGenePosition);
    //   console.log('Extracted gene start position:', startGenePosition);
    // } else {
    //   console.error('Gene start position not found');
    // }

    // if (geneChromMatch){
    //   geneChrom = geneChromMatch[0];
    //   this.geneChrom = geneChrom;
    //   this.geneChromChanged.emit(this.geneChrom);
    // }
  
      this.showPopup = true;
      // this.callback?.(); // Call the callback if available
    } catch (error) {
      console.error('Error in search:', error);
    }
  }

  onResultClick(r: any): void {
    console.log('Clicked result:', r);
    // console.log('r metadata', r[1])

    const rawMetadata = r[1]; // Grab the metadata string from the result
      if (!rawMetadata) {
        console.error('No raw metadata found');
        return;
      }
  
      console.log('Raw Metadata:', rawMetadata); // Log the raw metadata string
  
      // Clean and decode the metadata string
      const cleaned = rawMetadata.replace(/^\[|\]$/g, ''); // Remove square brackets
      const parts: string[] = cleaned.split('|').map((part: string) => 
        decodeURIComponent(part.replace(/"/g, '')) // Decode URL-encoded strings and remove quotes
      );
  
      // Debug: Check if parts are being split correctly
      console.log('Parts:', parts);
  
      // The first part is the gene position (should be "SL2.50ch01:776048..784378")
      const genePosition = parts[0];
      console.log('Extracted gene position:', genePosition);

          // Extract the gene start position and chromosome using a regular expression
    const startGenePositionMatch = genePosition.match(/:(\d+)\.\./); // Match numbers between colon and ".."
    const geneChromMatch = genePosition.match(/^([^:]+)/)

    let startGenePosition: number | null = null;
    let geneChrom: string | null = null;

    if (startGenePositionMatch) {
      startGenePosition = parseInt(startGenePositionMatch[1], 10); // Extract the start position
      // Emit the startGenePosition back to the parent
      this.startGenePosition = startGenePosition;
      this.genePositionChanged.emit(this.startGenePosition);
      console.log('Extracted gene start position:', startGenePosition);
    } else {
      console.error('Gene start position not found');
    }

    if (geneChromMatch){
      geneChrom = geneChromMatch[0];
      this.geneChrom = geneChrom;
      this.geneChromChanged.emit(this.geneChrom);
    }

    // this.callback?.(); 
    this.callParentFunction();
  }
}