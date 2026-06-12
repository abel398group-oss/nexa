-- Base de conhecimento do HiperTMS (tenant 'default' = usado pelo fluxo WhatsApp)
-- Enriquecida com os módulos reais do HiperTMS v12. Idempotente: apaga e recria.
DELETE FROM ai_knowledge_base WHERE tenant_id = 'default';

INSERT INTO ai_knowledge_base (id, tenant_id, product_code, topic, category, title, content, tags) VALUES
(gen_random_uuid()::text,'default','hipertms','visao_geral','comercial','O que é o HiperTMS',
'O HiperTMS é um sistema de gestão de transporte (TMS) completo para transportadoras. Centraliza numa só plataforma: emissão fiscal (CT-e e MDF-e integrados à SEFAZ), gestão de frota (veículos e motoristas), operação logística (cotações, fretes, viagens), precificação automática (tabelas de frete), financeiro (contas a pagar/receber, faturas) e gestão comercial/equipe. Tudo integrado, com painel de indicadores. Substitui várias planilhas e sistemas separados por um só.',
ARRAY['o que é','sistema','tms','gestão de transporte','visão geral','funcionalidades','plataforma']),

(gen_random_uuid()::text,'default','hipertms','frota_veiculos','operacional','Controle de veículos e frota',
'O módulo de frota controla cada veículo de ponta a ponta: cadastro completo, vínculo veículo↔motorista, histórico de odômetro (quilometragem), manutenções preventivas e corretivas, registros de abastecimento, consumo e média de combustível por veículo (km/litro) e saldo/controle de combustível. Permite acompanhar o custo e o desempenho real de cada caminhão, identificar gastos fora da curva e planejar manutenção.',
ARRAY['veiculo','veículos','frota','caminhão','manutenção','odometro','quilometragem','consumo','combustivel','abastecimento','controle de veiculos','custo do veiculo']),

(gen_random_uuid()::text,'default','hipertms','frota_motoristas','operacional','Controle de motoristas',
'Gestão completa de motoristas: cadastro com dados da CNH e ALERTAS de vencimento de habilitação/documentos (evita rodar irregular), vínculo do motorista ao veículo e às viagens, e controle de adiantamentos e diárias pagos a cada motorista. A transportadora sabe quem está habilitado, evita multa por documento vencido e controla quanto paga para cada motorista.',
ARRAY['motorista','motoristas','cnh','habilitação','diária','adiantamento','vencimento','controle de motorista','vale']),

(gen_random_uuid()::text,'default','hipertms','fiscal','operacional','Emissão fiscal: CT-e, MDF-e e SEFAZ',
'O HiperTMS emite os documentos fiscais do transporte direto no sistema, integrado à SEFAZ: CT-e (Conhecimento de Transporte eletrônico) com cálculo de impostos (ICMS) e geração do DACTE em PDF, e MDF-e (Manifesto Eletrônico de Documentos Fiscais). Gerencia o certificado digital da empresa, as configurações fiscais e a importação de XML das NF-e dos clientes para gerar os CT-es. Tudo sem precisar de um emissor separado.',
ARRAY['cte','ct-e','mdfe','mdf-e','fiscal','sefaz','nota fiscal','nfe','certificado digital','xml','emissão','dacte','icms','imposto']),

(gen_random_uuid()::text,'default','hipertms','operacao','operacional','Operação logística: cotações, fretes e viagens',
'O módulo logístico cobre toda a operação: cotações de frete, ordens de serviço de transporte, fretes/embarques, viagens (trips) e agendamento de cargas. Importa XML de NF-e do cliente para agilizar o cadastro. Permite acompanhar cada operação do pedido até a entrega, vinculando documentos, veículo e motorista a cada viagem — dando rastreabilidade e organização à rotina.',
ARRAY['frete','fretes','viagem','viagens','cotação','cotações','embarque','carga','operação','logística','entrega','ordem de serviço','agendamento']),

(gen_random_uuid()::text,'default','hipertms','precificacao','comercial','Precificação e tabelas de frete',
'Motor de precificação com tabelas de frete, regras de tarifa e markup. Você importa/configura as tabelas (rotas, pesos, clientes) e o sistema calcula o preço do frete automaticamente quando chega um pedido, aplicando markup e descontos. Padroniza a precificação da transportadora, gera cotação em segundos e protege a margem — elimina cálculo manual e erro de preço.',
ARRAY['preço','precificação','tabela de frete','tarifa','markup','cálculo de frete','cotação de preço','margem','desconto','rota']),

