import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ProgramasService } from '../../core/services/programas.service';
import { FacultadesService } from '../../core/services/facultades.service';
import { Programa } from '../../core/models/programa.model';

@Component({
  selector: 'app-programas',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, TableModule, DialogModule, InputTextModule, TagModule, SelectModule, ToastModule],
  providers: [MessageService],
  templateUrl: './programas.component.html',
  styleUrl: './programas.component.scss',
})
export class ProgramasComponent implements OnInit {
  items: Programa[] = [];
  loading = false;
  facultadOptions: { label: string; value: number }[] = [];

  dialogVisible = false;
  editingItem: Programa | null = null;
  saving = false;
  form: FormGroup;

  private cdr = inject(ChangeDetectorRef);

  constructor(
    private service: ProgramasService,
    private facultadesService: FacultadesService,
    private messageService: MessageService,
    private fb: FormBuilder,
  ) {
    this.form = this.fb.group({
      nombre: ['', [Validators.required, Validators.maxLength(200), Validators.pattern(/\S/)]],
      descripcion: ['', Validators.maxLength(2000)],
      actividades: ['', Validators.maxLength(2000)],
      orden: [0, [Validators.required, Validators.min(0), Validators.max(1000)]],
      activo: [true],
      facultadId: [null, Validators.required],
    });
  }

  ngOnInit(): void {
    this.facultadesService.getFacultades({ limit: 100 }).subscribe({
      next: (res) => {
        this.facultadOptions = res.items.map((f: any) => ({ label: f.nombre || f.etiqueta, value: f.id as number }));
        this.cdr.detectChanges();
      },
      error: () => {},
    });
    this.loadItems();
  }

  loadItems(): void {
    this.loading = true;
    this.service.getTodos().subscribe({
      next: (res) => {
        this.items = res;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
        this.showError('Error al cargar los programas');
      },
    });
  }

  actividadesDe(p: Programa): number {
    return (p.actividades ?? '').split('\n').filter((a) => a.trim()).length;
  }

  openCreate(): void {
    this.editingItem = null;
    const siguiente = this.items.reduce((m, p) => Math.max(m, p.orden), 0) + 1;
    this.form.reset({ nombre: '', descripcion: '', actividades: '', orden: siguiente, activo: true, facultadId: null });
    this.dialogVisible = true;
  }

  openEdit(item: Programa): void {
    this.editingItem = item;
    this.form.reset({
      nombre: item.nombre,
      descripcion: item.descripcion ?? '',
      actividades: item.actividades ?? '',
      orden: item.orden,
      activo: item.activo,
      facultadId: item.facultadId ?? null,
    });
    this.dialogVisible = true;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    const raw = this.form.value;
    const dto = {
      nombre: String(raw.nombre).trim(),
      descripcion: String(raw.descripcion ?? '').trim() || null,
      actividades: String(raw.actividades ?? '').trim() || null,
      orden: Number(raw.orden),
      activo: !!raw.activo,
      facultadId: raw.facultadId,
    };
    const obs = this.editingItem ? this.service.actualizar(this.editingItem.id, dto) : this.service.crear(dto);
    obs.subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: this.editingItem ? 'Programa actualizado' : 'Programa creado',
          life: 3000,
        });
        this.dialogVisible = false;
        this.saving = false;
        this.cdr.detectChanges();
        this.loadItems();
      },
      error: (err) => {
        this.saving = false;
        this.cdr.detectChanges();
        this.showError(err?.error?.message || 'Error al guardar el programa');
      },
    });
  }

  private showError(detail: string): void {
    this.messageService.add({ severity: 'error', summary: 'Error', detail, life: 4000 });
  }
}
