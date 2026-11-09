import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateProgramaDto } from './dto/create-programa.dto';
import { UpdateProgramaDto } from './dto/update-programa.dto';
import { ProgramasService } from './programas.service';

@ApiTags('Programas')
@ApiBearerAuth()
@Controller('programas')
export class ProgramasController {
  constructor(private readonly programasService: ProgramasService) {}

  @Get()
  @ApiOperation({ summary: 'Listar los programas de vinculación con el medio vigentes' })
  @ApiOkResponse({ description: 'Lista de programas obtenida exitosamente' })
  findAll() {
    return this.programasService.findAll();
  }

  @Get('admin')
  @Roles(Role.ADMIN, Role.GESTOR_VCM, Role.DIRECTOR_VCM)
  @ApiOperation({ summary: 'Listar todos los programas, incluidos los desactivados (administración)' })
  findAllAdmin() {
    return this.programasService.findAllAdmin();
  }

  @Post()
  @Roles(Role.ADMIN, Role.GESTOR_VCM, Role.DIRECTOR_VCM)
  @ApiOperation({ summary: 'Crear un programa de vinculación' })
  @ApiConflictResponse({ description: 'Ya existe un programa con ese nombre' })
  create(@Body() dto: CreateProgramaDto) {
    return this.programasService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.GESTOR_VCM, Role.DIRECTOR_VCM)
  @ApiOperation({ summary: 'Actualizar un programa (descripción, actividades, orden o si está vigente)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProgramaDto) {
    return this.programasService.update(id, dto);
  }
}
