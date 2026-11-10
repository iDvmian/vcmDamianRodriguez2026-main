import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreatePlanDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  facultadId: number;

  @ApiProperty({ example: '2024 – 2028' })
  @IsString()
  @IsNotEmpty({ message: 'El período es requerido' })
  @MaxLength(50)
  periodo: string;
}

export class UpdatePlanDto {
  @ApiProperty({ example: '2024 – 2028' })
  @IsString()
  @IsNotEmpty({ message: 'El período es requerido' })
  @MaxLength(50)
  periodo: string;
}

export class QueryPlanesDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  facultadId?: number;
}
