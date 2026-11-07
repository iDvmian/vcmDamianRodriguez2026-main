export interface DashboardResumen {
  solicitudes: {
    total: number; pendientes: number; aprobadas: number; rechazadas: number;
    pctAprobadas: number; pctRechazadas: number; pctPendientes: number;
  };
  planteamientos: { total: number; PENDIENTE: number; APROBADO: number; RECHAZADO: number };
  proyectos: {
    total: number; enProceso: number; pausados: number; finalizados: number; cancelados: number;
    pctFinalizados: number;
  };
  tasaConversion: number;
  horasHombre: number;
  participantes: { docentes: number; estudiantes: number; docentesExternos: number; alumnosExternos: number; otrosExternos: number; total: number };
  alumnosVoluntarios: number;
  duracionPromedioDias: number | null;
  tiempoRespuestaPromedioDias: number | null;
}

export interface FacultadComparada {
  facultadId: number;
  facultad: string;
  etiqueta: string;
  solicitudes: number;
  aprobadas: number;
  rechazadas: number;
  pendientes: number;
  planteamientos: number;
  proyectos: number;
  finalizados: number;
  horasHombre: number;
  participantes: number;
  alumnosVoluntarios: number;
  tasaConversion: number;
}

export interface SeguimientoPaso {
  etapa: string;
  label: string;
  cuenta: number;
  pctDelTotal: number;
  pctDelPaso: number;
}

export interface SeguimientoTiempo {
  clave: string;
  label: string;
  promedioDias: number | null;
  casos: number;
  omitidosAproximados: number;
}

export interface Seguimiento {
  embudo: SeguimientoPaso[];
  tiempos: SeguimientoTiempo[];
  rechazos: {
    solicitud: { evaluadas: number; rechazadas: number; pctRechazo: number };
    planteamiento: { evaluados: number; rechazados: number; reenviados: number; pctRechazo: number };
  };
  hitosPorMes: {
    mes: string;
    solicitudes: number;
    solicitudesAprobadas: number;
    planteamientosAprobados: number;
    proyectosCreados: number;
    proyectosFinalizados: number;
  }[];
  cuellosDeBotella: {
    umbralDias: number;
    total: number;
    porEtapa: { etapa: string; cantidad: number }[];
    items: { solicitudId: number; titulo: string; carrera: string; etapa: string; dias: number }[];
  };
}

export interface Dashboard {
  resumen: DashboardResumen;
  porFacultad: FacultadComparada[];
  porMes: { mes: string; solicitudes: number; proyectos: number }[];
  porTipoIntervencion: { tipo: string; planteamientos: number; proyectos: number; horasHombre: number }[];
  porCarrera: { carrera: string; etiqueta: string; solicitudes: number; proyectos: number }[];
  porComuna: { comuna: string; solicitudes: number }[];
  rankingDocentes: { docente: string; carrera: string; facultad: string; planteamientos: number; aprobados: number; proyectos: number; horasHombre: number }[];
  rankingAlumnos: { alumno: string; carrera: string; proyectos: number }[];
  seguimiento?: Seguimiento;
}

export interface DashboardFiltros {
  fechaDesde?: string | null;
  fechaHasta?: string | null;
  facultadId?: number | null;
  carreraId?: number | null;
  tipoIntervencion?: string | null;
}
