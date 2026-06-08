import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { Connector } from './connector.interface';
import { HiperTmsConnector } from './hipertms.connector';

// Registry: resolve o Connector certo por productCode (ADR 010).
// Novos produtos = registrar novo connector aqui.
@Injectable()
export class ConnectorsService {
  private readonly registry: Map<string, Connector>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly hipertms: HiperTmsConnector,
  ) {
    this.registry = new Map<string, Connector>([
      [hipertms.productCode, hipertms],
      // ['crm', crmConnector] (futuro)
    ]);
  }

  get(productCode: string): Connector {
    const c = this.registry.get(productCode);
    if (!c) throw new NotFoundException(`Sem conector para o produto: ${productCode}`);
    return c;
  }

  async listProducts() {
    return this.prisma.product.findMany({ where: { status: 'active' } });
  }

  async health(productCode: string) {
    return this.get(productCode).healthCheck();
  }

  async getPlans(productCode: string) {
    return this.get(productCode).getPlans();
  }

  // Verifica se o telefone já tem cadastro no produto.
  // phone: formato E.164 brasileiro (ex: "5511999990000")
  async lookupCustomer(productCode: string, phone: string) {
    const customer = await this.get(productCode).lookupCustomer(phone);
    return { found: customer !== null, customer };
  }
}
