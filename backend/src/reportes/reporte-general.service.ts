import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import { CurrentUser } from '../auth/strategies/jwt.strategy';
import { facultadDelDecano } from '../common/alcance';
import { PrismaService } from '../prisma/prisma.service';
import { QueryReporteDto, TipoReporte } from './dto/query-reporte.dto';

// ─── Catálogo de columnas ────────────────────────────────────────────────────
interface Columna {
  key: string;
  label: string;
  peso: number; // ancho relativo en el PDF
  defecto: boolean;
}

const CATALOGO: Record<TipoReporte, Columna[]> = {
  SOLICITUDES: [
    { key: 'id', label: 'ID', peso: 4, defecto: true },
    { key: 'titulo', label: 'Título', peso: 22, defecto: true },
    { key: 'estado', label: 'Estado', peso: 9, defecto: true },
    { key: 'solicitante', label: 'Solicitante', peso: 14, defecto: true },
    { key: 'correo', label: 'Correo', peso: 16, defecto: false },
    { key: 'telefono', label: 'Teléfono', peso: 10, defecto: false },
    { key: 'carrera', label: 'Carrera', peso: 14, defecto: true },
    { key: 'facultad', label: 'Facultad', peso: 9, defecto: false },
    { key: 'ciudad', label: 'Comuna', peso: 10, defecto: true },
    { key: 'direccion', label: 'Dirección', peso: 14, defecto: false },
    { key: 'fecha', label: 'Fecha de recepción', peso: 10, defecto: true },
    { key: 'avance', label: 'Avance', peso: 12, defecto: false },
    { key: 'descripcion', label: 'Descripción', peso: 26, defecto: false },
  ],
  PLANTEAMIENTOS: [
    { key: 'id', label: 'ID', peso: 4, defecto: true },
    { key: 'solicitud', label: 'Solicitud', peso: 22, defecto: true },
    { key: 'estado', label: 'Estado', peso: 9, defecto: true },
    { key: 'docente', label: 'Docente', peso: 14, defecto: true },
    { key: 'carrera', label: 'Carrera', peso: 14, defecto: true },
    { key: 'ciudad', label: 'Comuna', peso: 10, defecto: false },
    { key: 'tipo', label: 'Tipo de intervención', peso: 15, defecto: true },
    { key: 'duracion', label: 'Duración', peso: 9, defecto: true },
    { key: 'horas', label: 'Horas hombre', peso: 8, defecto: true },
    { key: 'fecha', label: 'Fecha del planteamiento', peso: 10, defecto: true },
    { key: 'tieneProyecto', label: '¿Tiene proyecto?', peso: 8, defecto: false },
    { key: 'descripcion', label: 'Descripción', peso: 26, defecto: false },
  ],
  PROYECTOS: [
    { key: 'id', label: 'ID', peso: 4, defecto: true },
    { key: 'titulo', label: 'Proyecto', peso: 20, defecto: true },
    { key: 'estado', label: 'Estado', peso: 9, defecto: true },
    { key: 'docente', label: 'Docente', peso: 14, defecto: true },
    { key: 'carrera', label: 'Carrera', peso: 13, defecto: true },
    { key: 'ciudad', label: 'Comuna', peso: 10, defecto: false },
    { key: 'tipo', label: 'Tipo de intervención', peso: 14, defecto: true },
    { key: 'fechaInicio', label: 'Inicio', peso: 9, defecto: true },
    { key: 'fechaFin', label: 'Fin', peso: 9, defecto: true },
    { key: 'horas', label: 'Horas hombre', peso: 7, defecto: true },
    { key: 'gasto', label: 'Gasto del proyecto', peso: 10, defecto: true },
    { key: 'docentes', label: 'Docentes', peso: 7, defecto: false },
    { key: 'estudiantes', label: 'Estudiantes', peso: 8, defecto: false },
    { key: 'docentesExt', label: 'Docentes externos', peso: 8, defecto: false },
    { key: 'alumnosExt', label: 'Alumnos externos', peso: 8, defecto: false },
    { key: 'otrosExt', label: 'Otros externos', peso: 8, defecto: false },
    { key: 'totalPersonas', label: 'Total personas', peso: 8, defecto: true },
    { key: 'alumnos', label: 'Alumnos voluntarios', peso: 20, defecto: false },
  ],
};

