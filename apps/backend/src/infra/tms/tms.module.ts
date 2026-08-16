import { Global, Module } from '@nestjs/common';
import { TmsLookupService } from './tms-lookup.service';

/**
 * TmsModule — consulta read-only ao banco do HiperTMS, uma instância só.
 *
 * O serviço estava registrado como provider em TRÊS módulos (`SenderModule`,
 * `AgentsModule`, `TelemarketingModule`), e o Nest cria uma instância por registro. Como
 * `onModuleInit` abre um `Pool` do `pg`, eram três pools independentes contra o mesmo
 * banco — seis conexões para um serviço stateless que só faz SELECT.
 *
 * A duplicação não era descuido: o comentário em `telemarketing.module.ts` explicava que
 * provider próprio evitava importar módulo de aplicação e fechar ciclo. `@Global` aqui
 * resolve os dois lados, porque este módulo é FOLHA — não importa nada de `application/`,
 * então não há ciclo possível. É o mesmo padrão de `PrismaModule` e `WahaModule`.
 */
@Global()
@Module({
  providers: [TmsLookupService],
  exports: [TmsLookupService],
})
export class TmsModule {}
