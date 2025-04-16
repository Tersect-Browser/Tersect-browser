import {
  Component,
  ElementRef,
  HostListener,
  Input,
  ViewChild,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, takeUntil } from 'rxjs';

import { AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { OverlayPanelModule } from 'primeng/overlaypanel';

import { searchGene } from './searchGene';

@Component({
  selector: 'gene-search',
  templateUrl: './gene-search.component.html',
  styleUrls: ['./gene-search.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AutoCompleteModule,
    ButtonModule,
    OverlayPanelModule,
  ],
})
export class GeneSearchComponent implements OnDestroy {
  /** Called when the user picks a gene */
  @Input() callback!: (start: number, chrom: string, interval: number) => void;

  /** Interval chosen in the parent (e.g. 1 000 bp) */
  @Input() selectedInterval!: number;

  /** Gene location extracted from the result row */
  private startGenePosition?: number;
  private geneChrom?: string;

  query = '';
  suggestions: string[] = [];
  results: unknown[] = [];
  showPopup = false;

  @ViewChild('searchContainer', { static: false })
  private searchContainer?: ElementRef<HTMLElement>;

  private readonly input$ = new Subject<string>();
  private readonly destroy$ = new Subject<void>();

  constructor() {
    /* Debounce keystrokes before running autocomplete */
    this.input$
      .pipe(debounceTime(200), takeUntil(this.destroy$))
      .subscribe((v) => this.suggest(v));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Fired by p‑autoComplete */
  onInputChange(event: { query: string }): void {
    this.query = event.query ?? '';
    this.input$.next(this.query);
  }

  /** Close the popup if the user clicks outside this component */
  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent): void {
    if (
      this.searchContainer &&
      !this.searchContainer.nativeElement.contains(event.target as Node)
    ) {
      this.showPopup = false;
    }
  }

  /* ----------  Autocomplete  ---------- */

  private suggest(value: string): void {
    const terms = ['BRCA1', 'TP53', 'MYC', 'EGFR', 'CDKN2A'];
    this.suggestions = terms.filter((t) =>
      t.toLowerCase().startsWith(value.toLowerCase())
    );
  }

  /* ----------  Full‑text search  ---------- */

  async search(): Promise<void> {
    if (!this.query) return;

    try {
      this.results = await searchGene(this.query);
      this.showPopup = this.results.length > 0;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('searchGene failed:', err);
    }
  }

  /** The user selected a row in the overlay panel */
  onResultClick(row: any): void {
    const raw = row?.[1] as string | undefined; // “[SL2.50ch01:776048..784378|…]”
    if (!raw) return;

    const location = raw.replace(/^\[|\]$/g, '').split('|')[0]; // “SL2.50ch01:776048..784378”
    const [chrom, range] = location.split(':');
    const startMatch = range.match(/^(\d+)\.\./);

    if (!chrom || !startMatch) return;

    this.geneChrom = chrom;
    this.startGenePosition = Number.parseInt(startMatch[1], 10);

    /* Notify the parent component */
    if (this.callback && this.geneChrom && this.startGenePosition !== undefined) {
      this.callback(this.startGenePosition, this.geneChrom, this.selectedInterval);
    }
  }
}
