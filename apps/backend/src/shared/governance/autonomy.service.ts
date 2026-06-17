import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

export type AutonomyChannel = 'whatsapp' | 'email';

// Kill switch da autonomia da IA (ADR 012).
//
// `master` é o botão de pânico (desliga TUDO). `whatsapp`/`email` ligam/desligam a
// Lia por canal. Autonomia efetiva de um canal = master AND canal.
//
// Estado persistido no banco (tabela singleton `autonomy_setting`, id="global"),
// então sobrevive a restart — não religa a Lia sozinho. Em runtime fica em memória
// (carregado no boot, atualizado a cada toggle). Default inicial vem do .env
// (AI_AUTONOMY_ENABLED) só quando a linha ainda não existe.
@Injectable()
export class AutonomyService implements OnModuleInit {
  private readonly logger = new Logger('Autonomy');
  private master = true;
  private whatsapp = true;
  private email = true;
  private lastChangedBy = 'boot';

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const envDefault = String(process.env.AI_AUTONOMY_ENABLED).toLowerCase() === 'true';
    try {
      const row = await this.prisma.autonomySetting.upsert({
        where: { id: 'global' },
        update: {},
        create: { id: 'global', master: envDefault, whatsapp: envDefault, email: envDefault },
      });
      this.master = row.master;
      this.whatsapp = row.whatsapp;
      this.email = row.email;
      this.lastChangedBy = row.changedBy ?? 'boot';
      this.logger.log(`Autonomia carregada do banco: master=${this.master} whatsapp=${this.whatsapp} email=${this.email}`);
    } catch (e: any) {
      // banco indisponível / migration ainda não rodou → usa o default do .env em memória
      this.master = this.whatsapp = this.email = envDefault;
      this.logger.warn(`Autonomia: falha ao ler do banco (${e?.message}); usando default do .env = ${envDefault}.`);
    }
  }

  /**
   * Autonomia efetiva. Sem canal => retorna só o master (compatível com checagens
   * genéricas). Com canal => master AND flag do canal.
   */
  isEnabled(channel?: AutonomyChannel): boolean {
    if (!channel) return this.master;
    if (!this.master) return false;
    return channel === 'whatsapp' ? this.whatsapp : this.email;
  }

  /** Atualiza um ou mais flags (parcial) e persiste no banco. */
  async setState(
    patch: Partial<{ master: boolean; whatsapp: boolean; email: boolean }>,
    changedBy = 'admin',
  ) {
    if (patch.master !== undefined) this.master = patch.master;
    if (patch.whatsapp !== undefined) this.whatsapp = patch.whatsapp;
    if (patch.email !== undefined) this.email = patch.email;
    this.lastChangedBy = changedBy;
    this.logger.warn(
      `KILL SWITCH: master=${this.master} whatsapp=${this.whatsapp} email=${this.email} por ${changedBy}`,
    );
    try {
      await this.prisma.autonomySetting.upsert({
        where: { id: 'global' },
        update: { master: this.master, whatsapp: this.whatsapp, email: this.email, changedBy },
        create: { id: 'global', master: this.master, whatsapp: this.whatsapp, email: this.email, changedBy },
      });
    } catch (e: any) {
      this.logger.error(`Falha ao persistir autonomia: ${e?.message}`);
    }
    return this.status();
  }

  status() {
    return {
      autonomyEnabled: this.master, // compat: antes era um único booleano
      master: this.master,
      whatsapp: this.whatsapp,
      email: this.email,
      lastChangedBy: this.lastChangedBy,
    };
  }
}
