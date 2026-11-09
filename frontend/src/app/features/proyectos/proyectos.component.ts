import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { Router } from '@angular/router';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import {
  ProyectosService,
  CreateProyectoDto,
  UpdateProyectoDto,
} from '../../core/services/proyectos.service';
import { PlanteamientosService } from '../../core/services/planteamientos.service';
import { AlumnosVoluntariosService } from '../../core/services/alumnos-voluntarios.service';
import { AuthService } from '../../core/services/auth.service';
import { FacultadesService } from '../../core/services/facultades.service';
import { CarrerasService } from '../../core/services/carreras.service';
import { ProgramasService } from '../../core/services/programas.service';
import { UsuariosService } from '../../core/services/usuarios.service';
import { TIPOS_INTERVENCION } from '../../core/constants/tipos-intervencion';
import { ALCANCE_OPCIONES } from '../../core/models/solicitud.model';
import { Proyecto, Observacion, EstadoProyecto, CostoProyecto, TipoCosto, TotalesCosto } from '../../core/models/proyecto.model';

interface PlanteamientoOption {
  id: number;
  label: string;
  carreraId: number | null;
}

interface AlumnoOption {
  label: string;
  value: number;
}

// Validador cruzado: la fecha de fin debe ser estrictamente posterior a la de inicio.
// Las fechas vienen del <input type="date"> como 'YYYY-MM-DD', comparables como string.
function fechaRangeValidator(group: AbstractControl): ValidationErrors | null {
  const ini = group.get('fechaInicio')?.value;
  const fin = group.get('fechaFin')?.value;
  if (ini && fin && fin <= ini) return { fechaRange: true };
  return null;
}

@Component({
  selector: 'app-proyectos',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TableModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    MultiSelectModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './proyectos.component.html',
  styleUrl: './proyectos.component.scss',
})
export class ProyectosComponent implements OnInit {
  items: Proyecto[] = [];
  totalRecords = 0;
  loading = false;
  readonly rows = 10;
  currentPage = 1;

  selectedEstado: EstadoProyecto | null = null;

  // Filtros adicionales
  filtroFacultadId: number | null = null;
  filtroCarreraId: number | null = null;
  filtroDocenteId: number | null = null;
  filtroProgramaId: number | null = null;
  filtroTipo: string | null = null;
  filtroAlcance: string | null = null;

  facultadFiltroOptions: { label: string; value: number }[] = [];
  private carrerasFiltroTodas: { label: string; value: number; facultadId: number | null }[] = [];
  docenteFiltroOptions: { label: string; value: number }[] = [];
  programaFiltroOptions: { label: string; value: number }[] = [];
  readonly tipoFiltroOptions = TIPOS_INTERVENCION;
  readonly alcanceFiltroOptions = ALCANCE_OPCIONES;

  readonly estadoOptions: { label: string; value: EstadoProyecto }[] = [
    { label: 'En proceso', value: 'EN_PROCESO' },
    { label: 'Pausado', value: 'PAUSADO' },
    { label: 'Finalizado', value: 'FINALIZADO' },
    { label: 'Cancelado', value: 'CANCELADO' },
  ];

  // Modal crear / editar
  dialogVisible = false;
  editingItem: Proyecto | null = null;
  saving = false;
  form: FormGroup;

  planteamientosDropdown: PlanteamientoOption[] = [];
  alumnoOptions: AlumnoOption[] = [];
  loadingAlumnos = false;

  // Modal detalle (Ver) + observaciones
  detailVisible = false;
  detailItem: Proyecto | null = null;
  observaciones: Observacion[] = [];
  loadingObservaciones = false;
  nuevaObservacion = '';
  addingObservacion = false;

  // Costos del proyecto (ingresos y gastos)
  costos: CostoProyecto[] = [];
  readonly tiposCosto: { label: string; value: TipoCosto }[] = [
    { label: 'Gasto (−)', value: 'GASTO' },
    { label: 'Ingreso (+)', value: 'INGRESO' },
  ];
  costoForm: { concepto: string; tipo: TipoCosto; monto: number | null } = { concepto: '', tipo: 'GASTO', monto: null };
  editandoCostoId: number | null = null;
  guardandoCosto = false;

  // Sub-formularios del formulario de proyecto
  personasDialogVisible = false;
  faltaPersonas = false;
  faltaCostos = false;
  costosDialogVisible = false;

