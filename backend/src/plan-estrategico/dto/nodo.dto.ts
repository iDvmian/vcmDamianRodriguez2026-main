import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateNodoDto {
  @ApiProperty({ description: 'Id del elemento padre (plan, eje, objetivo global u objetivo específico según el nivel)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  padreId: number;

  @ApiProperty({ example: 'Fortalecimiento institucional' })
  @IsString()
  @IsNotEmpty({ message: 'La descripción es requerida' })
  @MaxLength(2000)
  descripcion: string;

  @ApiPropertyOptional({ example: 'UCM OG 2', description: 'Solo para objetivos globales' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenciaUcm?: string | null;
}

export class UpdateNodoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'La descripción es requerida' })
  @MaxLength(2000)
  descripcion?: string;

  @ApiPropertyOptional({ example: 'UCM OG 2', description: 'Solo para objetivos globales' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenciaUcm?: string | null;
}
