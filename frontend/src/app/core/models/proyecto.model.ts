import { Planteamiento } from './planteamiento.model';
import { AlumnoVoluntario } from './alumno-voluntario.model';

export type EstadoProyecto = 'EN_PROCESO' | 'PAUSADO' | 'FINALIZADO' | 'CANCELADO';

export interface Observacion {
  id: number;
  descripcion: string;
  proyectoId: number;
  autorId: number;
  autor?: {
    id: number;
    nombres: string;
    apellidos: string;
    email?: string;
  };
  createdAt: string;
}

// El backend devuelve los alumnos asignados como registros de la tabla intermedia
// ProyectoAlumno (cada uno con el alumno anidado), NO como un AlumnoVoluntario[] plano.
// Verificado en backend/src/proyectos/proyectos.service.ts → PROYECTO_INCLUDE.alumnos.
export interface ProyectoAlumno {
  proyectoId: number;
  alumnoId: number;
  alumno: AlumnoVoluntario;
}

export interface ArchivoProyecto {
  id: number;
  url: string;
  publicId: string;
  nombre: string;
  proyectoId: number;
  createdAt: string;
}

export type TipoCosto = 'INGRESO' | 'GASTO';

export interface CostoProyecto {
  id: number;
  concepto: string;
  tipo: TipoCosto;
  /** Siempre positivo; el signo lo da el tipo (ingreso +, gasto -). */
  monto: number;
  fecha: string;
  proyectoId: number;
}

export interface TotalesCosto {
  ingresos: number;
  gastos: number;
  /** ingresos - gastos */
  saldo: number;
}

export interface CostosProyecto {
  costos: CostoProyecto[];
  totales: TotalesCosto;
}

export interface Proyecto {
  id: number;
  estado: EstadoProyecto;
  fechaInicio: string;
  fechaFin: string;
  participantesDocentes?: number | null;
  participantesEstudiantes?: number | null;
  participantesDocentesExternos?: number | null;
  participantesAlumnosExternos?: number | null;
  participantesOtrosExternos?: number | null;
  planteamientoId: number;
  // El docente y la carrera NO vienen a nivel raíz: se derivan de
  // planteamiento.docente / planteamiento.solicitud.carrera respectivamente.
  planteamiento?: Planteamiento;
  alumnos?: ProyectoAlumno[];
  observaciones?: Observacion[];
  archivos?: ArchivoProyecto[];
  costos?: CostoProyecto[];
  createdAt: string;
  updatedAt: string;
}