const ESTADOS_VALIDOS: Record<TipoReporte, string[]> = {
  SOLICITUDES: ['PENDIENTE', 'APROBADA', 'RECHAZADA'],
  PLANTEAMIENTOS: ['PENDIENTE', 'APROBADO', 'RECHAZADO'],
  PROYECTOS: ['EN_PROCESO', 'PAUSADO', 'FINALIZADO', 'CANCELADO'],
};

const TITULOS: Record<TipoReporte, string> = {
  SOLICITUDES: 'Solicitudes',
  PLANTEAMIENTOS: 'Planteamientos',
  PROYECTOS: 'Proyectos',
};

const ETIQUETA_FECHA: Record<TipoReporte, string> = {
  SOLICITUDES: 'fecha de recepción',
  PLANTEAMIENTOS: 'fecha del planteamiento',
  PROYECTOS: 'fecha de inicio',
};

const TIPOS_INTERVENCION: Record<string, string> = {
  CHARLA: 'Charla o conferencia',
  TALLER: 'Taller',
  CURSO_CAPACITACION: 'Curso de capacitación',
  SEMINARIO: 'Seminario o jornada',
  ASESORIA_TECNICA: 'Asesoría o asistencia técnica',
  OPERATIVO_TERRENO: 'Operativo o actividad en terreno',
  APRENDIZAJE_SERVICIO: 'Proyecto de aprendizaje-servicio',
  ACTIVIDAD_CULTURAL: 'Actividad cultural o artística',
  VOLUNTARIADO: 'Voluntariado',
  INVESTIGACION_APLICADA: 'Investigación o estudio aplicado',
  OTRO: 'Otro',
};

const LIMITE_MAXIMO = 5000;

// ─── Utilidades de formato ───────────────────────────────────────────────────
const fmtFecha = (d: Date | null | undefined): string => {
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
};
const fmtEstado = (e: string): string => e.replace(/_/g, ' ');
const fmtTipo = (t: string | null | undefined, otro?: string | null): string => {
  if (!t) return '—';
  if (t === 'OTRO' && otro) return `Otro: ${otro}`;
  return TIPOS_INTERVENCION[t] ?? t;
};
const nombre = (u: { nombres: string; apellidos: string } | null | undefined): string =>
  u ? `${u.nombres} ${u.apellidos}` : '—';
const pesos = (n: number): string => `$${n.toLocaleString('es-CL')}`;
const num = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : String(n));

export interface ReporteResultado {
  tipo: TipoReporte;
  titulo: string;
  columnas: { key: string; label: string; peso: number }[];
  filas: Record<string, string>[];
  total: number;
  mostradas: number;
  truncado: boolean;
  resumen: {
    porEstado: { estado: string; cantidad: number }[];
    horasTotales: number | null;
    personasTotales: number | null;
    gastoTotal: number | null;
  };
  filtros: string[];
}

@Injectable()
export class ReporteGeneralService {
  constructor(private readonly prisma: PrismaService) {}

  /** Columnas y estados disponibles, para armar el formulario del frontend. */
  catalogo() {
    const data = (Object.keys(CATALOGO) as TipoReporte[]).map((tipo) => ({
      tipo,
      titulo: TITULOS[tipo],
      etiquetaFecha: ETIQUETA_FECHA[tipo],
      estados: ESTADOS_VALIDOS[tipo],
      columnas: CATALOGO[tipo].map(({ key, label, defecto }) => ({ key, label, defecto })),
    }));
    return { data, message: 'Catálogo de reportes', statusCode: 200 };
  }

  async datos(query: QueryReporteDto, user: CurrentUser) {
    const r = await this.construir(query, user, query.limite ?? 15);
    return { data: r, message: 'Reporte generado', statusCode: 200 };
  }

  async pdf(query: QueryReporteDto, user: CurrentUser): Promise<Buffer> {
    const r = await this.construir(query, user, LIMITE_MAXIMO);
    return this.buildPdf(r);
  }

