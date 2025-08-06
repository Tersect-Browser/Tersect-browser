import { Component, EventEmitter, Input, Output, OnInit, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { firstValueFrom, isObservable } from 'rxjs';

// PrimeNG
// import { DialogModule } from 'primeng/dialog'; // <-- remove
import { DropdownModule } from 'primeng/dropdown';
import { MultiSelectModule } from 'primeng/multiselect';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { IntrogressionVisualizerComponent } from '../introgression-visualizer/introgression-visualizer.component';
import { DomSanitizer } from '@angular/platform-browser';

// CDK
import { DragDropModule } from '@angular/cdk/drag-drop';

type SubmitPayload = { outgroup: string; quartet: string[]; mpl: string[]; };

@Component({
  selector: 'app-introgression-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DragDropModule,
    DropdownModule,
    MultiSelectModule,
    ButtonModule,
    TooltipModule,
    ProgressSpinnerModule,
    IntrogressionVisualizerComponent
  ],
  templateUrl: './introgression-modal.component.html',
  styleUrls: ['./introgression-modal.component.css'],
})
export class IntrogressionModalComponent implements OnInit, OnChanges {
  private fb = inject(FormBuilder);

  /** Inputs */
  @Input({ required: true }) taxa: string[] = [];
  @Input({ required: true }) submitFn!: (payload: SubmitPayload) => Promise<any> | import('rxjs').Observable<any>;

  /** Show/hide (same API as before) */
  @Input() visible = false;
  @Input({ required: true }) modalClose!: () => void;
  @Output() closed = new EventEmitter<boolean>();
  @Output() completed = new EventEmitter<{ payload: SubmitPayload; result: any; trustedUrl: any }>();

  /** Window state */
  minimized = false;
  maximized = false;
  floating = true;         // set false to dock inline with the page
  width = '95vw';
  height = '75vh';

  loading = false;
  submitted = false;
  result: any | null = null;
  public trustedUrl: any = null;
  error: string | null = null;

  taxaOptions: { label: string; value: string }[] = [];

  constructor(public sanitizer: DomSanitizer) {}

  form = this.fb.group({
    outgroup: this.fb.control<string | null>(null, { validators: [Validators.required] }),
    quartet: this.fb.control<string[]>([], { validators: [] }),
    mpl: this.fb.control<string[]>([], { validators: [maxItemsValidator(5)] })
  }, { validators: [quartetValidator()] });

  ngOnInit() {
    this.syncOptions();
    this.ctrl('outgroup').valueChanges.subscribe(og => {
      const q = this.ctrl('quartet').value ?? [];
      if (!og) return;
      if (!q.includes(og)) {
        const others = q.filter((x: any) => x !== og);
        const next = [og, ...others].slice(0, 4);
        this.ctrl('quartet').setValue(next, { emitEvent: false });
      }
      this.form.updateValueAndValidity({ onlySelf: false, emitEvent: false });
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['taxa']) this.syncOptions();
  }

  private syncOptions() {
    this.taxaOptions = (this.taxa ?? []).map(t => ({ label: t, value: t }));
  }

  ctrl(name: 'outgroup' | 'quartet' | 'mpl') {
    return this.form.get(name) as AbstractControl;
  }

  get quartetMissingOutgroup() { return this.ctrl('quartet').errors?.['missingOutgroup']; }
  get quartetSizeInvalid() { return this.ctrl('quartet').errors?.['sizeInvalid']; }

  async onSubmit() {
    this.submitted = true;
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.submitFn) return;
    this.loading = true; this.error = null;

    const payload: SubmitPayload = {
      outgroup: this.ctrl('outgroup').value!,
      quartet: this.ctrl('quartet').value ?? [],
      mpl: this.ctrl('mpl').value ?? []
    };

    try {
      const maybe = this.submitFn(payload);
      const result = isObservable(maybe) ? await firstValueFrom(maybe as any) : await (maybe as Promise<any>);
      this.result = result;
      this.trustedUrl = this.sanitizer.bypassSecurityTrustUrl(result.phyloText);
      this.completed.emit({ payload, result, trustedUrl: this.trustedUrl });
    } catch (err: any) {
      console.error('Introgression analysis failed', err);
      this.error = err?.message ?? 'Failed to run analysis.';
    } finally {
      this.loading = false;
    }
  }

  clearResults() { this.result = null; this.error = null; }

  cancel() {
    this.close();
    return this.modalClose?.();
  }

  private close() {
    this.closed.emit(false);
    this.submitted = false;
    this.result = null;
    this.error = null;
    this.form.reset({ outgroup: null, quartet: [], mpl: [] });
    this.visible = false;
  }

  /** Window controls */
  toggleMinimize() { this.minimized = !this.minimized; }
  toggleMaximize() {
    this.maximized = !this.maximized;
    if (this.maximized) { this.minimized = false; }
  }
  toggleFloating() { this.floating = !this.floating; }
}

/** Validators (unchanged) */
function quartetValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const outgroup = group.get('outgroup')?.value as string | null;
    const quartet = (group.get('quartet')?.value as string[] | null) ?? [];
    const ctrl = group.get('quartet'); if (!ctrl) return null;

    const errors: any = {};
    if (quartet.length !== 4) errors.sizeInvalid = true;
    if (outgroup && !quartet.includes(outgroup)) errors.missingOutgroup = true;

    ctrl.setErrors(Object.keys(errors).length ? errors : null);
    return null;
  };
}

function maxItemsValidator(max: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const v = control.value as string[] | null;
    if (Array.isArray(v) && v.length > max) return { maxItems: { max } };
    return null;
  };
}
