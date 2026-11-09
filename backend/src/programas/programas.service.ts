import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProgramaDto } from './dto/create-programa.dto';
import { UpdateProgramaDto } from './dto/update-programa.dto';

const ORDEN = [{ orden: 'asc' as const }, { nombre: 'asc' as const }];
const vacioANulo = (v?: string | null) => (v === undefined ? undefined : v?.trim() || null);

@Injectable()
export class ProgramasService {
  constructor(private readonly prisma: PrismaService) {}

  /** Programas de vinculación vigentes, en el orden definido por la universidad. */
  async findAll() {
    const data = await this.prisma.programa.findMany({ where: { activo: true }, orderBy: ORDEN });
    return { data, message: 'Programas obtenidos exitosamente', statusCode: 200 };
  }

  /** Todos los programas (también los desactivados), para administrarlos. */
  async findAllAdmin() {
    const data = await this.prisma.programa.findMany({
      orderBy: ORDEN,
      include: { _count: { select: { solicitudes: true } } },
    });
    return { data, message: 'Programas obtenidos exitosamente', statusCode: 200 };
  }

  async create(dto: CreateProgramaDto) {
    const nombre = dto.nombre.trim();
    await this.validarNombreLibre(nombre);
    let orden = dto.orden;
    if (orden === undefined) {
      const ultimo = await this.prisma.programa.aggregate({ _max: { orden: true } });
      orden = (ultimo._max.orden ?? 0) + 1;
    }
    const data = await this.prisma.programa.create({
      data: {
        nombre,
        descripcion: vacioANulo(dto.descripcion),
        actividades: vacioANulo(dto.actividades),
        orden,
        activo: dto.activo ?? true,
      },
    });
    return { data, message: 'Programa creado', statusCode: 201 };
  }

  async update(id: number, dto: UpdateProgramaDto) {
    const actual = await this.prisma.programa.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException(`Programa con id ${id} no encontrado`);
    const nombre = dto.nombre?.trim();
    if (nombre && nombre !== actual.nombre) await this.validarNombreLibre(nombre);
    const data = await this.prisma.programa.update({
      where: { id },
      data: {
        nombre: nombre || undefined,
        descripcion: vacioANulo(dto.descripcion),
        actividades: vacioANulo(dto.actividades),
        orden: dto.orden,
        activo: dto.activo,
      },
    });
    return { data, message: 'Programa actualizado', statusCode: 200 };
  }

  private async validarNombreLibre(nombre: string) {
    const existe = await this.prisma.programa.findUnique({ where: { nombre } });
    if (existe) throw new ConflictException('Ya existe un programa con ese nombre');
  }
}
