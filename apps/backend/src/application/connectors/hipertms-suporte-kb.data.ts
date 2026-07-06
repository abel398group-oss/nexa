import { KnowledgeItem } from './connector.interface';

// Base de conhecimento de SUPORTE — troubleshooting, FAQ e erros comuns do HiperTMS.
// Complementa os manuais operacionais (hipertms-manuais.data.ts) com foco em
// resolução de problemas que chegam via ticket de suporte.
// Categoria 'suporte' para que a Lia do suporte priorize estes artigos.

export const SUPORTE_KB: KnowledgeItem[] = [

  // ══════════════════════════════════════════════════════════
  // ACESSO E LOGIN
  // ══════════════════════════════════════════════════════════
  {
    topic: 'acesso-login',
    category: 'suporte',
    title: 'Não consigo fazer login — senha incorreta',
    content:
      'Problema: mensagem de "senha incorreta" ou "usuário não encontrado" ao tentar entrar.\n' +
      'Soluções:\n' +
      '1. Certifique-se de usar o e-mail cadastrado (não apelido ou nome).\n' +
      '2. Clique em "Esqueci minha senha" na tela de login — você receberá um link por e-mail para redefinir.\n' +
      '3. Verifique se o e-mail de redefinição não caiu no spam.\n' +
      '4. Se o link de redefinição expirou (validade de 24h), solicite um novo.\n' +
      '5. Usuários desativados não conseguem fazer login. Peça ao administrador da empresa para reativar o acesso em Administração → Usuários.',
    tags: ['login', 'senha', 'acesso', 'esqueci', 'nao consigo entrar', 'usuario'],
  },
  {
    topic: 'acesso-login',
    category: 'suporte',
    title: 'Não recebi o e-mail de convite ou ativação de conta',
    content:
      'Problema: nova conta criada mas o e-mail de ativação não chegou.\n' +
      'Soluções:\n' +
      '1. Verifique a pasta de spam/lixo eletrônico — e-mails automáticos costumam ser filtrados.\n' +
      '2. Verifique se o endereço de e-mail foi cadastrado corretamente pelo administrador (um caractere errado impede a entrega).\n' +
      '3. Peça ao administrador para reenviar o convite: Administração → Usuários → selecione o usuário → Reenviar convite.\n' +
      '4. Se o domínio corporativo bloqueou o e-mail (firewall), solicite ao TI liberar o domínio de envio.\n' +
      '5. O link de ativação expira em 48h — se expirou, é necessário reenviar.',
    tags: ['email', 'convite', 'ativacao', 'conta nova', 'nao recebi', 'cadastro'],
  },
  {
    topic: 'acesso-login',
    category: 'suporte',
    title: 'Usuário sem permissão para acessar um módulo',
    content:
      'Problema: usuário logado mas não vê ou não consegue acessar determinada área (Financeiro, Fiscal, Precificação, etc.).\n' +
      'Causa: permissões insuficientes no perfil do usuário.\n' +
      'Solução:\n' +
      '1. Acesse Administração → Usuários.\n' +
      '2. Localize o usuário e clique em Editar.\n' +
      '3. Na aba Permissões, habilite os módulos que o usuário precisa acessar.\n' +
      '4. Salve — o usuário já tem acesso na próxima navegação.\n' +
      'Obs: apenas administradores podem alterar permissões. Se o próprio administrador não vê algum módulo, entre em contato com o suporte.',
    tags: ['permissao', 'acesso negado', 'nao vejo modulo', 'role', 'perfil', 'administrador'],
  },
  {
    topic: 'acesso-login',
    category: 'suporte',
    title: 'Como desativar ou remover um usuário que saiu da empresa',
    content:
      'Procedimento para revogar acesso de colaborador desligado:\n' +
      '1. Acesse Administração → Usuários.\n' +
      '2. Localize o usuário e clique em Desativar.\n' +
      '3. O acesso é revogado imediatamente — o usuário não consegue mais fazer login.\n' +
      '4. O histórico de ações do usuário é preservado para auditoria.\n' +
      'Atenção: é importante desativar o usuário assim que o colaborador sair para evitar acesso não autorizado.',
    tags: ['desativar usuario', 'remover acesso', 'colaborador desligado', 'seguranca'],
  },

  // ══════════════════════════════════════════════════════════
  // FISCAL — CT-e
  // ══════════════════════════════════════════════════════════
  {
    topic: 'cte-rejeicao',
    category: 'suporte',
    title: 'CT-e rejeitado pela SEFAZ — como identificar e resolver',
    content:
      'Quando um CT-e é rejeitado, a SEFAZ retorna um código de rejeição e uma mensagem descritiva.\n' +
      'Como proceder:\n' +
      '1. Acesse Operação → CT-e e localize o documento com status "Rejeitado".\n' +
      '2. Abra o CT-e e veja o código de rejeição exibido no campo "Situação fiscal".\n' +
      '3. Corrija a causa raiz (veja tabela de códigos abaixo) e emita um novo CT-e.\n' +
      'Rejeições NÃO consomem numeração — você pode emitir com o mesmo número após corrigir.\n' +
      'Códigos frequentes: 539 (CFOP inválido), 562 (CT-e já cancelado), 204 (duplicidade), 581 (certificado expirado).\n' +
      'Se o código não aparecer na lista conhecida, acione o suporte com o XML do CT-e.',
    tags: ['cte', 'rejeicao', 'sefaz', 'rejeitado', 'codigo rejeicao', 'erro fiscal'],
  },
  {
    topic: 'cte-rejeicao',
    category: 'suporte',
    title: 'Código SEFAZ 539 — CFOP inválido para a UF',
    content:
      'Rejeição 539: o CFOP informado no CT-e não é válido para a combinação de UF de origem e destino.\n' +
      'O HiperTMS usa CFOP 5352 (operação interna) e 6352 (operação interestadual).\n' +
      'Possíveis causas:\n' +
      '- A UF de origem ou destino está errada nos dados do embarque.\n' +
      '- O endereço do remetente ou destinatário está incompleto/errado no cadastro.\n' +
      'Solução:\n' +
      '1. Verifique o endereço completo (com UF) do remetente e destinatário.\n' +
      '2. Atualize o cadastro em Cadastros → Clientes/Remetentes e Destinatários.\n' +
      '3. Emita o CT-e novamente.',
    tags: ['539', 'cfop', 'uf', 'rejeicao', 'cte', 'intraestadual', 'interestadual'],
  },
  {
    topic: 'cte-rejeicao',
    category: 'suporte',
    title: 'Código SEFAZ 562 — CT-e já cancelado',
    content:
      'Rejeição 562: tentativa de cancelar um CT-e que já foi cancelado anteriormente.\n' +
      'Solução: não há ação necessária — o CT-e já está cancelado. Verifique o status em Operação → CT-e.\n' +
      'Se precisar de um novo documento, emita um CT-e substituto.',
    tags: ['562', 'cancelamento', 'cte', 'ja cancelado', 'rejeicao'],
  },
  {
    topic: 'cte-rejeicao',
    category: 'suporte',
    title: 'Código SEFAZ 204 — Duplicidade de CT-e',
    content:
      'Rejeição 204: a SEFAZ identificou um CT-e com o mesmo número já autorizado.\n' +
      'Solução:\n' +
      '1. Verifique em Operação → CT-e se o documento já está autorizado.\n' +
      '2. Se o documento anterior está correto, não emita novamente.\n' +
      '3. Se o documento anterior está errado, cancele-o primeiro e depois emita o correto.\n' +
      '4. Se o número foi consumido indevidamente, avance o sequenciador: Administração → Sequenciadores.',
    tags: ['204', 'duplicidade', 'cte', 'mesmo numero', 'rejeicao'],
  },
  {
    topic: 'cte-rejeicao',
    category: 'suporte',
    title: 'Código SEFAZ 581 — Certificado digital inválido ou expirado',
    content:
      'Rejeição 581: o certificado digital do emitente está inválido, expirado ou com senha incorreta.\n' +
      'Solução:\n' +
      '1. Acesse Administração → Configurações Fiscais → Certificados.\n' +
      '2. Verifique a data de validade do certificado.\n' +
      '3. Se expirado: adquira um novo certificado junto à Autoridade Certificadora (Serpro, Certisign, etc.).\n' +
      '4. Se válido mas com erro: remova e faça upload novamente, informando a senha correta.\n' +
      '5. Após renovar, emita o CT-e novamente.',
    tags: ['581', 'certificado', 'expirado', 'invalido', 'pfx', 'senha', 'rejeicao'],
  },
  {
    topic: 'cte-rejeicao',
    category: 'suporte',
    title: 'Código SEFAZ 108 / 109 — Serviço SEFAZ paralisado',
    content:
      'Rejeições 108/109: o serviço da SEFAZ está temporariamente indisponível.\n' +
      '108 = paralisação temporária (com previsão de retorno). 109 = paralisação sem previsão.\n' +
      'Solução:\n' +
      '1. Aguarde alguns minutos e tente novamente.\n' +
      '2. Consulte o status dos serviços em: https://www.cte.fazenda.gov.br\n' +
      '3. Em caso de indisponibilidade prolongada, é necessário usar o modo de contingência (entre em contato com o suporte).\n' +
      'Atenção: em período de contingência o CT-e pode ser emitido manualmente, mas deve ser regularizado após o retorno da SEFAZ.',
    tags: ['108', '109', 'sefaz', 'paralisado', 'indisponivel', 'contingencia', 'cte'],
  },
  {
    topic: 'cte-carta-correcao',
    category: 'suporte',
    title: 'Como corrigir um CT-e já autorizado — Carta de Correção',
    content:
      'Problema: CT-e autorizado mas com dado errado (nome, endereço, valor complementar, observação).\n' +
      'Solução: Carta de Correção Eletrônica (CC-e).\n' +
      'Como emitir:\n' +
      '1. Acesse Operação → CT-e e abra o documento autorizado.\n' +
      '2. Clique em "Carta de Correção".\n' +
      '3. Descreva o que está errado e o valor correto no campo de correção.\n' +
      '4. Confirme — a CC-e é transmitida à SEFAZ.\n' +
      'Limitações da Carta de Correção:\n' +
      '- NÃO pode corrigir: valor total do frete, CNPJ das partes, dados do modal, número da NF-e.\n' +
      '- Se a correção necessária não é permitida por CC-e, é necessário cancelar e reemitir o CT-e (prazo máximo de cancelamento: 24h após a autorização, exceto com NF-e vinculada).',
    tags: ['carta de correcao', 'cce', 'corrigir cte', 'cte errado', 'correcao fiscal'],
  },
  {
    topic: 'cte-cancelamento',
    category: 'suporte',
    title: 'Como cancelar um CT-e autorizado',
    content:
      'Prazo para cancelamento: até 24h após a autorização pela SEFAZ (exceto quando há MDF-e vinculado ativo).\n' +
      'Como cancelar:\n' +
      '1. Acesse Operação → CT-e e abra o documento.\n' +
      '2. Clique em "Cancelar CT-e".\n' +
      '3. Informe o motivo do cancelamento (mínimo 15 caracteres).\n' +
      '4. Confirme — o cancelamento é transmitido à SEFAZ.\n' +
      'Após o cancelamento, o CT-e fica com status "Cancelado" e você pode emitir um novo.\n' +
      'Se o prazo de 24h passou, não é possível cancelar — neste caso use a Carta de Correção ou emita um CT-e Complementar/Substituto.',
    tags: ['cancelar cte', 'cancelamento', 'prazo cancelamento', 'cte cancelado'],
  },

  // ══════════════════════════════════════════════════════════
  // FISCAL — MDF-e
  // ══════════════════════════════════════════════════════════
  {
    topic: 'mdfe-problemas',
    category: 'suporte',
    title: 'MDF-e não está encerrando — como resolver',
    content:
      'Problema: MDF-e autorizado mas o encerramento falha ou não aparece a opção de encerrar.\n' +
      'O encerramento do MDF-e é obrigatório ao término de cada viagem interestadual.\n' +
      'Causas e soluções:\n' +
      '1. Certificado expirado: o encerramento exige o mesmo certificado da emissão. Renove o certificado e tente novamente.\n' +
      '2. SEFAZ indisponível: aguarde e tente mais tarde (consulte status em cte.fazenda.gov.br).\n' +
      '3. MDF-e já encerrado: verifique o status — se já constar "Encerrado", não é necessário encerrar novamente.\n' +
      '4. Timeout de comunicação: tente novamente após alguns minutos.\n' +
      'Atenção: não encerrar o MDF-e dentro do prazo gera pendência fiscal. Em caso de persistência, acione o suporte com o número do MDF-e.',
    tags: ['mdfe', 'encerramento', 'nao encerra', 'encerrar viagem', 'fiscal', 'mdf-e'],
  },
  {
    topic: 'mdfe-problemas',
    category: 'suporte',
    title: 'MDF-e rejeitado — principais causas',
    content:
      'Causas comuns de rejeição do MDF-e:\n' +
      '1. Certificado digital inválido ou expirado (código 581): renove o certificado.\n' +
      '2. RNTRC não informado ou inválido: verifique o número RNTRC do veículo em Frota → Veículos.\n' +
      '3. Placa do veículo inválida: confira o cadastro do veículo em Frota → Veículos.\n' +
      '4. CT-e não autorizado vinculado: todos os CT-e incluídos no MDF-e devem estar autorizados antes da emissão do MDF-e.\n' +
      '5. UF de início/término inválida: verifique se a rota está corretamente cadastrada.\n' +
      'Verifique o código de rejeição retornado e corrija a causa antes de reemitir.',
    tags: ['mdfe', 'rejeicao', 'rntrc', 'placa', 'cte nao autorizado', 'mdf-e rejeitado'],
  },

  // ══════════════════════════════════════════════════════════
  // CERTIFICADO DIGITAL
  // ══════════════════════════════════════════════════════════
  {
    topic: 'certificado-digital',
    category: 'suporte',
    title: 'Como configurar o certificado digital no HiperTMS',
    content:
      'O certificado digital A1 (arquivo PFX) é obrigatório para emissão de CT-e e MDF-e.\n' +
      'Passo a passo:\n' +
      '1. Acesse Administração → Configurações Fiscais → Certificados.\n' +
      '2. Clique em "Upload de Certificado".\n' +
      '3. Selecione o arquivo PFX do certificado A1.\n' +
      '4. Informe a senha do certificado.\n' +
      '5. O sistema valida: CNPJ do certificado deve ser igual ao CNPJ da empresa cadastrada.\n' +
      '6. Se válido, o certificado é salvo e a emissão fiscal passa a funcionar.\n' +
      'Onde obter o certificado: Serpro (e-CNPJ A1), Certisign, Valid, Soluti, entre outras Autoridades Certificadoras.\n' +
      'Validade média: 1 a 3 anos. Renove antes do vencimento.',
    tags: ['certificado', 'pfx', 'a1', 'upload', 'configurar certificado', 'ecnpj'],
  },
  {
    topic: 'certificado-digital',
    category: 'suporte',
    title: 'Certificado digital expirado — o que fazer',
    content:
      'Sintoma: CT-e ou MDF-e rejeitado com erro de certificado, ou aviso de "certificado próximo do vencimento".\n' +
      'Solução:\n' +
      '1. Adquira um novo certificado A1 junto à Autoridade Certificadora (e-CNPJ A1).\n' +
      '2. Acesse Administração → Configurações Fiscais → Certificados.\n' +
      '3. Remova o certificado expirado.\n' +
      '4. Faça upload do novo arquivo PFX com a nova senha.\n' +
      '5. Emita o documento que falhou novamente.\n' +
      'Dica: configure um lembrete com 30 dias de antecedência para renovação — o sistema alerta sobre vencimentos próximos.',
    tags: ['certificado expirado', 'renovar certificado', 'vencimento', 'pfx', 'cte', 'mdfe'],
  },
  {
    topic: 'certificado-digital',
    category: 'suporte',
    title: 'Erro ao importar certificado — senha inválida ou CNPJ incompatível',
    content:
      'Erros comuns ao fazer upload do certificado:\n' +
      '1. "Senha inválida": a senha informada não corresponde ao arquivo PFX. Solicite a senha correta à Autoridade Certificadora que emitiu o certificado.\n' +
      '2. "CNPJ do certificado diferente do CNPJ da empresa": o certificado pertence a outro CNPJ. Verifique se fez upload do arquivo correto. O CNPJ da empresa deve estar em Administração → Dados da Empresa.\n' +
      '3. "Arquivo inválido": o arquivo PFX está corrompido ou não é um certificado válido. Solicite um novo download junto à Autoridade Certificadora.\n' +
      '4. "Certificado já expirado": o arquivo PFX enviado já está vencido — adquira um novo certificado.',
    tags: ['certificado', 'senha invalida', 'cnpj incompativel', 'pfx', 'erro upload', 'importar'],
  },

  // ══════════════════════════════════════════════════════════
  // PRECIFICAÇÃO E CÁLCULO DE FRETE
  // ══════════════════════════════════════════════════════════
  {
    topic: 'precificacao-erros',
    category: 'suporte',
    title: 'Sistema não está calculando o frete — tabela não encontrada',
    content:
      'Problema: ao criar cotação ou embarque, o sistema não calcula o frete ou retorna valor zero.\n' +
      'Causas:\n' +
      '1. Nenhuma tabela de frete cadastrada para a rota (origem/destino).\n' +
      '2. A tabela existe mas está inativa.\n' +
      '3. O tipo de veículo da operação não está coberto pela tabela.\n' +
      'Solução:\n' +
      '1. Acesse Precificação → Tabelas de Frete.\n' +
      '2. Verifique se existe uma tabela ativa que cobre a rota e o tipo de veículo.\n' +
      '3. Se não existe, crie uma nova tabela FCL ou LCL conforme a operação.\n' +
      '4. Verifique se a tabela está com status "Ativa".\n' +
      '5. Se existe contrato para o cliente, verifique em Precificação → Contratos se o contrato está vigente.',
    tags: ['frete', 'calculo', 'tabela nao encontrada', 'precificacao', 'valor zero', 'cotacao'],
  },
  {
    topic: 'precificacao-erros',
    category: 'suporte',
    title: 'Valor do frete calculado diferente do esperado',
    content:
      'Problema: o sistema calcula um valor de frete diferente do que o cliente ou a equipe espera.\n' +
      'Causas comuns:\n' +
      '1. Margem de markup configurada incorretamente em Precificação → Margens.\n' +
      '2. Regime tributário com alíquotas desatualizadas em Precificação → Regimes Tributários.\n' +
      '3. Contrato do cliente com tabela diferente da tabela padrão.\n' +
      '4. Serviços adicionais sendo incluídos automaticamente (pedágio, seguro, etc.).\n' +
      'Como diagnosticar:\n' +
      '1. Acesse a cotação e clique em "Ver detalhamento do cálculo" para ver o breakdown completo.\n' +
      '2. Verifique: frete base + serviços adicionais + markup + impostos.\n' +
      '3. Identifique o componente com valor incorreto e ajuste a configuração correspondente.',
    tags: ['frete errado', 'valor diferente', 'calculo incorreto', 'markup', 'margem', 'tabela'],
  },
  {
    topic: 'precificacao-erros',
    category: 'suporte',
    title: 'Como importar tabela de frete (planilha)',
    content:
      'O HiperTMS permite importar tabelas de frete via planilha (arquivo).\n' +
      'Passo a passo:\n' +
      '1. Acesse Precificação → Tabelas de Frete.\n' +
      '2. Clique em "Importar Tabela".\n' +
      '3. Baixe o modelo de planilha disponível na tela.\n' +
      '4. Preencha o modelo com suas tabelas (rotas, veículos e valores).\n' +
      '5. Faça upload do arquivo preenchido.\n' +
      '6. O sistema valida e importa as tabelas.\n' +
      'Erros comuns na importação:\n' +
      '- Colunas fora do padrão do modelo: use sempre o modelo baixado do sistema.\n' +
      '- Rotas com UF inválida: use as siglas oficiais (SP, RJ, MG, etc.).\n' +
      '- Valores com vírgula e ponto invertidos: use ponto como separador decimal (ex: 250.00).',
    tags: ['importar tabela', 'planilha', 'upload', 'tabela frete', 'fcl', 'lcl'],
  },

  // ══════════════════════════════════════════════════════════
  // EMBARQUES
  // ══════════════════════════════════════════════════════════
  {
    topic: 'embarques-problemas',
    category: 'suporte',
    title: 'Não consigo importar o XML da NF-e do cliente',
    content:
      'Problema: erro ao fazer upload do arquivo XML da Nota Fiscal Eletrônica do cliente.\n' +
      'Causas e soluções:\n' +
      '1. Arquivo não é um XML de NF-e válido: confirme que o arquivo é o XML de autorização da NF-e (não o PDF/DANFE).\n' +
      '2. NF-e já importada: o sistema não permite importar a mesma NF-e duas vezes (chave duplicada). Verifique em Vendas → NFe XML.\n' +
      '3. Arquivo corrompido ou incompleto: solicite ao cliente o XML original da SEFAZ.\n' +
      '4. Tamanho do arquivo acima do limite: XMLs de NF-e com muitos itens podem ser grandes — tente importar individualmente.\n' +
      '5. Formato da chave de acesso inválido: a chave deve ter 44 dígitos numéricos.',
    tags: ['xml', 'nfe', 'importar', 'nota fiscal', 'upload', 'erro importacao'],
  },
  {
    topic: 'embarques-problemas',
    category: 'suporte',
    title: 'Embarque travado no status "Aguardando" — como avançar',
    content:
      'Problema: embarque criado mas não avança para execução.\n' +
      'Causas:\n' +
      '1. Embarque não foi incluído em nenhuma viagem.\n' +
      '2. A viagem foi criada mas está no status "Planejada" (não iniciada).\n' +
      'Solução:\n' +
      '1. Acesse Operação → Viagens e verifique se o embarque está em alguma viagem.\n' +
      '2. Se não está, crie uma nova viagem em Operação → Viagens → Nova Viagem e adicione o embarque.\n' +
      '3. Se está em uma viagem "Planejada", inicie a viagem para que o embarque passe para "Em andamento".',
    tags: ['embarque', 'aguardando', 'status', 'viagem', 'travado', 'nao avanca'],
  },

  // ══════════════════════════════════════════════════════════
  // FROTA
  // ══════════════════════════════════════════════════════════
  {
    topic: 'frota-problemas',
    category: 'suporte',
    title: 'Veículo não aparece disponível para seleção na viagem',
    content:
      'Problema: ao criar uma viagem, um veículo não está disponível para seleção.\n' +
      'Causas:\n' +
      '1. Veículo com status "Em viagem": está alocado em outra viagem ativa. Conclua ou cancele a viagem anterior.\n' +
      '2. Veículo com status "Em manutenção": está com uma ordem de manutenção aberta. Registre a saída da manutenção em Frota → Manutenções.\n' +
      '3. Veículo com status "Inativo": reative o cadastro em Frota → Veículos.\n' +
      '4. Veículo não cadastrado: cadastre em Frota → Veículos → Novo Veículo.',
    tags: ['veiculo', 'disponivel', 'viagem', 'selecionar', 'frota', 'manutencao'],
  },
  {
    topic: 'frota-problemas',
    category: 'suporte',
    title: 'CNH do motorista vencida — alerta no sistema',
    content:
      'O sistema emite alertas quando documentos de motoristas estão próximos do vencimento.\n' +
      'Como resolver o alerta de CNH vencida:\n' +
      '1. Acesse Frota → Motoristas e abra o cadastro do motorista.\n' +
      '2. Na aba Documentos, atualize a data de validade da CNH após a renovação.\n' +
      '3. Faça upload da CNH renovada.\n' +
      'Atenção: motorista com CNH vencida não deve operar. Verifique a situação antes de alocar o motorista em uma viagem.\n' +
      'Dica: o sistema alerta com 30 dias de antecedência sobre vencimentos.',
    tags: ['cnh', 'vencida', 'motorista', 'documento', 'alerta', 'frota'],
  },
  {
    topic: 'frota-problemas',
    category: 'suporte',
    title: 'Como registrar manutenção e retornar veículo para operação',
    content:
      'Quando um veículo precisa de manutenção:\n' +
      '1. Acesse Frota → Manutenções → Nova Manutenção.\n' +
      '2. Selecione o veículo, tipo de manutenção, datas e fornecedor.\n' +
      '3. O veículo fica automaticamente com status "Em manutenção" (indisponível para viagens).\n' +
      'Para retornar o veículo após a manutenção:\n' +
      '1. Abra a ordem de manutenção.\n' +
      '2. Informe a data de saída e o custo final.\n' +
      '3. Clique em "Concluir Manutenção".\n' +
      '4. O veículo retorna automaticamente ao status "Disponível".',
    tags: ['manutencao', 'veiculo', 'retornar', 'disponivel', 'frota', 'ordem manutencao'],
  },

  // ══════════════════════════════════════════════════════════
  // FINANCEIRO
  // ══════════════════════════════════════════════════════════
  {
    topic: 'financeiro-problemas',
    category: 'suporte',
    title: 'Conta a pagar ou receber não aparece no relatório',
    content:
      'Problema: lançamento financeiro não aparece no relatório ou fluxo de caixa.\n' +
      'Causas e verificações:\n' +
      '1. Filtro de datas: verifique se o período do relatório inclui a data de vencimento da conta.\n' +
      '2. Filtro de status: contas canceladas não aparecem nos relatórios de contas ativas.\n' +
      '3. Categoria incorreta: a conta pode estar classificada em uma categoria que não está no filtro aplicado.\n' +
      '4. Conta bancária errada: se o relatório filtra por conta bancária, verifique se a conta correta está selecionada.\n' +
      'Solução: remova todos os filtros e busque pelo valor ou fornecedor para localizar o lançamento.',
    tags: ['financeiro', 'relatorio', 'conta', 'nao aparece', 'fluxo caixa', 'filtro'],
  },
  {
    topic: 'financeiro-problemas',
    category: 'suporte',
    title: 'Como criar uma fatura e enviá-la ao cliente',
    content:
      'Uma fatura consolida vários embarques do mesmo cliente para cobrança:\n' +
      '1. Acesse Financeiro → Faturas (tomador).\n' +
      '2. Clique em "Nova Fatura".\n' +
      '3. Selecione o cliente (tomador).\n' +
      '4. Selecione os embarques que serão incluídos (apenas embarques com status "Entregue").\n' +
      '5. Revise o valor total e clique em "Emitir Fatura".\n' +
      '6. Para enviar ao cliente: abra a fatura e clique em "Enviar por E-mail" — um e-mail é enviado automaticamente com o PDF da fatura.\n' +
      'Após o cliente pagar, registre o recebimento: abra a fatura e clique em "Registrar Pagamento".',
    tags: ['fatura', 'cliente', 'cobranca', 'enviar fatura', 'faturamento', 'recebimento'],
  },
  {
    topic: 'financeiro-problemas',
    category: 'suporte',
    title: 'Saldo da conta bancária está incorreto',
    content:
      'Problema: o saldo exibido em Financeiro → Contas Bancárias não bate com o saldo real.\n' +
      'Causas:\n' +
      '1. Saldo inicial configurado incorretamente ao cadastrar a conta.\n' +
      '2. Lançamentos não registrados no sistema (pagamentos feitos fora do sistema).\n' +
      '3. Lançamentos duplicados (conta paga duas vezes no sistema).\n' +
      'Como corrigir:\n' +
      '1. Acesse Financeiro → Contas Bancárias e abra o extrato da conta.\n' +
      '2. Compare com o extrato bancário real.\n' +
      '3. Para lançamentos duplicados, cancele um deles.\n' +
      '4. Para lançamentos faltantes, registre manualmente.\n' +
      '5. Se o saldo inicial está errado, entre em contato com o suporte para ajuste.',
    tags: ['saldo', 'conta bancaria', 'incorreto', 'financeiro', 'extrato', 'conciliacao'],
  },

  // ══════════════════════════════════════════════════════════
  // CADASTROS
  // ══════════════════════════════════════════════════════════
  {
    topic: 'cadastros-problemas',
    category: 'suporte',
    title: 'CNPJ duplicado — sistema não permite cadastrar empresa',
    content:
      'Problema: ao tentar cadastrar um cliente ou fornecedor, o sistema informa que o CNPJ já existe.\n' +
      'Solução:\n' +
      '1. Pesquise o CNPJ em Cadastros → Clientes (ou Fornecedores/Terceiros).\n' +
      '2. O cadastro existente pode estar inativo — verifique a situação.\n' +
      '3. Se o cadastro está ativo mas com dados diferentes, atualize os dados do existente em vez de criar um novo.\n' +
      '4. Se o CNPJ existe como cliente e você precisa cadastrá-lo também como fornecedor, edite o cadastro existente e adicione o relacionamento "Fornecedor" na aba de relacionamentos.',
    tags: ['cnpj', 'duplicado', 'empresa', 'cadastro', 'ja existe', 'cliente', 'fornecedor'],
  },
  {
    topic: 'cadastros-problemas',
    category: 'suporte',
    title: 'Endereço do cadastro não está sendo reconhecido para emissão fiscal',
    content:
      'Problema: ao emitir CT-e, o endereço do remetente ou destinatário é rejeitado ou aparece incompleto.\n' +
      'Requisitos de endereço para documentos fiscais:\n' +
      '- CEP completo (8 dígitos)\n' +
      '- Logradouro, número, bairro\n' +
      '- Município com código IBGE correto\n' +
      '- UF\n' +
      'Solução:\n' +
      '1. Acesse o cadastro da empresa em Cadastros → Clientes/Remetentes e Destinatários.\n' +
      '2. Informe o CEP — o sistema preenche automaticamente os demais campos via consulta de CEP.\n' +
      '3. Confirme que o município está correto (não apenas a cidade, mas o município exato).\n' +
      '4. Salve e tente emitir novamente.',
    tags: ['endereco', 'cep', 'municipio', 'cadastro', 'cte', 'fiscal', 'ibge'],
  },
  {
    topic: 'cadastros-problemas',
    category: 'suporte',
    title: 'Como importar múltiplos cadastros via CSV',
    content:
      'Para importar vários clientes/fornecedores de uma vez:\n' +
      '1. Acesse Cadastros → Importar CSV.\n' +
      '2. Baixe o modelo de planilha disponível na tela.\n' +
      '3. Preencha o modelo com os dados das empresas.\n' +
      '4. Faça upload do arquivo preenchido.\n' +
      '5. O sistema valida e exibe um relatório: importados com sucesso + erros.\n' +
      'Erros comuns:\n' +
      '- CNPJ sem formatação (use apenas números: 12345678000195).\n' +
      '- Colunas obrigatórias vazias (razão social, CNPJ, UF).\n' +
      '- Caracteres especiais no CSV (salve como UTF-8 sem BOM).\n' +
      'Corrija os erros na planilha e reimporte apenas os registros com erro.',
    tags: ['importar', 'csv', 'planilha', 'clientes', 'fornecedores', 'cadastro em massa'],
  },

  // ══════════════════════════════════════════════════════════
  // ADMINISTRAÇÃO
  // ══════════════════════════════════════════════════════════
  {
    topic: 'administracao-problemas',
    category: 'suporte',
    title: 'Sequenciador zerou ou está fora de ordem — como corrigir',
    content:
      'Problema: cotações, embarques ou faturas estão sendo numeradas errado (sequência reiniciou ou pulou números).\n' +
      'Como verificar e corrigir:\n' +
      '1. Acesse Administração → Sequenciadores.\n' +
      '2. Verifique o número atual de cada sequência (cotações, embarques, faturas, etc.).\n' +
      '3. Se o número está abaixo do último documento emitido, ajuste para o próximo número correto.\n' +
      'Atenção: altere apenas avançando o número (nunca retroceda) para evitar duplicidades.\n' +
      'Esta configuração é normalmente definida uma única vez na implantação.',
    tags: ['sequenciador', 'numeracao', 'zerOU', 'fora de ordem', 'numero documento', 'administracao'],
  },
  {
    topic: 'administracao-problemas',
    category: 'suporte',
    title: 'Dados da empresa estão errados nos documentos emitidos',
    content:
      'Problema: CT-e, faturas ou relatórios saem com razão social, CNPJ ou endereço incorretos.\n' +
      'Solução:\n' +
      '1. Acesse Administração → Dados da Empresa.\n' +
      '2. Verifique e corrija: razão social, nome fantasia, CNPJ, inscrição estadual, endereço e logotipo.\n' +
      '3. Salve as alterações.\n' +
      '4. Novos documentos emitidos já usarão os dados atualizados.\n' +
      'Atenção: documentos já emitidos (CT-e autorizado, faturas enviadas) não são alterados retroativamente. Use Carta de Correção para corrigir dados em CT-e autorizados.',
    tags: ['dados empresa', 'cnpj errado', 'razao social', 'endereco errado', 'documento', 'administracao'],
  },
  {
    topic: 'administracao-problemas',
    category: 'suporte',
    title: 'Como configurar automações — alertas e triggers automáticos',
    content:
      'O HiperTMS permite configurar parâmetros de automação para agilizar operações:\n' +
      '1. Acesse Administração → Automação.\n' +
      '2. Configure os parâmetros disponíveis:\n' +
      '   - Cálculo automático de frete ao criar embarque.\n' +
      '   - Alerta de margem mínima em cotações.\n' +
      '   - Geração automática de tarefas em eventos operacionais.\n' +
      '3. Salve as configurações.\n' +
      'As automações são aplicadas para todos os usuários da empresa.\n' +
      'Dica: ative o alerta de margem mínima para evitar que cotações com margem negativa sejam enviadas ao cliente.',
    tags: ['automacao', 'alerta', 'trigger', 'calculo automatico', 'administracao', 'parametros'],
  },

  // ══════════════════════════════════════════════════════════
  // OPERAÇÃO — CARGAS E VIAGENS
  // ══════════════════════════════════════════════════════════
  {
    topic: 'operacao-problemas',
    category: 'suporte',
    title: 'Como registrar uma ocorrência ou avaria durante a entrega',
    content:
      'Para registrar uma ocorrência durante o transporte:\n' +
      '1. Acesse o embarque (em Vendas → Embarques ou na viagem correspondente).\n' +
      '2. Clique na aba "Eventos".\n' +
      '3. Clique em "Novo Evento".\n' +
      '4. Selecione o tipo: tentativa de entrega, avaria, atraso, roubo, etc.\n' +
      '5. Adicione a descrição e data/hora da ocorrência.\n' +
      '6. Salve — o evento fica registrado no histórico do embarque.\n' +
      'O registro de ocorrências é importante para rastreabilidade, seguro e comunicação com o cliente.',
    tags: ['ocorrencia', 'avaria', 'entrega', 'evento', 'rastreamento', 'embarque'],
  },
  {
    topic: 'operacao-problemas',
    category: 'suporte',
    title: 'Viagem não pode ser concluída — o que verificar',
    content:
      'Problema: botão de "Concluir Viagem" indisponível ou erro ao tentar concluir.\n' +
      'Verificações:\n' +
      '1. MDF-e pendente: se houver MDF-e vinculado, ele deve ser encerrado antes de concluir a viagem.\n' +
      '2. Embarques não entregues: todos os embarques da viagem devem ter status "Entregue" para concluir a viagem. Registre a entrega em cada embarque.\n' +
      '3. Status da viagem: a viagem deve estar com status "Em andamento" para poder ser concluída. Se está "Planejada", inicie-a primeiro.\n' +
      '4. Permissão insuficiente: verifique se o usuário tem permissão para concluir viagens em Administração → Usuários → Permissões.',
    tags: ['viagem', 'concluir', 'mdfe', 'encerrar', 'embarques entregues', 'status'],
  },
  {
    topic: 'operacao-problemas',
    category: 'suporte',
    title: 'Como gerar o DACTE (PDF do CT-e)',
    content:
      'O DACTE é o documento impresso do CT-e que acompanha a carga.\n' +
      'Como gerar:\n' +
      '1. Acesse Operação → CT-e.\n' +
      '2. Localize o CT-e autorizado e clique nele para abrir.\n' +
      '3. Clique em "Download DACTE" ou "Imprimir DACTE".\n' +
      '4. O PDF é gerado e pode ser impresso ou enviado digitalmente.\n' +
      'Obs: o DACTE só está disponível para CT-e com status "Autorizado".\n' +
      'Se o botão não aparece, verifique se o CT-e está autorizado (não em processamento ou rejeitado).',
    tags: ['dacte', 'pdf', 'cte', 'imprimir', 'download', 'documento impresso'],
  },

  // ══════════════════════════════════════════════════════════
  // COMPRAS
  // ══════════════════════════════════════════════════════════
  {
    topic: 'compras-problemas',
    category: 'suporte',
    title: 'Solicitação de compra não está sendo aprovada',
    content:
      'Problema: solicitação de compra criada mas permanece pendente sem aprovação.\n' +
      'Causas:\n' +
      '1. Nenhum usuário com perfil de aprovador: verifique em Administração → Usuários se existe alguém com permissão de aprovar compras.\n' +
      '2. Aprovador não recebeu notificação: verifique em Equipes → Notificações se o alerta chegou para o aprovador.\n' +
      '3. Aprovador não conhece o processo: oriente o aprovador a acessar Compras → Solicitações e filtrar por "Pendentes".\n' +
      'Como aprovar:\n' +
      '1. Acesse Compras → Solicitações.\n' +
      '2. Filtre por status "Pendente".\n' +
      '3. Abra a solicitação e clique em "Aprovar" ou "Recusar".',
    tags: ['solicitacao compra', 'aprovacao', 'pendente', 'compras', 'aprovador'],
  },
  {
    topic: 'compras-problemas',
    category: 'suporte',
    title: 'Estoque não atualizou após recebimento de pedido',
    content:
      'Problema: pedido de compra marcado como recebido, mas o estoque em Compras → Estoque não aumentou.\n' +
      'Verificações:\n' +
      '1. O recebimento foi registrado com quantidade acima de zero? Abra o pedido e veja o histórico de recebimentos.\n' +
      '2. O produto cadastrado no pedido é o mesmo produto no estoque? (nome idêntico)\n' +
      '3. Aguarde alguns segundos e recarregue a tela — o sistema pode ter um leve delay.\n' +
      'Para registrar recebimento manualmente:\n' +
      '1. Acesse o produto em Compras → Estoque.\n' +
      '2. Clique em "Nova Movimentação" → tipo "Entrada".\n' +
      '3. Informe a quantidade e o motivo "Recebimento de pedido".',
    tags: ['estoque', 'recebimento', 'pedido compra', 'nao atualizou', 'movimentacao'],
  },

  // ══════════════════════════════════════════════════════════
  // EQUIPES E NOTIFICAÇÕES
  // ══════════════════════════════════════════════════════════
  {
    topic: 'equipes-problemas',
    category: 'suporte',
    title: 'Não estou recebendo notificações do sistema',
    content:
      'Problema: eventos importantes acontecem mas o usuário não recebe alertas.\n' +
      'Verificações:\n' +
      '1. Acesse Equipes → Notificações para ver se as notificações estão sendo geradas (podem não estar chegando por e-mail).\n' +
      '2. Verifique se o e-mail do usuário está correto em Administração → Minha Conta.\n' +
      '3. Verifique a pasta de spam do e-mail.\n' +
      '4. Verifique em Administração → Usuários → Permissões se o usuário tem acesso às funcionalidades que geram notificações.\n' +
      'Obs: o sino de notificações no topo da tela exibe notificações dentro do sistema em tempo real.',
    tags: ['notificacao', 'alerta', 'email', 'nao recebo', 'aviso', 'equipes'],
  },

  // ══════════════════════════════════════════════════════════
  // OPERAÇÃO — VIAGENS (gaps)
  // ══════════════════════════════════════════════════════════
  {
    topic: 'operacao-problemas',
    category: 'suporte',
    title: 'Como criar uma viagem e adicionar embarques',
    content:
      'Passo a passo para criar uma viagem:\n' +
      '1. Acesse Operação → Viagens e clique em "Nova Viagem".\n' +
      '2. Selecione o Veículo e o Motorista.\n' +
      '3. Adicione os Embarques que farão parte da viagem (somente embarques com status "Aguardando").\n' +
      '4. Defina a Rota (sequência de coletas e entregas).\n' +
      '5. Informe a Diária do motorista, se aplicável.\n' +
      '6. Salve — a viagem fica com status "Planejada".\n' +
      'Para iniciar a viagem: abra a viagem salva e clique em "Iniciar Viagem" — o status muda para "Em andamento" e os embarques passam a "Em andamento".\n' +
      'Obs: um embarque só pode estar em uma viagem por vez.',
    tags: ['viagem', 'criar viagem', 'nova viagem', 'embarque', 'motorista', 'veiculo', 'operacao'],
  },
  {
    topic: 'operacao-problemas',
    category: 'suporte',
    title: 'Viagem está no status "Planejada" — como iniciar',
    content:
      'Uma viagem criada fica inicialmente no status "Planejada" — isso significa que não foi iniciada ainda.\n' +
      'Para iniciar:\n' +
      '1. Acesse Operação → Viagens e abra a viagem desejada.\n' +
      '2. Clique em "Iniciar Viagem".\n' +
      '3. O status muda para "Em andamento" e os embarques vinculados passam de "Aguardando" para "Em andamento".\n' +
      'Por que isso importa:\n' +
      '- Embarques em viagem "Planejada" ficam travados em "Aguardando".\n' +
      '- O CT-e e MDF-e só podem ser emitidos quando a viagem está "Em andamento".\n' +
      '- O encerramento do MDF-e só é possível após iniciar e concluir a viagem.',
    tags: ['planejada', 'iniciar viagem', 'em andamento', 'status viagem', 'operacao'],
  },

  // ══════════════════════════════════════════════════════════
  // FISCAL — CT-e (gaps)
  // ══════════════════════════════════════════════════════════
  {
    topic: 'cte-rejeicao',
    category: 'suporte',
    title: 'CT-e em processamento há muito tempo — o que fazer',
    content:
      'Status "Em processamento" significa que o CT-e foi transmitido à SEFAZ mas ainda não retornou resposta.\n' +
      'Causas comuns:\n' +
      '1. SEFAZ instável: lentidão ou intermitência no serviço da SEFAZ.\n' +
      '2. Timeout de conexão: a resposta foi perdida antes de chegar ao sistema.\n' +
      'O que fazer:\n' +
      '1. Aguarde 5 a 10 minutos e consulte novamente o status em Operação → CT-e.\n' +
      '2. Se ainda "Em processamento" após 10 minutos, clique em "Consultar SEFAZ" (ou "Verificar status") — o sistema consultará a SEFAZ e atualizará o status.\n' +
      '3. Se a SEFAZ confirmar autorização: o status muda para "Autorizado".\n' +
      '4. Se a SEFAZ retornar rejeição: o status muda para "Rejeitado" com o código de erro.\n' +
      'IMPORTANTE: NÃO emita um novo CT-e enquanto o anterior ainda estiver em processamento — pode gerar duplicidade (rejeição 204).',
    tags: ['em processamento', 'cte', 'sefaz', 'timeout', 'consultar', 'status', 'aguardando retorno'],
  },
  {
    topic: 'cte-cancelamento',
    category: 'suporte',
    title: 'CT-e Complementar — quando usar e como emitir',
    content:
      'O CT-e Complementar é usado para corrigir o VALOR de um CT-e já autorizado quando a correção não pode ser feita por Carta de Correção.\n' +
      'Quando usar:\n' +
      '- Quando o valor do frete foi emitido a menor e precisa de complementação.\n' +
      '- Quando há diferença de frete a cobrar após o transporte.\n' +
      'NÃO use CT-e Complementar para cancelar ou substituir o CT-e original — ele apenas COMPLEMENTA.\n' +
      'Como emitir:\n' +
      '1. Acesse Operação → CT-e.\n' +
      '2. Abra o CT-e original autorizado.\n' +
      '3. Clique em "Emitir Complementar".\n' +
      '4. Informe o valor complementar (diferença).\n' +
      '5. Confirme — o CT-e Complementar referencia o original automaticamente.\n' +
      'Obs: o prazo para cancelamento do CT-e original (24h) é independente do prazo para emissão do Complementar.',
    tags: ['cte complementar', 'complementar', 'valor errado', 'diferenca frete', 'corrigir valor'],
  },

  // ══════════════════════════════════════════════════════════
  // FROTA — ABASTECIMENTO E DIÁRIAS (gaps)
  // ══════════════════════════════════════════════════════════
  {
    topic: 'frota-problemas',
    category: 'suporte',
    title: 'Abastecimento não gerou conta a pagar — como resolver',
    content:
      'Problema: abastecimento registrado em Frota → Abastecimentos mas não aparece como conta a pagar no Financeiro.\n' +
      'Causa: o abastecimento precisa ser APROVADO e CONVERTIDO para gerar a conta a pagar automaticamente.\n' +
      'Fluxo correto:\n' +
      '1. Registro: o motorista/operador registra o abastecimento em Frota → Abastecimentos.\n' +
      '2. Aprovação: um usuário com permissão acessa o abastecimento e clica em "Aprovar".\n' +
      '3. Conversão: após aprovado, clique em "Converter em Conta a Pagar" — o sistema cria automaticamente a conta no Financeiro → Contas a Pagar.\n' +
      'Se o botão "Aprovar" não aparece: o usuário não tem permissão de aprovação — ajuste em Administração → Usuários → Permissões.\n' +
      'Se foi aprovado mas não convertido: localize o abastecimento e faça a conversão manualmente.',
    tags: ['abastecimento', 'conta pagar', 'nao gerou', 'aprovacao', 'conversao', 'frota', 'financeiro'],
  },
  {
    topic: 'frota-problemas',
    category: 'suporte',
    title: 'Como registrar diária ou adiantamento de motorista',
    content:
      'Diárias e adiantamentos registram os valores pagos aos motoristas durante as viagens.\n' +
      'Como registrar:\n' +
      '1. Acesse Frota → Diárias e clique em "Nova Diária".\n' +
      '2. Selecione o Motorista e a Viagem correspondente.\n' +
      '3. Informe o Valor e a Forma de Pagamento.\n' +
      '4. Salve — o registro é vinculado ao financeiro da viagem.\n' +
      'Também é possível adicionar a diária diretamente ao criar a viagem (campo "Diária do motorista" no formulário de Nova Viagem).\n' +
      'O valor da diária aparece no custo da viagem em Operação → Viagens → aba Financeiro.\n' +
      'Se a diária não aparece no financeiro: verifique se o registro está vinculado à viagem correta.',
    tags: ['diaria', 'adiantamento', 'motorista', 'viagem', 'pagamento', 'frota', 'financeiro viagem'],
  },

  // ══════════════════════════════════════════════════════════
  // FINANCEIRO — PRESTADOR E ORÇAMENTO (gaps)
  // ══════════════════════════════════════════════════════════
  {
    topic: 'financeiro-problemas',
    category: 'suporte',
    title: 'Fatura de prestador — como registrar fatura de transportador terceiro',
    content:
      'Faturas de prestador são cobranças recebidas de transportadores parceiros (terceiros).\n' +
      'Como registrar:\n' +
      '1. Acesse Financeiro → Faturas (prestador).\n' +
      '2. Clique em "Nova Fatura de Prestador".\n' +
      '3. Selecione o Transportador (deve estar cadastrado em Cadastros → Terceiros).\n' +
      '4. Vincule as Ordens de Serviço de transporte realizadas.\n' +
      '5. Revise os valores e confirme.\n' +
      '6. A fatura gera automaticamente uma Conta a Pagar em Financeiro → Contas a Pagar.\n' +
      'Se o transportador não aparece na lista: cadastre-o primeiro em Cadastros → Terceiros com CNPJ e dados bancários.\n' +
      'Após registrar o pagamento: abra a fatura e clique em "Registrar Pagamento" para liquidar a conta a pagar.',
    tags: ['fatura prestador', 'terceiro', 'transportador', 'parceiro', 'conta pagar', 'financeiro', 'ordem servico'],
  },

  // ══════════════════════════════════════════════════════════
  // PRECIFICAÇÃO — CONTRATOS (gaps)
  // ══════════════════════════════════════════════════════════
  {
    topic: 'precificacao-erros',
    category: 'suporte',
    title: 'Como criar um contrato comercial e vincular a um cliente',
    content:
      'Um contrato garante que um cliente específico sempre use uma tabela de frete negociada, com condições especiais.\n' +
      'Como criar:\n' +
      '1. Acesse Precificação → Contratos e clique em "Novo Contrato".\n' +
      '2. Selecione o Cliente (tomador).\n' +
      '3. Selecione a Tabela de Frete que será aplicada a este cliente.\n' +
      '4. Defina o período de validade (data início e fim).\n' +
      '5. Adicione serviços adicionais incluídos no contrato, se houver.\n' +
      '6. Salve — o contrato fica vinculado ao cliente.\n' +
      'Nas cotações para esse cliente, o sistema usa automaticamente a tabela contratual.\n' +
      'Problemas comuns:\n' +
      '- Contrato vencido: o sistema usa a tabela padrão. Renove o contrato em Precificação → Contratos.\n' +
      '- Mais de um contrato ativo: o sistema usa o contrato mais recente. Verifique e desative contratos antigos.',
    tags: ['contrato', 'cliente', 'tabela frete', 'contrato comercial', 'precificacao', 'vigencia'],
  },

  // ══════════════════════════════════════════════════════════
  // ADMINISTRAÇÃO — AMBIENTE FISCAL E USUÁRIOS (gaps)
  // ══════════════════════════════════════════════════════════
  {
    topic: 'administracao-problemas',
    category: 'suporte',
    title: 'Ambiente SEFAZ: produção vs. homologação — como configurar',
    content:
      'O HiperTMS opera em dois ambientes fiscais: Produção (documentos reais) e Homologação (testes, sem valor fiscal).\n' +
      'Como verificar e alterar o ambiente:\n' +
      '1. Acesse Administração → Configurações Fiscais (ou Dados da Empresa → aba Fiscal).\n' +
      '2. Verifique o campo "Ambiente SEFAZ": deve estar em "Produção" para emitir documentos reais.\n' +
      '3. Para alterar: selecione "Produção" e salve.\n' +
      'ATENÇÃO: documentos emitidos em Homologação NÃO têm valor fiscal e NÃO precisam ser cancelados. São apenas para teste.\n' +
      'Sintomas de ambiente errado:\n' +
      '- CT-e autorizado mas não aparece na consulta da SEFAZ → está em homologação.\n' +
      '- Cliente reclama que o CT-e não é válido → verifique o ambiente.\n' +
      'Após mudar para Produção: emita novos documentos. Os documentos de homologação ficam arquivados apenas localmente.',
    tags: ['ambiente', 'producao', 'homologacao', 'sefaz', 'fiscal', 'teste', 'configuracao fiscal'],
  },
  {
    topic: 'administracao-problemas',
    category: 'suporte',
    title: 'Limite de usuários do plano atingido — o que fazer',
    content:
      'Problema: ao tentar cadastrar um novo usuário, o sistema informa que o limite do plano foi atingido.\n' +
      'Limites por plano:\n' +
      '- Básico: 5 usuários\n' +
      '- Essencial: 8 usuários\n' +
      '- Profissional: 15 usuários\n' +
      'Opções:\n' +
      '1. Fazer upgrade do plano: acesse Administração → Assinatura e Cobrança → Alterar Plano.\n' +
      '2. Desativar usuários inativos: Administração → Usuários → localize usuários que não acessam mais e clique em "Desativar". Usuários inativos não contam para o limite.\n' +
      '3. Verificar o plano atual: Administração → Assinatura e Cobrança mostra o plano ativo e quantos usuários estão em uso.',
    tags: ['limite usuarios', 'plano', 'usuario', 'upgrade', 'maximo', 'administracao', 'assinatura'],
  },

  // ══════════════════════════════════════════════════════════
  // DÚVIDAS GERAIS / FAQ
  // ══════════════════════════════════════════════════════════
  {
    topic: 'faq-geral',
    category: 'suporte',
    title: 'Como funciona o onboarding inicial do HiperTMS',
    content:
      'Na primeira vez que você acessa o HiperTMS, um assistente de configuração (onboarding) guia você pelas configurações essenciais:\n' +
      '1. Dados da empresa (razão social, CNPJ, endereço, logotipo).\n' +
      '2. Configurações fiscais (certificado digital, regime tributário, ambiente SEFAZ).\n' +
      '3. Cadastros iniciais (clientes, veículos, motoristas).\n' +
      '4. Tabelas de frete.\n' +
      'Cada etapa salva automaticamente ao avançar. O assistente pode ser retomado a qualquer momento em Administração → Dados da Empresa.\n' +
      'Quando o progresso atingir 100%, o sistema está pronto para operar.',
    tags: ['onboarding', 'configuracao inicial', 'primeiros passos', 'comecar', 'implantacao'],
  },
  {
    topic: 'faq-geral',
    category: 'suporte',
    title: 'Diferença entre CT-e e MDF-e — quando emitir cada um',
    content:
      'CT-e (Conhecimento de Transporte eletrônico): documento fiscal que representa o serviço de transporte prestado. É emitido por embarque — um CT-e por carga/cliente. É obrigatório para qualquer transporte rodoviário de carga.\n\n' +
      'MDF-e (Manifesto Eletrônico de Documentos Fiscais): documento que acompanha o veículo durante a viagem, agrupando todos os CT-e incluídos. É obrigatório em viagens interestaduais com múltiplos CT-e ou quando exigido pela legislação estadual.\n\n' +
      'Resumo prático:\n' +
      '- Emita o CT-e para cada embarque/cliente.\n' +
      '- Emita o MDF-e por viagem (agrupa os CT-e da viagem).\n' +
      '- Encerre o MDF-e ao concluir cada viagem.',
    tags: ['cte', 'mdfe', 'diferenca', 'quando emitir', 'obrigatorio', 'fiscal'],
  },
  {
    topic: 'faq-geral',
    category: 'suporte',
    title: 'Como funciona o limite de crédito do cliente',
    content:
      'O limite de crédito define o valor máximo de operações em aberto que um cliente pode ter.\n' +
      'Como configurar:\n' +
      '1. Acesse Cadastros → Clientes e abra o cliente.\n' +
      '2. No campo "Limite de Crédito", informe o valor máximo.\n' +
      '3. Salve.\n' +
      'Comportamento:\n' +
      '- Quando as contas a receber em aberto do cliente atingem o limite, o sistema alerta ao criar novas cotações/embarques.\n' +
      '- O sistema não bloqueia automaticamente, apenas alerta (exceto se configurado para bloquear em Administração → Automação).\n' +
      'Para liberar crédito: registre os recebimentos de faturas pendentes do cliente.',
    tags: ['limite credito', 'cliente', 'credito', 'bloqueio', 'cobranca', 'financeiro'],
  },
  {
    topic: 'faq-geral',
    category: 'suporte',
    title: 'Diferença entre FCL e LCL — tipos de carga no HiperTMS',
    content:
      'FCL (Full Container Load / Carga Fechada): o cliente contrata um veículo completo, independente do peso/volume da carga. O preço é por tipo de veículo e rota. Ideal para cargas grandes ou quando o cliente precisa de exclusividade no veículo.\n\n' +
      'LCL (Less Container Load / Carga Fracionada): a carga do cliente divide o veículo com outras cargas. O preço é calculado por peso, cubagem ou volume. Ideal para cargas menores ou quando o cliente não precisa do veículo completo.\n\n' +
      'No HiperTMS: ao criar uma cotação ou embarque, selecione o tipo de operação (FCL ou LCL) — isso determina qual tabela de precificação será usada.',
    tags: ['fcl', 'lcl', 'carga fechada', 'carga fracionada', 'tipo operacao', 'precificacao'],
  },
  {
    topic: 'faq-geral',
    category: 'suporte',
    title: 'Como consultar o histórico de atividades e auditoria',
    content:
      'O HiperTMS registra todas as ações dos usuários automaticamente.\n' +
      'Para consultar:\n' +
      '1. Acesse Equipes → Atividades.\n' +
      '2. Use os filtros de data, usuário e tipo de ação para encontrar ações específicas.\n' +
      '3. O histórico mostra: quem fez, o quê e quando.\n' +
      'O log de atividades é útil para:\n' +
      '- Auditoria interna (quem alterou um valor, quem cancelou um documento).\n' +
      '- Identificar ações realizadas por erro.\n' +
      '- Acompanhar a produtividade da equipe.',
    tags: ['historico', 'auditoria', 'atividades', 'log', 'quem fez', 'rastreabilidade'],
  },
  {
    topic: 'faq-geral',
    category: 'suporte',
    title: 'O sistema está lento ou dando erro — o que fazer',
    content:
      'Passos para diagnosticar lentidão ou erros no sistema:\n' +
      '1. Atualize a página (F5 ou Ctrl+R) — o problema pode ser pontual.\n' +
      '2. Tente em outro navegador (Chrome, Edge, Firefox).\n' +
      '3. Limpe o cache do navegador (Ctrl+Shift+Delete).\n' +
      '4. Verifique sua conexão com a internet.\n' +
      '5. Se o erro persistir: anote o código de erro exibido (ex: 500, 503) e entre em contato com o suporte informando:\n' +
      '   - O que você estava fazendo.\n' +
      '   - O código ou mensagem de erro.\n' +
      '   - Horário da ocorrência.\n' +
      'Erros 500/502/503 indicam problema no servidor — o suporte deve ser acionado com prioridade.',
    tags: ['lento', 'erro', 'sistema', '500', '503', 'cache', 'navegador', 'suporte tecnico'],
  },
  {
    topic: 'faq-geral',
    category: 'suporte',
    title: 'Como alterar o plano de assinatura',
    content:
      'Para alterar o plano (upgrade ou downgrade):\n' +
      '1. Acesse Administração → Assinatura e Cobrança.\n' +
      '2. Veja o plano atual e as opções disponíveis.\n' +
      '3. Clique em "Alterar Plano" e selecione o novo plano.\n' +
      '4. Confirme as mudanças.\n' +
      'Upgrades: ativados imediatamente, com cobrança proporcional ao período restante.\n' +
      'Downgrades: aplicados no próximo ciclo de cobrança.\n' +
      'Planos disponíveis:\n' +
      '- Básico: R$89/mês — 5 usuários\n' +
      '- Essencial: R$199/mês — 8 usuários\n' +
      '- Profissional: R$299/mês — 15 usuários + suporte prioritário',
    tags: ['plano', 'assinatura', 'upgrade', 'downgrade', 'cobranca', 'mudar plano'],
  },

  // ─── CT-e RELATÓRIOS E CONSULTA ─────────────────────────────────────────────

  {
    topic: 'cte-rejeicao',
    category: 'suporte',
    title: 'Como visualizar todos os CT-e emitidos — lista e filtros',
    content:
      'Para consultar todos os CT-e da sua operação:\n' +
      '1. Acesse Operação → CT-e.\n' +
      '2. A lista exibe todos os CT-e com: número, tomador, valor, data de emissão e situação fiscal.\n' +
      'Status disponíveis para filtrar:\n' +
      '• Autorizado — emitido e validado pela SEFAZ\n' +
      '• Cancelado — cancelamento autorizado\n' +
      '• Denegado — emissão negada pela SEFAZ\n' +
      '• Em processamento — aguardando retorno da SEFAZ\n' +
      'Para ver apenas um tipo: use o filtro de situação fiscal no topo da lista.\n' +
      'Para buscar por período: use o filtro de data de emissão.\n' +
      'Para ver os detalhes de um CT-e: clique no registro — abre o DANFE resumido e os dados completos.',
    tags: ['cte', 'relatorio', 'lista', 'consultar', 'todos cte', 'emitidos', 'filtro', 'status', 'periodo', 'operacao'],
  },
  {
    topic: 'cte-rejeicao',
    category: 'suporte',
    title: 'Como baixar o DACTE (PDF do CT-e autorizado)',
    content:
      'O DACTE é o documento impresso do CT-e, necessário para acompanhar a carga.\n' +
      'Para baixar:\n' +
      '1. Acesse Operação → CT-e.\n' +
      '2. Localize o CT-e desejado (status deve ser "Autorizado").\n' +
      '3. Clique no CT-e para abrir os detalhes.\n' +
      '4. Clique em Download DACTE.\n' +
      'O PDF será gerado e baixado automaticamente.\n' +
      'Atenção: só é possível baixar o DACTE de CT-e com status "Autorizado". CT-e cancelado, denegado ou em processamento não geram DACTE.',
    tags: ['dacte', 'pdf', 'cte', 'imprimir', 'download', 'documento impresso', 'autorizado'],
  },

  // ─── GAPS DOS MANUAIS ATUALIZADOS (jun/2026) ────────────────────────────────

  {
    topic: 'operacao-problemas',
    category: 'suporte',
    title: 'Como reorganizar a sequência de paradas de uma viagem',
    content:
      'O HiperTMS permite reorganizar a ordem de coletas e entregas de uma viagem em andamento.\n' +
      'Acesse Operação → Gestão de Paradas.\n' +
      'A tela exibe a sequência atual de todas as paradas das viagens ativas.\n' +
      'Para reorganizar: arraste e solte as paradas na nova ordem desejada.\n' +
      'Também é possível:\n' +
      '• Registrar confirmação de coleta ou entrega em cada parada.\n' +
      '• Adicionar observações operacionais por ponto de rota.\n' +
      'Atenção: reorganizar paradas não altera os documentos fiscais já emitidos (CT-e/MDF-e).',
    tags: ['paradas', 'sequencia entrega', 'reorganizar', 'coleta', 'entrega', 'rota', 'gestao paradas', 'viagem'],
  },
  {
    topic: 'precificacao-erros',
    category: 'suporte',
    title: 'Regimes Tributários — como configurar os impostos do frete',
    content:
      'Os Regimes Tributários definem os impostos que incidem sobre cada operação de frete (ISS, PIS, COFINS, IR, CSLL).\n' +
      'Acesso restrito a administradores: Precificação → Regimes Tributários.\n' +
      'Problemas comuns:\n' +
      '• Frete com imposto zerado: verifique se existe um regime tributário ativo.\n' +
      '• Alíquota errada: abra o regime e atualize as alíquotas conforme legislação vigente.\n' +
      '• Frete com custo fiscal diferente do esperado: confira se o regime correto está vinculado à tabela de frete usada.\n' +
      'Dica: mantenha as alíquotas sempre atualizadas — mudanças na legislação exigem atualização manual aqui.',
    tags: ['regime tributario', 'imposto', 'iss', 'pis', 'cofins', 'ir', 'csll', 'fiscal', 'aliquota', 'precificacao'],
  },
  {
    topic: 'financeiro-problemas',
    category: 'suporte',
    title: 'Conta a pagar criada mas não aparece para pagamento — fluxo de aprovação',
    content:
      'Contas a pagar no HiperTMS passam por um fluxo de aprovação antes de ficarem disponíveis para pagamento.\n' +
      'Se a conta foi criada mas não aparece na lista de pagamento, verifique:\n' +
      '1. Status da conta: deve estar "Pendente" (aprovada). Se estiver em rascunho ou aguardando aprovação, um usuário com permissão precisa aprová-la.\n' +
      '2. Filtros ativos: remova todos os filtros na lista de Contas a Pagar para localizar a conta.\n' +
      '3. Conta cancelada: verifique se não foi cancelada acidentalmente.\n' +
      'Para aprovar uma conta: Financeiro → Contas a Pagar → localizar a conta → clique em Aprovar.\n' +
      'Apenas usuários com permissão de aprovação financeira podem executar esta etapa.',
    tags: ['conta pagar', 'aprovacao', 'nao aparece', 'financeiro', 'pendente', 'fluxo aprovacao', 'pagamento'],
  },
  {
    topic: 'frota-problemas',
    category: 'suporte',
    title: 'Margem da viagem está errada — como configurar o preço de referência de combustível',
    content:
      'O custo de combustível nas viagens é calculado com base no Preço de Referência cadastrado no sistema.\n' +
      'Se a margem ou o custo da viagem está incorreto, verifique e atualize o preço de referência:\n' +
      '1. Acesse Frota → Preço de Referência.\n' +
      '2. Informe o preço atual por litro de cada tipo de combustível (diesel, gasolina, arla, etc.).\n' +
      '3. Salve — o novo valor será usado nos cálculos de custo das próximas viagens.\n' +
      'Dica: atualize o preço de referência sempre que houver variação significativa no preço do combustível para manter os cálculos de margem precisos.',
    tags: ['combustivel', 'preco referencia', 'margem viagem', 'custo viagem', 'diesel', 'frota', 'calculo custo'],
  },
  {
    topic: 'precificacao-erros',
    category: 'suporte',
    title: 'Serviço adicional cobrado automaticamente no frete — como revisar',
    content:
      'O HiperTMS pode incluir serviços adicionais automaticamente nas cotações (ex: pedágio, seguro, coleta expressa).\n' +
      'Se o cliente questionar uma cobrança extra no frete:\n' +
      '1. Abra a cotação ou embarque e clique em "Ver detalhamento do cálculo".\n' +
      '2. Identifique os serviços adicionais listados e seus valores.\n' +
      '3. Para remover um serviço de uma cotação específica: edite a cotação e desmarque o serviço.\n' +
      '4. Para desativar o serviço permanentemente: Precificação → Serviços Adicionais → desativar o serviço.\n' +
      'Atenção: apenas administradores podem desativar serviços adicionais globalmente.',
    tags: ['servico adicional', 'cobranca extra', 'frete', 'pedagio', 'seguro', 'cotacao', 'detalhamento calculo'],
  },
  {
    topic: 'acesso-login',
    category: 'suporte',
    title: 'Perfis de acesso — referência de permissões por perfil',
    content:
      'O HiperTMS possui perfis de acesso pré-definidos que controlam o que cada usuário pode ver e fazer.\n' +
      'Para consultar os perfis disponíveis: Administração → Perfis de Acesso (referência).\n' +
      'Perfis típicos:\n' +
      '• Administrador: acesso total, incluindo configurações fiscais, usuários e assinatura.\n' +
      '• Operacional: acesso a embarques, viagens, CT-e e MDF-e. Sem acesso financeiro ou administrativo.\n' +
      '• Comercial: acesso a cotações, clientes e oportunidades. Sem acesso operacional ou financeiro.\n' +
      '• Financeiro: acesso a contas, faturas e relatórios. Sem acesso a configurações.\n' +
      'Para ajustar permissões individuais além do perfil padrão: Administração → Usuários → Editar → aba Permissões.\n' +
      'Apenas administradores podem alterar perfis e permissões.',
    tags: ['perfil acesso', 'role', 'permissao', 'administrador', 'operacional', 'comercial', 'financeiro', 'usuario'],
  },
  {
    topic: 'financeiro-problemas',
    category: 'suporte',
    title: 'Fatura com status "Paga Parcialmente" — como registrar o restante',
    content:
      'O status "Paga Parcialmente" aparece quando o cliente pagou menos do que o valor total da fatura.\n' +
      'Para registrar o pagamento restante:\n' +
      '1. Acesse Financeiro → Faturas (tomador).\n' +
      '2. Localize a fatura com status "Paga Parcialmente".\n' +
      '3. Clique em Registrar Recebimento.\n' +
      '4. Informe o valor recebido (pode ser o saldo restante ou um valor parcial novamente).\n' +
      '5. Confirme a data e a conta bancária de destino.\n' +
      'Quando o valor total for registrado, o status muda automaticamente para "Paga".\n' +
      'Se houve desconto ou juros no recebimento, informe a diferença no campo correspondente.',
    tags: ['fatura parcialmente paga', 'paga parcialmente', 'recebimento parcial', 'fatura', 'financeiro', 'registrar pagamento'],
  },
  {
    topic: 'frota-problemas',
    category: 'suporte',
    title: 'Como programar revisão preventiva de veículo',
    content:
      'O HiperTMS permite programar revisões preventivas por quilometragem ou intervalo de tempo.\n' +
      'Para configurar:\n' +
      '1. Acesse Frota → Veículos.\n' +
      '2. Abra o cadastro do veículo desejado.\n' +
      '3. Acesse a aba Revisões.\n' +
      '4. Clique em Nova Revisão Preventiva e defina:\n' +
      '   • Tipo de revisão (troca de óleo, pneus, revisão geral, etc.)\n' +
      '   • Critério: por quilometragem (ex: a cada 10.000 km) ou por tempo (ex: a cada 3 meses).\n' +
      '5. O sistema alertará quando o vencimento se aproximar.\n' +
      'Para executar a revisão quando chegar o prazo: crie uma Ordem de Manutenção em Frota → Manutenções.',
    tags: ['revisao preventiva', 'manutencao preventiva', 'quilometragem', 'vencimento', 'frota', 'veiculo', 'alerta manutencao'],
  },
];
