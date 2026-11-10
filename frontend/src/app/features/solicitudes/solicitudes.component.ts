import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { SolicitudesService, CreateSolicitudDto, UpdateSolicitudDto, GestionarSolicitudDto } from '../../core/services/solicitudes.service';
import { ProgramasService } from '../../core/services/programas.service';
import { Programa } from '../../core/models/programa.model';
import { CarrerasService } from '../../core/services/carreras.service';
import { UsuariosService } from '../../core/services/usuarios.service';
import { AuthService } from '../../core/services/auth.service';
import { Solicitud, EstadoSolicitud, TIPO_CLIENTE_LABELS, TipoCliente, ALCANCE_OPCIONES } from '../../core/models/solicitud.model';
import { REGIONES_FUERA_DEL_MAULE } from '../../core/constants/regiones-chile';
import { COMUNAS_POR_REGION } from '../../core/constants/comunas-chile';
import { PAISES } from '../../core/constants/paises';
import { COMUNAS_MAULE } from '../../core/constants/comunas-maule';


/** Valor del selector de programa para "mi solicitud no encaja con ningún programa". */
const SIN_PROGRAMA = 0;

interface CarreraOption {
  id: number;
  label: string;
  facultadId?: number;
}

interface ActiveFilter {
  key: 'estado' | 'facultad' | 'carrera' | 'ciudad' | 'solicitante' | 'fechas';
  label: string;
}

@Component({
  selector: 'app-solicitudes',
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
    DatePickerModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './solicitudes.component.html',
  styleUrl: './solicitudes.component.scss',
})
export class SolicitudesComponent implements OnInit, OnDestroy {
  items: Solicitud[] = [];
  totalRecords = 0;
  loading = false;
  readonly rows = 10;
  currentPage = 1;

  selectedEstado: EstadoSolicitud | null = null;
  selectedCarreraId: number | null = null;
  selectedCiudad: string | null = null;
  selectedFacultadId: number | null = null;
  facultadesDropdown: { id: number; label: string }[] = [];
  fechaDesde = '';
  fechaHasta = '';
  /** Fechas elegidas en los calendarios; fechaDesde/fechaHasta (AAAA-MM-DD) son lo que se envía al backend. */
  desdeDate: Date | null = null;
  hastaDate: Date | null = null;
  solicitanteTexto = '';
  showAdvanced = false;
  private solicitanteTimer: ReturnType<typeof setTimeout> | null = null;

  /** Facultad y carrera no aplican a quienes ya están limitados a su carrera. */
  get canFilterByCareer(): boolean {
    return this.useAllEndpoint && !['DOCENTE', 'ENCARGADO_CARRERA'].includes(this.currentUser?.rol ?? '');
  }

  /** Carreras de la facultad elegida (o todas si no hay facultad). */
  get carrerasFiltradas(): CarreraOption[] {
    return this.selectedFacultadId === null
      ? this.carrerasDropdown
      : this.carrerasDropdown.filter(c => c.facultadId === this.selectedFacultadId);
  }

  /** Cantidad de filtros activos dentro del panel, para el contador del botón. */
  get advancedCount(): number {
    return [
      this.selectedFacultadId !== null,
      this.selectedCarreraId !== null,
      !!this.solicitanteTexto.trim(),
    ].filter(Boolean).length;
  }

  selectedOrden: 'recientes' | 'antiguas' = 'recientes';
  carrerasDropdown: CarreraOption[] = [];

  readonly tipoClienteOptions = (Object.keys(TIPO_CLIENTE_LABELS) as TipoCliente[])
    .map(value => ({ value, label: TIPO_CLIENTE_LABELS[value] }));

  /** Carreras de una facultad (para el selector en dos pasos del formulario). */
  carrerasDe(facultadId: number | null | undefined): CarreraOption[] {
    return facultadId ? this.carrerasDropdown.filter(c => c.facultadId === facultadId) : [];
  }

  /** Texto legible del tipo de cliente (incluye el texto libre si es "Otro"). */
  tipoClienteTexto(s: Pick<Solicitud, 'tipoCliente' | 'tipoClienteOtro'>): string {
    if (!s.tipoCliente) return '—';
    return s.tipoCliente === 'OTRO' && s.tipoClienteOtro
      ? `Otro: ${s.tipoClienteOtro}`
      : TIPO_CLIENTE_LABELS[s.tipoCliente];
  }