  // Costos que se agregan al crear el proyecto (se envían junto con el proyecto)
  nuevosCostos: { concepto: string; tipo: TipoCosto; monto: number }[] = [];
  nuevoCostoForm: { concepto: string; tipo: TipoCosto; monto: number | null } = { concepto: '', tipo: 'GASTO', monto: null };

  get nuevoCostoValido(): boolean {
    const f = this.nuevoCostoForm;
    return !!f.concepto.trim() && !!f.monto && f.monto > 0;
  }

  get totalesNuevosCostos(): TotalesCosto {
    const ingresos = this.nuevosCostos.filter((c) => c.tipo === 'INGRESO').reduce((a, c) => a + c.monto, 0);
    const gastos = this.nuevosCostos.filter((c) => c.tipo === 'GASTO').reduce((a, c) => a + c.monto, 0);
    return { ingresos, gastos, saldo: ingresos - gastos };
  }

  agregarCostoNuevo(): void {
    if (!this.nuevoCostoValido) return;
    this.nuevosCostos = [
      ...this.nuevosCostos,
      { concepto: this.nuevoCostoForm.concepto.trim(), tipo: this.nuevoCostoForm.tipo, monto: Math.round(Number(this.nuevoCostoForm.monto)) },
    ];
    this.nuevoCostoForm = { concepto: '', tipo: this.nuevoCostoForm.tipo, monto: null };
  }

  quitarCostoNuevo(i: number): void {
    this.nuevosCostos = this.nuevosCostos.filter((_, idx) => idx !== i);
  }

  // Modal estado
  estadoDialogVisible = false;
  estadoItem: Proyecto | null = null;
  estadoSaving = false;
  estadoForm: FormGroup;

  private cdr = inject(ChangeDetectorRef);

  constructor(
    private service: ProyectosService,
    private planteamientosService: PlanteamientosService,
    private alumnosService: AlumnosVoluntariosService,
    private authService: AuthService,
    private facultadesService: FacultadesService,
    private carrerasService: CarrerasService,
    private programasService: ProgramasService,
    private usuariosService: UsuariosService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private router: Router,
    private fb: FormBuilder,
  ) {
    this.form = this.fb.group(
      {
        planteamientoId: [null, Validators.required],
        fechaInicio: ['', Validators.required],
        fechaFin: ['', Validators.required],
        alumnoIds: [{ value: [], disabled: true }],
        participantesDocentes: [null, [Validators.min(0), Validators.max(100000)]],
        participantesEstudiantes: [null, [Validators.min(0), Validators.max(100000)]],
        participantesDocentesExternos: [null, [Validators.min(0), Validators.max(100000)]],
        participantesAlumnosExternos: [null, [Validators.min(0), Validators.max(100000)]],
        participantesOtrosExternos: [null, [Validators.min(0), Validators.max(100000)]],
      },
      { validators: fechaRangeValidator },
    );

    this.estadoForm = this.fb.group({
      estado: [null, Validators.required],
    });
  }

  // ── Permisos ────────────────────────────────────────────────
  get currentUser() { return this.authService.getCurrentUser(); }

  // ADMIN puede editar/eliminar cualquier proyecto
  get isAdmin() { return this.currentUser?.rol === 'ADMIN'; }

  get canCreate() { return ['DOCENTE', 'ADMIN'].includes(this.currentUser?.rol ?? ''); }

  get useAllEndpoint() {
    return ['ADMIN', 'GESTOR_VCM', 'ENCARGADO_CARRERA', 'DECANO', 'DIRECTOR_VCM'].includes(this.currentUser?.rol ?? '');
  }

  get showDocenteColumn() { return this.currentUser?.rol !== 'DOCENTE'; }

  // El docente del proyecto vive en planteamiento.docente (no a nivel raíz).
  getDocenteId(p: Proyecto): number | undefined {
    return p.planteamiento?.docenteId;
  }

  getDocenteNombre(p: Proyecto): string {
    const d = p.planteamiento?.docente;
    return d ? `${d.nombres} ${d.apellidos}` : '—';
  }

  getProyectoTitulo(p: Proyecto): string {
    return p.planteamiento?.solicitud?.titulo ?? `Planteamiento #${p.planteamientoId}`;
  }

