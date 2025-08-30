import { Component, Input } from '@angular/core';
import { ReactComponentDirective } from '@ngeenx/ngx-react';
import GeneSearch from './react-components/geneSearch';


@Component({
  selector: 'gene-search',
  standalone: true,
  template: `
    <div
    [reactComponent]="GeneSearch"
    [props]="props"
  ></div>
  `,
  imports: [ReactComponentDirective],
})
export class GeneSearchComponent {
  @Input() props: any;

  public GeneSearch: typeof GeneSearch = GeneSearch;
}