  // ───────────────────────────────────────────────────────────────────────────
  private async construir(
    query: QueryReporteDto,
    user: CurrentUser,
    limiteFilas: number,
  ): Promise<ReporteResultado> {
    const tipo = query.tipo;

    if (query.estado && !ESTADOS_VALIDOS[tipo].includes(query.estado)) {
      throw new BadRequestException(
        `Estado inválido para ${TITULOS[tipo]}. Valores: ${ESTADOS_VALIDOS[tipo].join(', ')}`,
      );
    }

    // Un Encargado de carrera solo ve los datos de su propia carrera.
    let carreraId = query.carreraId;
    if (user.rol === Role.ENCARGADO_CARRERA) {
      const u = await this.prisma.user.findUnique({ where: { id: user.id }, select: { carreraId: true } });
      carreraId = u?.carreraId ?? -1; // sin carrera asignada: no ve nada
    }

    // El Decano solo ve los datos de su propia facultad (se ignora cualquier otra que pida)
    const facultadDecano = await facultadDelDecano(this.prisma, user);
    const facultadId = facultadDecano ?? query.facultadId;

    const solicitudWhere: Prisma.SolicitudWhereInput = {};
    if (carreraId !== undefined) solicitudWhere.carreraId = carreraId;
    if (facultadId !== undefined) solicitudWhere.facultadId = facultadId;
    if (query.ciudad) solicitudWhere.ciudad = query.ciudad;

    const docenteWhere: Prisma.UserWhereInput | undefined = query.docente?.trim()
      ? {
          AND: query.docente
            .trim()
            .split(/\s+/)
            .map((w) => ({ OR: [{ nombres: { contains: w } }, { apellidos: { contains: w } }] })),
        }
      : undefined;

    const rango = (): Prisma.DateTimeFilter | undefined => {
      if (!query.fechaDesde && !query.fechaHasta) return undefined;
      const f: Prisma.DateTimeFilter = {};
      if (query.fechaDesde) f.gte = new Date(`${query.fechaDesde}T00:00:00`);
      if (query.fechaHasta) f.lte = new Date(`${query.fechaHasta}T23:59:59.999`);
      return f;
    };
    const orderDir: 'asc' | 'desc' = query.orden === 'antiguas' ? 'asc' : 'desc';

    // Columnas elegidas (en el orden del catálogo); si no hay, las predeterminadas
    const pedidas = (query.columnas ?? '').split(',').map((c) => c.trim()).filter(Boolean);
    let columnas = CATALOGO[tipo].filter((c) => pedidas.includes(c.key));
    if (!columnas.length) columnas = CATALOGO[tipo].filter((c) => c.defecto);

    let filasRaw: { fila: Record<string, string>; estado: string; horas: number; personas: number; gasto?: number }[] = [];
    let total = 0;

    if (tipo === 'SOLICITUDES') {
      const planteamientoFiltro: Prisma.PlanteamientoWhereInput = {};
      if (query.tipoIntervencion) planteamientoFiltro.tipoIntervencion = query.tipoIntervencion;
      if (docenteWhere) planteamientoFiltro.docente = docenteWhere;
      const where: Prisma.SolicitudWhereInput = {
        ...solicitudWhere,
        ...(rango() && { createdAt: rango() }),
        ...(!!query.estado && { estado: query.estado as any }),
        ...(Object.keys(planteamientoFiltro).length > 0 && { planteamiento: { is: planteamientoFiltro } }),
      };
      const [rows, count] = await Promise.all([
        this.prisma.solicitud.findMany({
          where,
          include: {
            carrera: { include: { facultad: true } },
            facultad: true,
            cliente: { select: { nombres: true, apellidos: true, email: true } },
            planteamiento: { select: { id: true, proyecto: { select: { id: true } } } },
          },
          orderBy: { createdAt: orderDir },
          take: LIMITE_MAXIMO,
        }),
        this.prisma.solicitud.count({ where }),
      ]);
      total = count;
      filasRaw = rows.map((s: any) => ({
        estado: s.estado,
        horas: 0,
        personas: 0,
        fila: {
          id: String(s.id),
          titulo: s.titulo,
          estado: fmtEstado(s.estado),
          solicitante: nombre(s.cliente),
          correo: s.cliente?.email ?? '—',
          telefono: s.telefono ?? '—',
          carrera: s.carrera?.nombre ?? '—',
          facultad: s.facultad?.etiqueta ?? s.carrera?.facultad?.etiqueta ?? '—',
          ciudad: s.ciudad ?? '—',
          direccion: [s.direccion, s.numeroDireccion].filter(Boolean).join(' ') || '—',
          fecha: fmtFecha(s.createdAt),
          avance: s.planteamiento?.proyecto ? 'Con proyecto' : s.planteamiento ? 'Con planteamiento' : 'Sin planteamiento',
          descripcion: s.descripcion ?? '',
        },
      }));
    } else if (tipo === 'PLANTEAMIENTOS') {
      const where: Prisma.PlanteamientoWhereInput = {
        ...(rango() && { createdAt: rango() }),
        ...(!!query.estado && { estado: query.estado as any }),
        ...(!!query.tipoIntervencion && { tipoIntervencion: query.tipoIntervencion }),
        ...(docenteWhere && { docente: docenteWhere }),
        ...(Object.keys(solicitudWhere).length > 0 && { solicitud: { is: solicitudWhere } }),
      };
      const [rows, count] = await Promise.all([
        this.prisma.planteamiento.findMany({
          where,
          include: {
            docente: { select: { nombres: true, apellidos: true } },
            solicitud: { include: { carrera: true } },
            proyecto: { select: { id: true } },
          },
          orderBy: { createdAt: orderDir },
          take: LIMITE_MAXIMO,
        }),
        this.prisma.planteamiento.count({ where }),
      ]);
      total = count;
      filasRaw = rows.map((p: any) => ({
        estado: p.estado,
        horas: p.horasHombre ?? 0,
        personas: 0,
        fila: {
          id: String(p.id),
          solicitud: p.solicitud?.titulo ?? '—',
          estado: fmtEstado(p.estado),
          docente: nombre(p.docente),
          carrera: p.solicitud?.carrera?.nombre ?? '—',
          ciudad: p.solicitud?.ciudad ?? '—',
          tipo: fmtTipo(p.tipoIntervencion, p.tipoIntervencionOtro),
          duracion: p.tiempoEstimado || '—',
          horas: num(p.horasHombre),
          fecha: fmtFecha(p.createdAt),
          tieneProyecto: p.proyecto ? 'Sí' : 'No',
          descripcion: p.descripcion ?? '',
        },
      }));
    } else {
      const planteamientoFiltro: Prisma.PlanteamientoWhereInput = {
        ...(!!query.tipoIntervencion && { tipoIntervencion: query.tipoIntervencion }),
        ...(docenteWhere && { docente: docenteWhere }),
        ...(Object.keys(solicitudWhere).length > 0 && { solicitud: { is: solicitudWhere } }),
      };
      const where: Prisma.ProyectoWhereInput = {
        ...(rango() && { fechaInicio: rango() }),
        ...(!!query.estado && { estado: query.estado as any }),
        ...(Object.keys(planteamientoFiltro).length > 0 && { planteamiento: { is: planteamientoFiltro } }),
      };
      const [rows, count] = await Promise.all([
        this.prisma.proyecto.findMany({
          where,
          include: {
            planteamiento: {
              include: {
                docente: { select: { nombres: true, apellidos: true } },
                solicitud: { include: { carrera: true } },
              },
            },
            alumnos: { include: { alumno: { select: { nombres: true, apellidos: true } } } },
            costos: { select: { tipo: true, monto: true } },
          },
          orderBy: { fechaInicio: orderDir },
          take: LIMITE_MAXIMO,
        }),
        this.prisma.proyecto.count({ where }),
      ]);
      total = count;
      filasRaw = rows.map((p: any) => {
        const pl = p.planteamiento;
        const totalPersonas =
          (p.participantesDocentes ?? 0) +
          (p.participantesEstudiantes ?? 0) +
          (p.participantesDocentesExternos ?? 0) +
          (p.participantesAlumnosExternos ?? 0) +
          (p.participantesOtrosExternos ?? 0);
        // Solo se informa el gasto (los aportes no se consideran)
        const gasto = (p.costos ?? []).filter((c: any) => c.tipo === 'GASTO').reduce((a: number, c: any) => a + c.monto, 0);
        return {
          estado: p.estado,
          horas: pl?.horasHombre ?? 0,
          personas: totalPersonas,
          gasto,
          fila: {
            id: String(p.id),
            titulo: pl?.solicitud?.titulo ?? '—',
            estado: fmtEstado(p.estado),
            docente: nombre(pl?.docente),
            carrera: pl?.solicitud?.carrera?.nombre ?? '—',
            ciudad: pl?.solicitud?.ciudad ?? '—',
            tipo: fmtTipo(pl?.tipoIntervencion, pl?.tipoIntervencionOtro),
            fechaInicio: fmtFecha(p.fechaInicio),
            fechaFin: fmtFecha(p.fechaFin),
            horas: num(pl?.horasHombre),
            gasto: gasto > 0 ? pesos(gasto) : '—',
            docentes: num(p.participantesDocentes),
            estudiantes: num(p.participantesEstudiantes),
            docentesExt: num(p.participantesDocentesExternos),
            alumnosExt: num(p.participantesAlumnosExternos),
            otrosExt: num(p.participantesOtrosExternos),
            totalPersonas: String(totalPersonas),
            alumnos: p.alumnos?.length ? p.alumnos.map((a: any) => nombre(a.alumno)).join(', ') : 'Sin alumnos',
          },
        };
      });
    }

    // Resumen (sobre todas las filas traídas)
    const conteo = new Map<string, number>();
    let horas = 0;
    let personas = 0;
    let gastoTotal = 0;
    for (const f of filasRaw) {
      conteo.set(f.estado, (conteo.get(f.estado) ?? 0) + 1);
      horas += f.horas;
      personas += f.personas;
      gastoTotal += f.gasto ?? 0;
    }
    const porEstado = ESTADOS_VALIDOS[tipo].map((e) => ({ estado: fmtEstado(e), cantidad: conteo.get(e) ?? 0 }));

    // Solo se devuelven las columnas elegidas
    const filas = filasRaw.slice(0, limiteFilas).map(({ fila }) => {
      const out: Record<string, string> = {};
      for (const c of columnas) out[c.key] = fila[c.key] ?? '';
      return out;
    });

    return {
      tipo,
      titulo: TITULOS[tipo],
      columnas: columnas.map(({ key, label, peso }) => ({ key, label, peso })),
      filas,
      total,
      mostradas: filas.length,
      truncado: total > filasRaw.length,
      resumen: {
        porEstado,
        horasTotales: tipo === 'SOLICITUDES' ? null : horas,
        personasTotales: tipo === 'PROYECTOS' ? personas : null,
        gastoTotal: tipo === 'PROYECTOS' ? gastoTotal : null,
      },
      filtros: await this.describirFiltros(query, carreraId, user),
    };
  }