  getNumAlumnos(p: Proyecto): number {
    return p.alumnos?.length ?? 0;
  }

  canEdit(p: Proyecto): boolean {
    return this.getDocenteId(p) === this.currentUser?.id || this.isAdmin;
  }

  canEditEstado(p: Proyecto): boolean {
    const rol = this.currentUser?.rol ?? '';
    if (rol === 'DOCENTE') return this.getDocenteId(p) === this.currentUser?.id;
    return ['ADMIN', 'GESTOR_VCM'].includes(rol);
  }

  canDeleteObs(o: Observacion): boolean {
    const rol = this.currentUser?.rol ?? '';
    if (rol === 'ADMIN') return true;
    return rol === 'DOCENTE' && o.autorId === this.currentUser?.id;
  }

  /** Gestión edita los costos de cualquier proyecto; el docente solo los de sus proyectos. */
  canEditCostos(p: Proyecto | null): boolean {
    if (!p) return false;
    const rol = this.currentUser?.rol ?? '';
    if (rol === 'DOCENTE') return this.getDocenteId(p) === this.currentUser?.id;
    return ['ADMIN', 'GESTOR_VCM', 'DIRECTOR_VCM'].includes(rol);
  }

  get totalesCosto(): TotalesCosto {
    const ingresos = this.costos.filter((c) => c.tipo === 'INGRESO').reduce((a, c) => a + c.monto, 0);
    const gastos = this.costos.filter((c) => c.tipo === 'GASTO').reduce((a, c) => a + c.monto, 0);
    return { ingresos, gastos, saldo: ingresos - gastos };
  }

  /** $1.234.567 (pesos chilenos, sin decimales). */
  fmtPesos(n: number): string {
    return '$' + Math.abs(Math.round(n)).toLocaleString('es-CL');
  }

  /** +$200.000 / −$700.000 según el tipo. */
  fmtCosto(c: { tipo: TipoCosto; monto: number }): string {
    return (c.tipo === 'INGRESO' ? '+' : '−') + this.fmtPesos(c.monto);
  }

  /** Resultado (ingresos − gastos) del proyecto para la lista; null si no tiene costos cargados. */
  saldoProyecto(p: Proyecto): { saldo: number } | null {
    const costos = p.costos ?? [];
    if (!costos.length) return null;
    const saldo = costos.reduce((a, c) => a + (c.tipo === 'INGRESO' ? c.monto : -c.monto), 0);
    return { saldo };
  }

  fmtSaldo(n: number): string {
    return (n > 0 ? '+' : n < 0 ? '−' : '') + this.fmtPesos(n);
  }

  // Permitir agregar observaciones a los 6 roles del endpoint (no CLIENTE).
  get canAddObs() {
    return ['DOCENTE', 'ADMIN', 'GESTOR_VCM', 'ENCARGADO_CARRERA', 'DECANO']
      .includes(this.currentUser?.rol ?? '');
  }

  // ── Evidencia (archivos del proyecto) ───────────────────────
  readonly MAX_ARCHIVO_MB = 10;
  readonly TIPOS_ARCHIVO = [
    'image/jpeg',
    'image/png',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  uploadingFile = false;

  /** Solo el docente dueño del proyecto o el admin; no en proyectos cancelados. */
  canManageArchivos(p: Proyecto | null): boolean {
    if (!p || p.estado === 'CANCELADO') return false;
    const user = this.currentUser;
    if (user?.rol === 'ADMIN') return true;
    return user?.rol === 'DOCENTE' && p.planteamiento?.docenteId === user.id;
  }

  isImagen(nombre: string): boolean {
    return /\.(jpe?g|png)$/i.test(nombre);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length || !this.detailItem) return;
    const file = input.files[0];
    input.value = '';

    if (!this.TIPOS_ARCHIVO.includes(file.type)) {
      this.messageService.add({ severity: 'error', summary: 'Archivo no permitido', detail: 'Usa JPG, PNG, PDF, Word o Excel', life: 4000 });
      return;
    }
    if (file.size > this.MAX_ARCHIVO_MB * 1024 * 1024) {
      this.messageService.add({ severity: 'error', summary: 'Archivo muy grande', detail: `El máximo es ${this.MAX_ARCHIVO_MB} MB`, life: 4000 });
      return;
    }

    this.uploadingFile = true;
    this.cdr.detectChanges();
    this.service.addArchivo(this.detailItem.id, file).subscribe({
      next: () => {
        this.uploadingFile = false;
        this.messageService.add({ severity: 'success', summary: 'Archivo subido', detail: `"${file.name}" agregado como evidencia`, life: 3000 });
        this.refreshDetail();
      },
      error: (err: any) => {
        this.uploadingFile = false;
        this.cdr.detectChanges();
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Error al subir el archivo', life: 4000 });
      },
    });
  }

