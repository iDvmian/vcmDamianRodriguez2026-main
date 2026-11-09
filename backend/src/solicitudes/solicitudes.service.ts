import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlcanceVinculacion, EstadoSolicitud, EtapaSeguimiento, OrigenSolicitud, Role } from '@prisma/client';
import { registrarEtapa } from '../common/seguimiento';
import { facultadDelDecano } from '../common/alcance';
import { COMUNAS_MAULE } from '../common/constants/comunas-maule';
import { COMUNAS_POR_REGION } from '../common/constants/comunas-chile';
import { PAISES } from '../common/constants/paises';
import { REGIONES_FUERA_DEL_MAULE } from '../common/constants/regiones-chile';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateSolicitudDto } from './dto/create-solicitud.dto';
import { GestionarSolicitudDto } from './dto/gestionar-solicitud.dto';
import { QuerySolicitudesDto } from './dto/query-solicitudes.dto';
import { UpdateSolicitudDto } from './dto/update-solicitud.dto';
import { CurrentUser } from '../auth/strategies/jwt.strategy';

const SOLICITUD_INCLUDE = {
  cliente: { select: { id: true, nombres: true, apellidos: true, email: true, rut: true } },
  carrera: { include: { facultad: true } },
  programa: { select: { id: true, nombre: true } },
  archivos: true,
  planteamiento: { select: { id: true, estado: true, createdAt: true } },
} as const;