  /** Al cambiar de facultad en el formulario se limpia la carrera elegida. */
  onFacultadFormChange(group: FormGroup): void {
    group.get('carreraId')!.setValue(null);
  }
  readonly comunasMaule = COMUNAS_MAULE;
  readonly regionesChile = REGIONES_FUERA_DEL_MAULE;
  readonly paises = PAISES;
  readonly alcances = ALCANCE_OPCIONES;

  readonly ordenOptions = [
    { label: 'Más recientes primero', value: 'recientes' },
    { label: 'Más antiguas primero', value: 'antiguas' },
  ];

  /** Filtros activos, para mostrarlos como etiquetas bajo la barra. */
  get activeFilters(): ActiveFilter[] {
    const filtros: ActiveFilter[] = [];
    if (this.selectedEstado !== null) {
      const e = this.estadoOptions.find(o => o.value === this.selectedEstado);
      filtros.push({ key: 'estado', label: e?.label ?? String(this.selectedEstado) });
    }
    if (this.selectedCiudad) {
      filtros.push({ key: 'ciudad', label: this.selectedCiudad });
    }
    if (this.selectedFacultadId !== null) {
      const f = this.facultadesDropdown.find(o => o.id === this.selectedFacultadId);
      filtros.push({ key: 'facultad', label: f?.label ?? 'Facultad' });
    }
    if (this.selectedCarreraId !== null) {
      const c = this.carrerasDropdown.find(o => o.id === this.selectedCarreraId);
      filtros.push({ key: 'carrera', label: c?.label ?? 'Carrera' });
    }
    if (this.solicitanteTexto.trim()) {
      filtros.push({ key: 'solicitante', label: `Solicitante: ${this.solicitanteTexto.trim()}` });
    }
    if (this.fechaDesde || this.fechaHasta) {
      const label = this.fechaDesde && this.fechaHasta
        ? `${this.formatFecha(this.fechaDesde)} – ${this.formatFecha(this.fechaHasta)}`
        : this.fechaDesde
          ? `Desde ${this.formatFecha(this.fechaDesde)}`
          : `Hasta ${this.formatFecha(this.fechaHasta)}`;
      filtros.push({ key: 'fechas', label });
    }
    return filtros;
  }

