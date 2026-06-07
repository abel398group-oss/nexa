-- Base de conhecimento real do HiperTMS (tenant 'default' = usado pelo fluxo WhatsApp)
-- Remove KB antigo do default p/ recadastrar limpo
DELETE FROM ai_knowledge_base WHERE tenant_id = 'default';

INSERT INTO ai_knowledge_base (id, tenant_id, product_code, topic, category, title, content, tags) VALUES
(gen_random_uuid()::text,'default','hipertms','visao_geral','comercial','O que é o HiperTMS',
'O HiperTMS é um sistema de gestão de transporte (TMS) completo para transportadoras. Centraliza em um só lugar: emissão de documentos fiscais (CT-e e MDF-e), gestão de frota (veículos e motoristas), operação logística (fretes, viagens e cotações), precificação/tabelas de frete, financeiro e gestão comercial. Tudo integrado à SEFAZ e com painel de indicadores.',
ARRAY['o que é','sistema','tms','gestão de transporte','visão geral','funcionalidades']),

(gen_random_uuid()::text,'default','hipertms','frota_veiculos','operacional','Controle de veículos e frota',
'O módulo de frota controla o cadastro completo dos veículos: dados do veículo, vínculo veículo/motorista, histórico de odômetro (quilometragem), manutenções (preventivas e corretivas), consumo e média de combustível por veículo, registros de abastecimento e saldo de combustível. Permite acompanhar custos e desempenho de cada veículo da operação.',
ARRAY['veiculo','veículos','frota','caminhão','manutenção','odometro','quilometragem','consumo','controle de veiculos']),

(gen_random_uuid()::text,'default','hipertms','frota_motoristas','operacional','Controle de motoristas',
'O HiperTMS gerencia o cadastro de motoristas com controle de CNH e alertas de vencimento de documentos/habilitação, vínculo do motorista ao veículo e às viagens, e controle de adiantamentos e diárias (allowances) do motorista. Assim a transportadora sabe quem está habilitado, evita rodar com documento vencido e controla os valores pagos a cada motorista.',
ARRAY['motorista','motoristas','cnh','habilitação','diária','adiantamento','vencimento','controle de motorista']),

(gen_random_uuid()::text,'default','hipertms','fiscal','operacional','Emissão fiscal: CT-e, MDF-e e SEFAZ',
'O HiperTMS emite documentos fiscais do transporte integrados à SEFAZ: CT-e (Conhecimento de Transporte eletrônico) e MDF-e (Manifesto Eletrônico de Documentos Fiscais). Gerencia o certificado digital da empresa, configurações fiscais e importação de XML de NF-e dos clientes para gerar os documentos. Emissão dentro do próprio sistema, sem precisar de emissor separado.',
ARRAY['cte','ct-e','mdfe','mdf-e','fiscal','sefaz','nota fiscal','certificado digital','xml','emissão']),

(gen_random_uuid()::text,'default','hipertms','operacao','operacional','Operação logística: fretes, viagens e cotações',
'O módulo logístico gerencia toda a operação: cotações de frete, ordens de serviço de transporte, fretes/embarques (shipments), viagens (trips) e agendamento de cargas. Permite acompanhar cada operação do pedido até a entrega, vinculando documentos, veículos e motoristas a cada viagem.',
ARRAY['frete','fretes','viagem','viagens','cotação','cotações','embarque','carga','operação','logística','entrega']),

(gen_random_uuid()::text,'default','hipertms','precificacao','comercial','Precificação e tabelas de frete',
'O HiperTMS tem um motor de precificação com tabelas de frete, regras de tarifa e markup. Permite importar e configurar tabelas, calcular o preço do frete automaticamente por rota/cliente e padronizar a precificação da transportadora, evitando cálculo manual e erro de margem.',
ARRAY['preço','precificação','tabela de frete','tarifa','markup','cálculo de frete','cotação de preço']),

(gen_random_uuid()::text,'default','hipertms','financeiro','operacional','Financeiro: contas, faturas e cobrança',
'O módulo financeiro controla contas a pagar e a receber, contas bancárias, categorias financeiras, faturas e faturas de venda. Integra com cobrança (boletos via Asaas) e dá visão do fluxo de caixa da transportadora, ligando o financeiro às operações de transporte.',
ARRAY['financeiro','contas a pagar','contas a receber','fatura','boleto','cobrança','fluxo de caixa','banco','asaas']),

(gen_random_uuid()::text,'default','hipertms','comercial_equipe','comercial','Gestão comercial, equipe e indicadores',
'Além da operação, o HiperTMS tem gestão comercial (contratos comerciais), gestão de equipe com tarefas e atividades, notificações, e um painel/dashboard com indicadores da operação (documentos, operações por estado, séries temporais). Ajuda o gestor a acompanhar a empresa em tempo real.',
ARRAY['dashboard','indicadores','relatório','contrato','equipe','tarefas','gestão','painel','comercial']),

(gen_random_uuid()::text,'default','hipertms','planos','comercial','Planos e preços do HiperTMS',
'O HiperTMS tem 3 planos: Básico R$89/mês (1 usuário, ~500 documentos), Essencial R$299/mês (5 usuários, até 5 filiais, ~1.000 documentos) e Profissional R$599/mês (15 usuários, suporte prioritário, ~5.000 documentos). O plano ideal depende do tamanho da frota e do volume de documentos da transportadora.',
ARRAY['plano','planos','preço','preços','valor','quanto custa','mensalidade','básico','essencial','profissional']);