  confirmRemoveArchivo(archivoId: number, nombre: string): void {
    this.confirmationService.confirm({
      message: `¿Eliminar el archivo "${nombre}"?`,
      header: 'Confirmar',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: () => this.removeArchivo(archivoId),
    });
  }

  private removeArchivo(archivoId: number): void {
    if (!this.detailItem) return;
    this.service.removeArchivo(this.detailItem.id, archivoId).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Archivo eliminado', detail: 'Archivo eliminado correctamente', life: 3000 });
        this.refreshDetail();
      },
      error: (err: any) => {
        this.cdr.detectChanges();
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Error al eliminar el archivo', life: 4000 });
      },
    });
  }

  private refreshDetail(): void {
    if (!this.detailItem) return;
    this.service.getById(this.detailItem.id).subscribe({
      next: (full) => {
        this.detailItem = full;
        this.observaciones = full.observaciones ?? [];
        this.cdr.detectChanges();
      },
      error: () => { this.cdr.detectChanges(); },
    });
  }

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (user?.rol === 'CLIENTE') {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.loadPlanteamientosDropdown();
    this.loadFiltrosOpciones();
    this.loadItems();
  }

  // ── Filtros adicionales ─────────────────────────────────────
  get carreraFiltroOptions() {
    return this.carrerasFiltroTodas.filter(
      (c) => this.filtroFacultadId === null || c.facultadId === this.filtroFacultadId,
    );
  }

  /** Solo ADMIN, GESTOR, DECANO y DIRECTOR pueden listar usuarios. */
  get puedeFiltrarDocente() {
    return ['ADMIN', 'GESTOR_VCM', 'DECANO', 'DIRECTOR_VCM'].includes(this.currentUser?.rol ?? '');
  }

  private loadFiltrosOpciones(): void {
    if (this.useAllEndpoint) {
      this.facultadesService.getFacultades({ limit: 100 }).subscribe({
        next: (res) => {
          this.facultadFiltroOptions = res.items.map((f: any) => ({ label: f.nombre || f.etiqueta, value: f.id }));
          this.cdr.detectChanges();
        },
        error: () => {},
      });
      this.carrerasService.getCarreras({ limit: 100 }).subscribe({
        next: (res) => {
          this.carrerasFiltroTodas = res.items.map((c: any) => ({
            label: c.nombre || c.etiqueta,
            value: c.id,
            facultadId: c.facultadId ?? c.facultad?.id ?? null,
          }));
          this.cdr.detectChanges();
        },
        error: () => {},
      });
    }
    if (this.puedeFiltrarDocente) {
      this.usuariosService.getUsuarios({ rol: 'DOCENTE' as any, limit: 100 }).subscribe({
        next: (res) => {
          this.docenteFiltroOptions = res.items.map((u: any) => ({
            label: `${u.nombres ?? ''} ${u.apellidos ?? ''}`.trim() || u.email,
            value: u.id,
          }));
          this.cdr.detectChanges();
        },
        error: () => {},
      });
    }
    this.programasService.getProgramas().subscribe({
      next: (res) => {
        this.programaFiltroOptions = res.map((p) => ({ label: p.nombre, value: p.id }));
        this.cdr.detectChanges();
      },
      error: () => {},
    });
  }

  onFacultadFiltroChange(): void {
    // La carrera elegida deja de ser válida si no pertenece a la facultad
    if (this.filtroCarreraId !== null && !this.carreraFiltroOptions.some((c) => c.value === this.filtroCarreraId)) {
      this.filtroCarreraId = null;
    }
    this.onFilterChange();
  }

  // ── Carga de datos ──────────────────────────────────────────
  loadPlanteamientosDropdown(): void {
    if (!this.canCreate) return;
    const rol = this.currentUser?.rol ?? '';
    // DOCENTE ve solo sus planteamientos; ADMIN ve todos.
    const obs = rol === 'DOCENTE'
      ? this.planteamientosService.getMisPlanteamientos({ estado: 'APROBADO', limit: 100 })
      : this.planteamientosService.getAll({ estado: 'APROBADO', limit: 100 });

    obs.subscribe({
      next: (res) => {
        this.planteamientosDropdown = res.items
          // Solo planteamientos APROBADOS que aún no tengan proyecto asociado.
          .filter(p => !p.proyecto)
          .map(p => ({
            id: p.id,
            label: p.solicitud?.titulo ? `#${p.id} — ${p.solicitud.titulo}` : `Planteamiento #${p.id}`,
            carreraId: p.solicitud?.carreraId ?? null,
          }));
        this.cdr.detectChanges();
      },
      error: () => {},
    });
  }

  loadItems(): void {
    this.loading = true;
    const params: Record<string, any> = { page: this.currentPage, limit: this.rows };
    if (this.selectedEstado !== null) params['estado'] = this.selectedEstado;
    if (this.filtroFacultadId !== null) params['facultadId'] = this.filtroFacultadId;
    if (this.filtroCarreraId !== null) params['carreraId'] = this.filtroCarreraId;
    if (this.filtroDocenteId !== null) params['docenteId'] = this.filtroDocenteId;
    if (this.filtroProgramaId !== null) params['programaId'] = this.filtroProgramaId;
    if (this.filtroTipo !== null) params['tipoIntervencion'] = this.filtroTipo;
    if (this.filtroAlcance !== null) params['alcance'] = this.filtroAlcance;

    const obs = this.useAllEndpoint
      ? this.service.getAll(params)
      : this.service.getMisProyectos(params);

    obs.subscribe({
      next: (res) => {
        this.items = res.items;
        this.totalRecords = res.total;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
        this.showError('Error al cargar los proyectos');
      },
    });
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    this.currentPage = (event.first ?? 0) / (event.rows ?? this.rows) + 1;
    this.loadItems();
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.loadItems();
  }

  clearFilters(): void {
    this.selectedEstado = null;
    this.filtroFacultadId = null;
    this.filtroCarreraId = null;
    this.filtroDocenteId = null;
    this.filtroProgramaId = null;
    this.filtroTipo = null;
    this.filtroAlcance = null;
    this.currentPage = 1;
    this.loadItems();
  }

  // ── Asignación de alumnos por carrera ───────────────────────
  private loadAlumnosForCarrera(carreraId: number | null): void {
    this.loadingAlumnos = true;
    this.alumnoOptions = [];
    this.cdr.detectChanges();
    // Si carreraId es null no se pudo derivar la carrera del planteamiento;
    // se cargan todos los alumnos activos como fallback.
    const params = carreraId != null
      ? { carreraId, estado: true, limit: 100 }
      : { estado: true, limit: 100 };

    this.alumnosService.getAll(params).subscribe({
      next: (res) => {
        this.alumnoOptions = res.items.map(a => ({
          label: `${a.nombres} ${a.apellidos}${a.carrera?.etiqueta ? ' · ' + a.carrera.etiqueta : ''}`,
          value: a.id,
        }));
        this.loadingAlumnos = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loadingAlumnos = false;
        this.cdr.detectChanges();
        this.showError('Error al cargar los alumnos voluntarios');
      },
    });
  }

  // En crear: la carrera se conoce solo tras elegir el planteamiento.
  onPlanteamientoChange(): void {
    const id = this.form.get('planteamientoId')?.value;
    const alumnosCtrl = this.form.get('alumnoIds');
    alumnosCtrl?.setValue([]);
    if (id == null) {
      alumnosCtrl?.disable();
      this.alumnoOptions = [];
      this.cdr.detectChanges();
      return;
    }
    const opt = this.planteamientosDropdown.find(o => o.id === id);
    alumnosCtrl?.enable();
    this.loadAlumnosForCarrera(opt?.carreraId ?? null);
  }

  // ── Crear / Editar ──────────────────────────────────────────
  openCreate(): void {
    this.editingItem = null;
    this.form.reset({ planteamientoId: null, fechaInicio: '', fechaFin: '', alumnoIds: [], participantesDocentes: null, participantesEstudiantes: null, participantesDocentesExternos: null, participantesAlumnosExternos: null, participantesOtrosExternos: null });
    this.form.get('planteamientoId')?.enable();
    this.form.get('alumnoIds')?.disable();
    this.nuevosCostos = [];
    this.nuevoCostoForm = { concepto: '', tipo: 'GASTO', monto: null };
    this.faltaPersonas = false;
    this.faltaCostos = false;
    this.alumnoOptions = [];
    this.dialogVisible = true;
  }

  openEdit(item: Proyecto): void {
    this.editingItem = item;
    this.form.reset({
      planteamientoId: item.planteamientoId,
      fechaInicio: this.toDateInput(item.fechaInicio),
      fechaFin: this.toDateInput(item.fechaFin),
      alumnoIds: item.alumnos?.map(pa => pa.alumnoId) ?? [],
      participantesDocentes: item.participantesDocentes ?? null,
      participantesEstudiantes: item.participantesEstudiantes ?? null,
      participantesDocentesExternos: item.participantesDocentesExternos ?? null,
      participantesAlumnosExternos: item.participantesAlumnosExternos ?? null,
      participantesOtrosExternos: item.participantesOtrosExternos ?? null,
    });
    // planteamientoId es readonly al editar (el backend no lo acepta en PATCH).
    this.form.get('planteamientoId')?.disable();
    this.form.get('alumnoIds')?.enable();
    // Cargar alumnos de la carrera del proyecto para el multiselect.
    this.loadAlumnosForCarrera(item.planteamiento?.solicitud?.carreraId ?? null);
    this.dialogVisible = true;
  }

  /** Convierte el valor del input a número; vacío o inválido = null. */
  private numOrNull(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /** Total de personas alcanzadas (solo para mostrar; no se guarda en la base). */
  get totalParticipantes(): number {
    const g = (k: string) => Number(this.form.get(k)?.value) || 0;
    return g('participantesDocentes') + g('participantesEstudiantes') + g('participantesDocentesExternos') + g('participantesAlumnosExternos') + g('participantesOtrosExternos');
  }

  totalDe(p: Proyecto): number {
    return (p.participantesDocentes ?? 0) + (p.participantesEstudiantes ?? 0) + (p.participantesDocentesExternos ?? 0) + (p.participantesAlumnosExternos ?? 0) + (p.participantesOtrosExternos ?? 0);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    // Al crear, las personas alcanzadas y el costo del proyecto son obligatorios
    if (!this.editingItem) {
      if (this.totalParticipantes <= 0) {
        this.faltaPersonas = true;
        this.showError('Indica las personas alcanzadas por la intervención (botón Desglosar).');
        this.personasDialogVisible = true;
        return;
      }
      if (this.nuevosCostos.length === 0) {
        this.faltaCostos = true;
        this.showError('Registra al menos una línea de costo del proyecto (botón Desglosar).');
        this.costosDialogVisible = true;
        return;
      }
    }
    this.faltaPersonas = false;
    this.faltaCostos = false;
    this.saving = true;
    const raw = this.form.getRawValue();

    if (this.editingItem) {
      const dto: UpdateProyectoDto = {
        fechaInicio: raw.fechaInicio,
        fechaFin: raw.fechaFin,
        alumnoIds: raw.alumnoIds ?? [],
        // Vacío = null, para que al borrar un número también se borre en la base
        participantesDocentes: this.numOrNull(raw.participantesDocentes),
        participantesEstudiantes: this.numOrNull(raw.participantesEstudiantes),
        participantesDocentesExternos: this.numOrNull(raw.participantesDocentesExternos),
        participantesAlumnosExternos: this.numOrNull(raw.participantesAlumnosExternos),
        participantesOtrosExternos: this.numOrNull(raw.participantesOtrosExternos),
      };
      this.service.update(this.editingItem.id, dto).subscribe({
        next: () => this.onSaveSuccess('Proyecto actualizado'),
        error: (err: any) => this.onSaveError(err),
      });
    } else {
      const dto: CreateProyectoDto = {
        planteamientoId: raw.planteamientoId,
        fechaInicio: raw.fechaInicio,
        fechaFin: raw.fechaFin,
        alumnoIds: raw.alumnoIds ?? [],
        participantesDocentes: this.numOrNull(raw.participantesDocentes) ?? undefined,
        participantesEstudiantes: this.numOrNull(raw.participantesEstudiantes) ?? undefined,
        participantesDocentesExternos: this.numOrNull(raw.participantesDocentesExternos) ?? undefined,
        participantesAlumnosExternos: this.numOrNull(raw.participantesAlumnosExternos) ?? undefined,
        participantesOtrosExternos: this.numOrNull(raw.participantesOtrosExternos) ?? undefined,
        costos: this.nuevosCostos,
      };
      this.service.create(dto).subscribe({
        next: () => this.onSaveSuccess('Proyecto creado'),
        error: (err: any) => this.onSaveError(err),
      });
    }
  }

  private onSaveSuccess(detail: string): void {
    this.messageService.add({ severity: 'success', summary: 'Éxito', detail, life: 3000 });
    this.dialogVisible = false;
    this.currentPage = 1;
    this.saving = false;
    this.cdr.detectChanges();
    this.loadItems();
    // Un planteamiento recién usado deja de estar disponible para nuevos proyectos.
    this.loadPlanteamientosDropdown();
  }

  private onSaveError(err: any): void {
    this.saving = false;
    this.cdr.detectChanges();
    this.showError(err?.error?.message || 'Error al guardar el proyecto');
  }

  confirmDelete(item: Proyecto): void {
    this.confirmationService.confirm({
      message: `¿Eliminar el proyecto "${this.getProyectoTitulo(item)}"? Esta acción no se puede deshacer.`,
      header: 'Confirmar eliminación',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: () => this.deleteItem(item),
    });
  }

  private deleteItem(item: Proyecto): void {
    this.service.delete(item.id).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Eliminado', detail: 'Proyecto eliminado correctamente', life: 3000 });
        this.currentPage = 1;
        this.cdr.detectChanges();
        this.loadItems();
        this.loadPlanteamientosDropdown();
      },
      error: (err: any) => {
        this.cdr.detectChanges();
        // El backend devuelve 400 si tiene observaciones o no está EN_PROCESO.
        this.showError(err?.error?.message || 'No se pudo eliminar el proyecto');
      },
    });
  }

  // ── Detalle (Ver) + observaciones ───────────────────────────
  openDetail(item: Proyecto): void {
    this.detailItem = item;
    this.observaciones = item.observaciones ?? [];
    this.costos = item.costos ?? [];
    this.cancelarEdicionCosto();
    this.nuevaObservacion = '';
    this.detailVisible = true;
    // Refrescar con el detalle completo y la lista canónica de observaciones.
    this.service.getById(item.id).subscribe({
      next: (full) => {
        this.detailItem = full;
        this.observaciones = full.observaciones ?? [];
        this.costos = full.costos ?? [];
        this.cdr.detectChanges();
      },
      error: () => {},
    });
  }

  // ── Costos ──────────────────────────────────────────────────
  editarCosto(c: CostoProyecto): void {
    this.editandoCostoId = c.id;
    this.costoForm = { concepto: c.concepto, tipo: c.tipo, monto: c.monto };
  }

  cancelarEdicionCosto(): void {
    this.editandoCostoId = null;
    this.costoForm = { concepto: '', tipo: 'GASTO', monto: null };
  }

  get costoValido(): boolean {
    const f = this.costoForm;
    return !!f.concepto.trim() && !!f.monto && f.monto > 0;
  }

  guardarCosto(): void {
    if (!this.detailItem || !this.costoValido) return;
    const dto = { concepto: this.costoForm.concepto.trim(), tipo: this.costoForm.tipo, monto: Math.round(Number(this.costoForm.monto)) };
    const peticion = this.editandoCostoId
      ? this.service.updateCosto(this.detailItem.id, this.editandoCostoId, dto)
      : this.service.addCosto(this.detailItem.id, dto);
    this.guardandoCosto = true;
    peticion.subscribe({
      next: (r) => {
        this.costos = r.costos;
        this.cancelarEdicionCosto();
        this.guardandoCosto = false;
        this.messageService.add({ severity: 'success', summary: 'Costos', detail: 'Costo guardado', life: 3000 });
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.guardandoCosto = false;
        this.cdr.detectChanges();
        this.showError(err?.error?.message || 'No se pudo guardar el costo');
      },
    });
  }

  confirmRemoveCosto(c: CostoProyecto): void {
    this.confirmationService.confirm({
      message: `¿Eliminar "${c.concepto}" (${this.fmtCosto(c)})?`,
      header: 'Confirmar',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: () => {
        if (!this.detailItem) return;
        this.service.removeCosto(this.detailItem.id, c.id).subscribe({
          next: (r) => {
            this.costos = r.costos;
            if (this.editandoCostoId === c.id) this.cancelarEdicionCosto();
            this.cdr.detectChanges();
          },
          error: (err: any) => this.showError(err?.error?.message || 'No se pudo eliminar el costo'),
        });
      },
    });
  }

  private reloadObservaciones(): void {
    if (!this.detailItem) return;
    this.loadingObservaciones = true;
    this.service.getObservaciones(this.detailItem.id).subscribe({
      next: (obs) => {
        this.observaciones = obs;
        this.loadingObservaciones = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loadingObservaciones = false;
        this.cdr.detectChanges();
      },
    });
  }

  addObservacion(): void {
    const descripcion = this.nuevaObservacion.trim();
    if (!descripcion || !this.detailItem) return;
    this.addingObservacion = true;
    this.service.addObservacion(this.detailItem.id, { descripcion }).subscribe({
      next: () => {
        this.nuevaObservacion = '';
        this.addingObservacion = false;
        this.messageService.add({ severity: 'success', summary: 'Observación', detail: 'Observación registrada', life: 3000 });
        this.reloadObservaciones();
      },
      error: (err: any) => {
        this.addingObservacion = false;
        this.cdr.detectChanges();
        this.showError(err?.error?.message || 'Error al registrar la observación');
      },
    });
  }

  confirmRemoveObservacion(o: Observacion): void {
    this.confirmationService.confirm({
      message: '¿Eliminar esta observación?',
      header: 'Confirmar',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: () => this.removeObservacion(o),
    });
  }

  private removeObservacion(o: Observacion): void {
    if (!this.detailItem) return;
    this.service.removeObservacion(this.detailItem.id, o.id).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Eliminada', detail: 'Observación eliminada', life: 3000 });
        this.reloadObservaciones();
      },
      error: (err: any) => {
        this.cdr.detectChanges();
        // DOCENTE solo puede borrar las suyas — mostrar el mensaje del backend.
        this.showError(err?.error?.message || 'No se pudo eliminar la observación');
      },
    });
  }

  // ── Estado ──────────────────────────────────────────────────
  openEstado(item: Proyecto): void {
    this.estadoItem = item;
    this.estadoForm.reset({ estado: item.estado });
    this.estadoDialogVisible = true;
  }

  saveEstado(): void {
    if (this.estadoForm.invalid) {
      this.estadoForm.markAllAsTouched();
      return;
    }
    this.estadoSaving = true;
    this.service.updateEstado(this.estadoItem!.id, { estado: this.estadoForm.value.estado }).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Éxito', detail: 'Estado actualizado', life: 3000 });
        this.estadoDialogVisible = false;
        this.estadoSaving = false;
        this.cdr.detectChanges();
        this.loadItems();
      },
      error: (err: any) => {
        this.estadoSaving = false;
        this.cdr.detectChanges();
        this.showError(err?.error?.message || 'Error al actualizar el estado');
      },
    });
  }

  // ── Utilidades ──────────────────────────────────────────────
  /** Texto del estado en mayúsculas y sin guion bajo (EN_PROCESO -> "EN PROCESO"). */
  estadoLabel(estado: EstadoProyecto): string {
    return (this.estadoOptions.find((o) => o.value === estado)?.label ?? estado).toUpperCase();
  }

  getEstadoStyle(estado: EstadoProyecto): Record<string, string> {
    const colors: Record<EstadoProyecto, string> = {
      EN_PROCESO: 'var(--ucm-celeste)',
      PAUSADO: 'var(--ucm-warning)',
      FINALIZADO: 'var(--ucm-success)',
      CANCELADO: 'var(--ucm-danger)',
    };
    return { background: colors[estado], color: '#fff' };
  }

  // Convierte una fecha ISO del backend a 'YYYY-MM-DD' para el <input type="date">.
  private toDateInput(value: string): string {
    return value ? value.slice(0, 10) : '';
  }

  private showError(detail: string): void {
    this.messageService.add({ severity: 'error', summary: 'Error', detail, life: 4000 });
  }
}