  /** Date -> AAAA-MM-DD usando la fecha local (evita corrimientos por zona horaria). */
  private toIso(d: Date): string {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  /** Se aplica al elegir o borrar la fecha de inicio o la de fin (cualquiera sirve sola). */
  onFechasChange(): void {
    this.fechaDesde = this.desdeDate ? this.toIso(this.desdeDate) : '';
    this.fechaHasta = this.hastaDate ? this.toIso(this.hastaDate) : '';
    this.onFilterChange();
  }

  private formatFecha(iso: string): string {
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  }

  readonly estadoOptions: { label: string; value: EstadoSolicitud }[] = [
    { label: 'Pendiente', value: 'PENDIENTE' },
    { label: 'Aprobada', value: 'APROBADA' },
    { label: 'Rechazada', value: 'RECHAZADA' },
  ];

  readonly gestionarEstadoOptions: { label: string; value: EstadoSolicitud }[] = [
    { label: 'Aprobada', value: 'APROBADA' },
    { label: 'Rechazada', value: 'RECHAZADA' },
  ];

  // Modal crear / editar
  dialogVisible = false;
  editingItem: Solicitud | null = null;
  viewOnly = false;
  saving = false;
  form: FormGroup;

  // Archivos (dentro del modal editar)
  uploadingFile = false;

  // Evaluar: se hace dentro del mismo modal del detalle (viewOnly + evaluando)
  evaluando = false;
  gestionarItem: Solicitud | null = null;
  gestionarSaving = false;
  gestionarForm: FormGroup;

  private cdr = inject(ChangeDetectorRef);
  private route = inject(ActivatedRoute);
  private usuariosService = inject(UsuariosService);
  private programasService = inject(ProgramasService);

  /** Programas de vinculación entre los que el solicitante debe elegir. */
  programas: Programa[] = [];

  get programaElegido(): Programa | null {
    const id = this.form.get('programaId')?.value;
    return this.programas.find((p) => p.id === id) ?? null;
  }

  /** Opción final de la lista: la solicitud no encaja en ningún programa y se elige la facultad. */
  readonly SIN_PROGRAMA = SIN_PROGRAMA;
  get sinPrograma(): boolean { return this.form.get('programaId')?.value === SIN_PROGRAMA; }

  /** Programas ofrecidos (el docente solo ve los de su facultad) más la opción "no encaja". */
  get programaOpciones(): Programa[] {
    let lista = this.programas;
    if (this.formIniciativa) {
      const fac = this.carrerasDropdown[0]?.facultadId;
      if (fac) lista = lista.filter((p) => p.facultadId === fac);
    }
    return [...lista, { id: SIN_PROGRAMA, nombre: 'Mi solicitud no encaja con ningún programa', orden: 9999, activo: true }];
  }

  /** Mientras hay un programa elegido, la facultad es la del programa y no se puede cambiar. */
  facultadBloqueada = false;

  /**
   * Mantiene la facultad coherente con el programa: con programa se fija y se bloquea; con
   * "no encaja" se libera y es obligatoria (salvo iniciativa de docente, cuya carrera ya es fija).
   */
  private sincronizarFacultad(): void {
    const fac = this.form.get('facultadId')!;
    const car = this.form.get('carreraId')!;
    const prog = this.programaElegido;
    if (prog?.facultadId) {
      if (fac.value !== prog.facultadId) {
        fac.setValue(prog.facultadId, { emitEvent: false });
        const c = this.carrerasDropdown.find((x) => x.id === car.value);
        if (c && c.facultadId !== prog.facultadId) car.setValue(null, { emitEvent: false });
      }
      this.facultadBloqueada = true;
      fac.clearValidators();
      if (fac.enabled) fac.disable({ emitEvent: false });
    } else {
      if (this.facultadBloqueada) {
        // venía de un programa: se vuelve a pedir la facultad
        fac.setValue(null, { emitEvent: false });
        car.setValue(null, { emitEvent: false });
      }
      this.facultadBloqueada = false;
      if (!this.viewOnly && fac.disabled) fac.enable({ emitEvent: false });
      fac.setValidators(this.sinPrograma && !this.formIniciativa ? [Validators.required] : []);
    }
    fac.updateValueAndValidity({ emitEvent: false });
  }

  /** Actividades del programa como lista (se guardan una por línea). */
  actividadesDe(p: Programa | null): string[] {
    return (p?.actividades ?? '').split('\n').map((a) => a.trim()).filter(Boolean);
  }

  /** Teléfono del perfil: se usa para prellenar el contacto de una solicitud nueva. */
  private telefonoPerfil = '';

  constructor(
    private service: SolicitudesService,
    private carrerasService: CarrerasService,
    private authService: AuthService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private fb: FormBuilder,
  ) {
    this.form = this.fb.group({
      titulo: ['', [Validators.required, Validators.maxLength(140)]],
      descripcion: ['', [Validators.required, Validators.maxLength(560)]],
      programaId: [null, Validators.required],
      alcance: ['REGIONAL', Validators.required],
      ciudad: [null, Validators.required],
      region: [null],
      pais: ['', Validators.maxLength(100)],
      direccion: ['', [Validators.required, Validators.maxLength(150)]],
      numeroDireccion: ['', Validators.maxLength(10)],
      telefono: ['', [Validators.required, Validators.pattern(/^\+?[\d\s]{8,20}$/)]],
      tipoCliente: [null, Validators.required],
      tipoClienteOtro: ['', Validators.maxLength(100)],
      nombreOrganizacion: ['', Validators.maxLength(150)],
      personasPrevistas: [null, [Validators.min(1), Validators.max(100000)]],
      facultadId: [null],
      carreraId: [null],
    });

    // Si elige "Otro", debe escribir qué tipo de cliente es
    // Los campos de ubicación obligatorios dependen del alcance elegido
    this.form.get('alcance')!.valueChanges.subscribe(() => this.aplicarValidacionAlcance());
    this.form.get('programaId')!.valueChanges.subscribe(() => this.sincronizarFacultad());

    this.form.get('tipoCliente')!.valueChanges.subscribe((tipo) => {
      const otro = this.form.get('tipoClienteOtro')!;
      if (tipo === 'OTRO') {
        otro.setValidators([Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)]);
      } else {
        otro.setValidators([Validators.maxLength(100)]);
        otro.setValue('', { emitEvent: false });
      }
      otro.updateValueAndValidity({ emitEvent: false });
    });

    this.gestionarForm = this.fb.group({
      estado: [null, Validators.required],
      facultadId: [null],
      carreraId: [null],
      motivoRechazo: [''],
    });

    // El motivo solo es obligatorio cuando se rechaza
    this.gestionarForm.get('estado')!.valueChanges.subscribe((estado) => {
      const motivo = this.gestionarForm.get('motivoRechazo')!;
      if (estado === 'RECHAZADA') {
        motivo.setValidators([Validators.required, Validators.pattern(/\S/), Validators.maxLength(500)]);
      } else {
        motivo.clearValidators();
        motivo.setValue('', { emitEvent: false });
      }
      motivo.updateValueAndValidity({ emitEvent: false });
    });
  }

