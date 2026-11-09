import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentUser } from '../auth/strategies/jwt.strategy';
import { facultadDelDecano } from '../common/alcance';
import { PrismaService } from '../prisma/prisma.service';
import { QueryDashboardDto } from './dto/query-dashboard.dto';

const DIA_MS = 24 * 60 * 60 * 1000;

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (parte: number, total: number) => (total > 0 ? round1((parte / total) * 100) : 0);
/** Días sin avance a partir de los cuales una iniciativa se considera detenida ("cuello de botella"). */
const UMBRAL_CUELLO_DIAS = 30;

const mesKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Todas las cifras parten de las SOLICITUDES recibidas en el período
   * (y carrera / tipo de intervención elegidos): sus planteamientos, proyectos,
   * docentes y alumnos se cuentan a partir de ahí, así el panel es coherente.
   */
  async getDashboard(query: QueryDashboardDto, user: CurrentUser) {
    const where: Prisma.SolicitudWhereInput = {};

    if (query.fechaDesde || query.fechaHasta) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (query.fechaDesde) createdAt.gte = new Date(`${query.fechaDesde}T00:00:00`);
      if (query.fechaHasta) createdAt.lte = new Date(`${query.fechaHasta}T23:59:59.999`);
      where.createdAt = createdAt;
    }
    // El Decano queda limitado a su facultad. Admin y Director ven todas; la facultad y la carrera
    // se filtran después en memoria para poder comparar todas las facultades entre sí.
    const facultadDecano = await facultadDelDecano(this.prisma, user);
    if (facultadDecano !== null) where.carrera = { is: { facultadId: facultadDecano } };
    const facultadSel = facultadDecano ?? query.facultadId;
    if (query.tipoIntervencion) {
      where.planteamiento = { is: { tipoIntervencion: query.tipoIntervencion } };
    }

    const todas = await this.prisma.solicitud.findMany({
      where,
      include: {
        programa: { select: { id: true, nombre: true } },
        carrera: {
          select: {
            id: true,
            nombre: true,
            etiqueta: true,
            facultadId: true,
            facultad: { select: { id: true, nombre: true, etiqueta: true } },
          },
        },
        planteamiento: {
          include: {
            docente: { select: { id: true, nombres: true, apellidos: true, carrera: { select: { nombre: true, facultad: { select: { nombre: true } } } } } },
            proyecto: {
              include: {
                alumnos: {
                  include: {
                    alumno: { select: { id: true, nombres: true, apellidos: true, carrera: { select: { nombre: true } } } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const solicitudes = todas.filter(
      (s) =>
        (facultadSel === undefined || s.carrera?.facultadId === facultadSel) &&
        (query.carreraId === undefined || s.carreraId === query.carreraId),
    );

    // ── Comparación entre facultades (sobre todas las visibles, sin filtrar por facultad/carrera) ──
    const facultades = new Map<number, {
      facultadId: number; facultad: string; etiqueta: string;
      solicitudes: number; aprobadas: number; rechazadas: number; pendientes: number;
      planteamientos: number; proyectos: number; finalizados: number;
      enProceso: number; pausados: number; cancelados: number;
      horasHombre: number; participantes: number; alumnos: Set<number>;
      docentes: number; estudiantes: number; docentesExternos: number; alumnosExternos: number; otrosExternos: number;
    }>();
    for (const s of todas) {
      if (!s.carrera) continue;
      const fid = s.carrera.facultadId;
      const f = facultades.get(fid) ?? {
        facultadId: fid, facultad: s.carrera.facultad.nombre, etiqueta: s.carrera.facultad.etiqueta,
        solicitudes: 0, aprobadas: 0, rechazadas: 0, pendientes: 0,
        planteamientos: 0, proyectos: 0, finalizados: 0, enProceso: 0, pausados: 0, cancelados: 0,
        horasHombre: 0, participantes: 0, alumnos: new Set<number>(),
        docentes: 0, estudiantes: 0, docentesExternos: 0, alumnosExternos: 0, otrosExternos: 0,
      };
      f.solicitudes++;
      if (s.estado === 'APROBADA') f.aprobadas++;
      else if (s.estado === 'RECHAZADA') f.rechazadas++;
      else f.pendientes++;
      const pl = s.planteamiento;
      if (pl) {
        f.planteamientos++;
        const pr = pl.proyecto;
        if (pr) {
          f.proyectos++;
          if (pr.estado === 'FINALIZADO') f.finalizados++;
          else if (pr.estado === 'EN_PROCESO') f.enProceso++;
          else if (pr.estado === 'PAUSADO') f.pausados++;
          else if (pr.estado === 'CANCELADO') f.cancelados++;
          f.horasHombre += pl.horasHombre ?? 0;
          f.docentes += pr.participantesDocentes ?? 0;
          f.estudiantes += pr.participantesEstudiantes ?? 0;
          f.docentesExternos += pr.participantesDocentesExternos ?? 0;
          f.alumnosExternos += pr.participantesAlumnosExternos ?? 0;
          f.otrosExternos += pr.participantesOtrosExternos ?? 0;
          f.participantes += (pr.participantesDocentes ?? 0) + (pr.participantesEstudiantes ?? 0) +
            (pr.participantesDocentesExternos ?? 0) + (pr.participantesAlumnosExternos ?? 0) + (pr.participantesOtrosExternos ?? 0);
          for (const a of pr.alumnos) f.alumnos.add(a.alumnoId);
        }
      }
      facultades.set(fid, f);
    }
    const porFacultad = [...facultades.values()]
      .map(({ alumnos, ...f }) => ({ ...f, alumnosVoluntarios: alumnos.size, tasaConversion: pct(f.proyectos, f.solicitudes) }))
      .sort((a, b) => b.solicitudes - a.solicitudes);

    // ── Solicitudes ──────────────────────────────────────────────────────────
    const solPorEstado = { PENDIENTE: 0, APROBADA: 0, RECHAZADA: 0 };
    for (const s of solicitudes) {
      solPorEstado[s.estado]++;
    }

    // ── Planteamientos y proyectos ───────────────────────────────────────────
    const planteamientos = solicitudes.flatMap((s) => (s.planteamiento ? [s.planteamiento] : []));
    const plantPorEstado = { PENDIENTE: 0, APROBADO: 0, RECHAZADO: 0 };
    for (const p of planteamientos) plantPorEstado[p.estado]++;

    const proyectos = planteamientos.flatMap((p) => (p.proyecto ? [{ ...p.proyecto, plant: p }] : []));
    const proyPorEstado = { EN_PROCESO: 0, PAUSADO: 0, FINALIZADO: 0, CANCELADO: 0 };
    let horasHombre = 0;
    let sumaDuracionMs = 0;
    const participantes = { docentes: 0, estudiantes: 0, docentesExternos: 0, alumnosExternos: 0, otrosExternos: 0 };
    const alumnosSet = new Set<number>();
    for (const pr of proyectos) {
      proyPorEstado[pr.estado]++;
      horasHombre += pr.plant.horasHombre ?? 0;
      sumaDuracionMs += pr.fechaFin.getTime() - pr.fechaInicio.getTime();
      participantes.docentes += pr.participantesDocentes ?? 0;
      participantes.estudiantes += pr.participantesEstudiantes ?? 0;
      participantes.docentesExternos += pr.participantesDocentesExternos ?? 0;
      participantes.alumnosExternos += pr.participantesAlumnosExternos ?? 0;
      participantes.otrosExternos += pr.participantesOtrosExternos ?? 0;
      for (const a of pr.alumnos) alumnosSet.add(a.alumnoId);
    }

    // ── Serie mensual ────────────────────────────────────────────────────────
    const meses = new Map<string, { solicitudes: number; proyectos: number }>();
    const slot = (k: string) => {
      if (!meses.has(k)) meses.set(k, { solicitudes: 0, proyectos: 0 });
      return meses.get(k)!;
    };
    for (const s of solicitudes) slot(mesKey(s.createdAt)).solicitudes++;
    for (const pr of proyectos) slot(mesKey(pr.fechaInicio)).proyectos++;
    const porMes = [...meses.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, v]) => ({ mes, ...v }));

    // ── Por tipo de intervención ─────────────────────────────────────────────
    const tipos = new Map<string, { planteamientos: number; proyectos: number; horasHombre: number }>();
    for (const p of planteamientos) {
      const k = p.tipoIntervencion ?? 'SIN_TIPO';
      const t = tipos.get(k) ?? { planteamientos: 0, proyectos: 0, horasHombre: 0 };
      t.planteamientos++;
      if (p.proyecto) {
        t.proyectos++;
        t.horasHombre += p.horasHombre ?? 0;
      }
      tipos.set(k, t);
    }
    const porTipoIntervencion = [...tipos.entries()]
      .map(([tipo, v]) => ({ tipo, ...v }))
      .sort((a, b) => b.planteamientos - a.planteamientos);

    // ── Por carrera ──────────────────────────────────────────────────────────
    const carreras = new Map<string, { carrera: string; etiqueta: string; solicitudes: number; proyectos: number }>();
    for (const s of solicitudes) {
      const k = s.carrera ? String(s.carrera.id) : 'sin';
      const c = carreras.get(k) ?? {
        carrera: s.carrera?.nombre ?? 'Sin carrera',
        etiqueta: s.carrera?.etiqueta ?? '—',
        solicitudes: 0,
        proyectos: 0,
      };
      c.solicitudes++;
      if (s.planteamiento?.proyecto) c.proyectos++;
      carreras.set(k, c);
    }
    const porCarrera = [...carreras.values()].sort(
      (a, b) => b.solicitudes - a.solicitudes || b.proyectos - a.proyectos,
    );

    // ── Por programa de vinculación (se muestran todos los vigentes, incluso sin solicitudes) ──
    const programasVigentes = await this.prisma.programa.findMany({
      where: { activo: true },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
      select: { id: true, nombre: true },
    });
    const programas = new Map<number | 'sin', { programa: string; solicitudes: number; proyectos: number }>();
    for (const pg of programasVigentes) programas.set(pg.id, { programa: pg.nombre, solicitudes: 0, proyectos: 0 });
    for (const s of solicitudes) {
      const k = s.programaId ?? 'sin';
      let e = programas.get(k);
      if (!e) {
        e = { programa: s.programa?.nombre ?? 'Sin programa', solicitudes: 0, proyectos: 0 };
        programas.set(k, e);
      }
      e.solicitudes++;
      if (s.planteamiento?.proyecto) e.proyectos++;
    }
    const porPrograma = [...programas.values()].sort((a, b) => b.solicitudes - a.solicitudes || b.proyectos - a.proyectos);

    // ── Por ubicación: alcance, región, comuna y país (solicitudes y los proyectos que llegaron a ser) ──
    const agrupar = (clave: (s: (typeof solicitudes)[number]) => string | null) => {
      const m = new Map<string, { nombre: string; solicitudes: number; proyectos: number }>();
      for (const s of solicitudes) {
        const k = clave(s);
        if (k === null) continue;
        const e = m.get(k) ?? { nombre: k, solicitudes: 0, proyectos: 0 };
        e.solicitudes++;
        if (s.planteamiento?.proyecto) e.proyectos++;
        m.set(k, e);
      }
      return [...m.values()].sort((a, b) => b.solicitudes - a.solicitudes || b.proyectos - a.proyectos);
    };
    // Comunas de cada región (para ver el detalle al elegir una región)
    const nombreRegion = (s: (typeof solicitudes)[number]) => s.region?.trim() || 'Sin región';
    const comunasPorRegion: Record<string, { nombre: string; solicitudes: number; proyectos: number }[]> = {};
    const regionesConDatos = new Set(solicitudes.filter((s) => s.alcance !== 'INTERNACIONAL').map(nombreRegion));
    for (const reg of regionesConDatos) {
      comunasPorRegion[reg] = agrupar((s) =>
        s.alcance === 'INTERNACIONAL' || nombreRegion(s) !== reg ? null : s.ciudad?.trim() || 'Sin comuna',
      );
    }
    const porUbicacion = {
      alcance: (['REGIONAL', 'NACIONAL', 'INTERNACIONAL'] as const).map((a) => {
        const delAlcance = solicitudes.filter((s) => s.alcance === a);
        return { nombre: a, solicitudes: delAlcance.length, proyectos: delAlcance.filter((s) => s.planteamiento?.proyecto).length };
      }),
      region: agrupar((s) => (s.alcance === 'INTERNACIONAL' ? null : s.region?.trim() || 'Sin región')),
      comunasPorRegion,
      pais: agrupar((s) => s.pais?.trim() || 'Sin país'),
    };

    // ── Por comuna ───────────────────────────────────────────────────────────
    const comunas = new Map<string, number>();
    for (const s of solicitudes) {
      const k = s.ciudad?.trim() || 'Sin comuna';
      comunas.set(k, (comunas.get(k) ?? 0) + 1);
    }
    const porComuna = [...comunas.entries()]
      .map(([comuna, solicitudes]) => ({ comuna, solicitudes }))
      .sort((a, b) => b.solicitudes - a.solicitudes)
      .slice(0, 10);

    // ── Ranking de docentes ──────────────────────────────────────────────────
    const docentes = new Map<
      number,
      { docente: string; carrera: string; facultad: string; planteamientos: number; aprobados: number; proyectos: number; horasHombre: number }
    >();
    for (const p of planteamientos) {
      const d = docentes.get(p.docenteId) ?? {
        docente: `${p.docente.nombres} ${p.docente.apellidos}`,
        carrera: p.docente.carrera?.nombre ?? '—',
        facultad: p.docente.carrera?.facultad?.nombre ?? '—',
        planteamientos: 0,
        aprobados: 0,
        proyectos: 0,
        horasHombre: 0,
      };
      d.planteamientos++;
      if (p.estado === 'APROBADO') d.aprobados++;
      if (p.proyecto) {
        d.proyectos++;
        d.horasHombre += p.horasHombre ?? 0;
      }
      docentes.set(p.docenteId, d);
    }
    const rankingDocentes = [...docentes.values()]
      .sort((a, b) => b.proyectos - a.proyectos || b.planteamientos - a.planteamientos)
      .slice(0, 10);

    // ── Ranking de alumnos voluntarios ───────────────────────────────────────
    const alumnos = new Map<number, { alumno: string; carrera: string; proyectos: number }>();
    for (const pr of proyectos) {
      for (const a of pr.alumnos) {
        const x = alumnos.get(a.alumnoId) ?? {
          alumno: `${a.alumno.nombres} ${a.alumno.apellidos}`,
          carrera: a.alumno.carrera?.nombre ?? '—',
          proyectos: 0,
        };
        x.proyectos++;
        alumnos.set(a.alumnoId, x);
      }
    }
    const rankingAlumnos = [...alumnos.values()].sort((a, b) => b.proyectos - a.proyectos).slice(0, 10);

    // Tiempo de respuesta real: de SOLICITUD_CREADA a SOLICITUD_APROBADA/RECHAZADA según el historial de etapas
    const seguimiento = await this.calcularSeguimiento(solicitudes);
    const tiempoRespuestaReal = seguimiento.tiempos.find((t) => t.clave === 'evaluacion_solicitud')?.promedioDias ?? null;

    const totalSol = solicitudes.length;
    const data = {
      resumen: {
        solicitudes: {
          total: totalSol,
          pendientes: solPorEstado.PENDIENTE,
          aprobadas: solPorEstado.APROBADA,
          rechazadas: solPorEstado.RECHAZADA,
          pctAprobadas: pct(solPorEstado.APROBADA, totalSol),
          pctRechazadas: pct(solPorEstado.RECHAZADA, totalSol),
          pctPendientes: pct(solPorEstado.PENDIENTE, totalSol),
        },
        planteamientos: { total: planteamientos.length, ...plantPorEstado },
        proyectos: {
          total: proyectos.length,
          enProceso: proyPorEstado.EN_PROCESO,
          pausados: proyPorEstado.PAUSADO,
          finalizados: proyPorEstado.FINALIZADO,
          cancelados: proyPorEstado.CANCELADO,
          pctFinalizados: pct(proyPorEstado.FINALIZADO, proyectos.length),
        },
        tasaConversion: pct(proyectos.length, totalSol),
        horasHombre,
        participantes: { ...participantes, total: participantes.docentes + participantes.estudiantes + participantes.docentesExternos + participantes.alumnosExternos + participantes.otrosExternos },
        alumnosVoluntarios: alumnosSet.size,
        duracionPromedioDias: proyectos.length ? round1(sumaDuracionMs / proyectos.length / DIA_MS) : null,
        tiempoRespuestaPromedioDias: tiempoRespuestaReal,
      },
      porMes,
      porFacultad,
      porTipoIntervencion,
      porCarrera,
      porComuna,
      porPrograma,
      porUbicacion,
      rankingDocentes,
      rankingAlumnos,
      seguimiento,
    };

    return { data, message: 'Dashboard obtenido exitosamente', statusCode: 200 };
  }

  /**
   * Indicadores del seguimiento de cada fase, calculados a partir de HistorialEtapa
   * para las solicitudes ya filtradas (mismo período, facultad, carrera y alcance por rol).
   * Los hitos "aproximados" (reconstruidos) cuentan en las cantidades, pero no en los tiempos.
   */
  private async calcularSeguimiento(
    solicitudes: {
      id: number;
      titulo: string;
      estado: string;
      createdAt: Date;
      updatedAt: Date;
      carrera: { nombre: string } | null;
      planteamiento: { estado: string; proyecto: { estado: string } | null } | null;
    }[],
  ) {
    const ids = solicitudes.map((s) => s.id);
    const eventos = ids.length
      ? await this.prisma.historialEtapa.findMany({
          where: { solicitudId: { in: ids } },
          select: { solicitudId: true, etapa: true, fecha: true, aproximado: true },
          orderBy: { fecha: 'asc' },
        })
      : [];

    type Hito = { primera: Date; ultima: Date; aproximado: boolean; veces: number };
    const porSol = new Map<number, Map<string, Hito>>();
    for (const e of eventos) {
      const m = porSol.get(e.solicitudId) ?? new Map<string, Hito>();
      const h = m.get(e.etapa);
      if (!h) m.set(e.etapa, { primera: e.fecha, ultima: e.fecha, aproximado: e.aproximado, veces: 1 });
      else {
        h.ultima = e.fecha;
        h.veces++;
        h.aproximado = h.aproximado && e.aproximado;
      }
      porSol.set(e.solicitudId, m);
    }
    const tiene = (id: number, ...etapas: string[]) => etapas.some((et) => porSol.get(id)?.has(et));

    // ── Embudo ───────────────────────────────────────────────────────────────
    const total = solicitudes.length;
    const pasos = [
      { etapa: 'SOLICITUD_CREADA', label: 'Solicitudes recibidas', cuenta: total },
      { etapa: 'SOLICITUD_APROBADA', label: 'Solicitudes aprobadas', cuenta: solicitudes.filter((s) => tiene(s.id, 'SOLICITUD_APROBADA')).length },
      { etapa: 'PLANTEAMIENTO_CREADO', label: 'Con planteamiento', cuenta: solicitudes.filter((s) => tiene(s.id, 'PLANTEAMIENTO_CREADO')).length },
      { etapa: 'PLANTEAMIENTO_APROBADO', label: 'Planteamiento aprobado', cuenta: solicitudes.filter((s) => tiene(s.id, 'PLANTEAMIENTO_APROBADO')).length },
      { etapa: 'PROYECTO_CREADO', label: 'Proyecto creado', cuenta: solicitudes.filter((s) => tiene(s.id, 'PROYECTO_CREADO')).length },
      { etapa: 'PROYECTO_FINALIZADO', label: 'Proyecto finalizado', cuenta: solicitudes.filter((s) => tiene(s.id, 'PROYECTO_FINALIZADO')).length },
    ];
    const embudo = pasos.map((p, i) => ({
      ...p,
      pctDelTotal: pct(p.cuenta, total),
      pctDelPaso: i === 0 ? 100 : pct(p.cuenta, pasos[i - 1].cuenta),
    }));

    // ── Tiempo promedio por fase ─────────────────────────────────────────────
    const primeraDe = (id: number, ...etapas: string[]) => {
      const hs = etapas.map((e) => porSol.get(id)?.get(e)).filter((h): h is Hito => !!h);
      if (!hs.length) return null;
      return hs.reduce((a, b) => (a.primera <= b.primera ? a : b));
    };
    const fases: { clave: string; label: string; desde: string[]; hasta: string[] }[] = [
      { clave: 'evaluacion_solicitud', label: 'Evaluación de la solicitud', desde: ['SOLICITUD_CREADA'], hasta: ['SOLICITUD_APROBADA', 'SOLICITUD_RECHAZADA'] },
      { clave: 'espera_planteamiento', label: 'Espera del planteamiento', desde: ['SOLICITUD_APROBADA'], hasta: ['PLANTEAMIENTO_CREADO'] },
      { clave: 'evaluacion_planteamiento', label: 'Evaluación del planteamiento', desde: ['PLANTEAMIENTO_CREADO'], hasta: ['PLANTEAMIENTO_APROBADO', 'PLANTEAMIENTO_RECHAZADO'] },
      { clave: 'inicio_proyecto', label: 'Inicio del proyecto', desde: ['PLANTEAMIENTO_APROBADO'], hasta: ['PROYECTO_CREADO'] },
      { clave: 'ejecucion_proyecto', label: 'Ejecución del proyecto', desde: ['PROYECTO_CREADO'], hasta: ['PROYECTO_FINALIZADO', 'PROYECTO_CANCELADO'] },
      { clave: 'ciclo_completo', label: 'Ciclo completo (solicitud a proyecto finalizado)', desde: ['SOLICITUD_CREADA'], hasta: ['PROYECTO_FINALIZADO'] },
    ];
    const tiempos = fases.map((f) => {
      let suma = 0;
      let n = 0;
      let omitidos = 0;
      for (const s of solicitudes) {
        const a = primeraDe(s.id, ...f.desde);
        const b = primeraDe(s.id, ...f.hasta);
        if (!a || !b) continue;
        if (a.aproximado || b.aproximado) { omitidos++; continue; }
        const ms = b.primera.getTime() - a.primera.getTime();
        if (ms < 0) continue;
        suma += ms;
        n++;
      }
      return { clave: f.clave, label: f.label, promedioDias: n ? round1(suma / n / DIA_MS) : null, casos: n, omitidosAproximados: omitidos };
    });

    // ── Rechazos por etapa ───────────────────────────────────────────────────
    const solEvaluadas = solicitudes.filter((s) => tiene(s.id, 'SOLICITUD_APROBADA', 'SOLICITUD_RECHAZADA')).length;
    const solRechazadas = solicitudes.filter((s) => tiene(s.id, 'SOLICITUD_RECHAZADA')).length;
    const plaEvaluados = solicitudes.filter((s) => tiene(s.id, 'PLANTEAMIENTO_APROBADO', 'PLANTEAMIENTO_RECHAZADO')).length;
    const plaRechazados = solicitudes.filter((s) => tiene(s.id, 'PLANTEAMIENTO_RECHAZADO')).length;
    const plaReenviados = solicitudes.filter((s) => tiene(s.id, 'PLANTEAMIENTO_REENVIADO')).length;
    const rechazos = {
      solicitud: { evaluadas: solEvaluadas, rechazadas: solRechazadas, pctRechazo: pct(solRechazadas, solEvaluadas) },
      planteamiento: {
        evaluados: plaEvaluados,
        rechazados: plaRechazados,
        reenviados: plaReenviados,
        pctRechazo: pct(plaRechazados, plaEvaluados),
      },
    };

    // ── Hitos por mes ────────────────────────────────────────────────────────
    const columnas: Record<string, string> = {
      SOLICITUD_CREADA: 'solicitudes',
      SOLICITUD_APROBADA: 'solicitudesAprobadas',
      PLANTEAMIENTO_APROBADO: 'planteamientosAprobados',
      PROYECTO_CREADO: 'proyectosCreados',
      PROYECTO_FINALIZADO: 'proyectosFinalizados',
    };
    const mesesHitos = new Map<string, Record<string, number>>();
    for (const e of eventos) {
      const col = columnas[e.etapa];
      if (!col) continue;
      const k = mesKey(e.fecha);
      const fila = mesesHitos.get(k) ?? { solicitudes: 0, solicitudesAprobadas: 0, planteamientosAprobados: 0, proyectosCreados: 0, proyectosFinalizados: 0 };
      fila[col]++;
      mesesHitos.set(k, fila);
    }
    const hitosPorMes = [...mesesHitos.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, v]) => ({ mes, ...v }));

    // ── Cuellos de botella: iniciativas detenidas en su etapa actual ─────────
    const ahora = Date.now();
    const detenidas: { solicitudId: number; titulo: string; carrera: string; etapa: string; dias: number }[] = [];
    for (const s of solicitudes) {
      const pl = s.planteamiento;
      let etapa: string | null = null;
      let desde: Date | null = null;
      const fechaDe = (et: string, usar: 'primera' | 'ultima' = 'ultima') => porSol.get(s.id)?.get(et)?.[usar] ?? null;
      if (s.estado === 'PENDIENTE') {
        etapa = 'Solicitud pendiente de evaluación';
        desde = fechaDe('SOLICITUD_CREADA') ?? s.createdAt;
      } else if (s.estado === 'APROBADA' && !pl) {
        etapa = 'Esperando el planteamiento';
        desde = fechaDe('SOLICITUD_APROBADA') ?? s.updatedAt;
      } else if (pl?.estado === 'PENDIENTE') {
        etapa = 'Planteamiento pendiente de evaluación';
        desde = fechaDe('PLANTEAMIENTO_REENVIADO') ?? fechaDe('PLANTEAMIENTO_CREADO') ?? s.updatedAt;
      } else if (pl?.estado === 'RECHAZADO') {
        etapa = 'Planteamiento rechazado sin reenviar';
        desde = fechaDe('PLANTEAMIENTO_RECHAZADO') ?? s.updatedAt;
      } else if (pl?.estado === 'APROBADO' && !pl.proyecto) {
        etapa = 'Esperando la creación del proyecto';
        desde = fechaDe('PLANTEAMIENTO_APROBADO') ?? s.updatedAt;
      } else if (pl?.proyecto?.estado === 'PAUSADO') {
        etapa = 'Proyecto pausado';
        desde = fechaDe('PROYECTO_PAUSADO') ?? s.updatedAt;
      }
      if (!etapa || !desde) continue;
      const dias = Math.floor((ahora - desde.getTime()) / DIA_MS);
      if (dias >= UMBRAL_CUELLO_DIAS) {
        detenidas.push({ solicitudId: s.id, titulo: s.titulo, carrera: s.carrera?.nombre ?? 'Sin carrera', etapa, dias });
      }
    }
    detenidas.sort((a, b) => b.dias - a.dias);
    const porEtapa = new Map<string, number>();
    for (const d of detenidas) porEtapa.set(d.etapa, (porEtapa.get(d.etapa) ?? 0) + 1);
    const cuellosDeBotella = {
      umbralDias: UMBRAL_CUELLO_DIAS,
      total: detenidas.length,
      porEtapa: [...porEtapa.entries()].map(([etapa, cantidad]) => ({ etapa, cantidad })).sort((a, b) => b.cantidad - a.cantidad),
      items: detenidas.slice(0, 15),
    };

    return { embudo, tiempos, rechazos, hitosPorMes, cuellosDeBotella };
  }
}
