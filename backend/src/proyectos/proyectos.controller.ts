import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/strategies/jwt.strategy';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateCostoDto } from './dto/create-costo.dto';
import { UpdateCostoDto } from './dto/update-costo.dto';
import { CreateObservacionDto } from './dto/create-observacion.dto';
import { CreateProyectoDto } from './dto/create-proyecto.dto';
import { QueryProyectosDto } from './dto/query-proyectos.dto';
import { UpdateEstadoProyectoDto } from './dto/update-estado-proyecto.dto';
import { UpdateProyectoDto } from './dto/update-proyecto.dto';
import { ProyectosService } from './proyectos.service';

const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024; // 10 MB
const TIPOS_ARCHIVO_PERMITIDOS = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

@ApiTags('proyectos')
@ApiBearerAuth()
@Controller('proyectos')
export class ProyectosController {
  constructor(private readonly proyectosService: ProyectosService) {}

  // IMPORTANTE: /mis-proyectos antes de /:id para evitar colisión de rutas
  @Get('mis-proyectos')
  @Roles(
    Role.ADMIN,
    Role.GESTOR_VCM,
    Role.ENCARGADO_CARRERA,
    Role.DOCENTE,
    Role.DECANO,
    Role.DIRECTOR_VCM,
  )
  @ApiOperation({ summary: 'Obtener mis proyectos (como docente)' })
  @ApiOkResponse({ description: 'Lista de proyectos propios obtenida exitosamente' })
  findMisProyectos(
    @Query() query: QueryProyectosDto,
    @Request() req: { user: CurrentUser },
  ) {
    return this.proyectosService.findMisProyectos(req.user, query);
  }

  @Get()
  @Roles(
    Role.ADMIN,
    Role.GESTOR_VCM,
    Role.ENCARGADO_CARRERA,
    Role.DOCENTE,
    Role.DECANO,
    Role.DIRECTOR_VCM,
  )
  @ApiOperation({ summary: 'Listar proyectos (filtrado automático por rol)' })
  @ApiOkResponse({ description: 'Lista de proyectos obtenida exitosamente' })
  findAll(
    @Query() query: QueryProyectosDto,
    @Request() req: { user: CurrentUser },
  ) {
    return this.proyectosService.findAll(query, req.user);
  }

  @Get(':id')
  @Roles(
    Role.ADMIN,
    Role.GESTOR_VCM,
    Role.ENCARGADO_CARRERA,
    Role.DOCENTE,
    Role.DECANO,
    Role.DIRECTOR_VCM,
  )
  @ApiOperation({ summary: 'Obtener un proyecto por ID' })
  @ApiOkResponse({ description: 'Proyecto encontrado' })
  @ApiNotFoundResponse({ description: 'Proyecto no encontrado' })
  @ApiForbiddenResponse({ description: 'Sin permiso para ver este proyecto' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: CurrentUser },
  ) {
    return this.proyectosService.findOne(id, req.user);
  }

  @Post()
  @Roles(Role.DOCENTE, Role.ADMIN)
  @ApiOperation({ summary: 'Crear proyecto a partir de un planteamiento APROBADO' })
  @ApiCreatedResponse({ description: 'Proyecto creado' })
  @ApiNotFoundResponse({ description: 'Planteamiento no encontrado' })
  @ApiBadRequestResponse({ description: 'Planteamiento no APROBADO, ya tiene proyecto, o alumnos inválidos' })
  create(
    @Body() dto: CreateProyectoDto,
    @Request() req: { user: CurrentUser },
  ) {
    return this.proyectosService.create(dto, req.user);
  }

