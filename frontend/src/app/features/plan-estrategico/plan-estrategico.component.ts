import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { FacultadesService } from '../../core/services/facultades.service';
import { PlanEstrategicoService } from '../../core/services/plan-estrategico.service';
import {
  EjeEstrategico,
  NivelPlan,
  ObjetivoEspecifico,
  ObjetivoGlobal,
  PlanEstrategico,
} from '../../core/models/plan-estrategico.model';

/** Qué se está creando o editando en el diálogo. */
type Elemento = 'plan' | NivelPlan;

const TITULOS: Record<Elemento, string> = {
  plan: 'Plan de Desarrollo Estratégico',
  ejes: 'Eje estratégico',
  'objetivos-globales': 'Objetivo global',
  'objetivos-especificos': 'Objetivo específico',
  indicadores: 'Indicador global',
};

@Component({
  selector: 'app-plan-estrategico',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, SelectModule, ToastModule, ConfirmDialogModule],
  providers: [MessageService, ConfirmationService],
  templateUrl: './plan-estrategico.component.html',
  styleUrl: './plan-estrategico.component.scss',
})
export class PlanEstrategicoComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  facultades: { label: string; value: number }[] = [];
  facultadId: number | null = null;

  planes: PlanEstrategico[] = [];
  plan: PlanEstrategico | null = null;
  planId: number | null = null;
  ejeId: number | null = null;
  ogId: number | null = null;

  loading = false;

  // Diálogo único para crear / editar cualquier elemento
  dialogVisible = false;
  dialogElemento: Elemento = 'plan';
  editandoId: number | null = null;
  padreId: number | null = null;
  texto = '';
  referenciaUcm = '';
  saving = false;

  // Documento del PDE (solo en el diálogo de plan)
  readonly maxArchivoMb = 15;
  archivo: File | null = null;
  archivoActual: string | null = null;
  quitarArchivoActual = false;

  constructor(
    private service: PlanEstrategicoService,
    private facultadesService: FacultadesService,
    private authService: AuthService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
  ) {}

  // ── Permisos ────────────────────────────────────────────────
  get currentUser(): any { return this.authService.getCurrentUser(); }
  get esDecano(): boolean { return this.currentUser?.rol === 'DECANO'; }
  get canEdit(): boolean {
    return ['ADMIN', 'GESTOR_VCM', 'DIRECTOR_VCM', 'DECANO'].includes(this.currentUser?.rol ?? '');
  }

  // ── Selección actual ────────────────────────────────────────
  get ejes(): EjeEstrategico[] { return this.plan?.ejes ?? []; }
  get eje(): EjeEstrategico | null { return this.ejes.find((e) => e.id === this.ejeId) ?? null; }
  get objetivos(): ObjetivoGlobal[] { return this.eje?.objetivos ?? []; }
  get og(): ObjetivoGlobal | null { return this.objetivos.find((o) => o.id === this.ogId) ?? null; }
  get especificos(): ObjetivoEspecifico[] { return this.og?.especificos ?? []; }
  get indicadores() { return this.og?.indicadores ?? []; }
  get planActual(): PlanEstrategico | null { return this.planes.find((p) => p.id === this.planId) ?? null; }
  get facultadNombre(): string {
    return this.facultades.find((f) => f.value === this.facultadId)?.label ?? this.planActual?.facultad?.nombre ?? '';
  }

  get dialogTitulo(): string {
    return (this.editandoId ? 'Editar ' : 'Nuevo ') + TITULOS[this.dialogElemento].toLowerCase();
  }

  // ── Carga ───────────────────────────────────────────────────
  ngOnInit(): void {
    if (this.esDecano) {
      // El Decano trabaja siempre con su propia facultad
      this.service.getMiFacultad().subscribe({
        next: (f) => {
          if (f) {
            this.facultades = [{ label: f.nombre, value: f.id }];
            this.facultadId = f.id;
          }
          this.loadPlanes();
        },
        error: () => this.loadPlanes(),
      });
      return;
    }
    this.facultadesService.getFacultades({ limit: 100 }).subscribe({
      next: (res) => {
        this.facultades = res.items.map((f: any) => ({ label: f.nombre || f.etiqueta, value: f.id }));
        if (this.facultadId === null && this.facultades.length) {
          const propia = this.currentUser?.facultadId;
          this.facultadId = this.facultades.some((f) => f.value === propia) ? propia : this.facultades[0].value;
          this.loadPlanes();
        }
        this.cdr.detectChanges();
      },
      error: () => {
        // Sin acceso al listado: el backend limita los planes a la facultad del usuario
        this.loadPlanes();
      },
    });
  }

  onFacultadChange(): void {
    this.planId = null;
    this.plan = null;
    this.loadPlanes();
  }

  loadPlanes(seleccionar?: number): void {
    this.loading = true;
    const filtro = this.esDecano ? null : this.facultadId;
    this.service.getPlanes(filtro).subscribe({
      next: (res) => {
        this.planes = res;
        if (this.facultadId === null && res.length) this.facultadId = res[0].facultadId;
        const objetivo = seleccionar ?? this.planId;
        this.planId = res.some((p) => p.id === objetivo) ? objetivo : res.length ? res[res.length - 1].id : null;
        this.loading = false;
        this.loadPlan();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
        this.showError('Error al cargar los planes');
      },
    });
  }

  loadPlan(): void {
    if (this.planId === null) {
      this.plan = null;
      this.ejeId = this.ogId = null;
      this.cdr.detectChanges();
      return;
    }
    this.service.getPlan(this.planId).subscribe({
      next: (p) => {
        this.plan = p;
        this.ajustarSelecciones();
        this.cdr.detectChanges();
      },
      error: () => {
        this.cdr.detectChanges();
        this.showError('Error al cargar el plan');
      },
    });
  }

  /** Mantiene la selección si sigue existiendo; si no, elige el primer elemento de cada nivel. */
  private ajustarSelecciones(): void {
    if (!this.ejes.some((e) => e.id === this.ejeId)) this.ejeId = this.ejes[0]?.id ?? null;
    if (!this.objetivos.some((o) => o.id === this.ogId)) this.ogId = this.objetivos[0]?.id ?? null;
  }

  // ── Selección ───────────────────────────────────────────────
  selectPlan(p: PlanEstrategico): void {
    this.planId = p.id;
    this.loadPlan();
  }
  selectEje(e: EjeEstrategico): void {
    this.ejeId = e.id;
    this.ogId = this.objetivos[0]?.id ?? null;
  }
  selectOg(o: ObjetivoGlobal): void {
    this.ogId = o.id;
  }

  // ── Crear / editar ──────────────────────────────────────────
  openCreate(elemento: Elemento): void {
    this.dialogElemento = elemento;
    this.editandoId = null;
    this.texto = '';
    this.referenciaUcm = '';
    this.archivo = null;
    this.archivoActual = null;
    this.quitarArchivoActual = false;
    this.padreId =
      elemento === 'plan' ? null
      : elemento === 'ejes' ? this.planId
      : elemento === 'objetivos-globales' ? this.ejeId
      : this.ogId;
    this.dialogVisible = true;
  }

  openEdit(elemento: Elemento, item: { id: number; descripcion?: string; periodo?: string; referenciaUcm?: string | null; archivoNombre?: string | null }): void {
    this.dialogElemento = elemento;
    this.editandoId = item.id;
    this.archivo = null;
    this.archivoActual = elemento === 'plan' ? item.archivoNombre ?? null : null;
    this.quitarArchivoActual = false;
    this.texto = (elemento === 'plan' ? item.periodo : item.descripcion) ?? '';
    this.referenciaUcm = item.referenciaUcm ?? '';
    this.dialogVisible = true;
  }

  save(): void {
    const texto = this.texto.trim();
    if (!texto) return;
    const elemento = this.dialogElemento;

    if (elemento === 'plan' && this.editandoId === null && this.facultadId === null) {
      this.showError('Selecciona una facultad');
      return;
    }
    this.saving = true;

    let obs;
    if (elemento === 'plan') {
      const base = this.editandoId
        ? this.service.actualizarPlan(this.editandoId, { periodo: texto })
        : this.service.crearPlan({ facultadId: this.facultadId as number, periodo: texto });
      // Una vez guardado el PDE se sube (o se quita) su documento
      obs = base.pipe(
        switchMap((plan: any) => {
          const id = plan?.id ?? this.editandoId;
          const fallo = catchError(() => {
            this.showError('El PDE se guardó, pero no se pudo actualizar el archivo');
            return of(undefined);
          });
          if (this.archivo) return this.service.subirArchivoPlan(id, this.archivo).pipe(fallo, map(() => plan));
          if (this.quitarArchivoActual && this.archivoActual) return this.service.quitarArchivoPlan(id).pipe(fallo, map(() => plan));
          return of(plan);
        }),
      );
    } else if (this.editandoId) {
      obs = this.service.actualizarNodo(elemento, this.editandoId, {
        descripcion: texto,
        ...(elemento === 'indicadores' ? { referenciaUcm: this.referenciaUcm.trim() || null } : {}),
      });
    } else {
      obs = this.service.crearNodo(elemento, {
        padreId: this.padreId as number,
        descripcion: texto,
        ...(elemento === 'indicadores' ? { referenciaUcm: this.referenciaUcm.trim() || null } : {}),
      });
    }

    obs.subscribe({
      next: (res: any) => {
        this.saving = false;
        this.dialogVisible = false;
        this.messageService.add({ severity: 'success', summary: 'Éxito', detail: `${TITULOS[elemento]} guardado`, life: 3000 });
        if (elemento === 'plan') {
          this.loadPlanes(res?.id);
        } else {
          // El elemento recién creado queda seleccionado para seguir bajando de nivel
          if (!this.editandoId && res?.id) {
            if (elemento === 'ejes') { this.ejeId = res.id; this.ogId = null; }
            else if (elemento === 'objetivos-globales') { this.ogId = res.id; }
          }
          this.loadPlan();
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.saving = false;
        this.cdr.detectChanges();
        this.showError(err?.error?.message || 'Error al guardar');
      },
    });
  }

  /** Ícono según el tipo de documento. */
  iconoArchivo(nombre?: string | null): string {
    return /\.pdf$/i.test(nombre ?? '') ? 'ti-file-type-pdf' : 'ti-file-type-doc';
  }

  onArchivoElegido(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    const okTipo = /\.(pdf|doc|docx)$/i.test(file.name);
    if (!okTipo) { this.showError('El archivo debe ser PDF o Word (.doc, .docx)'); return; }
    if (file.size > this.maxArchivoMb * 1024 * 1024) { this.showError(`El archivo no puede superar los ${this.maxArchivoMb} MB`); return; }
    this.archivo = file;
    this.quitarArchivoActual = false;
  }

  // ── Eliminar ────────────────────────────────────────────────
  confirmDelete(elemento: Elemento, id: number, nombre: string): void {
    const contiene = elemento === 'indicadores' || elemento === 'objetivos-especificos' ? '' : ' Se eliminará también todo lo que contiene.';
    this.confirmationService.confirm({
      header: `Eliminar ${TITULOS[elemento].toLowerCase()}`,
      message: `¿Eliminar "${nombre}"?${contiene}`,
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        const obs = elemento === 'plan' ? this.service.eliminarPlan(id) : this.service.eliminarNodo(elemento, id);
        obs.subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Éxito', detail: 'Elemento eliminado', life: 3000 });
            if (elemento === 'plan') this.loadPlanes();
            else this.loadPlan();
          },
          error: (err) => this.showError(err?.error?.message || 'Error al eliminar'),
        });
      },
    });
  }

  private showError(detail: string): void {
    this.messageService.add({ severity: 'error', summary: 'Error', detail, life: 4000 });
  }
}