  get currentUser() { return this.authService.getCurrentUser(); }
  get isAdmin() { return this.currentUser?.rol === 'ADMIN'; }
  get canGestionar() { return ['ADMIN', 'GESTOR_VCM'].includes(this.currentUser?.rol ?? ''); }
  get useAllEndpoint() { return ['ADMIN', 'GESTOR_VCM', 'ENCARGADO_CARRERA', 'DOCENTE', 'DECANO', 'DIRECTOR_VCM'].includes(this.currentUser?.rol ?? ''); }
  get canCreateSolicitud() { return ['ADMIN', 'GESTOR_VCM', 'CLIENTE', 'DOCENTE'].includes(this.currentUser?.rol ?? ''); }
  /** El docente propone una iniciativa propia: indica con quién trabaja y su carrera es la suya. */
  get esDocente() { return this.currentUser?.rol === 'DOCENTE'; }
  /** En el formulario, ¿se muestran los campos de iniciativa de docente? (al ver/editar depende de la solicitud) */
  get formIniciativa(): boolean { return this.editingItem ? this.editingItem.origen === 'DOCENTE' : this.esDocente; }
  get gestionarEstadoValue(): string { return this.gestionarForm.get('estado')?.value ?? ''; }

  canEdit(s: Solicitud): boolean {
    return s.estado === 'PENDIENTE' && (s.clienteId === this.currentUser?.id || this.isAdmin);
  }

  canDelete(s: Solicitud): boolean {
    return this.canEdit(s);
  }

  // ── Aviso de "editando" ───────────────────────────────────
  private latidoTimer: ReturnType<typeof setInterval> | null = null;
  private refrescoTimer: ReturnType<typeof setInterval> | null = null;
  /** Solicitud cuya edición está marcada por este usuario (para liberarla al cerrar). */
  private editandoId: number | null = null;

  /** ¿El solicitante tiene esta solicitud abierta en edición ahora mismo? */
  estaEditando(s: Solicitud | null | undefined): boolean {
    return !!s?.editandoHasta && new Date(s.editandoHasta).getTime() > Date.now();
  }

  /** El solicitante que edita su propia solicitud pendiente avisa cada 30 s para que no se evalúe a mitad de cambios. */
  private iniciarAvisoEdicion(item: Solicitud): void {
    this.detenerAvisoEdicion();
    if (item.estado !== 'PENDIENTE' || item.clienteId !== this.currentUser?.id) return;
    this.editandoId = item.id;
    const avisar = () => this.service.marcarEditando(item.id).subscribe({ error: () => {} });
    avisar();
    this.latidoTimer = setInterval(avisar, 30000);
  }

  private detenerAvisoEdicion(): void {
    if (this.latidoTimer) { clearInterval(this.latidoTimer); this.latidoTimer = null; }
    if (this.editandoId !== null) {
      const id = this.editandoId;
      this.editandoId = null;
      this.service.liberarEditando(id).subscribe({ error: () => {} });
    }
  }

  /** Cierre del formulario: termina la evaluación abierta y libera el aviso de edición. */
  onDialogHide(): void {
    this.evaluando = false;
    this.detenerAvisoEdicion();
  }

  /** Quien evalúa ve en vivo si el solicitante empezó o terminó de editar. */
  private refrescar(): void {
    if (this.evaluando && this.gestionarItem) {
      const id = this.gestionarItem.id;
      this.service.getById(id).subscribe({
        next: (actual) => {
          if (this.gestionarItem?.id === id) {
            this.gestionarItem = actual;
            this.cdr.detectChanges();
          }
        },
        error: () => {},
      });
    } else if (!this.dialogVisible) {
      this.loadItems(true);
    }
  }

  ngOnDestroy(): void {
    this.detenerAvisoEdicion();
    if (this.refrescoTimer) clearInterval(this.refrescoTimer);
  }