  @Patch(':id')
  @Roles(Role.DOCENTE, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar fechas y/o alumnos del proyecto' })
  @ApiOkResponse({ description: 'Proyecto actualizado' })
  @ApiNotFoundResponse({ description: 'Proyecto no encontrado' })
  @ApiForbiddenResponse({ description: 'Sin permiso para editar este proyecto' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProyectoDto,
    @Request() req: { user: CurrentUser },
  ) {
    return this.proyectosService.update(id, dto, req.user);
  }

  @Patch(':id/estado')
  @Roles(Role.DOCENTE, Role.ADMIN, Role.GESTOR_VCM)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar estado del proyecto' })
  @ApiOkResponse({ description: 'Estado actualizado' })
  @ApiNotFoundResponse({ description: 'Proyecto no encontrado' })
  @ApiForbiddenResponse({ description: 'Sin permiso para cambiar el estado' })
  updateEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEstadoProyectoDto,
    @Request() req: { user: CurrentUser },
  ) {
    return this.proyectosService.updateEstado(id, dto, req.user);
  }

  @Delete(':id')
  @Roles(Role.DOCENTE, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar proyecto (solo EN_PROCESO sin observaciones para DOCENTE)' })
  @ApiOkResponse({ description: 'Proyecto eliminado' })
  @ApiNotFoundResponse({ description: 'Proyecto no encontrado' })
  @ApiForbiddenResponse({ description: 'Sin permiso para eliminar este proyecto' })
  @ApiBadRequestResponse({ description: 'No se puede eliminar: tiene observaciones o no está en EN_PROCESO' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: CurrentUser },
  ) {
    return this.proyectosService.remove(id, req.user);
  }

  @Post(':id/archivos')
  @Roles(Role.DOCENTE, Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_ARCHIVO_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!TIPOS_ARCHIVO_PERMITIDOS.includes(file.mimetype)) {
          return cb(
            new BadRequestException('Tipo de archivo no permitido. Usa JPG, PNG, PDF, Word o Excel'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @ApiOperation({ summary: 'Subir un archivo de evidencia al proyecto (máx. 10 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ description: 'Archivo subido exitosamente' })
  @ApiNotFoundResponse({ description: 'Proyecto no encontrado' })
  @ApiForbiddenResponse({ description: 'Sin permiso para agregar archivos a este proyecto' })
  addArchivo(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: CurrentUser },
  ) {
    return this.proyectosService.addArchivo(id, file, req.user);
  }

  @Delete(':id/archivos/:archivoId')
  @Roles(Role.DOCENTE, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar un archivo de evidencia del proyecto' })
  @ApiOkResponse({ description: 'Archivo eliminado exitosamente' })
  @ApiNotFoundResponse({ description: 'Proyecto o archivo no encontrado' })
  @ApiForbiddenResponse({ description: 'Sin permiso para eliminar archivos de este proyecto' })
  removeArchivo(
    @Param('id', ParseIntPipe) id: number,
    @Param('archivoId', ParseIntPipe) archivoId: number,
    @Request() req: { user: CurrentUser },
  ) {
    return this.proyectosService.removeArchivo(id, archivoId, req.user);
  }

  @Post(':id/costos')
  @Roles(Role.DOCENTE, Role.ADMIN, Role.GESTOR_VCM, Role.DIRECTOR_VCM)
  @ApiOperation({ summary: 'Agregar una línea de costo (ingreso o gasto) al proyecto' })
  @ApiCreatedResponse({ description: 'Costo registrado; devuelve la lista y los totales' })
  @ApiNotFoundResponse({ description: 'Proyecto no encontrado' })
  @ApiForbiddenResponse({ description: 'Sin permiso para editar los costos de este proyecto' })
  addCosto(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCostoDto,
    @Request() req: { user: CurrentUser },
  ) {
    return this.proyectosService.addCosto(id, dto, req.user);
  }

  @Patch(':id/costos/:costoId')
  @Roles(Role.DOCENTE, Role.ADMIN, Role.GESTOR_VCM, Role.DIRECTOR_VCM)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Editar una línea de costo del proyecto' })
  @ApiOkResponse({ description: 'Costo actualizado; devuelve la lista y los totales' })
  updateCosto(
    @Param('id', ParseIntPipe) id: number,
    @Param('costoId', ParseIntPipe) costoId: number,
    @Body() dto: UpdateCostoDto,
    @Request() req: { user: CurrentUser },
  ) {
    return this.proyectosService.updateCosto(id, costoId, dto, req.user);
  }

  @Delete(':id/costos/:costoId')
  @Roles(Role.DOCENTE, Role.ADMIN, Role.GESTOR_VCM, Role.DIRECTOR_VCM)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar una línea de costo del proyecto' })
  @ApiOkResponse({ description: 'Costo eliminado; devuelve la lista y los totales' })
  removeCosto(
    @Param('id', ParseIntPipe) id: number,
    @Param('costoId', ParseIntPipe) costoId: number,
    @Request() req: { user: CurrentUser },
  ) {
    return this.proyectosService.removeCosto(id, costoId, req.user);
  }

  @Post(':proyectoId/observaciones')
  @Roles(
    Role.DOCENTE,
    Role.ADMIN,
    Role.GESTOR_VCM,
    Role.ENCARGADO_CARRERA,
    Role.DECANO,
  )
  @ApiOperation({ summary: 'Agregar observación al proyecto' })
  @ApiCreatedResponse({ description: 'Observación registrada' })
  @ApiNotFoundResponse({ description: 'Proyecto no encontrado' })
  @ApiForbiddenResponse({ description: 'Sin permiso para agregar observaciones' })
  addObservacion(
    @Param('proyectoId', ParseIntPipe) proyectoId: number,
    @Body() dto: CreateObservacionDto,
    @Request() req: { user: CurrentUser },
  ) {
    return this.proyectosService.addObservacion(proyectoId, dto, req.user);
  }

  @Get(':proyectoId/observaciones')
  @Roles(
    Role.ADMIN,
    Role.GESTOR_VCM,
    Role.ENCARGADO_CARRERA,
    Role.DOCENTE,
    Role.DECANO,
    Role.DIRECTOR_VCM,
  )
  @ApiOperation({ summary: 'Listar observaciones del proyecto' })
  @ApiOkResponse({ description: 'Observaciones obtenidas exitosamente' })
  @ApiNotFoundResponse({ description: 'Proyecto no encontrado' })
  getObservaciones(
    @Param('proyectoId', ParseIntPipe) proyectoId: number,
    @Request() req: { user: CurrentUser },
  ) {
    return this.proyectosService.getObservaciones(proyectoId, req.user);
  }

  @Delete(':proyectoId/observaciones/:obsId')
  @Roles(Role.DOCENTE, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar observación del proyecto' })
  @ApiOkResponse({ description: 'Observación eliminada' })
  @ApiNotFoundResponse({ description: 'Proyecto u observación no encontrada' })
  @ApiForbiddenResponse({ description: 'Solo puedes eliminar tus propias observaciones (DOCENTE)' })
  removeObservacion(
    @Param('proyectoId', ParseIntPipe) proyectoId: number,
    @Param('obsId', ParseIntPipe) obsId: number,
    @Request() req: { user: CurrentUser },
  ) {
    return this.proyectosService.removeObservacion(proyectoId, obsId, req.user);
  }
}