@Injectable()
export class SolicitudesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly mailService: MailService,
  ) {}

    /** Filtros comunes del listado: estado, ciudad, facultad, fechas, solicitante y orden. */
  private buildFilters(query: QuerySolicitudesDto) {
    const { estado, ciudad, facultadId, fechaDesde, fechaHasta, solicitante, orden, sinPlanteamiento } = query;
    const where: Record<string, unknown> = {};

    if (estado !== undefined) where.estado = estado;
    if (ciudad) where.ciudad = ciudad;
    if (facultadId !== undefined) where.carrera = { facultadId };
    if (sinPlanteamiento) where.planteamiento = { is: null };

    if (fechaDesde || fechaHasta) {
      const createdAt: { gte?: Date; lte?: Date } = {};
      if (fechaDesde) createdAt.gte = new Date(`${fechaDesde}T00:00:00`);
      if (fechaHasta) createdAt.lte = new Date(`${fechaHasta}T23:59:59.999`);
      where.createdAt = createdAt;
    }

    // Cada palabra debe aparecer en nombres, apellidos o correo ("Rosa Mal" encuentra a Rosa Maldonado)
    if (solicitante?.trim()) {
      where.AND = solicitante
        .trim()
        .split(/\s+/)
        .map((palabra) => ({
          cliente: {
            OR: [
              { nombres: { contains: palabra } },
              { apellidos: { contains: palabra } },
              { email: { contains: palabra } },
            ],
          },
        }));
    }

    const orderBy = { createdAt: orden === 'antiguas' ? 'asc' : 'desc' } as const;
    return { where, orderBy };
  }

    async findAll(query: QuerySolicitudesDto, currentUser: CurrentUser) {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;
    const { where, orderBy } = this.buildFilters(query);

    if (currentUser.rol === Role.ENCARGADO_CARRERA || currentUser.rol === Role.DOCENTE) {
      const user = await this.prisma.user.findUnique({ where: { id: currentUser.id } });
      if (user?.carreraId) {
        where.carreraId = user.carreraId;
      }
    } else {
      if (query.carreraId !== undefined) where.carreraId = query.carreraId;
    }

    // El Decano solo ve las solicitudes de las carreras de su facultad
    const facultadDecano = await facultadDelDecano(this.prisma, currentUser);
    if (facultadDecano !== null) where.carrera = { is: { facultadId: facultadDecano } };

    const [items, total] = await Promise.all([
      this.prisma.solicitud.findMany({
        where,
        include: SOLICITUD_INCLUDE,
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.solicitud.count({ where }),
    ]);

    return {
      data: { items, total, page, limit },
      message: 'Solicitudes obtenidas exitosamente',
      statusCode: 200,
    };
  }

  async findMisSolicitudes(clienteId: number, query: QuerySolicitudesDto) {
    const { carreraId, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;
    const { where, orderBy } = this.buildFilters(query);

    where.clienteId = clienteId;
    if (carreraId !== undefined) where.carreraId = carreraId;

    const [items, total] = await Promise.all([
      this.prisma.solicitud.findMany({
        where,
        include: SOLICITUD_INCLUDE,
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.solicitud.count({ where }),
    ]);

    return {
      data: { items, total, page, limit },
      message: 'Mis solicitudes obtenidas exitosamente',
      statusCode: 200,
    };
  }

  /**
   * Resumen para el solicitante: contadores y, por cada solicitud reciente, una línea de tiempo
   * simple (Recibida → Aprobada → En planteamiento → En ejecución → Finalizada).
   * Solo expone etapas y fechas; ningún dato interno (docente, observaciones).
   */
  async miResumen(clienteId: number) {
    const [total, pendientes, aprobadas, rechazadas, recientes] = await Promise.all([
      this.prisma.solicitud.count({ where: { clienteId } }),
      this.prisma.solicitud.count({ where: { clienteId, estado: EstadoSolicitud.PENDIENTE } }),
      this.prisma.solicitud.count({ where: { clienteId, estado: EstadoSolicitud.APROBADA } }),
      this.prisma.solicitud.count({ where: { clienteId, estado: EstadoSolicitud.RECHAZADA } }),
      this.prisma.solicitud.findMany({
        where: { clienteId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          titulo: true,
          estado: true,
          motivoRechazo: true,
          createdAt: true,
          planteamiento: { select: { id: true, proyecto: { select: { estado: true } } } },
          historial: { select: { etapa: true, fecha: true }, orderBy: { fecha: 'asc' } },
        },
      }),
    ]);

    const solicitudes = recientes.map((s) => ({
      id: s.id,
      titulo: s.titulo,
      estado: s.estado,
      motivoRechazo: s.motivoRechazo,
      createdAt: s.createdAt,
      pasos: this.armarPasos(s),
    }));

    return {
      data: { total, pendientes, aprobadas, rechazadas, solicitudes },
      message: 'Resumen obtenido exitosamente',
      statusCode: 200,
    };
  }

  private armarPasos(s: {
    estado: EstadoSolicitud;
    createdAt: Date;
    planteamiento: { proyecto: { estado: string } | null } | null;
    historial: { etapa: EtapaSeguimiento; fecha: Date }[];
  }) {
    // Fecha del primer (o último) registro de una etapa; null si aún no existe
    const fechaDe = (etapa: EtapaSeguimiento, ultima = false): Date | null => {
      const regs = s.historial.filter((h) => h.etapa === etapa);
      if (!regs.length) return null;
      return (ultima ? regs[regs.length - 1] : regs[0]).fecha;
    };

    type Estado = 'hecho' | 'actual' | 'pendiente' | 'rechazado';
    const pasos: { clave: string; label: string; fecha: Date | null; estado: Estado }[] = [
      { clave: 'RECIBIDA', label: 'Recibida', fecha: fechaDe(EtapaSeguimiento.SOLICITUD_CREADA) ?? s.createdAt, estado: 'hecho' },
    ];

    if (s.estado === EstadoSolicitud.RECHAZADA) {
      pasos.push({ clave: 'RECHAZADA', label: 'Rechazada', fecha: fechaDe(EtapaSeguimiento.SOLICITUD_RECHAZADA, true), estado: 'rechazado' });
      return pasos;
    }

    const proyecto = s.planteamiento?.proyecto ?? null;
    const aprobada = s.estado === EstadoSolicitud.APROBADA;
    const hecho = (b: boolean): Estado => (b ? 'hecho' : 'pendiente');

    pasos.push(
      { clave: 'APROBADA', label: 'Aprobada', fecha: fechaDe(EtapaSeguimiento.SOLICITUD_APROBADA), estado: hecho(aprobada) },
      { clave: 'PLANTEAMIENTO', label: 'En planteamiento', fecha: fechaDe(EtapaSeguimiento.PLANTEAMIENTO_CREADO), estado: hecho(!!s.planteamiento) },
      { clave: 'EJECUCION', label: 'En ejecución', fecha: fechaDe(EtapaSeguimiento.PROYECTO_EN_PROCESO), estado: hecho(!!proyecto) },
    );

    if (proyecto?.estado === 'CANCELADO') {
      pasos.push({ clave: 'CANCELADA', label: 'Cancelada', fecha: fechaDe(EtapaSeguimiento.PROYECTO_CANCELADO, true), estado: 'rechazado' });
    } else {
      pasos.push({ clave: 'FINALIZADA', label: 'Finalizada', fecha: fechaDe(EtapaSeguimiento.PROYECTO_FINALIZADO, true), estado: hecho(proyecto?.estado === 'FINALIZADO') });
    }

    // El primer paso pendiente es la etapa en la que está hoy
    const siguiente = pasos.find((p) => p.estado === 'pendiente');
    if (siguiente) siguiente.estado = 'actual';
    return pasos;
  }

  async findOne(id: number, currentUser: CurrentUser) {
    const solicitud = await this.prisma.solicitud.findUnique({
      where: { id },
      include: SOLICITUD_INCLUDE,
    });

    if (!solicitud) throw new NotFoundException(`Solicitud con id ${id} no encontrada`);

    if (currentUser.rol === Role.CLIENTE && solicitud.clienteId !== currentUser.id) {
      throw new ForbiddenException('No tienes permiso para ver esta solicitud');
    }

    const facultadDecano = await facultadDelDecano(this.prisma, currentUser);
    if (facultadDecano !== null && solicitud.carrera?.facultadId !== facultadDecano) {
      throw new ForbiddenException('Esta solicitud no pertenece a tu facultad');
    }

    return { data: solicitud, message: 'Solicitud obtenida exitosamente', statusCode: 200 };
  }

  /**
   * Valida y normaliza la ubicación según el alcance de la vinculación:
   * REGIONAL (comuna de la región del Maule + dirección), NACIONAL (comuna de otra región de Chile)
   * e INTERNACIONAL (país).
   */
  private normalizarUbicacion(u: {
    alcance: AlcanceVinculacion;
    ciudad?: string | null;
    direccion?: string | null;
    region?: string | null;
    pais?: string | null;
  }) {
    const limpiar = (v?: string | null) => v?.trim() || null;
    const ciudad = limpiar(u.ciudad);
    const direccion = limpiar(u.direccion);
    const region = limpiar(u.region);
    const pais = limpiar(u.pais);

    switch (u.alcance) {
      case AlcanceVinculacion.REGIONAL:
        if (!ciudad || !COMUNAS_MAULE.includes(ciudad)) {
          throw new BadRequestException('En una vinculación regional, la ciudad debe ser una comuna de la región del Maule');
        }
        if (!direccion) throw new BadRequestException('La dirección es requerida en una vinculación regional');
        return { alcance: u.alcance, ciudad, direccion, region: 'Maule', pais: 'Chile' };

      case AlcanceVinculacion.NACIONAL:
        if (!region || !REGIONES_FUERA_DEL_MAULE.includes(region)) {
          throw new BadRequestException('En una vinculación nacional, elige una región de Chile distinta del Maule');
        }
        if (!ciudad || !COMUNAS_POR_REGION[region]?.includes(ciudad)) {
          throw new BadRequestException(`En una vinculación nacional, la ciudad debe ser una comuna de la región ${region}`);
        }
        return { alcance: u.alcance, ciudad, direccion, region, pais: 'Chile' };

      case AlcanceVinculacion.INTERNACIONAL:
        if (!pais || !PAISES.includes(pais)) {
          throw new BadRequestException('En una vinculación internacional, elige un país de la lista');
        }
        return { alcance: u.alcance, ciudad, direccion, region: null, pais };

      default:
        throw new BadRequestException('Alcance inválido');
    }
  }

  /** El programa debe existir y estar vigente. */
  private async validarPrograma(programaId: number) {
    const programa = await this.prisma.programa.findUnique({ where: { id: programaId } });
    if (!programa || !programa.activo) throw new BadRequestException('El programa de vinculación seleccionado no es válido');
  }

  async create(dto: CreateSolicitudDto, currentUser: CurrentUser) {
    const clienteId = currentUser.id;
    const esDocente = currentUser.rol === Role.DOCENTE;
    let carreraId = dto.carreraId;

    if (esDocente) {
      // Iniciativa del docente: va asociada a su propia carrera y debe indicar con quién se trabaja
      const docente = await this.prisma.user.findUnique({ where: { id: clienteId }, select: { carreraId: true } });
      if (!docente?.carreraId) {
        throw new BadRequestException('Tu usuario no tiene una carrera asignada. Pide a un administrador que la asigne.');
      }
      if (!dto.nombreOrganizacion?.trim()) {
        throw new BadRequestException('Indica la organización o grupo con el que trabajarás');
      }
      carreraId = docente.carreraId;
    } else if (carreraId !== undefined) {
      const carrera = await this.prisma.carrera.findUnique({ where: { id: carreraId } });
      if (!carrera) throw new NotFoundException('Carrera no encontrada');
    }

    await this.validarPrograma(dto.programaId);
    const ubicacion = this.normalizarUbicacion(dto);

    const solicitud = await this.prisma.solicitud.create({
      data: {
        titulo: dto.titulo,
        descripcion: dto.descripcion,
        programaId: dto.programaId,
        ...ubicacion,
        numeroDireccion: dto.numeroDireccion,
        telefono: dto.telefono,
        tipoCliente: dto.tipoCliente,
        tipoClienteOtro: dto.tipoCliente === 'OTRO' ? dto.tipoClienteOtro?.trim() : null,
        origen: esDocente ? OrigenSolicitud.DOCENTE : OrigenSolicitud.EXTERNA,
        nombreOrganizacion: esDocente ? dto.nombreOrganizacion?.trim() : null,
        personasPrevistas: esDocente ? dto.personasPrevistas : null,
        carreraId,
        clienteId,
        estado: EstadoSolicitud.PENDIENTE,
      },
      include: SOLICITUD_INCLUDE,
    });

    await registrarEtapa(this.prisma, solicitud.id, EtapaSeguimiento.SOLICITUD_CREADA, clienteId);

    return { data: solicitud, message: 'Solicitud creada', statusCode: 201 };
  }

  async update(id: number, dto: UpdateSolicitudDto, currentUser: CurrentUser) {
    const solicitud = await this.prisma.solicitud.findUnique({ where: { id } });
    if (!solicitud) throw new NotFoundException(`Solicitud con id ${id} no encontrada`);

    if (currentUser.rol !== Role.ADMIN) {
      if (solicitud.clienteId !== currentUser.id) {
        throw new ForbiddenException('No tienes permiso para editar esta solicitud');
      }
      if (solicitud.estado !== EstadoSolicitud.PENDIENTE) {
        throw new BadRequestException('Solo se pueden editar solicitudes en estado PENDIENTE');
      }
    }

    const esIniciativaDocente = solicitud.origen === OrigenSolicitud.DOCENTE;

    // En una iniciativa de docente la carrera no se cambia (es la del docente)
    if (!esIniciativaDocente && dto.carreraId !== undefined) {
      const carrera = await this.prisma.carrera.findUnique({ where: { id: dto.carreraId } });
      if (!carrera) throw new NotFoundException('Carrera no encontrada');
    }
    if (esIniciativaDocente && dto.nombreOrganizacion !== undefined && !dto.nombreOrganizacion.trim()) {
      throw new BadRequestException('Indica la organización o grupo con el que trabajarás');
    }

    if (dto.programaId !== undefined) await this.validarPrograma(dto.programaId);

    // Si se toca algún dato de ubicación, se revalida todo junto con lo que ya tenía la solicitud
    const cambiaUbicacion = [dto.alcance, dto.ciudad, dto.region, dto.pais, dto.direccion].some((v) => v !== undefined);
    const ubicacion = cambiaUbicacion
      ? this.normalizarUbicacion({
          alcance: dto.alcance ?? solicitud.alcance,
          ciudad: dto.ciudad !== undefined ? dto.ciudad : solicitud.ciudad,
          direccion: dto.direccion !== undefined ? dto.direccion : solicitud.direccion,
          region: dto.region !== undefined ? dto.region : solicitud.region,
          pais: dto.pais !== undefined ? dto.pais : solicitud.pais,
        })
      : {};

    const updated = await this.prisma.solicitud.update({
      where: { id },
      data: {
        titulo: dto.titulo,
        descripcion: dto.descripcion,
        programaId: dto.programaId,
        ...ubicacion,
        numeroDireccion: dto.numeroDireccion,
        telefono: dto.telefono,
        tipoCliente: dto.tipoCliente,
        tipoClienteOtro: dto.tipoCliente === undefined ? undefined : dto.tipoCliente === 'OTRO' ? dto.tipoClienteOtro?.trim() : null,
        nombreOrganizacion: esIniciativaDocente ? dto.nombreOrganizacion?.trim() : undefined,
        personasPrevistas: esIniciativaDocente ? dto.personasPrevistas : undefined,
        carreraId: esIniciativaDocente ? undefined : dto.carreraId,
        editandoHasta: null, // al guardar termina la edición
      },
      include: SOLICITUD_INCLUDE,
    });

    return { data: updated, message: 'Solicitud actualizada', statusCode: 200 };
  }

  /** Segundos que dura la marca de "editando" si el navegador deja de renovarla (pestaña cerrada, corte de red). */
  private static readonly EDICION_TTL_MS = 90 * 1000;

  /**
   * El solicitante avisa que tiene la solicitud abierta en edición. Se renueva periódicamente desde
   * el formulario; si deja de llegar, la marca expira sola y el evaluador puede continuar.
   */
  async marcarEdicion(id: number, currentUser: CurrentUser) {
    const solicitud = await this.prisma.solicitud.findUnique({ where: { id } });
    if (!solicitud) throw new NotFoundException(`Solicitud con id ${id} no encontrada`);
    if (solicitud.clienteId !== currentUser.id) {
      throw new ForbiddenException('Solo quien creó la solicitud puede marcarla como en edición');
    }
    if (solicitud.estado !== EstadoSolicitud.PENDIENTE) {
      return { data: null, message: 'La solicitud ya no se puede editar', statusCode: 200 };
    }
    await this.prisma.solicitud.update({
      where: { id },
      // se conserva updatedAt: renovar la marca no es una modificación de la solicitud
      data: { editandoHasta: new Date(Date.now() + SolicitudesService.EDICION_TTL_MS), updatedAt: solicitud.updatedAt },
    });
    return { data: null, message: 'Edición marcada', statusCode: 200 };
  }

  /** El solicitante cerró el formulario: se libera la marca de inmediato. */
  async liberarEdicion(id: number, currentUser: CurrentUser) {
    const solicitud = await this.prisma.solicitud.findUnique({ where: { id } });
    if (!solicitud || solicitud.clienteId !== currentUser.id || !solicitud.editandoHasta) {
      return { data: null, message: 'Sin cambios', statusCode: 200 };
    }
    await this.prisma.solicitud.update({
      where: { id },
      data: { editandoHasta: null, updatedAt: solicitud.updatedAt },
    });
    return { data: null, message: 'Edición liberada', statusCode: 200 };
  }

  async gestionar(id: number, dto: GestionarSolicitudDto, usuarioId?: number) {
    const solicitud = await this.prisma.solicitud.findUnique({ where: { id } });
    if (!solicitud) throw new NotFoundException(`Solicitud con id ${id} no encontrada`);

    if (solicitud.editandoHasta && solicitud.editandoHasta > new Date()) {
      throw new ConflictException(
        'El solicitante está editando esta solicitud en este momento. Espera a que termine e inténtalo de nuevo.',
      );
    }

    if (dto.carreraId !== undefined) {
      const carrera = await this.prisma.carrera.findUnique({ where: { id: dto.carreraId } });
      if (!carrera) throw new NotFoundException('Carrera no encontrada');
    }

    const updated = await this.prisma.solicitud.update({
      where: { id },
      data: {
        estado: dto.estado,
        // el motivo solo existe cuando está rechazada; en cualquier otro caso se limpia
        motivoRechazo: dto.estado === EstadoSolicitud.RECHAZADA ? dto.motivoRechazo?.trim() || null : null,
        ...(dto.carreraId !== undefined && { carreraId: dto.carreraId }),
      },
      include: SOLICITUD_INCLUDE,
    });

    if (dto.estado !== solicitud.estado) {
      if (dto.estado === EstadoSolicitud.APROBADA) {
        await registrarEtapa(this.prisma, id, EtapaSeguimiento.SOLICITUD_APROBADA, usuarioId);
      } else if (dto.estado === EstadoSolicitud.RECHAZADA) {
        await registrarEtapa(this.prisma, id, EtapaSeguimiento.SOLICITUD_RECHAZADA, usuarioId);
      }
    }

    if (dto.estado === EstadoSolicitud.APROBADA || dto.estado === EstadoSolicitud.RECHAZADA) {
      this.mailService
        .sendSolicitudGestionada({
          to: updated.cliente.email,
          nombreCliente: `${updated.cliente.nombres} ${updated.cliente.apellidos}`,
          tituloSolicitud: updated.titulo,
          estado: dto.estado as 'APROBADA' | 'RECHAZADA',
          motivo: updated.motivoRechazo ?? undefined,
        })
        .catch((err) => console.error('[SolicitudesService] Error enviando notificación:', err));
    }

    return { data: updated, message: 'Solicitud gestionada', statusCode: 200 };
  }

  async remove(id: number, currentUser: CurrentUser) {
    const solicitud = await this.prisma.solicitud.findUnique({
      where: { id },
      include: {
        planteamiento: { select: { id: true } },
        archivos: { select: { id: true, publicId: true } },
      },
    });
    if (!solicitud) throw new NotFoundException(`Solicitud con id ${id} no encontrada`);

    if (currentUser.rol !== Role.ADMIN) {
      if (solicitud.clienteId !== currentUser.id) {
        throw new ForbiddenException('No tienes permiso para eliminar esta solicitud');
      }
      if (solicitud.estado !== EstadoSolicitud.PENDIENTE) {
        throw new BadRequestException('Solo se pueden eliminar solicitudes en estado PENDIENTE');
      }
    }

    if (solicitud.planteamiento) {
      throw new BadRequestException('No se puede eliminar: la solicitud tiene un planteamiento');
    }

    // Borrar archivos en Cloudinary antes de eliminar los registros (evita huérfanos)
    for (const archivo of solicitud.archivos) {
      await this.storageService.deleteFile(archivo.publicId);
    }

    await this.prisma.archivoSolicitud.deleteMany({ where: { solicitudId: id } });
    await this.prisma.solicitud.delete({ where: { id } });

    return { data: null, message: 'Solicitud eliminada', statusCode: 200 };
  }

  async addArchivo(solicitudId: number, file: Express.Multer.File, currentUser: CurrentUser) {
    const solicitud = await this.prisma.solicitud.findUnique({ where: { id: solicitudId } });
    if (!solicitud) throw new NotFoundException(`Solicitud con id ${solicitudId} no encontrada`);

    if (currentUser.rol === Role.CLIENTE && solicitud.clienteId !== currentUser.id) {
      throw new ForbiddenException('No tienes permiso para agregar archivos a esta solicitud');
    }

    const { url, publicId } = await this.storageService.uploadFile(file, 'solicitudes');

    const archivo = await this.prisma.archivoSolicitud.create({
      data: {
        url,
        publicId,
        nombre: file.originalname,
        solicitudId,
      },
    });

    return { data: archivo, message: 'Archivo subido', statusCode: 201 };
  }

  async removeArchivo(solicitudId: number, archivoId: number, currentUser: CurrentUser) {
    const solicitud = await this.prisma.solicitud.findUnique({ where: { id: solicitudId } });
    if (!solicitud) throw new NotFoundException(`Solicitud con id ${solicitudId} no encontrada`);

    const archivo = await this.prisma.archivoSolicitud.findFirst({
      where: { id: archivoId, solicitudId },
    });
    if (!archivo) throw new NotFoundException(`Archivo con id ${archivoId} no encontrado`);

    if (currentUser.rol === Role.CLIENTE && solicitud.clienteId !== currentUser.id) {
      throw new ForbiddenException('No tienes permiso para eliminar archivos de esta solicitud');
    }

    await this.storageService.deleteFile(archivo.publicId);
    await this.prisma.archivoSolicitud.delete({ where: { id: archivoId } });

    return { data: null, message: 'Archivo eliminado', statusCode: 200 };
  }
}