  ngOnInit(): void {
    if (this.canGestionar) {
      this.refrescoTimer = setInterval(() => this.refrescar(), 30000);
    }
    this.loadCarrerasDropdown();
    this.programasService.getProgramas().subscribe({
      next: (p) => { this.programas = p; this.cdr.detectChanges(); },
      error: () => {},
    });
    this.loadItems();
    if (this.canCreateSolicitud) {
      this.usuariosService.getMiPerfil().subscribe({
        next: (u) => {
          this.telefonoPerfil = u.telefono ?? '';
          // Si el formulario nuevo ya se abrió antes de que llegara el perfil, se completa ahora
          const tel = this.form.get('telefono');
          if (this.dialogVisible && !this.editingItem && !this.reenviando && tel && !tel.value && this.telefonoPerfil) {
            tel.setValue(this.telefonoPerfil);
          }
          this.cdr.detectChanges();
        },
        error: () => {},
      });
    }
    // Desde el inicio del solicitante: /dashboard/solicitudes?nueva=1 abre el formulario
    if (this.route.snapshot.queryParamMap.get('nueva') && this.canCreateSolicitud) {
      this.openCreate();
    }
  }

  loadCarrerasDropdown(): void {
    this.carrerasService.getCarreras({ limit: 100 }).subscribe({
      next: (res) => {
        const user = this.currentUser;
        const restricted = user && ['DOCENTE', 'ENCARGADO_CARRERA'].includes(user.rol);
        const items = restricted && user?.carreraId
          ? res.items.filter(c => c.id === user!.carreraId)
          : res.items;
        this.carrerasDropdown = items.map(c => ({
          id: c.id,
          facultadId: c.facultadId,
          label: `${c.nombre} (${c.facultad?.etiqueta ?? ''})`,
        }));

        const facultades = new Map<number, string>();
        items.forEach(c => {
          if (c.facultad) facultades.set(c.facultad.id, c.facultad.nombre);
        });
        this.facultadesDropdown = [...facultades.entries()]
          .map(([id, label]) => ({ id, label }))
          .sort((a, b) => a.label.localeCompare(b.label));
        this.cdr.detectChanges();
      },
      error: () => {},
    });
  }

  loadItems(silent = false): void {
    if (!silent) this.loading = true;
    const params: Record<string, any> = { page: this.currentPage, limit: this.rows };
    if (this.selectedEstado !== null) params['estado'] = this.selectedEstado;
    if (this.selectedCarreraId !== null) params['carreraId'] = this.selectedCarreraId;
    if (this.selectedCiudad) params['ciudad'] = this.selectedCiudad;
    params['orden'] = this.selectedOrden;
    if (this.selectedFacultadId !== null) params['facultadId'] = this.selectedFacultadId;
    if (this.fechaDesde) params['fechaDesde'] = this.fechaDesde;
    if (this.fechaHasta) params['fechaHasta'] = this.fechaHasta;
    if (this.solicitanteTexto.trim()) params['solicitante'] = this.solicitanteTexto.trim();

    const obs = this.useAllEndpoint
      ? this.service.getAll(params)
      : this.service.getMisSolicitudes(params);

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
        if (!silent) this.showError('Error al cargar las solicitudes');
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
    this.selectedCarreraId = null;
    this.selectedFacultadId = null;
    this.selectedCiudad = null;
    this.fechaDesde = '';
    this.fechaHasta = '';
    this.desdeDate = null;
    this.hastaDate = null;
    this.solicitanteTexto = '';
    this.currentPage = 1;
    this.loadItems();
  }

  removeFilter(key: ActiveFilter['key']): void {
    if (key === 'estado') this.selectedEstado = null;
    if (key === 'ciudad') this.selectedCiudad = null;
    if (key === 'facultad') { this.selectedFacultadId = null; this.selectedCarreraId = null; }
    if (key === 'carrera') this.selectedCarreraId = null;
    if (key === 'solicitante') this.solicitanteTexto = '';
    if (key === 'fechas') { this.fechaDesde = ''; this.fechaHasta = ''; this.desdeDate = null; this.hastaDate = null; }
    this.onFilterChange();
  }

  /** Al cambiar de facultad, se limpia la carrera para no dejar una combinación imposible. */
  onFacultadChange(): void {
    this.selectedCarreraId = null;
    this.onFilterChange();
  }

  /** Espera un momento después de escribir para no consultar en cada letra. */
  onSolicitanteInput(): void {
    if (this.solicitanteTimer) clearTimeout(this.solicitanteTimer);
    this.solicitanteTimer = setTimeout(() => this.onFilterChange(), 400);
  }

  /** Solicitud rechazada que se está corrigiendo para enviarla de nuevo (crea una solicitud nueva). */
  reenviando: Solicitud | null = null;

  /** Solo quien hizo la solicitud puede corregirla y reenviarla, y solo si fue rechazada. */
  canReenviar(sol: Solicitud): boolean {
    return sol.estado === 'RECHAZADA' && sol.clienteId === this.currentUser?.id;
  }

