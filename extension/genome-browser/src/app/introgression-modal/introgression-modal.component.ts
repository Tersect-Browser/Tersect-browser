import { Component, EventEmitter, Input, Output, OnInit, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { firstValueFrom, isObservable } from 'rxjs';

// PrimeNG
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { MultiSelectModule } from 'primeng/multiselect';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { IntrogressionVisualizerComponent } from '../introgression-visualizer/introgression-visualizer.component';
import { DomSanitizer } from '@angular/platform-browser';

type SubmitPayload = {
  outgroup: string;
  quartet: string[];  // exactly 4, must include outgroup
  mpl: string[];      // up to 5
};

@Component({
  selector: 'app-introgression-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DialogModule,
    DropdownModule,
    MultiSelectModule,
    ButtonModule,
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

  /** Two-way visible binding */
  @Input() visible = false;
  @Input({required: true}) modalClose!: () => void;
  @Output() closed = new EventEmitter<boolean>();

  /** Notify parent when a run completes (optional) */
  @Output() completed = new EventEmitter<{ payload: SubmitPayload; result: any; trustedUrl: any }>();





  loading = false;
  submitted = false;
  result: any | null = null;
  public trustedUrl: any = null; // Sanitized URL for iframe
  error: string | null = null;
  public sanitizerLocal: DomSanitizer;

  constructor(private sanitizer: DomSanitizer) {
    this.sanitizerLocal = sanitizer;
  }

  taxaOptions: { label: string; value: string }[] = [];

  form = this.fb.group({
    outgroup: this.fb.control<string | null>(null, { validators: [Validators.required] }),
    quartet: this.fb.control<string[]>([], { validators: [] }),
    mpl: this.fb.control<string[]>([], { validators: [maxItemsValidator(5)] })
  }, { validators: [quartetValidator()] });

  ngOnInit() {
    this.syncOptions();

    // Keep quartet in sync with outgroup: ensure it is included (auto-add if possible)
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

    console.log(this.modalClose, this.submitFn, 'in init');
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

  get quartetMissingOutgroup() {
    return this.ctrl('quartet').errors?.['missingOutgroup'];
  }

  get quartetSizeInvalid() {
    return this.ctrl('quartet').errors?.['sizeInvalid'];
  }

  async onSubmit() {
    this.submitted = true;
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.submitFn) return;

    this.loading = true;
    this.error = null;

    const payload: SubmitPayload = {
      outgroup: this.ctrl('outgroup').value!,
      quartet: this.ctrl('quartet').value ?? [],
      mpl: this.ctrl('mpl').value ?? []
    };

    try {
      const maybe = this.submitFn(payload);
      const result = isObservable(maybe) ? await firstValueFrom(maybe as any) : await (maybe as Promise<any>);
      this.result = result;                 // <-- show on the right pane
      this.trustedUrl = this.sanitizer.bypassSecurityTrustUrl(result.phyloText);
      this.completed.emit({ payload, result, trustedUrl: this.trustedUrl });
      // Do NOT close; keep dialog open to display results
    } catch (err: any) {
      console.error('Introgression analysis failed', err);
      this.error = err?.message ?? 'Failed to run analysis.';
    } finally {
      this.loading = false;
    }
  }

  clearResults() {
    this.result = null;
    this.error = null;
  }

  cancel() {
    this.close();
     return this.modalClose();
  }

  private close() {
    // this.visible = false;
    this.closed.emit(false);
    this.submitted = false;
    this.result = null;
    this.error = null;
    this.form.reset({ outgroup: null, quartet: [], mpl: [] });
  }
}

/** Validators **/

/** Form-level validator: quartet must be exactly 4 and include outgroup. */
function quartetValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const outgroup = group.get('outgroup')?.value as string | null;
    const quartet = (group.get('quartet')?.value as string[] | null) ?? [];

    const ctrl = group.get('quartet');
    if (!ctrl) return null;

    const errors: any = {};
    if (quartet.length !== 4) errors.sizeInvalid = true;
    if (outgroup && !quartet.includes(outgroup)) errors.missingOutgroup = true;

    ctrl.setErrors(Object.keys(errors).length ? errors : null);
    return null;
  };
}

/** Control-level validator: limit array length to max. */
function maxItemsValidator(max: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const v = control.value as string[] | null;
    if (Array.isArray(v) && v.length > max) return { maxItems: { max } };
    return null;
  };
}
