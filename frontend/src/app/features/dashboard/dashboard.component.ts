import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { ChartModule } from 'primeng/chart';
import { AuthService } from '../../core/services/auth.service';
import { ReportesService } from '../../core/services/reportes.service';
import { SolicitudesService } from '../../core/services/solicitudes.service';
import { MiResumen } from '../../core/models/mi-resumen.model';
import { CarrerasService } from '../../core/services/carreras.service';
import { FacultadesService } from '../../core/services/facultades.service';
import { UsuariosService } from '../../core/services/usuarios.service';
import { User } from '../../core/models/user.model';
import { Dashboard } from '../../core/models/dashboard.model';
import { TIPOS_INTERVENCION } from '../../core/constants/tipos-intervencion';

const AZUL = '#1B3D8C';
const CELESTE = '#29ABE2';
const TEAL = '#4DB6AC';
const VERDE = '#22C55E';
const AMARILLO = '#F59E0B';
const ROJO = '#EF4444';
const GRIS = '#9CA3AF';

type VistaUbicacion = 'alcance' | 'region' | 'pais';

const ALCANCE_ETIQUETA: Record<string, string> = {
  REGIONAL: 'Regional (Maule)',
  NACIONAL: 'Nacional',
  INTERNACIONAL: 'Internacional',
};

type SeccionDetalle = 'solicitudes' | 'proyectos' | 'personas';

/** Columna de la tabla "Detalle por facultad". `seccion` marca los encabezados que se pueden pulsar para desglosar. */
interface ColumnaDetalle {
  clave: string;
  label: string;
  seccion?: SeccionDetalle;
}

const COLUMNAS_GENERAL: ColumnaDetalle[] = [
  { clave: 'facultad', label: 'Facultad' },
  { clave: 'solicitudes', label: 'Solicitudes', seccion: 'solicitudes' },
  { clave: 'aprobadas', label: 'Aprobadas' },
  { clave: 'proyectos', label: 'Proyectos', seccion: 'proyectos' },
  { clave: 'finalizados', label: 'Finalizados' },
  { clave: 'tasaConversion', label: 'Conversión' },
  { clave: 'horasHombre', label: 'Horas hombre' },
  { clave: 'participantes', label: 'Personas impactadas', seccion: 'personas' },
  { clave: 'alumnosVoluntarios', label: 'Alumnos vol.' },
];

/** Desglose de cada sección: el primer dato es el total y sigue siendo pulsable para volver. */
const COLUMNAS_DESGLOSE: Record<SeccionDetalle, ColumnaDetalle[]> = {
  solicitudes: [
    { clave: 'facultad', label: 'Facultad' },
    { clave: 'solicitudes', label: 'Solicitudes', seccion: 'solicitudes' },
    { clave: 'aprobadas', label: 'Aprobadas' },
    { clave: 'rechazadas', label: 'Rechazadas' },
    { clave: 'pendientes', label: 'Pendientes' },
  ],
  proyectos: [
    { clave: 'facultad', label: 'Facultad' },
    { clave: 'proyectos', label: 'Proyectos', seccion: 'proyectos' },
    { clave: 'enProceso', label: 'En proceso' },
    { clave: 'pausados', label: 'Pausados' },
    { clave: 'finalizados', label: 'Finalizados' },
    { clave: 'cancelados', label: 'Cancelados' },
  ],
  personas: [
    { clave: 'facultad', label: 'Facultad' },
    { clave: 'participantes', label: 'Personas impactadas', seccion: 'personas' },
    { clave: 'docentes', label: 'Docentes' },
    { clave: 'estudiantes', label: 'Estudiantes' },
    { clave: 'docentesExternos', label: 'Docentes externos' },
    { clave: 'alumnosExternos', label: 'Alumnos externos' },
    { clave: 'otrosExternos', label: 'Otros externos' },
  ],
};

type HitoClave = 'todos' | 'solicitudes' | 'solicitudesAprobadas' | 'planteamientosAprobados' | 'proyectosCreados' | 'proyectosFinalizados';
type AgrupacionHitos = 'mes' | 'trimestre' | 'anio';

/** Hitos del seguimiento: clave en los datos, nombre y color de su serie. */
const HITOS: { clave: Exclude<HitoClave, 'todos'>; label: string; color: string }[] = [
  { clave: 'solicitudes', label: 'Solicitudes recibidas', color: CELESTE },
  { clave: 'solicitudesAprobadas', label: 'Solicitudes aprobadas', color: TEAL },
  { clave: 'planteamientosAprobados', label: 'Planteamientos aprobados', color: AMARILLO },
  { clave: 'proyectosCreados', label: 'Proyectos creados', color: AZUL },
  { clave: 'proyectosFinalizados', label: 'Proyectos finalizados', color: VERDE },
];

