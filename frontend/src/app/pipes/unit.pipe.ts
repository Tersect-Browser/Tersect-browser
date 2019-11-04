import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'unit'
})
export class UnitPipe implements PipeTransform {
    transform(value: number, unit: string): string {
        return `${isNaN(value) ? '' : value.toString()} ${unit}`;
    }
}
