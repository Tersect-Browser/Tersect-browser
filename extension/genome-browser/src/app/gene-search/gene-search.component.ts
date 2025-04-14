import { Component, ElementRef, HostListener, ViewChild } from '@angular/core'
import { debounceTime, Subject } from 'rxjs'
import { ButtonModule } from 'primeng/button'
import { AutoCompleteModule } from 'primeng/autocomplete'
import { OverlayPanelModule } from 'primeng/overlaypanel'
import { FormsModule } from '@angular/forms'

import { searchGene } from './searchGene'
import { CommonModule } from '@angular/common'


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
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent) {
    if (
      this.searchContainer &&
      !this.searchContainer.nativeElement.contains(event.target)
    ) {
      this.showPopup = false
    }
  }

  async suggest(value: string) {
    // Dummy local autocomplete (replace with actual index if needed)
    const terms = ['BRCA1', 'TP53', 'MYC', 'EGFR', 'CDKN2A']
    this.suggestions = terms.filter((t) => t.toLowerCase().startsWith(value.toLowerCase()))
  }

  parseResult(result: any) {
    const [id, raw] = result
    try {
      const decoded = decodeURIComponent(raw)
        .replace(/^\[|\]$/g, '') // remove brackets
        .split('|')

      const [location, source, name, type] = decoded

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

    this.results = await searchGene(this.query)
    this.showPopup = true
  }
}