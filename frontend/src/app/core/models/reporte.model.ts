export type TipoReporte = 'SOLICITUDES' | 'PLANTEAMIENTOS' | 'PROYECTOS';

export interface ColumnaCatalogo {
  key: string;
  label: string;
  defecto: boolean;
}

export interface CatalogoReporte {
  tipo: TipoReporte;
  titulo: string;
  etiquetaFecha: string;
  estados: string[];
  columnas: ColumnaCatalogo[];
}

export interface ReporteFiltros {
  tipo: TipoReporte;
  fechaDesde?: string | null;
  fechaHasta?: string | null;
  estado?: string | null;
  carreraId?: number | null;
  facultadId?: number | null;
  tipoIntervencion?: string | null;
  ciudad?: string | null;
  docente?: string | null;
  orden?: 'recientes' | 'antiguas';
  columnas?: string | null;
  limite?: number;
}

export interface ReporteVistaPrevia {
  tipo: TipoReporte;
  titulo: string;
  columnas: { key: string; label: string }[];
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
