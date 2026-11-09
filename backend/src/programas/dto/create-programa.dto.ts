import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateProgramaDto {
  @ApiProperty({ example: 'Tejiendo Redes' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre es requerido' })
  @MaxLength(200)
  nombre: string;

  @ApiPropertyOptional({ example: 'De qué trata el programa y a quién está dirigido' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descripcion?: string | null;

  @ApiPropertyOptional({ example: 'Actividad 1\nActividad 2', description: 'Actividades clave, una por línea' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  actividades?: string | null;

  @ApiPropertyOptional({ example: 1, description: 'Posición en la lista (menor = primero)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  orden?: number;

  @ApiPropertyOptional({ example: true, description: 'Si está vigente para nuevas solicitudes' })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
