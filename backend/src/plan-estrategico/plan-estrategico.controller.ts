import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query, Request, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/strategies/jwt.strategy';
import { CreateNodoDto, UpdateNodoDto } from './dto/nodo.dto';
import { CreatePlanDto, QueryPlanesDto, UpdatePlanDto } from './dto/plan.dto';
import { PlanEstrategicoService } from './plan-estrategico.service';

const LECTURA = [Role.ADMIN, Role.GESTOR_VCM, Role.ENCARGADO_CARRERA, Role.DOCENTE, Role.DECANO, Role.DIRECTOR_VCM];
const EDICION = [Role.ADMIN, Role.GESTOR_VCM, Role.DIRECTOR_VCM, Role.DECANO];

@ApiTags('Plan estratégico')
@ApiBearerAuth()
@Controller('plan-estrategico')
export class PlanEstrategicoController {
  constructor(private readonly service: PlanEstrategicoService) {}

  @Get('mi-facultad')
  @Roles(Role.DECANO)
  @ApiOperation({ summary: 'Facultad del Decano en sesión' })
  miFacultad(@Request() req: { user: CurrentUser }) {
    return this.service.miFacultad(req.user);
  }

  @Get('planes')
  @Roles(...LECTURA)
  @ApiOperation({ summary: 'Listar los planes de desarrollo estratégico (el Decano solo ve los de su facultad)' })
  findPlanes(@Query() query: QueryPlanesDto, @Request() req: { user: CurrentUser }) {
    return this.service.findPlanes(query, req.user);
  }

  @Get('planes/:id')
  @Roles(...LECTURA)
  @ApiOperation({ summary: 'Obtener un plan con todos sus ejes, objetivos e indicadores' })
  findPlan(@Param('id', ParseIntPipe) id: number, @Request() req: { user: CurrentUser }) {
    return this.service.findPlan(id, req.user);
  }

  @Post('planes')
  @Roles(...EDICION)
  @ApiOperation({ summary: 'Crear un plan de desarrollo estratégico para una facultad' })
  createPlan(@Body() dto: CreatePlanDto, @Request() req: { user: CurrentUser }) {
    return this.service.createPlan(dto, req.user);
  }

  @Patch('planes/:id')
  @Roles(...EDICION)
  @ApiOperation({ summary: 'Cambiar el período de un plan' })
  updatePlan(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePlanDto, @Request() req: { user: CurrentUser }) {
    return this.service.updatePlan(id, dto, req.user);
  }

  @Delete('planes/:id')
  @HttpCode(HttpStatus.OK)
  @Roles(...EDICION)
  @ApiOperation({ summary: 'Eliminar un plan y todo lo que contiene' })
  removePlan(@Param('id', ParseIntPipe) id: number, @Request() req: { user: CurrentUser }) {
    return this.service.removePlan(id, req.user);
  }

  @Post('planes/:id/archivo')
  @Roles(...EDICION)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Subir (o reemplazar) el documento del plan: PDF o Word, hasta 15 MB' })
  setArchivo(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: Express.Multer.File, @Request() req: { user: CurrentUser }) {
    return this.service.setArchivo(id, file, req.user);
  }

  @Delete('planes/:id/archivo')
  @HttpCode(HttpStatus.OK)
  @Roles(...EDICION)
  @ApiOperation({ summary: 'Quitar el documento del plan' })
  removeArchivo(@Param('id', ParseIntPipe) id: number, @Request() req: { user: CurrentUser }) {
    return this.service.removeArchivo(id, req.user);
  }

  /** nivel: ejes | objetivos-globales | objetivos-especificos | indicadores */
  @Post('nodos/:nivel')
  @Roles(...EDICION)
  @ApiOperation({ summary: 'Agregar un eje, objetivo global, objetivo específico o indicador' })
  createNodo(@Param('nivel') nivel: string, @Body() dto: CreateNodoDto, @Request() req: { user: CurrentUser }) {
    return this.service.createNodo(nivel, dto, req.user);
  }

  @Patch('nodos/:nivel/:id')
  @Roles(...EDICION)
  @ApiOperation({ summary: 'Editar un eje, objetivo o indicador' })
  updateNodo(
    @Param('nivel') nivel: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNodoDto,
    @Request() req: { user: CurrentUser },
  ) {
    return this.service.updateNodo(nivel, id, dto, req.user);
  }

  @Delete('nodos/:nivel/:id')
  @HttpCode(HttpStatus.OK)
  @Roles(...EDICION)
  @ApiOperation({ summary: 'Eliminar un eje, objetivo o indicador (y lo que contiene)' })
  removeNodo(@Param('nivel') nivel: string, @Param('id', ParseIntPipe) id: number, @Request() req: { user: CurrentUser }) {
    return this.service.removeNodo(nivel, id, req.user);
  }
}