  /**
   * Abre el formulario de nueva solicitud con los datos de la rechazada ya cargados.
   * La rechazada se conserva como registro; los archivos adjuntos deben subirse de nuevo.
   */
  corregirYReenviar(item: Solicitud): void {
    this.openCreate();
    this.reenviando = item;
    this.form.patchValue({
      titulo: item.titulo,
      descripcion: item.descripcion,
      programaId: item.programaId ?? SIN_PROGRAMA,
      alcance: item.alcance ?? 'REGIONAL',
      ciudad: item.ciudad ?? null,
      region: item.region ?? null,
      pais: item.pais ?? '',
      direccion: item.direccion ?? '',
      numeroDireccion: item.numeroDireccion ?? '',
      telefono: item.telefono ?? '',
      tipoCliente: item.tipoCliente ?? null,
      tipoClienteOtro: item.tipoClienteOtro ?? '',
      nombreOrganizacion: item.nombreOrganizacion ?? '',
      personasPrevistas: item.personasPrevistas ?? null,
      facultadId: item.facultadId ?? this.carrerasDropdown.find(c => c.id === item.carreraId)?.facultadId ?? null,
      carreraId: item.carreraId ?? null,
    });
    this.sincronizarFacultad();
  }

  get alcanceForm(): string { return this.form.get('alcance')?.value ?? 'REGIONAL'; }

  /** Qué campos de ubicación se piden (y cuáles son obligatorios) según el alcance. */
  private aplicarValidacionAlcance(): void {
    const a = this.alcanceForm;
    const poner = (campo: string, validators: any[]) => {
      const c = this.form.get(campo)!;
      c.setValidators(validators);
      c.updateValueAndValidity({ emitEvent: false });
    };
    poner('ciudad', a === 'REGIONAL' || a === 'NACIONAL' ? [Validators.required] : [Validators.maxLength(100)]);
    poner('region', a === 'NACIONAL' ? [Validators.required] : []);
    poner('pais', a === 'INTERNACIONAL' ? [Validators.required] : []);
    poner('direccion', a === 'REGIONAL' ? [Validators.required, Validators.maxLength(150)] : [Validators.maxLength(150)]);
  }

  /** Comunas de la región elegida (alcance nacional). */
  get comunasDeRegion(): string[] {
    const region = this.form.get('region')?.value;
    return region ? COMUNAS_POR_REGION[region] ?? [] : [];
  }

  /** Al cambiar de región se limpia la comuna, que pertenecía a la anterior. */
  cambiarRegion(): void {
    this.form.patchValue({ ciudad: null });
  }

  /** Al cambiar de alcance se limpian los datos de ubicación que ya no corresponden. */
  cambiarAlcance(): void {
    this.form.patchValue({ ciudad: null, region: null, pais: '' });
    this.aplicarValidacionAlcance();
  }

  /** Texto de lugar para el listado: ciudad, región o país según el alcance. */
  lugar(s: Solicitud): string {
    switch (s.alcance) {
      case 'INTERNACIONAL': return [s.ciudad, s.pais].filter(Boolean).join(', ') || '—';
      case 'NACIONAL': return [s.ciudad, s.region].filter(Boolean).join(', ') || '—';
      default: return s.ciudad || '—';
    }
  }

  /** La organización es obligatoria solo en iniciativas de docente. */
  private aplicarValidacionIniciativa(): void {
    const org = this.form.get('nombreOrganizacion')!;
    org.setValidators(this.formIniciativa
      ? [Validators.required, Validators.pattern(/\S/), Validators.maxLength(150)]
      : [Validators.maxLength(150)]);
    org.updateValueAndValidity({ emitEvent: false });
    // La carrera del docente es fija: no se pide en el formulario
    const carrera = this.form.get('carreraId')!;
    carrera.setValue(this.formIniciativa ? null : carrera.value, { emitEvent: false });
  }

  openCreate(): void {
    this.reenviando = null;
    this.evaluando = false;
    this.editingItem = null;
    this.viewOnly = false;
    this.form.reset({ alcance: 'REGIONAL', tipoClienteOtro: '', nombreOrganizacion: '', telefono: this.telefonoPerfil, pais: '' });
    this.aplicarValidacionAlcance();
    this.form.enable();
    this.facultadBloqueada = false;
    this.sincronizarFacultad();
    this.aplicarValidacionIniciativa();
    this.dialogVisible = true;
  }

