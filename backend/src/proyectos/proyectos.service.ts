import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoProyecto, EtapaSeguimiento, Role } from '@prisma/client';
import { registrarEtapa } from '../common/seguimiento';
import { facultadDelDecano } from '../common/alcance';

const ETAPA_POR_ESTADO: Record<EstadoProyecto, EtapaSeguimiento> = {
  EN_PROCESO: EtapaSeguimiento.PROYECTO_EN_PROCESO,
  PAUSADO: EtapaSeguimiento.PROYECTO_PAUSADO,
  FINALIZADO: EtapaSeguimiento.PROYECTO_FINALIZADO,
  CANCELADO: EtapaSeguimiento.PROYECTO_CANCELADO,
};
import { CurrentUser } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MailService } from '../mail/mail.service';
import { CreateCostoDto } from './dto/create-costo.dto';
import { UpdateCostoDto } from './dto/update-costo.dto';
import { CreateObservacionDto } from './dto/create-observacion.dto';
import { CreateProyectoDto } from './dto/create-proyecto.dto';
import { QueryProyectosDto } from './dto/query-proyectos.dto';
import { UpdateEstadoProyectoDto } from './dto/update-estado-proyecto.dto';
import { UpdateProyectoDto } from './dto/update-proyecto.dto';

const PROYECTO_INCLUDE = {
  planteamiento: {
    include: {
      solicitud: {
        include: {
          cliente: { select: { id: true, nombres: true, apellidos: true, email: true } },
          carrera: { include: { facultad: true } },
        },
      },
      docente: { select: { id: true, nombres: true, apellidos: true, email: true } },
    },
  },
  alumnos: {
    include: {
      alumno: { include: { carrera: { include: { facultad: true } } } },
    },
  },
  archivos: { orderBy: { createdAt: 'asc' as const } },
  costos: { orderBy: { id: 'asc' as const } },
  observaciones: {
    include: { autor: { select: { id: true, nombres: true, apellidos: true, email: true } } },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

@Injectable()
export class ProyectosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly mailService: MailService,
  ) {}

  async findAll(query: QueryProyectosDto, currentUser: CurrentUser) {
    const { estado, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    // El Decano solo ve los proyectos de las carreras de su facultad
    const facultadDecano = await facultadDelDecano(this.prisma, currentUser);
    if (facultadDecano !== null) {
      where.planteamiento = { solicitud: { facultadId: facultadDecano } };
    }

    if (
      currentUser.rol !== Role.ADMIN &&
      currentUser.rol !== Role.GESTOR_VCM &&
      currentUser.rol !== Role.DECANO &&
      currentUser.rol !== Role.DIRECTOR_VCM
    ) {
      if (currentUser.rol === Role.ENCARGADO_CARRERA) {
        const user = await this.prisma.user.findUnique({ where: { id: currentUser.id } });
        if (user?.carreraId) {
          where.planteamiento = { solicitud: { carreraId: user.carreraId } };
        }
      } else if (currentUser.rol === Role.DOCENTE) {
        where.planteamiento = { docenteId: currentUser.id };
      }
    }

    if (estado !== undefined) where.estado = estado;
    this.aplicarFiltros(where, query);

    const { items, total } = await this.paginar(where, query);

    return { data: { items, total, page, limit }, message: 'Proyectos obtenidos exitosamente', statusCode: 200 };
  }

  /** Página de proyectos según el orden pedido (por defecto, los más recientes primero). */
  private async paginar(where: Record<string, unknown>, query: QueryProyectosDto) {
    const { page = 1, limit = 10, orden = 'RECIENTES' } = query;
    const skip = (page - 1) * limit;

    // El gasto total es una suma de filas relacionadas, que la base de datos no permite ordenar directamente:
    // se calcula por proyecto, se ordena y se pagina en memoria.
    if (orden === 'GASTO_DESC' || orden === 'GASTO_ASC') {
      const filas = await this.prisma.proyecto.findMany({
        where,
        select: { id: true, costos: { select: { tipo: true, monto: true } } },
      });
      const gasto = (c: { tipo: string; monto: number }[]) => c.filter((x) => x.tipo === 'GASTO').reduce((a, x) => a + x.monto, 0);
      const signo = orden === 'GASTO_DESC' ? -1 : 1;
      const ids = filas
        .map((f) => ({ id: f.id, gasto: gasto(f.costos) }))
        .sort((a, b) => signo * (a.gasto - b.gasto) || b.id - a.id)
        .slice(skip, skip + limit)
        .map((f) => f.id);
      const encontrados = await this.prisma.proyecto.findMany({ where: { id: { in: ids } }, include: PROYECTO_INCLUDE });
      const items = ids.map((id) => encontrados.find((p) => p.id === id)!).filter(Boolean);
      return { items, total: filas.length };
    }

    const orderBy =
      orden === 'FECHA_INICIO_DESC' ? [{ fechaInicio: 'desc' as const }, { id: 'desc' as const }]
      : orden === 'FECHA_INICIO_ASC' ? [{ fechaInicio: 'asc' as const }, { id: 'desc' as const }]
      : orden === 'ALUMNOS_DESC' ? [{ alumnos: { _count: 'desc' as const } }, { id: 'desc' as const }]
      : orden === 'ALUMNOS_ASC' ? [{ alumnos: { _count: 'asc' as const } }, { id: 'desc' as const }]
      : [{ id: 'desc' as const }];

    const [items, total] = await Promise.all([
      this.prisma.proyecto.findMany({ where, include: PROYECTO_INCLUDE, skip, take: limit, orderBy }),
      this.prisma.proyecto.count({ where }),
    ]);
    return { items, total };
  }

  /** Filtros opcionales del listado (se combinan con AND con las restricciones por rol). */
  private aplicarFiltros(where: Record<string, unknown>, query: QueryProyectosDto): void {
    const { facultadId, carreraId, docenteId, programaId, tipoIntervencion, alcance } = query;
    const condiciones: Record<string, unknown>[] = [];
    if (facultadId !== undefined) {
      condiciones.push({ planteamiento: { solicitud: { facultadId } } });
    }
    if (carreraId !== undefined) condiciones.push({ planteamiento: { solicitud: { carreraId } } });
    if (docenteId !== undefined) condiciones.push({ planteamiento: { docenteId } });
    if (programaId !== undefined) condiciones.push({ planteamiento: { solicitud: { programaId } } });
    if (tipoIntervencion !== undefined) condiciones.push({ planteamiento: { tipoIntervencion } });
    if (alcance !== undefined) condiciones.push({ planteamiento: { solicitud: { alcance } } });
    if (!condiciones.length) return;
    const previo = where.AND;
    where.AND = [...(Array.isArray(previo) ? previo : previo ? [previo] : []), ...condiciones];
  }

  async findMisProyectos(currentUser: CurrentUser, query: QueryProyectosDto) {
    const { estado, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { planteamiento: { docenteId: currentUser.id } };
    if (estado !== undefined) where.estado = estado;
    this.aplicarFiltros(where, query);

    const { items, total } = await this.paginar(where, query);

    return { data: { items, total, page, limit }, message: 'Mis proyectos obtenidos exitosamente', statusCode: 200 };
  }

  /** El Decano solo puede acceder a proyectos de su propia facultad. */
  private async verificarFacultadDecano(currentUser: CurrentUser, proyectoId: number): Promise<void> {
    const facultadDecano = await facultadDelDecano(this.prisma, currentUser);
    if (facultadDecano === null) return;
    const pertenece = await this.prisma.proyecto.count({
      where: { id: proyectoId, planteamiento: { solicitud: { facultadId: facultadDecano } } },
    });
    if (!pertenece) throw new ForbiddenException('Este proyecto no pertenece a tu facultad');
  }

  async findOne(id: number, currentUser: CurrentUser) {
    const proyecto = await this.prisma.proyecto.findUnique({ where: { id }, include: PROYECTO_INCLUDE });
    if (!proyecto) throw new NotFoundException(`Proyecto con id ${id} no encontrado`);

    if (currentUser.rol === Role.DOCENTE && proyecto.planteamiento.docenteId !== currentUser.id) {
      throw new ForbiddenException('No tienes permiso para ver este proyecto');
    }
    await this.verificarFacultadDecano(currentUser, id);

    return { data: proyecto, message: 'Proyecto obtenido exitosamente', statusCode: 200 };
  }

  async create(dto: CreateProyectoDto, currentUser: CurrentUser) {
    const planteamiento = await this.prisma.planteamiento.findUnique({
      where: { id: dto.planteamientoId },
      include: {
        proyecto: { select: { id: true } },
        solicitud: { select: { titulo: true, cliente: { select: { nombres: true, apellidos: true, email: true } } } },
      },
    });

    if (!planteamiento) throw new NotFoundException('Planteamiento no encontrado');

    if (planteamiento.estado !== 'APROBADO') {
      throw new BadRequestException('Solo se pueden crear proyectos a partir de planteamientos en estado APROBADO');
    }

    if (planteamiento.proyecto) {
      throw new BadRequestException('Este planteamiento ya tiene un proyecto asociado');
    }

    const totalPersonas =
      (dto.participantesDocentes ?? 0) +
      (dto.participantesEstudiantes ?? 0) +
      (dto.participantesDocentesExternos ?? 0) +
      (dto.participantesAlumnosExternos ?? 0) +
      (dto.participantesOtrosExternos ?? 0);
    if (totalPersonas <= 0) {
      throw new BadRequestException('Debes indicar las personas alcanzadas por la intervención');
    }

    if (dto.alumnoIds && dto.alumnoIds.length > 0) {
      const alumnos = await this.prisma.alumnoVoluntario.findMany({
        where: { id: { in: dto.alumnoIds } },
        select: { id: true },
      });
      if (alumnos.length !== dto.alumnoIds.length) {
        throw new BadRequestException('Uno o más alumnos voluntarios no existen');
      }
    }

    const proyecto = await this.prisma.$transaction(async (tx) => {
      const created = await tx.proyecto.create({
        data: {
          planteamientoId: dto.planteamientoId,
          fechaInicio: new Date(dto.fechaInicio),
          fechaFin: new Date(dto.fechaFin),
          participantesDocentes: dto.participantesDocentes,
          participantesEstudiantes: dto.participantesEstudiantes,
          participantesDocentesExternos: dto.participantesDocentesExternos,
          participantesAlumnosExternos: dto.participantesAlumnosExternos,
          participantesOtrosExternos: dto.participantesOtrosExternos,
          estado: EstadoProyecto.EN_PROCESO,
        },
      });

      if (dto.alumnoIds && dto.alumnoIds.length > 0) {
        await tx.proyectoAlumno.createMany({
          data: dto.alumnoIds.map((alumnoId) => ({ proyectoId: created.id, alumnoId })),
        });
      }

      {
        await tx.costoProyecto.createMany({
          data: dto.costos.map((c) => ({
            proyectoId: created.id,
            concepto: c.concepto.trim(),
            tipo: c.tipo,
            monto: c.monto,
            ...(c.fecha ? { fecha: new Date(c.fecha) } : {}),
          })),
        });
      }

      // Seguimiento: el proyecto nace activo (EN_PROCESO)
      await registrarEtapa(tx, planteamiento.solicitudId, EtapaSeguimiento.PROYECTO_CREADO, currentUser.id, { propagarError: true });
      await registrarEtapa(tx, planteamiento.solicitudId, EtapaSeguimiento.PROYECTO_EN_PROCESO, currentUser.id, { propagarError: true });

      return created;
    });

    // Aviso al solicitante: su iniciativa pasó a ejecución
    const cli = planteamiento.solicitud.cliente;
    const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { timeZone: 'UTC' });
    this.mailService
      .sendAvanceIniciativa({
        to: cli.email,
        nombreCliente: `${cli.nombres} ${cli.apellidos}`,
        tituloSolicitud: planteamiento.solicitud.titulo,
        hito: 'PROYECTO_INICIADO',
        fechaInicio: fmt(dto.fechaInicio),
        fechaFin: fmt(dto.fechaFin),
      })
      .catch((err) => console.error('[ProyectosService] Error enviando notificación:', err));

    return this.findOne(proyecto.id, currentUser);
  }

  async update(id: number, dto: UpdateProyectoDto, currentUser: CurrentUser) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id },
      include: { planteamiento: { select: { docenteId: true } } },
    });
    if (!proyecto) throw new NotFoundException(`Proyecto con id ${id} no encontrado`);

    if (currentUser.rol === Role.DOCENTE && proyecto.planteamiento.docenteId !== currentUser.id) {
      throw new ForbiddenException('No tienes permiso para editar este proyecto');
    }

    if (dto.alumnoIds !== undefined) {
      if (dto.alumnoIds.length > 0) {
        const alumnos = await this.prisma.alumnoVoluntario.findMany({
          where: { id: { in: dto.alumnoIds } },
          select: { id: true },
        });
        if (alumnos.length !== dto.alumnoIds.length) {
          throw new BadRequestException('Uno o más alumnos voluntarios no existen');
        }
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.proyectoAlumno.deleteMany({ where: { proyectoId: id } });
        if (dto.alumnoIds!.length > 0) {
          await tx.proyectoAlumno.createMany({
            data: dto.alumnoIds!.map((alumnoId) => ({ proyectoId: id, alumnoId })),
          });
        }
      });
    }

    const dataToUpdate: Record<string, unknown> = {};
    if (dto.fechaInicio !== undefined) dataToUpdate.fechaInicio = new Date(dto.fechaInicio);
    if (dto.fechaFin !== undefined) dataToUpdate.fechaFin = new Date(dto.fechaFin);
    // undefined = no tocar; null = vaciar el dato
    if (dto.participantesDocentes !== undefined) dataToUpdate.participantesDocentes = dto.participantesDocentes;
    if (dto.participantesEstudiantes !== undefined) dataToUpdate.participantesEstudiantes = dto.participantesEstudiantes;
    if (dto.participantesDocentesExternos !== undefined) dataToUpdate.participantesDocentesExternos = dto.participantesDocentesExternos;
    if (dto.participantesAlumnosExternos !== undefined) dataToUpdate.participantesAlumnosExternos = dto.participantesAlumnosExternos;
    if (dto.participantesOtrosExternos !== undefined) dataToUpdate.participantesOtrosExternos = dto.participantesOtrosExternos;

    if (Object.keys(dataToUpdate).length > 0) {
      await this.prisma.proyecto.update({ where: { id }, data: dataToUpdate });
    }

    const updated = await this.prisma.proyecto.findUnique({ where: { id }, include: PROYECTO_INCLUDE });
    return { data: updated, message: 'Proyecto actualizado', statusCode: 200 };
  }

  async updateEstado(id: number, dto: UpdateEstadoProyectoDto, currentUser: CurrentUser) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id },
      include: {
        planteamiento: {
          select: {
            docenteId: true,
            solicitudId: true,
            solicitud: { select: { titulo: true, cliente: { select: { nombres: true, apellidos: true, email: true } } } },
          },
        },
      },
    });
    if (!proyecto) throw new NotFoundException(`Proyecto con id ${id} no encontrado`);

    if (currentUser.rol === Role.DOCENTE && proyecto.planteamiento.docenteId !== currentUser.id) {
      throw new ForbiddenException('No tienes permiso para cambiar el estado de este proyecto');
    }

    const updated = await this.prisma.proyecto.update({
      where: { id },
      data: { estado: dto.estado },
      include: PROYECTO_INCLUDE,
    });

    if (dto.estado !== proyecto.estado) {
      await registrarEtapa(this.prisma, proyecto.planteamiento.solicitudId, ETAPA_POR_ESTADO[dto.estado], currentUser.id);

      // Aviso al solicitante cuando la iniciativa finaliza
      if (dto.estado === EstadoProyecto.FINALIZADO) {
        const cli = proyecto.planteamiento.solicitud.cliente;
        this.mailService
          .sendAvanceIniciativa({
            to: cli.email,
            nombreCliente: `${cli.nombres} ${cli.apellidos}`,
            tituloSolicitud: proyecto.planteamiento.solicitud.titulo,
            hito: 'PROYECTO_FINALIZADO',
          })
          .catch((err) => console.error('[ProyectosService] Error enviando notificación:', err));
      }
    }

    return { data: updated, message: 'Estado actualizado', statusCode: 200 };
  }

  async remove(id: number, currentUser: CurrentUser) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id },
      include: {
        planteamiento: { select: { docenteId: true } },
        observaciones: { select: { id: true } },
        archivos: { select: { id: true, publicId: true } },
      },
    });
    if (!proyecto) throw new NotFoundException(`Proyecto con id ${id} no encontrado`);

    if (currentUser.rol === Role.DOCENTE) {
      if (proyecto.planteamiento.docenteId !== currentUser.id) {
        throw new ForbiddenException('No tienes permiso para eliminar este proyecto');
      }
      if (proyecto.estado !== EstadoProyecto.EN_PROCESO) {
        throw new BadRequestException('Solo se pueden eliminar proyectos en estado EN_PROCESO');
      }
    }

    if (proyecto.observaciones.length > 0) {
      throw new BadRequestException('No se puede eliminar: el proyecto tiene observaciones registradas');
    }

    // Borrar la evidencia en Cloudinary antes de eliminar los registros (evita archivos huérfanos)
    for (const archivo of proyecto.archivos) {
      await this.storageService.deleteFile(archivo.publicId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.archivoProyecto.deleteMany({ where: { proyectoId: id } });
      await tx.proyectoAlumno.deleteMany({ where: { proyectoId: id } });
      await tx.proyecto.delete({ where: { id } });
    });

    return { data: null, message: 'Proyecto eliminado', statusCode: 200 };
  }

  // ── Evidencia (archivos del proyecto) ──────────────────────
  async addArchivo(proyectoId: number, file: Express.Multer.File, currentUser: CurrentUser) {
    if (!file) throw new BadRequestException('Debes adjuntar un archivo');

    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id: proyectoId },
      include: { planteamiento: { select: { docenteId: true } } },
    });
    if (!proyecto) throw new NotFoundException(`Proyecto con id ${proyectoId} no encontrado`);

    if (currentUser.rol === Role.DOCENTE && proyecto.planteamiento.docenteId !== currentUser.id) {
      throw new ForbiddenException('No tienes permiso para agregar archivos a este proyecto');
    }
    if (proyecto.estado === EstadoProyecto.CANCELADO) {
      throw new BadRequestException('No se pueden agregar archivos a un proyecto cancelado');
    }

    const { url, publicId } = await this.storageService.uploadFile(file, 'proyectos');

    const archivo = await this.prisma.archivoProyecto.create({
      data: { url, publicId, nombre: file.originalname, proyectoId },
    });

    return { data: archivo, message: 'Archivo subido', statusCode: 201 };
  }

  async removeArchivo(proyectoId: number, archivoId: number, currentUser: CurrentUser) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id: proyectoId },
      include: { planteamiento: { select: { docenteId: true } } },
    });
    if (!proyecto) throw new NotFoundException(`Proyecto con id ${proyectoId} no encontrado`);

    const archivo = await this.prisma.archivoProyecto.findFirst({
      where: { id: archivoId, proyectoId },
    });
    if (!archivo) throw new NotFoundException(`Archivo con id ${archivoId} no encontrado`);

    if (currentUser.rol === Role.DOCENTE && proyecto.planteamiento.docenteId !== currentUser.id) {
      throw new ForbiddenException('No tienes permiso para eliminar archivos de este proyecto');
    }

    await this.storageService.deleteFile(archivo.publicId);
    await this.prisma.archivoProyecto.delete({ where: { id: archivoId } });

    return { data: null, message: 'Archivo eliminado', statusCode: 200 };
  }

  // ── Costos del proyecto (ingresos y gastos) ─────────────────────────────
  /** Gestión (Admin, Gestor, Director) edita cualquier proyecto; el docente solo los suyos. */
  private async proyectoEditableParaCostos(proyectoId: number, currentUser: CurrentUser) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id: proyectoId },
      include: { planteamiento: { select: { docenteId: true } } },
    });
    if (!proyecto) throw new NotFoundException(`Proyecto con id ${proyectoId} no encontrado`);
    if (currentUser.rol === Role.DOCENTE && proyecto.planteamiento.docenteId !== currentUser.id) {
      throw new ForbiddenException('No tienes permiso para editar los costos de este proyecto');
    }
    return proyecto;
  }

  private async costosDelProyecto(proyectoId: number) {
    const costos = await this.prisma.costoProyecto.findMany({
      where: { proyectoId },
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
    });
    const ingresos = costos.filter((c) => c.tipo === 'INGRESO').reduce((a, c) => a + c.monto, 0);
    const gastos = costos.filter((c) => c.tipo === 'GASTO').reduce((a, c) => a + c.monto, 0);
    return { costos, totales: { ingresos, gastos, saldo: ingresos - gastos } };
  }

  async addCosto(proyectoId: number, dto: CreateCostoDto, currentUser: CurrentUser) {
    await this.proyectoEditableParaCostos(proyectoId, currentUser);
    await this.prisma.costoProyecto.create({
      data: {
        proyectoId,
        concepto: dto.concepto.trim(),
        tipo: dto.tipo,
        monto: dto.monto,
        ...(dto.fecha ? { fecha: new Date(dto.fecha) } : {}),
      },
    });
    return { data: await this.costosDelProyecto(proyectoId), message: 'Costo registrado', statusCode: 201 };
  }

  async updateCosto(proyectoId: number, costoId: number, dto: UpdateCostoDto, currentUser: CurrentUser) {
    await this.proyectoEditableParaCostos(proyectoId, currentUser);
    const costo = await this.prisma.costoProyecto.findFirst({ where: { id: costoId, proyectoId } });
    if (!costo) throw new NotFoundException(`Costo con id ${costoId} no encontrado en este proyecto`);
    await this.prisma.costoProyecto.update({
      where: { id: costoId },
      data: {
        ...(dto.concepto !== undefined ? { concepto: dto.concepto.trim() } : {}),
        ...(dto.tipo !== undefined ? { tipo: dto.tipo } : {}),
        ...(dto.monto !== undefined ? { monto: dto.monto } : {}),
        ...(dto.fecha ? { fecha: new Date(dto.fecha) } : {}),
      },
    });
    return { data: await this.costosDelProyecto(proyectoId), message: 'Costo actualizado', statusCode: 200 };
  }

  async removeCosto(proyectoId: number, costoId: number, currentUser: CurrentUser) {
    await this.proyectoEditableParaCostos(proyectoId, currentUser);
    const costo = await this.prisma.costoProyecto.findFirst({ where: { id: costoId, proyectoId } });
    if (!costo) throw new NotFoundException(`Costo con id ${costoId} no encontrado en este proyecto`);
    await this.prisma.costoProyecto.delete({ where: { id: costoId } });
    return { data: await this.costosDelProyecto(proyectoId), message: 'Costo eliminado', statusCode: 200 };
  }

  async addObservacion(proyectoId: number, dto: CreateObservacionDto, currentUser: CurrentUser) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id: proyectoId },
      include: { planteamiento: { select: { docenteId: true } } },
    });
    if (!proyecto) throw new NotFoundException(`Proyecto con id ${proyectoId} no encontrado`);

    if (currentUser.rol === Role.DOCENTE && proyecto.planteamiento.docenteId !== currentUser.id) {
      throw new ForbiddenException('No tienes permiso para agregar observaciones a este proyecto');
    }
    await this.verificarFacultadDecano(currentUser, proyectoId);

    const observacion = await this.prisma.observacion.create({
      data: { descripcion: dto.descripcion, proyectoId, autorId: currentUser.id },
      include: { autor: { select: { id: true, nombres: true, apellidos: true, email: true } } },
    });

    return { data: observacion, message: 'Observación registrada', statusCode: 201 };
  }

  async getObservaciones(proyectoId: number, currentUser: CurrentUser) {
    const proyecto = await this.prisma.proyecto.findUnique({ where: { id: proyectoId } });
    if (!proyecto) throw new NotFoundException(`Proyecto con id ${proyectoId} no encontrado`);
    await this.verificarFacultadDecano(currentUser, proyectoId);

    const observaciones = await this.prisma.observacion.findMany({
      where: { proyectoId },
      include: { autor: { select: { id: true, nombres: true, apellidos: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return { data: observaciones, message: 'Observaciones obtenidas exitosamente', statusCode: 200 };
  }

  async removeObservacion(proyectoId: number, obsId: number, currentUser: CurrentUser) {
    const proyecto = await this.prisma.proyecto.findUnique({ where: { id: proyectoId } });
    if (!proyecto) throw new NotFoundException(`Proyecto con id ${proyectoId} no encontrado`);

    const observacion = await this.prisma.observacion.findFirst({
      where: { id: obsId, proyectoId },
    });
    if (!observacion) throw new NotFoundException(`Observación con id ${obsId} no encontrada en este proyecto`);

    if (currentUser.rol === Role.DOCENTE && observacion.autorId !== currentUser.id) {
      throw new ForbiddenException('Solo puedes eliminar tus propias observaciones');
    }

    await this.prisma.observacion.delete({ where: { id: obsId } });

    return { data: null, message: 'Observación eliminada', statusCode: 200 };
  }
}
