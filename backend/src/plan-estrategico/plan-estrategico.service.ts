import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentUser } from '../auth/strategies/jwt.strategy';
import { facultadDelDecano } from '../common/alcance';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateNodoDto, UpdateNodoDto } from './dto/nodo.dto';
import { CreatePlanDto, QueryPlanesDto, UpdatePlanDto } from './dto/plan.dto';

/** Multer entrega el nombre en latin1: se recupera el UTF-8 original (tildes y ñ). */
const nombreOriginal = (file: Express.Multer.File): string => {
  const recuperado = Buffer.from(file.originalname, 'latin1').toString('utf8');
  // Si el nombre ya venía bien codificado, la conversión daría caracteres inválidos: se deja tal cual
  return recuperado.includes('\uFFFD') ? file.originalname : recuperado;
};

type Nivel = 'ejes' | 'objetivos-globales' | 'objetivos-especificos' | 'indicadores';
const NIVELES: Nivel[] = ['ejes', 'objetivos-globales', 'objetivos-especificos', 'indicadores'];
const ID_ASC = { id: 'asc' as const };

/** Un plan con todo su árbol: ejes → objetivos globales → específicos → indicadores. */
const ARBOL = {
  facultad: { select: { id: true, nombre: true, etiqueta: true } },
  ejes: {
    orderBy: ID_ASC,
    include: {
      objetivos: {
        orderBy: ID_ASC,
        include: {
          especificos: { orderBy: ID_ASC },
          indicadores: { orderBy: ID_ASC },
        },
      },
    },
  },
} satisfies Prisma.PlanEstrategicoInclude;

