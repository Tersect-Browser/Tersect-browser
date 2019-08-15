import { Component, ViewEncapsulation } from '@angular/core';
import { SelectItem } from 'primeng/components/common/selectitem';

@Component({
    selector: 'app-group-box',
    templateUrl: './group-box.component.html',
    styleUrls: ['./group-box.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class GroupBoxComponent {
    accession_groups: SelectItem[] = [
        { label: 'Wild species', value: { name: 'Wild species' } },
        { label: 'Cultivars', value: { name: 'cultivars' } }
    ];
    selected_groups: string[];
}
