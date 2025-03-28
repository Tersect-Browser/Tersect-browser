import { Component, Input } from '@angular/core';


@Component({
    selector: 'app-jbrowser-modal',
    template: `
      <jbrowser-wrapper
        [attr.bind-props]="jsonProps">
      </jbrowser-wrapper>
    `
  })
  export class JBrowserModalComponent {
    @Input() props: any;
  
    get jsonProps() {
      return JSON.stringify(this.props);
    }
  }
  