(gen_random_uuid()::text,'default','hipertms','metodologia_valor','comercial','Metodologia de valor: economia e margem para a transportadora',
'A economia que o HiperTMS gera é para a EMPRESA (a operação de transporte), não para a pessoa. Ela vem da metodologia de precificação aplicada ao transporte de carga: o custo do frete é calculado a partir das variáveis reais da operação — consumo de combustível (km/litro), manutenção preventiva e corretiva, depreciação do veículo, custos com motorista (diárias e adiantamentos), impostos do CT-e e a margem-alvo. Essas variáveis compõem a complexidade real do transporte de carga. Em vez de cotar no "achismo", a transportadora precifica pelo custo real e protege a margem em cada frete. O ganho é institucional: menos erro de precificação, menos frete rodando no prejuízo, menos retrabalho fiscal e visão clara de custo por veículo e por rota. Argumento de venda B2B: o sistema se paga ao evitar poucos fretes mal cotados por mês. Próximo passo técnico recomendado: preparar uma cotação demonstrando os custos e a margem de uma rota real do cliente, facilitando a decisão ou a aplicação de desconto.',
ARRAY['economia','valor','roi','retorno','custo','margem','depreciação','manutenção preventiva','consumo','custo do frete','metodologia','por que vale a pena','justificativa','custo por km','cotação','tomada de decisão']),

(gen_random_uuid()::text,'default','hipertms','financeiro','operacional','Financeiro: contas, faturas e cobrança',
'Módulo financeiro com contas a pagar e a receber, contas bancárias, categorias financeiras, faturas e faturas de venda. Integra com cobrança (boletos via Asaas) e dá visão do fluxo de caixa, ligando o financeiro às operações de transporte (cada frete/viagem reflete no caixa). Ajuda a saber quanto entra, quanto sai e a saúde financeira da empresa.',
ARRAY['financeiro','contas a pagar','contas a receber','fatura','boleto','cobrança','fluxo de caixa','banco','asaas','faturamento']),

(gen_random_uuid()::text,'default','hipertms','comercial_equipe','comercial','Gestão comercial, equipe e indicadores',
'Além da operação, o HiperTMS tem gestão comercial (contratos comerciais), gestão de equipe com tarefas e atividades, notificações automáticas (ex.: alertas de documento a vencer) e um dashboard com indicadores da operação (volume de documentos, operações por estado, séries temporais). O gestor acompanha a empresa em tempo real e a equipe sabe o que precisa ser feito.',
ARRAY['dashboard','indicadores','relatório','contrato','equipe','tarefas','atividades','gestão','painel','comercial','notificação']),

(gen_random_uuid()::text,'default','hipertms','multiempresa','operacional','Multiempresa, filiais, usuários e permissões',
'O HiperTMS suporta operação com múltiplas filiais (conforme o plano) e vários usuários, cada um com permissões por função (controle de acesso). Assim a matriz e as filiais trabalham no mesmo sistema, cada pessoa enxergando o que é do seu papel, com segurança e organização.',
ARRAY['filial','filiais','multiempresa','usuários','permissão','acesso','equipe','matriz','perfil']),

(gen_random_uuid()::text,'default','hipertms','implantacao','comercial','Implantação, treinamento e suporte',
'A implantação é rápida e acompanhada: cadastro inicial, importação/configuração das tabelas de frete e treinamento da equipe. O suporte é em português e orienta a transportadora no dia a dia. O objetivo é a empresa começar a emitir CT-e e cotar fretes em poucos dias.',
ARRAY['implantação','onboarding','treinamento','suporte','começar','migração','ajuda','implementação']),

(gen_random_uuid()::text,'default','hipertms','integracoes','operacional','Integrações',
'O HiperTMS integra com a SEFAZ (emissão de CT-e/MDF-e), com cobrança via Asaas (boletos), e importa XML de NF-e dos clientes para gerar documentos. Centraliza fiscal, financeiro e operação, reduzindo digitação e erro entre sistemas.',
ARRAY['integração','integrações','sefaz','asaas','xml','nfe','boleto','api']),

(gen_random_uuid()::text,'default','hipertms','planos','comercial','Planos e preços do HiperTMS',
'O HiperTMS tem 3 planos: Básico R$89/mês (1 usuário, ~500 documentos/mês, CT-e e precificação), Essencial R$299/mês (5 usuários, até 5 filiais, ~1.000 documentos/mês), e Profissional R$599/mês (15 usuários, suporte prioritário, ~5.000 documentos/mês). O plano ideal depende do tamanho da frota e do volume de documentos por mês. Recursos crescem do Básico ao Profissional (cada plano inclui tudo do anterior).',
ARRAY['plano','planos','preço','preços','valor','quanto custa','mensalidade','básico','essencial','profissional','assinatura']);
