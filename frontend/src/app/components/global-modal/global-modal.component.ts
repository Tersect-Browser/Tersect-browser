// global-modal.component.ts
import { Component } from '@angular/core';
import { ModalService } from '../../pages/tersect-browser/services/modal.service';


@Component({
  selector: 'app-global-modal',
  templateUrl: './global-modal.component.html'
})
export class GlobalModalComponent {
  constructor(public modalService: ModalService) {}
}
