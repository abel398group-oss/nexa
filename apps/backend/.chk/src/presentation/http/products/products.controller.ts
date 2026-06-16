import { Controller, Get, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ConnectorsService } from '@/application/connectors/connectors.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller()
export class ProductsController {
  constructor(private readonly connectors: ConnectorsService) {}

  // Lista produtos conectados
  @Get('products')
  list() {
    return this.connectors.listProducts();
  }

  // Saúde do conector de um produto
  @Get('products/:code/health')
  health(@Param('code') code: string) {
    return this.connectors.health(code);
  }

  // Planos do produto (via Connector → fonte de verdade = produto)
  @Get('plans')
  plans(@Query('productCode') productCode = 'hipertms') {
    return this.connectors.getPlans(productCode);
  }

  // Verifica se um telefone já tem cadastro no TMS.
  // GET /connectors/lookup?phone=5511999990000&productCode=hipertms
  // Retorna: { found: boolean, customer: TmsCustomer | null }
  @Get('connectors/lookup')
  async lookupCustomer(
    @Query('phone') phone: string,
    @Query('productCode') productCode = 'hipertms',
  ) {
    if (!phone) throw new BadRequestException('phone é obrigatório');
    return this.connectors.lookupCustomer(productCode, phone);
  }
}