@Injectable()
export class PlanEstrategicoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ── Alcance ───────────────────────────────────────────────
  /** El Decano solo puede ver y editar los planes de su facultad. */
  private async verificarFacultad(user: CurrentUser, facultadId: number): Promise<void> {
    const facultadDecano = await facultadDelDecano(this.prisma, user);
    if (facultadDecano !== null && facultadDecano !== facultadId) {
      throw new ForbiddenException('Este plan no pertenece a tu facultad');
    }
  }

  private async planOrFail(id: number, user: CurrentUser) {
    const plan = await this.prisma.planEstrategico.findUnique({ where: { id }, include: ARBOL });
    if (!plan) throw new NotFoundException('Plan estratégico no encontrado');
    await this.verificarFacultad(user, plan.facultadId);
    return plan;
  }

  private nivelValido(nivel: string): Nivel {
    if (!NIVELES.includes(nivel as Nivel)) throw new BadRequestException('Nivel no válido');
    return nivel as Nivel;
  }

  /** Facultad a la que pertenece un elemento del árbol; 404 si no existe. */
  private async facultadDeNodo(nivel: Nivel, id: number): Promise<number> {
    let facultadId: number | undefined;
    if (nivel === 'ejes') {
      facultadId = (await this.prisma.ejeEstrategico.findUnique({ where: { id }, select: { plan: { select: { facultadId: true } } } }))?.plan.facultadId;
    } else if (nivel === 'objetivos-globales') {
      facultadId = (await this.prisma.objetivoGlobal.findUnique({ where: { id }, select: { eje: { select: { plan: { select: { facultadId: true } } } } } }))?.eje.plan.facultadId;
    } else if (nivel === 'objetivos-especificos') {
      facultadId = (
        await this.prisma.objetivoEspecifico.findUnique({
          where: { id },
          select: { objetivoGlobal: { select: { eje: { select: { plan: { select: { facultadId: true } } } } } } },
        })
      )?.objetivoGlobal.eje.plan.facultadId;
    } else {
      facultadId = (
        await this.prisma.indicadorGlobal.findUnique({
          where: { id },
          select: { objetivoGlobal: { select: { eje: { select: { plan: { select: { facultadId: true } } } } } } },
        })
      )?.objetivoGlobal.eje.plan.facultadId;
    }
    if (facultadId === undefined) throw new NotFoundException('Elemento no encontrado');
    return facultadId;
  }

  // ── Planes ────────────────────────────────────────────────
  async miFacultad(user: CurrentUser) {
    const id = await facultadDelDecano(this.prisma, user);
    const data = id && id > 0 ? await this.prisma.facultad.findUnique({ where: { id }, select: { id: true, nombre: true, etiqueta: true } }) : null;
    return { data, message: 'Facultad obtenida exitosamente', statusCode: 200 };
  }

  async findPlanes(query: QueryPlanesDto, user: CurrentUser) {
    const facultadDecano = await facultadDelDecano(this.prisma, user);
    const where: Prisma.PlanEstrategicoWhereInput = {};
    if (facultadDecano !== null) where.facultadId = facultadDecano;
    else if (query.facultadId !== undefined) where.facultadId = query.facultadId;
    const data = await this.prisma.planEstrategico.findMany({
      where,
      orderBy: { periodo: 'asc' },
      include: { facultad: { select: { id: true, nombre: true, etiqueta: true } }, _count: { select: { ejes: true } } },
    });
    return { data, message: 'Planes obtenidos exitosamente', statusCode: 200 };
  }

  async findPlan(id: number, user: CurrentUser) {
    const data = await this.planOrFail(id, user);
    return { data, message: 'Plan obtenido exitosamente', statusCode: 200 };
  }

  async createPlan(dto: CreatePlanDto, user: CurrentUser) {
    // El Decano siempre crea planes en su propia facultad
    const facultadDecano = await facultadDelDecano(this.prisma, user);
    if (facultadDecano !== null) dto = { ...dto, facultadId: facultadDecano };
    await this.verificarFacultad(user, dto.facultadId);
    const facultad = await this.prisma.facultad.findUnique({ where: { id: dto.facultadId } });
    if (!facultad) throw new NotFoundException('Facultad no encontrada');
    const periodo = dto.periodo.trim();
    await this.validarPeriodoLibre(dto.facultadId, periodo);
    const data = await this.prisma.planEstrategico.create({ data: { facultadId: dto.facultadId, periodo } });
    return { data, message: 'Plan creado exitosamente', statusCode: 201 };
  }

  async updatePlan(id: number, dto: UpdatePlanDto, user: CurrentUser) {
    const plan = await this.planOrFail(id, user);
    const periodo = dto.periodo.trim();
    if (periodo !== plan.periodo) await this.validarPeriodoLibre(plan.facultadId, periodo);
    const data = await this.prisma.planEstrategico.update({ where: { id }, data: { periodo } });
    return { data, message: 'Plan actualizado exitosamente', statusCode: 200 };
  }

  async removePlan(id: number, user: CurrentUser) {
    const plan = await this.planOrFail(id, user);
    await this.prisma.planEstrategico.delete({ where: { id } });
    if (plan.archivoPublicId) await this.storage.deleteFile(plan.archivoPublicId).catch(() => undefined);
    return { data: null, message: 'Plan eliminado exitosamente', statusCode: 200 };
  }

  // ── Documento del plan ────────────────────────────────────
  private static readonly TIPOS_ARCHIVO = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  /** Sube (o reemplaza) el documento del PDE. */
  async setArchivo(id: number, file: Express.Multer.File | undefined, user: CurrentUser) {
    if (!file) throw new BadRequestException('Adjunta un archivo');
    if (!PlanEstrategicoService.TIPOS_ARCHIVO.includes(file.mimetype)) {
      throw new BadRequestException('El archivo debe ser PDF o Word (.doc, .docx)');
    }
    const plan = await this.planOrFail(id, user);
    const { url, publicId } = await this.storage.uploadFile(file, 'plan-estrategico');
    const data = await this.prisma.planEstrategico.update({
      where: { id },
      data: { archivoUrl: url, archivoPublicId: publicId, archivoNombre: nombreOriginal(file).slice(0, 255) },
    });
    if (plan.archivoPublicId) await this.storage.deleteFile(plan.archivoPublicId).catch(() => undefined);
    return { data, message: 'Archivo del plan guardado', statusCode: 200 };
  }

  async removeArchivo(id: number, user: CurrentUser) {
    const plan = await this.planOrFail(id, user);
    if (!plan.archivoPublicId) throw new NotFoundException('Este plan no tiene un archivo');
    const data = await this.prisma.planEstrategico.update({
      where: { id },
      data: { archivoUrl: null, archivoPublicId: null, archivoNombre: null },
    });
    await this.storage.deleteFile(plan.archivoPublicId).catch(() => undefined);
    return { data, message: 'Archivo eliminado', statusCode: 200 };
  }

  private async validarPeriodoLibre(facultadId: number, periodo: string): Promise<void> {
    const existe = await this.prisma.planEstrategico.findUnique({ where: { facultadId_periodo: { facultadId, periodo } } });
    if (existe) throw new ConflictException('Esta facultad ya tiene un plan con ese período');
  }

  // ── Ejes, objetivos e indicadores ─────────────────────────
  async createNodo(nivelParam: string, dto: CreateNodoDto, user: CurrentUser) {
    const nivel = this.nivelValido(nivelParam);
    const descripcion = dto.descripcion.trim();
    if (!descripcion) throw new BadRequestException('La descripción es requerida');

    let data: unknown;
    if (nivel === 'ejes') {
      const plan = await this.prisma.planEstrategico.findUnique({ where: { id: dto.padreId } });
      if (!plan) throw new NotFoundException('Plan estratégico no encontrado');
      await this.verificarFacultad(user, plan.facultadId);
      data = await this.prisma.ejeEstrategico.create({ data: { planId: plan.id, descripcion } });
    } else if (nivel === 'objetivos-globales') {
      await this.verificarFacultad(user, await this.facultadDeNodo('ejes', dto.padreId));
      data = await this.prisma.objetivoGlobal.create({ data: { ejeId: dto.padreId, descripcion } });
    } else if (nivel === 'objetivos-especificos') {
      await this.verificarFacultad(user, await this.facultadDeNodo('objetivos-globales', dto.padreId));
      data = await this.prisma.objetivoEspecifico.create({ data: { objetivoGlobalId: dto.padreId, descripcion } });
    } else {
      await this.verificarFacultad(user, await this.facultadDeNodo('objetivos-globales', dto.padreId));
      data = await this.prisma.indicadorGlobal.create({
        data: { objetivoGlobalId: dto.padreId, descripcion, referenciaUcm: dto.referenciaUcm?.trim() || null },
      });
    }
    return { data, message: 'Elemento creado exitosamente', statusCode: 201 };
  }

  async updateNodo(nivelParam: string, id: number, dto: UpdateNodoDto, user: CurrentUser) {
    const nivel = this.nivelValido(nivelParam);
    await this.verificarFacultad(user, await this.facultadDeNodo(nivel, id));
    const descripcion = dto.descripcion?.trim();
    if (dto.descripcion !== undefined && !descripcion) throw new BadRequestException('La descripción es requerida');

    let data: unknown;
    if (nivel === 'ejes') {
      data = await this.prisma.ejeEstrategico.update({ where: { id }, data: { descripcion } });
    } else if (nivel === 'objetivos-globales') {
      data = await this.prisma.objetivoGlobal.update({ where: { id }, data: { descripcion } });
    } else if (nivel === 'objetivos-especificos') {
      data = await this.prisma.objetivoEspecifico.update({ where: { id }, data: { descripcion } });
    } else {
      data = await this.prisma.indicadorGlobal.update({
        where: { id },
        data: {
          descripcion,
          referenciaUcm: dto.referenciaUcm === undefined ? undefined : dto.referenciaUcm?.trim() || null,
        },
      });
    }
    return { data, message: 'Elemento actualizado exitosamente', statusCode: 200 };
  }

  async removeNodo(nivelParam: string, id: number, user: CurrentUser) {
    const nivel = this.nivelValido(nivelParam);
    await this.verificarFacultad(user, await this.facultadDeNodo(nivel, id));
    if (nivel === 'ejes') await this.prisma.ejeEstrategico.delete({ where: { id } });
    else if (nivel === 'objetivos-globales') await this.prisma.objetivoGlobal.delete({ where: { id } });
    else if (nivel === 'objetivos-especificos') await this.prisma.objetivoEspecifico.delete({ where: { id } });
    else await this.prisma.indicadorGlobal.delete({ where: { id } });
    return { data: null, message: 'Elemento eliminado exitosamente', statusCode: 200 };
  }
}