/** Máximo de meses que muestra el gráfico de hitos en la vista mensual (los más recientes). */
const MAX_MESES_HITOS = 20;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DatePickerModule, SelectModule, ButtonModule, ChartModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  constructor(
    private authService: AuthService,
    private reportes: ReportesService,
    private carrerasService: CarrerasService,
    private solicitudesService: SolicitudesService,
    private facultadesService: FacultadesService,
    private usuariosService: UsuariosService,
  ) {}

  get currentUser(): User | null {
    return this.authService.getCurrentUser();
  }

  /** El panel de indicadores es para Decano, Director de VCM y Admin; el resto ve la bienvenida. */
  get showPanel(): boolean {
    const rol = this.currentUser?.rol;
    return rol === 'DECANO' || rol === 'DIRECTOR_VCM' || rol === 'ADMIN';
  }

  /** Director y Admin ven todas las facultades (con comparación); el Decano solo la suya. */
  get esGlobal(): boolean {
    const rol = this.currentUser?.rol;
    return rol === 'DIRECTOR_VCM' || rol === 'ADMIN';
  }

  /** Nombre de la facultad del Decano, para mostrarlo en el encabezado. */
  facultadDecano: string | null = null;

  // ── Inicio del solicitante ─────────────────────────────────────────────────
  get esCliente(): boolean {
    return this.currentUser?.rol === 'CLIENTE';
  }

  resumen: MiResumen | null = null;
  resumenCargando = false;
  resumenError = false;

  /** Alertas que el solicitante ya cerró (se recuerdan en su navegador). */
  private alertasCerradas = new Set<number>();

  private get claveAlertas(): string {
    return `vcm_alertas_cerradas_${this.currentUser?.id ?? 0}`;
  }

  private leerAlertasCerradas(): void {
    try {
      const raw = localStorage.getItem(this.claveAlertas);
      this.alertasCerradas = new Set<number>(raw ? JSON.parse(raw) : []);
    } catch {
      this.alertasCerradas = new Set<number>();
    }
  }

  cerrarAlerta(id: number): void {
    this.alertasCerradas.add(id);
    try {
      localStorage.setItem(this.claveAlertas, JSON.stringify([...this.alertasCerradas]));
    } catch {
      // sin almacenamiento disponible: la alerta se oculta solo mientras la página esté abierta
    }
  }

  /** Solicitudes rechazadas más recientes (con su motivo) que el solicitante aún no cerró. */
  get rechazadasRecientes() {
    return (this.resumen?.solicitudes ?? [])
      .filter(s => s.estado === 'RECHAZADA' && !this.alertasCerradas.has(s.id))
      .slice(0, 3);
  }

  cargarResumen(): void {
    this.resumenCargando = true;
    this.resumenError = false;
    this.solicitudesService.getMiResumen().subscribe({
      next: (r) => {
        this.resumen = r;
        this.resumenCargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.resumenCargando = false;
        this.resumenError = true;
        this.cdr.detectChanges();
      },
    });
  }

  // ── Filtros ────────────────────────────────────────────────────────────────
  fechaDesde: Date | null = null;
  fechaHasta: Date | null = null;
  facultadId: number | null = null;
  carreraId: number | null = null;
  tipoIntervencion: string | null = null;
  facultadOptions: { label: string; value: number }[] = [];
  private todasCarreras: { label: string; value: number; facultadId: number }[] = [];
  readonly tipoOptions = TIPOS_INTERVENCION;

  // ── Datos ──────────────────────────────────────────────────────────────────
  data: Dashboard | null = null;
  loading = false;
  error = false;

  chartMes: any;
  chartSolEstado: any;
  chartProyEstado: any;
  chartTipo: any;
  chartCarrera: any;
  chartFacultad: any;
  chartUbicacion: any;
  chartPrograma: any;
  chartEmbudo: any;
  chartTiempos: any;
  chartRechazo: any;
  chartHitos: any;

  readonly optsLinea = this.baseOptions(true);
  /** Total y porcentaje de cada porción, considerando solo las que están visibles. */
  private static porcion(chart: any, i: number): { valor: number; pct: number } {
    const datos: number[] = chart.data.datasets[0].data;
    const total = datos.reduce((acc, v, j) => acc + (chart.getDataVisibility(j) ? Number(v) || 0 : 0), 0);
    const valor = Number(datos[i]) || 0;
    return { valor, pct: total ? (valor / total) * 100 : 0 };
  }

  private static fmtPct(pct: number): string {
    return pct.toLocaleString('es-CL', { maximumFractionDigits: 1 }) + '%';
  }

  readonly optsDonut = {
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          usePointStyle: true,
          // La leyenda muestra también cantidad y porcentaje: sirve para las porciones muy chicas
          generateLabels: (chart: any) => {
            const ds = chart.data.datasets[0];
            return chart.data.labels.map((label: string, i: number) => {
              const { valor, pct } = DashboardComponent.porcion(chart, i);
              return {
                text: `${label}: ${valor} (${DashboardComponent.fmtPct(pct)})`,
                fillStyle: ds.backgroundColor[i],
                strokeStyle: ds.backgroundColor[i],
                pointStyle: 'circle',
                hidden: !chart.getDataVisibility(i),
                index: i,
              };
            });
          },
        },
      },
    },
  };

  /** Dibuja la cantidad y el porcentaje sobre cada porción (las menores a 6% quedan solo en la leyenda). */
  readonly pluginsDonut = [
    {
      id: 'etiquetasDona',
      afterDatasetsDraw: (chart: any) => {
        const ctx = chart.ctx;
        chart.getDatasetMeta(0).data.forEach((arco: any, i: number) => {
          if (!chart.getDataVisibility(i)) return;
          const { valor, pct } = DashboardComponent.porcion(chart, i);
          if (!valor || pct < 6) return;
          const { x, y } = arco.tooltipPosition(true);
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = '600 13px sans-serif';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.fillStyle = '#fff';
          const lineas = [String(valor), DashboardComponent.fmtPct(pct)];
          lineas.forEach((t, k) => {
            const yy = y + (k - 0.5) * 15;
            ctx.strokeText(t, x, yy);
            ctx.fillText(t, x, yy);
          });
          ctx.restore();
        });
      },
    },
  ];

  /** Imprime solo el gráfico de la tarjeta (con su título y la fecha), sin el resto de la pantalla. */
  imprimirGrafico(evento: Event, titulo: string): void {
    const tarjeta = (evento.currentTarget as HTMLElement).closest('.chart-card');
    const canvas = tarjeta?.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    this.imprimirDocumento(titulo, `<img src="${canvas.toDataURL('image/png')}" alt="${titulo}" />`);
  }

  /** Imprime solo la tabla de la tarjeta (con su título y la fecha), en hoja horizontal. */
  imprimirTabla(evento: Event, titulo: string): void {
    const tarjeta = (evento.currentTarget as HTMLElement).closest('.table-card');
    const tabla = tarjeta?.querySelector('table') as HTMLTableElement | null;
    if (!tabla) return;
    this.imprimirDocumento(titulo, tabla.outerHTML.replace(/<i [^>]*><\/i>/g, ''), true);
  }

  /** Arma una página limpia con el título y el contenido, y abre el cuadro de impresión del navegador. */
  private imprimirDocumento(titulo: string, cuerpo: string, horizontal = false): void {
    const fecha = new Date().toLocaleString('es-CL');

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${titulo}</title>
      <style>
        ${horizontal ? '@page { size: landscape; margin: 14mm; }' : ''}
        body { font-family: Arial, sans-serif; margin: 32px; color: #1F2937; text-align: center; }
        h1 { font-size: 20px; margin: 0 0 4px; color: #1B3D8C; }
        p { font-size: 12px; color: #6B7280; margin: 0 0 24px; }
        img { max-width: 100%; height: auto; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; }
        th, td { padding: 6px 8px; border-bottom: 1px solid #E5E7EB; }
        th { background: #F3F4F6; color: #1B3D8C; font-weight: 600; }
        tr { page-break-inside: avoid; }
      </style></head>
      <body>
        <h1>${titulo}</h1>
        <p>VCM FCI · UCM — ${fecha}</p>
        ${cuerpo}
      </body></html>`);
    doc.close();

    const limpiar = () => setTimeout(() => iframe.remove(), 1000);
    const lanzar = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      limpiar();
    };
    const img = doc.querySelector('img');
    if (img && !img.complete) img.onload = lanzar; else lanzar();
  }
  readonly optsBarra = this.baseOptions(true);
  readonly optsBarraH = { ...this.baseOptions(false), indexAxis: 'y' as const };

  /** Opciones del gráfico "Por tipo de intervención": barras horizontales con espacio, leyenda arriba y todos los nombres visibles. */
  readonly optsTipo = {
    indexAxis: 'y' as const,
    maintainAspectRatio: false,
    layout: { padding: { top: 6, right: 40 } },
    // Separación entre grupos y entre las dos barras de cada tipo
    datasets: { bar: { categoryPercentage: 0.72, barPercentage: 0.88, borderRadius: 3 } },
    plugins: {
      legend: { display: true, position: 'top' as const, align: 'end' as const, labels: { usePointStyle: true } },
      tooltip: {
        callbacks: {
          // Qué parte de los planteamientos de ese tipo llegó a ser proyecto
          afterBody: (items: any[]) => {
            const it = items[0];
            const plant = Number(it.chart.data.datasets[0].data[it.dataIndex]) || 0;
            const proy = Number(it.chart.data.datasets[1].data[it.dataIndex]) || 0;
            return plant ? `Conversión a proyecto: ${DashboardComponent.fmtPct((proy / plant) * 100)}` : '';
          },
        },
      },
    },
    scales: {
      x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#EEF1F5' } },
      // autoSkip: false evita que Chart.js oculte nombres cuando hay muchos tipos
      y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 13 }, padding: 8 } },
    },
  };

  /** Alto del gráfico por tipo: crece con la cantidad de tipos para que las barras no queden apretadas. */
  get alturaTipo(): number {
    const n = this.chartTipo?.labels?.length ?? 0;
    return Math.max(280, n * 62 + 80);
  }

  /** Alto del gráfico por programa: crece con la cantidad de programas (los nombres ocupan varias líneas). */
  get alturaPrograma(): number {
    const n = this.chartPrograma?.labels?.length ?? 0;
    return Math.max(320, n * 66 + 80);
  }

  /** Parte un nombre largo en líneas para que el eje no lo corte. */
  private partirNombre(nombre: string, max = 34): string[] {
    const lineas: string[] = [];
    let actual = '';
    for (const palabra of nombre.split(' ')) {
      if (actual && (actual + ' ' + palabra).length > max) {
        lineas.push(actual);
        actual = palabra;
      } else {
        actual = actual ? `${actual} ${palabra}` : palabra;
      }
    }
    if (actual) lineas.push(actual);
    return lineas;
  }

  ngOnInit(): void {
    if (this.esCliente) {
      this.leerAlertasCerradas();
      this.cargarResumen();
      return;
    }
    if (!this.showPanel) return;
    this.carrerasService.getCarreras({ limit: 100 }).subscribe({
      next: (res) => {
        this.todasCarreras = res.items.map((c) => ({ label: c.nombre, value: c.id, facultadId: c.facultadId }));
        this.cdr.detectChanges();
      },
    });
    if (this.esGlobal) {
      this.facultadesService.getFacultades({ limit: 100 }).subscribe({
        next: (res) => {
          this.facultadOptions = res.items.map((f) => ({ label: f.nombre, value: f.id }));
          this.cdr.detectChanges();
        },
      });
    } else if (this.currentUser?.rol === 'DECANO') {
      this.usuariosService.getMiPerfil().subscribe({
        next: (u) => {
          this.facultadDecano = u.facultad?.nombre ?? null;
          this.cdr.detectChanges();
        },
        error: () => {},
      });
    }
    this.cargar();
  }

  private baseOptions(legend: boolean) {
    return {
      maintainAspectRatio: false,
      // Espacio para que las etiquetas al final de las barras no se corten
      layout: { padding: { top: 20, right: 36 } },
      plugins: { legend: { display: legend, position: 'bottom' as const, labels: { usePointStyle: true } } },
      scales: {
        x: { ticks: { precision: 0 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    };
  }

  private toIso(d: Date): string {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  /** Carreras que se ofrecen en el filtro: las de la facultad elegida (o todas las visibles). */
  get carreraOptions(): { label: string; value: number }[] {
    return this.todasCarreras.filter((c) => this.facultadId === null || c.facultadId === this.facultadId);
  }

  /** Al cambiar de facultad se limpia la carrera para no dejar una combinación imposible. */
  onFacultadChange(): void {
    this.carreraId = null;
    this.cargar();
  }

  /** Desde la tabla comparativa: baja de lo general a una facultad (o vuelve a todas al repetir el clic). */
  seleccionarFacultad(id: number): void {
    if (!this.esGlobal) return;
    this.facultadId = this.facultadId === id ? null : id;
    this.carreraId = null;
    this.cargar();
  }

  limpiarFiltros(): void {
    this.fechaDesde = null;
    this.fechaHasta = null;
    this.facultadId = null;
    this.carreraId = null;
    this.tipoIntervencion = null;
    this.cargar();
  }

  get hayFiltros(): boolean {
    return !!(this.fechaDesde || this.fechaHasta || this.facultadId || this.carreraId || this.tipoIntervencion);
  }

  cargar(): void {
    this.loading = true;
    this.error = false;
    this.reportes
      .getDashboard({
        fechaDesde: this.fechaDesde ? this.toIso(this.fechaDesde) : null,
        fechaHasta: this.fechaHasta ? this.toIso(this.fechaHasta) : null,
        facultadId: this.esGlobal ? this.facultadId : null,
        carreraId: this.carreraId,
        tipoIntervencion: this.tipoIntervencion,
      })
      .subscribe({
        next: (d) => {
          this.data = d;
          this.armarGraficos(d);
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.loading = false;
          this.error = true;
          this.cdr.detectChanges();
        },
      });
  }

  private tipoLabel(tipo: string): string {
    if (tipo === 'SIN_TIPO') return 'Sin tipo definido';
    return TIPOS_INTERVENCION.find((t) => t.value === tipo)?.label ?? tipo;
  }

  private mesLabel(key: string): string {
    const [y, m] = key.split('-');
    return `${MESES[Number(m) - 1]} ${y}`;
  }

  // ── Tabla "Detalle por facultad": vista general o desglose de una sección ───────────────────────
  seccionDetalle: SeccionDetalle | null = null;

  get columnasDetalle(): ColumnaDetalle[] {
    return this.seccionDetalle ? COLUMNAS_DESGLOSE[this.seccionDetalle] : COLUMNAS_GENERAL;
  }

  get tituloDetalle(): string {
    const nombres: Record<SeccionDetalle, string> = {
      solicitudes: 'Solicitudes',
      proyectos: 'Proyectos',
      personas: 'Personas impactadas',
    };
    return 'Detalle por facultad' + (this.seccionDetalle ? ` — ${nombres[this.seccionDetalle]}` : '');
  }

  /** Pulsar el encabezado de una sección la desglosa; pulsarlo de nuevo vuelve a la vista general. */
  alternarSeccionDetalle(seccion: SeccionDetalle | undefined): void {
    if (!seccion) return;
    this.seccionDetalle = this.seccionDetalle === seccion ? null : seccion;
  }

  trackColumna(_: number, c: ColumnaDetalle): string {
    return c.clave;
  }

  /** Texto de una celda de la tabla, con el formato que corresponda a la columna. */
  valorDetalle(f: any, c: ColumnaDetalle): string {
    if (c.clave === 'facultad') return f.facultad;
    if (c.clave === 'tasaConversion') return `${f.tasaConversion}%`;
    return this.fmt(f[c.clave]);
  }

  /** Fila de totales de la tabla (suma de todas las facultades mostradas). */
  valorTotalDetalle(c: ColumnaDetalle): string {
    const facs: any[] = this.data?.porFacultad ?? [];
    if (c.clave === 'facultad') return 'Total';
    if (c.clave === 'tasaConversion') {
      const sol = facs.reduce((a, f) => a + f.solicitudes, 0);
      const proy = facs.reduce((a, f) => a + f.proyectos, 0);
      return sol ? `${Math.round((proy / sol) * 1000) / 10}%` : '0%';
    }
    return this.fmt(facs.reduce((a, f) => a + (Number(f[c.clave]) || 0), 0));
  }

  /** Facultad a la que corresponden los datos: la elegida en el filtro (Admin/Director) o la del Decano. */
  get nombreFacultadFiltro(): string | null {
    if (this.esGlobal) {
      return this.facultadOptions.find((f) => f.value === this.facultadId)?.label ?? null;
    }
    return this.facultadDecano || null;
  }

  /** Título de un gráfico, con el nombre de la facultad cuando los datos son de una sola. */
  tituloConFacultad(base: string): string {
    const fac = this.nombreFacultadFiltro;
    return fac ? `${base} — ${fac}` : base;
  }

  // ── Ubicación de las solicitudes: por alcance, región, comuna o país ────────────────────────
  vistaUbicacion: VistaUbicacion = 'alcance';
  readonly vistasUbicacion: { valor: VistaUbicacion; label: string; titulo: string }[] = [
    { valor: 'alcance', label: 'Alcance', titulo: 'Solicitudes por alcance' },
    { valor: 'region', label: 'Región', titulo: 'Solicitudes por región' },
    { valor: 'pais', label: 'País', titulo: 'Solicitudes por país' },
  ];

  /** Región elegida para ver sus comunas (solo en la vista "Región"). */
  regionElegida: string | null = null;

  get tituloUbicacion(): string {
    if (this.vistaUbicacion === 'region' && this.regionElegida) return `Solicitudes por comuna — ${this.regionElegida}`;
    return this.vistasUbicacion.find((v) => v.valor === this.vistaUbicacion)?.titulo ?? '';
  }

  /** Regiones que tienen solicitudes, para elegir una y ver sus comunas. */
  get regionesConDatos(): string[] {
    return (this.data?.porUbicacion?.region ?? []).map((r) => r.nombre).filter((n) => n !== 'Sin región');
  }

  cambiarVistaUbicacion(vista: VistaUbicacion): void {
    this.vistaUbicacion = vista;
    if (vista !== 'region') this.regionElegida = null;
    if (this.data) this.armarChartUbicacion(this.data);
  }

  /** Elige una región para ver sus comunas; con null vuelve a todas las regiones. */
  elegirRegion(region: string | null): void {
    this.regionElegida = region || null;
    if (this.data) this.armarChartUbicacion(this.data);
  }

  /** Al hacer clic en una barra de región se abre el detalle de sus comunas. */
  seleccionarBarraUbicacion(evento: any): void {
    if (this.vistaUbicacion !== 'region' || this.regionElegida) return;
    const indice = evento?.element?.index;
    const region = this.data?.porUbicacion?.region?.[indice]?.nombre;
    if (region && region !== 'Sin región') this.elegirRegion(region);
  }

  /** Alto del gráfico de ubicación: crece con la cantidad de barras. */
  get alturaUbicacion(): number {
    const n = this.chartUbicacion?.labels?.length ?? 0;
    return Math.max(240, n * 62 + 80);
  }

  private armarChartUbicacion(d: Dashboard): void {
    const ub = d.porUbicacion;
    // Si con los filtros actuales la región elegida ya no tiene solicitudes, se vuelve a la lista de regiones
    if (this.regionElegida && !ub?.comunasPorRegion?.[this.regionElegida]) this.regionElegida = null;
    const items =
      this.vistaUbicacion === 'region' && this.regionElegida
        ? ub?.comunasPorRegion?.[this.regionElegida] ?? []
        : ub?.[this.vistaUbicacion] ?? [];
    this.chartUbicacion = {
      labels: items.map((i) => (this.vistaUbicacion === 'alcance' ? ALCANCE_ETIQUETA[i.nombre] ?? i.nombre : i.nombre)),
      datasets: [
        { label: 'Solicitudes', data: items.map((i) => i.solicitudes), backgroundColor: TEAL },
        { label: 'Proyectos', data: items.map((i) => i.proyectos), backgroundColor: AZUL },
      ],
    };
  }

  /** Proceso que se compara entre facultades: todo junto o una sola etapa. */
  vistaFacultad: 'todo' | 'solicitudes' | 'planteamientos' | 'proyectos' = 'todo';
  readonly vistasFacultad: { valor: 'todo' | 'solicitudes' | 'planteamientos' | 'proyectos'; label: string }[] = [
    { valor: 'todo', label: 'Todo el proceso' },
    { valor: 'solicitudes', label: 'Solicitudes' },
    { valor: 'planteamientos', label: 'Planteamientos' },
    { valor: 'proyectos', label: 'Proyectos' },
  ];

  cambiarVistaFacultad(vista: 'todo' | 'solicitudes' | 'planteamientos' | 'proyectos'): void {
    this.vistaFacultad = vista;
    if (this.data) this.armarChartFacultad(this.data);
  }

  /**
   * Gráfico de comparación entre facultades. En "todo el proceso" muestra las etapas lado a lado;
   * al elegir una etapa muestra solo esa, ordenada de mayor a menor para comparar con facilidad.
   */
  private armarChartFacultad(d: Dashboard): void {
    const facs = [...(d.porFacultad ?? [])];
    if (this.vistaFacultad === 'todo') {
      this.chartFacultad = {
        labels: facs.map((f) => f.etiqueta),
        datasets: [
          { label: 'Solicitudes', data: facs.map((f) => f.solicitudes), backgroundColor: CELESTE },
          { label: 'Planteamientos', data: facs.map((f) => f.planteamientos), backgroundColor: TEAL },
          { label: 'Proyectos', data: facs.map((f) => f.proyectos), backgroundColor: AZUL },
          { label: 'Proyectos finalizados', data: facs.map((f) => f.finalizados), backgroundColor: VERDE },
        ],
      };
      return;
    }
    const campo = this.vistaFacultad;
    const meta = {
      solicitudes: { label: 'Solicitudes', color: CELESTE },
      planteamientos: { label: 'Planteamientos', color: TEAL },
      proyectos: { label: 'Proyectos', color: AZUL },
    }[campo];
    facs.sort((a, b) => b[campo] - a[campo]);
    this.chartFacultad = {
      labels: facs.map((f) => f.etiqueta),
      datasets: [{ label: meta.label, data: facs.map((f) => f[campo]), backgroundColor: meta.color }],
    };
  }

  /**
   * Escribe el valor al final de cada barra (a la derecha en las horizontales, arriba en las verticales),
   * para no depender de leer el eje. Un dataset puede traer `sufijo` (ej: '%') para agregarlo al número.
   */
  readonly pluginsBarras = [
    {
      id: 'valoresBarras',
      afterDatasetsDraw: (chart: any) => {
        const ctx = chart.ctx;
        const horizontal = chart.options.indexAxis === 'y';
        const varias = chart.data.datasets.length > 1;
        chart.data.datasets.forEach((ds: any, k: number) => {
          if (!chart.isDatasetVisible(k)) return;
          chart.getDatasetMeta(k).data.forEach((barra: any, i: number) => {
            const valor = Number(ds.data[i]);
            if (!valor) return;
            const texto = valor.toLocaleString('es-CL', { maximumFractionDigits: 1 }) + (ds.sufijo ?? '');
            ctx.save();
            ctx.font = `600 ${varias ? 10 : 12}px sans-serif`;
            ctx.fillStyle = '#374151';
            if (horizontal) {
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText(texto, barra.x + 6, barra.y);
            } else {
              // Con varias series, si el número no cabe sobre la barra se omite (queda en el tooltip)
              if (varias && ctx.measureText(texto).width > barra.width + 4) { ctx.restore(); return; }
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              ctx.fillText(texto, barra.x, barra.y - 4);
            }
            ctx.restore();
          });
        });
      },
    },
  ];

  private armarGraficos(d: Dashboard): void {
    const r = d.resumen;

    this.armarChartFacultad(d);

    this.chartMes = {
      labels: d.porMes.map((m) => this.mesLabel(m.mes)),
      datasets: [
        { label: 'Solicitudes recibidas', data: d.porMes.map((m) => m.solicitudes), borderColor: AZUL, backgroundColor: AZUL, tension: 0.3 },
        { label: 'Proyectos iniciados', data: d.porMes.map((m) => m.proyectos), borderColor: TEAL, backgroundColor: TEAL, tension: 0.3 },
      ],
    };

    this.chartSolEstado = {
      labels: ['Pendientes', 'Aprobadas', 'Rechazadas'],
      datasets: [{ data: [r.solicitudes.pendientes, r.solicitudes.aprobadas, r.solicitudes.rechazadas], backgroundColor: [AMARILLO, VERDE, ROJO] }],
    };

    this.chartProyEstado = {
      labels: ['En proceso', 'Pausados', 'Finalizados', 'Cancelados'],
      datasets: [{ data: [r.proyectos.enProceso, r.proyectos.pausados, r.proyectos.finalizados, r.proyectos.cancelados], backgroundColor: [CELESTE, AMARILLO, VERDE, GRIS] }],
    };

    // De mayor a menor, para que se lea como un ranking
    const tipos = [...d.porTipoIntervencion].sort(
      (a, b) => b.planteamientos - a.planteamientos || b.proyectos - a.proyectos,
    );
    this.chartTipo = {
      labels: tipos.map((t) => this.tipoLabel(t.tipo)),
      datasets: [
        { label: 'Planteamientos', data: tipos.map((t) => t.planteamientos), backgroundColor: CELESTE },
        { label: 'Proyectos', data: tipos.map((t) => t.proyectos), backgroundColor: AZUL },
      ],
    };

    this.chartCarrera = {
      labels: d.porCarrera.map((c) => c.etiqueta),
      datasets: [
        { label: 'Solicitudes', data: d.porCarrera.map((c) => c.solicitudes), backgroundColor: CELESTE },
        { label: 'Proyectos', data: d.porCarrera.map((c) => c.proyectos), backgroundColor: AZUL },
      ],
    };

    // Ya viene de mayor a menor; los nombres largos se parten en varias líneas
    const programas = d.porPrograma ?? [];
    this.chartPrograma = {
      labels: programas.map((p) => this.partirNombre(p.programa)),
      datasets: [
        { label: 'Solicitudes', data: programas.map((p) => p.solicitudes), backgroundColor: CELESTE },
        { label: 'Proyectos', data: programas.map((p) => p.proyectos), backgroundColor: AZUL },
      ],
    };

    this.armarChartUbicacion(d);

    this.armarSeguimiento(d);
  }

  /** Indicadores del seguimiento de cada fase (embudo, tiempos, rechazos e hitos por mes). */
  private armarSeguimiento(d: Dashboard): void {
    const s = d.seguimiento;
    if (!s) return;

    this.chartEmbudo = {
      labels: s.embudo.map((p) => p.label),
      datasets: [{
        label: 'Iniciativas',
        data: s.embudo.map((p) => p.cuenta),
        backgroundColor: [CELESTE, TEAL, AMARILLO, VERDE, AZUL, '#0F766E'],
      }],
    };

    this.chartTiempos = {
      labels: s.tiempos.map((t) => `${t.label} (${t.casos} casos)`),
      datasets: [{
        label: 'Días promedio',
        sufijo: ' d',
        data: s.tiempos.map((t) => t.promedioDias ?? 0),
        backgroundColor: [CELESTE, TEAL, AMARILLO, VERDE, AZUL, GRIS],
      }],
    };

    this.chartRechazo = {
      labels: ['Solicitudes', 'Planteamientos'],
      datasets: [{
        label: '% de rechazo',
        sufijo: '%',
        data: [s.rechazos.solicitud.pctRechazo, s.rechazos.planteamiento.pctRechazo],
        backgroundColor: [ROJO, AMARILLO],
      }],
    };

    this.armarChartHitos(s);
  }

  // ── Gráfico "Hitos por mes": hito elegido y agrupación (mes / trimestre / año) ─────────────────
  hitoSeleccionado: HitoClave = 'todos';
  agrupacionHitos: AgrupacionHitos = 'mes';

  readonly opcionesHito: { label: string; value: HitoClave }[] = [
    { label: 'Todos los hitos', value: 'todos' },
    ...HITOS.map((h) => ({ label: h.label, value: h.clave })),
  ];
  readonly agrupacionesHitos: { valor: AgrupacionHitos; label: string }[] = [
    { valor: 'mes', label: 'Mensual' },
    { valor: 'trimestre', label: 'Trimestral' },
    { valor: 'anio', label: 'Anual' },
  ];

  /** Título del gráfico según la agrupación y el hito elegidos. */
  get tituloHitos(): string {
    const periodo = { mes: 'mes', trimestre: 'trimestre', anio: 'año' }[this.agrupacionHitos];
    const hito = HITOS.find((h) => h.clave === this.hitoSeleccionado);
    const limite = this.agrupacionHitos === 'mes' ? ` (últimos ${MAX_MESES_HITOS})` : '';
    return `Hitos por ${periodo}${limite}` + (hito ? ` — ${hito.label}` : '');
  }

  cambiarHito(hito: HitoClave): void {
    this.hitoSeleccionado = hito;
    this.rearmarHitos();
  }

  cambiarAgrupacionHitos(agrupacion: AgrupacionHitos): void {
    this.agrupacionHitos = agrupacion;
    this.rearmarHitos();
  }

  private rearmarHitos(): void {
    if (this.data?.seguimiento) this.armarChartHitos(this.data.seguimiento);
  }

  /** Suma los hitos mensuales en el período elegido (mes, trimestre o año), en orden cronológico. */
  private armarChartHitos(s: NonNullable<Dashboard['seguimiento']>): void {
    const grupos = new Map<string, Record<Exclude<HitoClave, 'todos'>, number>>();
    for (const m of s.hitosPorMes) {
      const [anio, mes] = m.mes.split('-');
      const clave =
        this.agrupacionHitos === 'mes' ? m.mes
        : this.agrupacionHitos === 'trimestre' ? `${anio}-T${Math.ceil(Number(mes) / 3)}`
        : anio;
      const g = grupos.get(clave) ?? {
        solicitudes: 0, solicitudesAprobadas: 0, planteamientosAprobados: 0, proyectosCreados: 0, proyectosFinalizados: 0,
      };
      for (const h of HITOS) g[h.clave] += Number(m[h.clave]) || 0;
      grupos.set(clave, g);
    }
    // En la vista mensual se muestran solo los últimos meses, para que el gráfico se pueda leer
    const todas = [...grupos.keys()].sort();
    const claves = this.agrupacionHitos === 'mes' ? todas.slice(-MAX_MESES_HITOS) : todas;
    const etiqueta = (k: string) =>
      this.agrupacionHitos === 'mes' ? this.mesLabel(k)
      : this.agrupacionHitos === 'trimestre' ? `${k.split('-T')[1]}º trim. ${k.split('-T')[0]}`
      : k;
    const elegidos = HITOS.filter((h) => this.hitoSeleccionado === 'todos' || h.clave === this.hitoSeleccionado);

    this.chartHitos = {
      labels: claves.map(etiqueta),
      datasets: elegidos.map((h) => ({
        label: h.label,
        data: claves.map((k) => grupos.get(k)![h.clave]),
        borderColor: h.color,
        backgroundColor: h.color,
        tension: 0.3,
      })),
    };
  }

  /** Con un solo hito elegido, escribe el valor sobre cada punto (y salta algunos si son muchos puntos). */
  readonly pluginsHitos = [
    {
      id: 'valoresHitos',
      afterDatasetsDraw: (chart: any) => {
        if (chart.data.datasets.length !== 1) return;
        const ctx = chart.ctx;
        const puntos = chart.getDatasetMeta(0).data;
        const paso = Math.max(1, Math.ceil(puntos.length / 20));
        puntos.forEach((p: any, i: number) => {
          if (i % paso !== 0) return;
          const valor = Number(chart.data.datasets[0].data[i]) || 0;
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.font = '600 11px sans-serif';
          ctx.fillStyle = '#374151';
          ctx.fillText(String(valor), p.x, p.y - 6);
          ctx.restore();
        });
      },
    },
  ];

  fmt(n: number | null | undefined, sufijo = ''): string {
    return n === null || n === undefined ? '—' : `${n.toLocaleString('es-CL')}${sufijo}`;
  }
}
