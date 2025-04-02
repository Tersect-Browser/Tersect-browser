import { Component, ViewChild, ElementRef, OnInit } from '@angular/core';
import { ModalService } from '../../pages/tersect-browser/services/modal.service';
import { JbrowseWrapperProps } from '../../../../../common/JbrowseInterface';


@Component({
  selector: 'app-global-modal',
  templateUrl: './global-modal.component.html',
  styleUrls: ['./global-modal.component.css']
})
export class GlobalModalComponent implements OnInit {
  isVisible: boolean = false;
  modalTitle: string = 'Modal';

  jbrowseProps: JbrowseWrapperProps = {
    location: {
      start: 0,
      end: 98543444,
      zoomLevel: 100,
      pheneticWidth: 1000,
      binSize: 50000
    }
  };

  @ViewChild('customElementContainer', { static: true }) containerRef!: ElementRef;

  constructor(public modalService: ModalService) {}

  ngOnInit() {
    this.modalService.visible$.subscribe(val => this.isVisible = val);
    this.modalService.title$.subscribe(title => {
      console.log('title', title);
      this.modalTitle = title
    });

    this.modalService.customElement$.subscribe(config => {

      this.jbrowseProps = config;
    });
  }
}