  openEdit(item: Solicitud, readonly = false): void {
    this.reenviando = null;
    this.evaluando = false;
    this.editingItem = item;
    this.viewOnly = readonly;
    this.form.patchValue({
      titulo: item.titulo,
      descripcion: item.descripcion,
      programaId: item.programaId ?? SIN_PROGRAMA,
      alcance: item.alcance ?? 'REGIONAL',
      ciudad: item.ciudad ?? null,
      region: item.region ?? null,
      pais: item.pais ?? '',
      direccion: item.direccion ?? '',
      numeroDireccion: item.numeroDireccion ?? '',
      telefono: item.telefono ?? '',
      tipoCliente: item.tipoCliente ?? null,
      tipoClienteOtro: item.tipoClienteOtro ?? '',
      nombreOrganizacion: item.nombreOrganizacion ?? '',
      personasPrevistas: item.personasPrevistas ?? null,
      facultadId: item.facultadId ?? this.carrerasDropdown.find(c => c.id === item.carreraId)?.facultadId ?? null,
      carreraId: item.carreraId ?? null,
    });
    if (readonly) {
      this.form.disable();
    } else {
      this.form.enable();
      this.sincronizarFacultad();
    }
    this.aplicarValidacionIniciativa();
    this.dialogVisible = true;
    if (!readonly) this.iniciarAvisoEdicion(item);
  }

  save(): void {
    if (this.viewOnly) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    const raw = this.form.getRawValue();

    if (this.editingItem) {
      const dto: UpdateSolicitudDto = {
        titulo: raw.titulo,
        descripcion: raw.descripcion,
        programaId: raw.programaId === SIN_PROGRAMA ? null : raw.programaId,
        facultadId: raw.facultadId || null,
        alcance: raw.alcance,
        ciudad: raw.ciudad || null,
        region: raw.region || null,
        pais: raw.pais?.trim() || null,
        direccion: raw.direccion?.trim() || null,
        numeroDireccion: raw.numeroDireccion?.trim() || null,
        telefono: raw.telefono.trim(),
        tipoCliente: raw.tipoCliente,
        tipoClienteOtro: raw.tipoCliente === 'OTRO' ? raw.tipoClienteOtro.trim() : undefined,
        ...(this.formIniciativa && {
          nombreOrganizacion: String(raw.nombreOrganizacion ?? '').trim(),
          personasPrevistas: raw.personasPrevistas || undefined,
        }),
        carreraId: raw.carreraId || null,
      };
      this.service.update(this.editingItem.id, dto).subscribe({
        next: () => this.onSaveSuccess('Solicitud actualizada'),
        error: (err: any) => this.onSaveError(err),
      });
    } else {
      const dto: CreateSolicitudDto = {
        titulo: raw.titulo,
        descripcion: raw.descripcion,
        programaId: raw.programaId === SIN_PROGRAMA ? null : raw.programaId,
        facultadId: raw.facultadId || null,
        alcance: raw.alcance,
        ciudad: raw.ciudad || null,
        region: raw.region || null,
        pais: raw.pais?.trim() || null,
        direccion: raw.direccion?.trim() || null,
        numeroDireccion: raw.numeroDireccion?.trim() || undefined,
        telefono: raw.telefono.trim(),
        tipoCliente: raw.tipoCliente,
        tipoClienteOtro: raw.tipoCliente === 'OTRO' ? raw.tipoClienteOtro.trim() : undefined,
        ...(this.formIniciativa && {
          nombreOrganizacion: String(raw.nombreOrganizacion ?? '').trim(),
          personasPrevistas: raw.personasPrevistas || undefined,
        }),
        carreraId: raw.carreraId || undefined,
      };
      this.service.create(dto).subscribe({
        next: () => this.onSaveSuccess('Solicitud creada'),
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
  }

  private onSaveError(err: any): void {
    this.saving = false;
    this.cdr.detectChanges();
    this.showError(err?.error?.message || 'Error al guardar la solicitud');
  }

  confirmDelete(item: Solicitud): void {
    this.confirmationService.confirm({
      message: `¿Eliminar la solicitud "${item.titulo}"? Esta acción no se puede deshacer.`,
      header: 'Confirmar eliminación',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: () => this.deleteItem(item),
    });
  }

  private deleteItem(item: Solicitud): void {
    this.service.delete(item.id).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Eliminada', detail: 'Solicitud eliminada correctamente', life: 3000 });
        this.currentPage = 1;
        this.cdr.detectChanges();
        this.loadItems();
      },
      error: (err: any) => {
        this.cdr.detectChanges();
        this.showError(err?.error?.message || 'No se pudo eliminar la solicitud');
      },
    });
  }

