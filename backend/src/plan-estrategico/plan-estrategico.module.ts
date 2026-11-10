import { Module } from '@nestjs/common';
import { PlanEstrategicoController } from './plan-estrategico.controller';
import { PlanEstrategicoService } from './plan-estrategico.service';

@Module({
  controllers: [PlanEstrategicoController],
  providers: [PlanEstrategicoService],
})
export class PlanEstrategicoModule {}