  private async describirFiltros(query: QueryReporteDto, carreraId: number | undefined, user: CurrentUser) {
    const f: string[] = [];
    if (query.fechaDesde) f.push(`${ETIQUETA_FECHA[query.tipo]} desde ${query.fechaDesde.split('-').reverse().join('/')}`);
    if (query.fechaHasta) f.push(`${ETIQUETA_FECHA[query.tipo]} hasta ${query.fechaHasta.split('-').reverse().join('/')}`);
    if (query.estado) f.push(`Estado: ${fmtEstado(query.estado)}`);
    if (carreraId !== undefined && carreraId > 0) {
      const c = await this.prisma.carrera.findUnique({ where: { id: carreraId }, select: { nombre: true } });
      f.push(`Carrera: ${c?.nombre ?? carreraId}${user.rol === Role.ENCARGADO_CARRERA ? ' (tu carrera)' : ''}`);
    }
    const facultadDecano = await facultadDelDecano(this.prisma, user);
    const facultadId = facultadDecano ?? query.facultadId;
    if (facultadId !== undefined && facultadId > 0) {
      const fa = await this.prisma.facultad.findUnique({ where: { id: facultadId }, select: { nombre: true } });
      f.push(`Facultad: ${fa?.nombre ?? facultadId}${facultadDecano !== null ? ' (tu facultad)' : ''}`);
    }
    if (query.tipoIntervencion) f.push(`Tipo de intervención: ${fmtTipo(query.tipoIntervencion)}`);
    if (query.ciudad) f.push(`Comuna: ${query.ciudad}`);
    if (query.docente?.trim()) f.push(`Docente: ${query.docente.trim()}`);
    return f;
  }