  // ── Archivos ─────────────────────────────────────────────
  
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length || !this.editingItem) return;
    const file = input.files[0];
    input.value = '';
    this.uploadingFile = true;
    this.cdr.detectChanges();

    this.service.addArchivo(this.editingItem.id, file).subscribe({
      next: () => {
        this.uploadingFile = false;
        this.messageService.add({ severity: 'success', summary: 'Archivo subido', detail: `"${file.name}" agregado correctamente`, life: 3000 });
        this.refreshEditingItem();
      },
      error: (err: any) => {
        this.uploadingFile = false;
        this.cdr.detectChanges();
        this.showError(err?.error?.message || 'Error al subir el archivo');
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
    if (!this.editingItem) return;
    this.service.removeArchivo(this.editingItem.id, archivoId).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Archivo eliminado', detail: 'Archivo eliminado correctamente', life: 3000 });
        this.refreshEditingItem();
      },
      error: (err: any) => {
        this.cdr.detectChanges();
        this.showError(err?.error?.message || 'Error al eliminar el archivo');
      },
    });
  }

  private refreshEditingItem(): void {
    if (!this.editingItem) return;
    this.service.getById(this.editingItem.id).subscribe({
      next: (updated) => {
        this.editingItem = updated;
        this.cdr.detectChanges();
      },
      error: () => { this.cdr.detectChanges(); },
    });
  }
  

  // ── Gestionar ─────────────────────────────────────────────
  /** Evaluar = abrir el detalle completo de la solicitud con el bloque de evaluación al final. */
  openGestionar(item: Solicitud): void {
    this.openEdit(item, true);
    this.gestionarItem = item;
    this.gestionarForm.reset({ estado: null, facultadId: null, carreraId: null, motivoRechazo: '' });
    this.evaluando = true;

    // Se vuelve a leer la solicitud: el listado puede estar desactualizado (p. ej. el solicitante la está editando)
    this.service.getById(item.id).subscribe({
      next: (actual) => {
        if (this.gestionarItem?.id !== actual.id) return;
        this.gestionarItem = actual;
        this.editingItem = actual;
        this.form.patchValue({
          titulo: actual.titulo,
          descripcion: actual.descripcion,
          programaId: actual.programaId ?? SIN_PROGRAMA,
          alcance: actual.alcance ?? 'REGIONAL',
          ciudad: actual.ciudad ?? null,
          region: actual.region ?? null,
          pais: actual.pais ?? '',
          direccion: actual.direccion ?? '',
          numeroDireccion: actual.numeroDireccion ?? '',
          telefono: actual.telefono ?? '',
          tipoCliente: actual.tipoCliente ?? null,
          tipoClienteOtro: actual.tipoClienteOtro ?? '',
          nombreOrganizacion: actual.nombreOrganizacion ?? '',
          personasPrevistas: actual.personasPrevistas ?? null,
        });
        this.cdr.detectChanges();
      },
      error: () => {},
    });
  }

  saveGestionar(): void {
    if (this.gestionarForm.invalid) {
      this.gestionarForm.markAllAsTouched();
      return;
    }
    const raw = this.gestionarForm.value;
    this.gestionarSaving = true;
    const dto: GestionarSolicitudDto = {
      estado: raw.estado,
      carreraId: raw.carreraId || undefined,
      motivoRechazo: raw.estado === 'RECHAZADA' ? String(raw.motivoRechazo ?? '').trim() : undefined,
    };
    this.service.gestionar(this.gestionarItem!.id, dto).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Éxito', detail: 'Solicitud gestionada correctamente', life: 3000 });
        this.dialogVisible = false;
        this.evaluando = false;
        this.gestionarSaving = false;
        this.cdr.detectChanges();
        this.currentPage = 1;
        this.loadItems();
      },
      error: (err: any) => {
        this.gestionarSaving = false;
        this.cdr.detectChanges();
        this.showError(err?.error?.message || 'Error al gestionar la solicitud');
      },
    });
  }

  getEstadoStyle(estado: EstadoSolicitud): Record<string, string> {
    const colors: Record<EstadoSolicitud, string> = {
      PENDIENTE: 'var(--ucm-warning)',
      APROBADA: 'var(--ucm-success)',
      RECHAZADA: 'var(--ucm-danger)',
    };
    return { background: colors[estado], color: '#fff' };
  }

  private showError(detail: string): void {
    this.messageService.add({ severity: 'error', summary: 'Error', detail, life: 4000 });
  }
}
