export interface IndicadorGlobal {
  id: number;
  descripcion: string;
  /** Objetivo global institucional al que responde, ej: "UCM OG 2". */
  referenciaUcm: string | null;
  objetivoGlobalId: number;
}

export interface ObjetivoEspecifico {
  id: number;
  descripcion: string;
  objetivoGlobalId: number;
}

export interface ObjetivoGlobal {
  id: number;
  descripcion: string;
  ejeId: number;
  especificos: ObjetivoEspecifico[];
  indicadores: IndicadorGlobal[];
}

export interface EjeEstrategico {
  id: number;
  descripcion: string;
  planId: number;
  objetivos: ObjetivoGlobal[];
}

export interface PlanEstrategico {
  id: number;
  periodo: string;
  facultadId: number;
  archivoUrl?: string | null;
  archivoNombre?: string | null;
  facultad?: { id: number; nombre: string; etiqueta: string };
  _count?: { ejes: number };
  ejes?: EjeEstrategico[];
}

export type NivelPlan = 'ejes' | 'objetivos-globales' | 'objetivos-especificos' | 'indicadores';
