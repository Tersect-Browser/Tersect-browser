import { Component, Input } from '@angular/core';
import { ReactComponentDirective } from '@ngeenx/ngx-react';
import JbrowseWrapper from './react-components/JbrowseWrapper';

@Component({
  selector: 'app-root',
  standalone: true,
  template: `
    <div
    [reactComponent]="JbrowseWrapper"
    [props]="props"
  ></div>
  `,
  imports: [ReactComponentDirective],
})
export class AppComponent {
  @Input() props: any;

  public JbrowseWrapper: typeof JbrowseWrapper = JbrowseWrapper;
}