  // ─── PDF ───────────────────────────────────────────────────────────────────
  private buildPdf(r: ReporteResultado): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const AZUL = '#1B3D8C';
      const MUTED = '#6B7280';
      const BORDE = '#E5E7EB';
      const TEXTO = '#1F2937';
      const M = 36;
      const pageW = doc.page.width - M * 2;
      const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 24;

      // Encabezado
      doc.fontSize(17).fillColor(AZUL).font('Helvetica-Bold').text(`Reporte de ${r.titulo} — VCM FCI-UCM`, M, M, { width: pageW, align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor(MUTED).font('Helvetica').text(
        `Generado el ${new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}`,
        { width: pageW, align: 'center' },
      );
      doc.moveDown(0.2);
      doc.text(r.filtros.length ? `Filtros: ${r.filtros.join('  |  ')}` : 'Sin filtros (todos los registros)', {
        width: pageW,
        align: 'center',
      });
      doc.moveDown(0.5);
      doc.moveTo(M, doc.y).lineTo(M + pageW, doc.y).strokeColor(AZUL).lineWidth(1.5).stroke();
      doc.moveDown(0.5);
      doc.fontSize(9).fillColor(MUTED).text(
        `Total de registros: ${r.total}${r.truncado ? ` (se muestran los primeros ${r.mostradas})` : ''}`,
        M, doc.y, { width: pageW, align: 'right' },
      );
      doc.moveDown(0.5);

      // Tabla
      const pesoTotal = r.columnas.reduce((s, c) => s + c.peso, 0);
      const widths = r.columnas.map((c) => (c.peso / pesoTotal) * pageW);
      const PAD = 3;
      const FS = 7.5;

      const drawHeader = (y: number): number => {
        doc.font('Helvetica-Bold').fontSize(FS);
        const h = Math.max(...r.columnas.map((c, i) => doc.heightOfString(c.label, { width: widths[i] - PAD * 2 }))) + PAD * 2;
        doc.rect(M, y, pageW, h).fill(AZUL);
        let x = M;
        r.columnas.forEach((c, i) => {
          doc.fillColor('#FFFFFF').text(c.label, x + PAD, y + PAD, { width: widths[i] - PAD * 2 });
          x += widths[i];
        });
        return y + h;
      };

      if (r.filas.length === 0) {
        doc.fontSize(11).fillColor(MUTED).font('Helvetica').text('No se encontraron registros con los filtros aplicados.', M, doc.y + 10, { width: pageW, align: 'center' });
      } else {
        let y = drawHeader(doc.y);
        r.filas.forEach((fila, idx) => {
          doc.font('Helvetica').fontSize(FS);
          const textos = r.columnas.map((c) => {
            const t = fila[c.key] ?? '';
            return t.length > 220 ? t.substring(0, 220).trimEnd() + '…' : t;
          });
          const h = Math.max(...textos.map((t, i) => doc.heightOfString(t, { width: widths[i] - PAD * 2 }))) + PAD * 2;
          if (y + h > bottomLimit()) {
            doc.addPage();
            y = drawHeader(doc.page.margins.top);
          }
          if (idx % 2 === 1) doc.rect(M, y, pageW, h).fill('#F4F6F8');
          let x = M;
          textos.forEach((t, i) => {
            doc.fillColor(TEXTO).font('Helvetica').fontSize(FS).text(t, x + PAD, y + PAD, { width: widths[i] - PAD * 2 });
            x += widths[i];
          });
          doc.moveTo(M, y + h).lineTo(M + pageW, y + h).strokeColor(BORDE).lineWidth(0.4).stroke();
          y += h;
        });
        doc.x = M;
        doc.y = y + 14;
      }

      // Resumen
      if (r.filas.length > 0) {
        if (doc.y + 90 > bottomLimit()) doc.addPage();
        doc.x = M;
        doc.font('Helvetica-Bold').fontSize(11).fillColor(AZUL).text('Resumen', M, doc.y, { width: pageW });
        doc.moveDown(0.3);
        doc.font('Helvetica').fontSize(9).fillColor(TEXTO);
        doc.text(`Registros por estado: ${r.resumen.porEstado.map((e) => `${e.estado}: ${e.cantidad}`).join('   ')}`, M, doc.y, { width: pageW });
        if (r.resumen.horasTotales !== null) doc.text(`Horas hombre totales: ${r.resumen.horasTotales}`, M, doc.y, { width: pageW });
        if (r.resumen.personasTotales !== null) doc.text(`Personas alcanzadas (total): ${r.resumen.personasTotales}`, M, doc.y, { width: pageW });
        if (r.resumen.gastoTotal !== null) doc.text(`Gasto total de los proyectos: ${pesos(r.resumen.gastoTotal)}`, M, doc.y, { width: pageW });
      }

      // Pie de página en todas las páginas
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        const saved = doc.page.margins.bottom;
        const footerY = doc.page.height - saved + 8;
        doc.page.margins.bottom = 0;
        doc.fontSize(8).fillColor('#9CA3AF').font('Helvetica')
          .text('VCM FCI-UCM', M, footerY, { width: pageW, align: 'left', lineBreak: false })
          .text(`Página ${i + 1} de ${range.count}`, M, footerY, { width: pageW, align: 'right', lineBreak: false });
        doc.page.margins.bottom = saved;
      }

      doc.flushPages();
      doc.end();
    });
  }
}
