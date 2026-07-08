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
    title: 'Como visualizar e exportar relatório de CT-e emitidos',
    content:
      'Para consultar e exportar os CT-e da sua operação:\n' +
      '1. Acesse Operação → CT-e.\n' +
      '2. A lista exibe todos os CT-e com: número, tomador, valor, data de emissão e situação fiscal.\n' +
      'Filtros disponíveis:\n' +
      '• Status: Autorizado | Cancelado | Denegado | Em processamento\n' +
      '• Período: use os presets "Hoje", "Esta semana", "Este mês" ou informe intervalo personalizado (De / Até)\n' +
      '• Tomador: busca por razão social ou CNPJ\n' +
      'Para exportar (relatório CSV):\n' +
      '1. Aplique os filtros desejados (período, status, tomador).\n' +
      '2. Clique no botão "Exportar CSV" no topo da lista.\n' +
      '3. O arquivo gerado contém apenas os CT-e filtrados.\n' +
      'Para ver os detalhes de um CT-e específico: clique na linha — abre painel lateral com dados principais e ações.\n' +
      'Para abrir o DANFE sem sair da lista: clique no expansor na linha do CT-e.',
    tags: ['cte', 'relatorio cte', 'exportar csv', 'lista cte', 'consultar', 'todos cte', 'emitidos', 'filtro', 'periodo', 'operacao', 'relatorio', 'exportar'],
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

  // ══════════════════════════════════════════════════════════
  // FINANCEIRO — COBRANÇA E FATURA (ASAAS)
  // ══════════════════════════════════════════════════════════
  {
    topic: 'financeiro-problemas',
    category: 'suporte',
    title: 'Como emitir boleto bancário para o cliente',
    content:
      'O HiperTMS integra com a plataforma Asaas para emissão de boletos registrados.\n' +
      'Pré-requisito: a integração com o Asaas deve estar configurada em Administração → Dados da Empresa → aba Integrações. Sem isso o botão ficará inativo.\n' +
      'Passo a passo:\n' +
      '1. Acesse Financeiro → Faturas (tomador).\n' +
      '2. Abra a fatura desejada.\n' +
      '3. Clique na aba "Cobrança".\n' +
      '4. Clique em "Emitir Boleto".\n' +
      '5. Confirme o vencimento e clique em emitir.\n' +
      'O sistema retorna a linha digitável, código de barras e PDF do boleto prontos para envio ao cliente.\n' +
      'O status da fatura muda automaticamente para "Em cobrança".',
    tags: ['boleto', 'emitir boleto', 'cobrança', 'asaas', 'fatura', 'cliente', 'pagamento', 'boleto bancario'],
  },
  {
    topic: 'financeiro-problemas',
    category: 'suporte',
    title: 'Como gerar cobrança PIX para o cliente',
    content:
      'O HiperTMS gera cobranças PIX via Asaas com QR Code e código Copia e Cola.\n' +
      'Pré-requisito: integração Asaas configurada em Administração → Dados da Empresa → aba Integrações.\n' +
      'Passo a passo:\n' +
      '1. Acesse Financeiro → Faturas (tomador).\n' +
      '2. Abra a fatura desejada.\n' +
      '3. Clique na aba "Cobrança".\n' +
      '4. Clique em "Gerar PIX".\n' +
      '5. O QR Code e o código Copia e Cola são gerados imediatamente.\n' +
      'Quando o pagamento é confirmado no Asaas, o status da fatura atualiza automaticamente para "Paga" — sem intervenção manual.',
    tags: ['pix', 'qr code', 'copia cola', 'cobrança pix', 'asaas', 'fatura', 'pagamento instantaneo', 'cliente'],
  },
  {
    topic: 'financeiro-problemas',
    category: 'suporte',
    title: 'Como registrar recebimento por TED, depósito ou dinheiro',
    content:
      'Para pagamentos recebidos fora da plataforma (TED, depósito bancário, dinheiro):\n' +
      '1. Acesse Financeiro → Faturas (tomador).\n' +
      '2. Abra a fatura correspondente.\n' +
      '3. Clique em "Registrar Pagamento".\n' +
      '4. Informe: data do recebimento, valor, banco de origem e observações (opcional).\n' +
      '5. Confirme — o status da fatura muda para "Paga" e um lançamento é gerado no contas a receber.\n' +
      'Se houver desconto ou juros, informe a diferença no campo correspondente.',
    tags: ['ted', 'deposito', 'dinheiro', 'registrar pagamento', 'recebimento manual', 'fatura', 'financeiro'],
  },
  {
    topic: 'financeiro-problemas',
    category: 'suporte',
    title: 'Ciclo de vida da fatura — entendendo os 9 status possíveis',
    content:
      'Uma fatura no HiperTMS pode passar por até 9 status ao longo da sua vida:\n' +
      '1. Rascunho — criada mas não enviada ao cliente.\n' +
      '2. Emitida — enviada ao cliente, aguardando pagamento.\n' +
      '3. Visualizada — o cliente abriu a fatura (rastreio de leitura).\n' +
      '4. Vencida — data de vencimento ultrapassada sem pagamento registrado.\n' +
      '5. Em cobrança — boleto ou PIX emitidos via Asaas.\n' +
      '6. Paga parcialmente — valor parcial recebido.\n' +
      '7. Paga — valor total quitado.\n' +
      '8. Cancelada — fatura cancelada.\n' +
      '9. Contestada — cliente abriu disputa sobre o valor.\n' +
      'Todas as transições ficam registradas no histórico de auditoria com o usuário responsável e horário.',
    tags: ['status fatura', 'ciclo vida fatura', 'fatura vencida', 'fatura paga', 'em cobrança', 'contestada', 'financeiro'],
  },
  {
    topic: 'financeiro-problemas',
    category: 'suporte',
    title: 'Como parcelar uma fatura em até 36 vezes',
    content:
      'O HiperTMS permite parcelamento de faturas de 1 a 36 vezes.\n' +
      'Para configurar o parcelamento:\n' +
      '1. Acesse Financeiro → Faturas (tomador).\n' +
      '2. Ao criar ou editar uma fatura, localize a seção "Parcelamento".\n' +
      '3. Informe a quantidade de parcelas (1 a 36).\n' +
      '4. O sistema calcula automaticamente as datas de vencimento e os valores de cada parcela.\n' +
      'Cada parcela gera uma entrada separada no contas a receber.\n' +
      'Boleto ou PIX podem ser emitidos individualmente para cada parcela na aba "Cobrança" da parcela.',
    tags: ['parcelar', 'parcelas', 'parcelamento', 'fatura parcelada', '36 vezes', 'financeiro', 'recebivel'],
  },

  // ══════════════════════════════════════════════════════════
  // FINANCEIRO — DRE E ORÇAMENTO
  // ══════════════════════════════════════════════════════════
  {
    topic: 'financeiro-problemas',
    category: 'suporte',
    title: 'Como consultar o DRE (Demonstrativo de Resultado do Exercício)',
    content:
      'Caminho: Financeiro → DRE.\n' +
      'O DRE consolida todas as receitas e despesas do período em um demonstrativo estruturado:\n' +
      '• Receitas brutas → Deduções → Receita líquida\n' +
      '• Custos operacionais (combustível, manutenção, motoristas, pedágios)\n' +
      '• Despesas administrativas\n' +
      '• EBITDA\n' +
      '• Resultado líquido (lucro ou prejuízo)\n' +
      'Filtros disponíveis: período (mês, trimestre ou ano livre), centro de custo, comparativo com período anterior.\n' +
      'O comparativo exibe a variação percentual entre os dois períodos lado a lado.',
    tags: ['dre', 'demonstrativo resultado', 'lucro', 'prejuizo', 'ebitda', 'financeiro', 'relatorio financeiro', 'resultado'],
  },
  {
    topic: 'financeiro-problemas',
    category: 'suporte',
    title: 'Como definir o orçamento anual e usar a sugestão automática',
    content:
      'Caminho: Financeiro → Orçamento.\n' +
      'Para definir o orçamento:\n' +
      '1. Acesse Financeiro → Orçamento.\n' +
      '2. Clique em "Calcular sugestão" para que o sistema analise os últimos 12 meses e proponha valores por categoria automaticamente.\n' +
      '3. Revise a sugestão, ajuste categoria a categoria se necessário e clique em Salvar.\n' +
      'Com o orçamento configurado, o sistema compara os valores realizados com os planejados em tempo real, sinalizando desvios.\n' +
      'Dica: refaça a sugestão no início de cada ano ou quando houver mudança significativa na operação.',
    tags: ['orcamento', 'budget', 'sugestao automatica', 'meta receita', 'limite despesa', 'financeiro', 'planejamento'],
  },

  // ══════════════════════════════════════════════════════════
  // OPERAÇÃO — GNRE E NFS-e
  // ══════════════════════════════════════════════════════════
  {
    topic: 'operacao-problemas',
    category: 'suporte',
    title: 'GNRE — como gerar e registrar pagamento',
    content:
      'Caminho: Operação → GNRE.\n' +
      'A GNRE (Guia Nacional de Recolhimento de Tributos Estaduais) é obrigatória em operações interestaduais onde o destinatário está em UF diferente do emitente e não é contribuinte do ICMS.\n' +
      'Para gerar uma GNRE:\n' +
      '1. Acesse Operação → GNRE.\n' +
      '2. Clique em "Gerar GNRE".\n' +
      '3. Vincule ao CT-e correspondente — o sistema preenche automaticamente código da receita, valor do ICMS e vencimento.\n' +
      '4. Baixe o PDF para pagamento na rede bancária ou via PIX.\n' +
      'Para registrar o pagamento: abra a GNRE e clique em "Registrar Pagamento" após quitação.\n' +
      'Status disponíveis: Pendente, Paga, Cancelada.',
    tags: ['gnre', 'guia recolhimento', 'icms interestadual', 'uf destino', 'operacao', 'fiscal', 'tributario'],
  },
  {
    topic: 'operacao-problemas',
    category: 'suporte',
    title: 'NFS-e — como emitir e cancelar nota fiscal de serviço',
    content:
      'Caminho: Operação → NFS-e.\n' +
      'Utilizado por transportadoras que prestam serviços sujeitos a ISS (imposto municipal).\n' +
      'Para emitir uma NFS-e:\n' +
      '1. Acesse Operação → NFS-e.\n' +
      '2. Clique em "Emitir NFS-e".\n' +
      '3. Preencha: tomador, descrição do serviço, valor, alíquota ISS e código do serviço municipal.\n' +
      '4. Confirme — o documento é enviado à prefeitura do município configurado na empresa.\n' +
      'Para cancelar: acesse Operação → NFS-e → ações → Cancelar. Informe a justificativa obrigatória.\n' +
      'Atenção: verifique o prazo de cancelamento permitido pelo município antes de prosseguir.\n' +
      'PDF e XML ficam disponíveis para download após autorização.',
    tags: ['nfse', 'nota fiscal servico', 'iss', 'imposto municipal', 'nfs-e', 'emitir', 'cancelar', 'prefeitura'],
  },
  {
    topic: 'cte-rejeicao',
    category: 'suporte',
    title: 'Como reemitir um CT-e rejeitado ou com erro',
    content:
      'Para CT-e com status Rejeitado ou Erro:\n' +
      '1. Acesse Operação → CT-e.\n' +
      '2. Localize o CT-e com status Rejeitado ou Erro.\n' +
      '3. Clique no menu ⋮ (três pontos) e selecione "Reemitir".\n' +
      '4. O sistema reabre o formulário com os dados originais pré-preenchidos.\n' +
      '5. Corrija as informações que causaram a rejeição (verifique o código de erro para saber o que corrigir).\n' +
      '6. Clique em emitir para reenviar à SEFAZ.\n' +
      'Se o status não atualizou após a emissão: use a opção "Atualizar status" no menu ⋮ para consultar o retorno da SEFAZ.',
    tags: ['reemitir cte', 'cte rejeitado', 'cte erro', 'reenviar sefaz', 'corrigir cte', 'operacao', 'fiscal'],
  },

  // ══════════════════════════════════════════════════════════
  // FROTA — OCORRÊNCIAS, FIPE E MANUTENÇÃO
  // ══════════════════════════════════════════════════════════
  {
    topic: 'frota-problemas',
    category: 'suporte',
    title: 'Como registrar uma ocorrência de motorista (infração, acidente, advertência)',
    content:
      'Caminho: Frota → Motoristas → detalhe do motorista → aba "Ocorrências".\n' +
      'Para registrar uma ocorrência:\n' +
      '1. Acesse Frota → Motoristas e abra o cadastro do motorista.\n' +
      '2. Clique na aba "Ocorrências".\n' +
      '3. Clique em "Nova Ocorrência".\n' +
      '4. Preencha:\n' +
      '   • Tipo: infração, acidente, advertência ou elogio\n' +
      '   • Data e descrição detalhada\n' +
      '   • Gravidade: leve, média ou grave\n' +
      '   • Documentos comprobatórios (foto, boletim, etc.)\n' +
      '5. Salve — a ocorrência fica no histórico permanente do motorista.\n' +
      'Atenção: ocorrências graves podem impactar a elegibilidade do motorista para determinadas rotas.',
    tags: ['ocorrencia motorista', 'infracao', 'acidente', 'advertencia', 'historico motorista', 'frota', 'motorista'],
  },
  {
    topic: 'frota-problemas',
    category: 'suporte',
    title: 'Consulta FIPE automática ao cadastrar veículo',
    content:
      'Ao cadastrar ou editar um veículo, o HiperTMS consulta automaticamente a Tabela FIPE.\n' +
      'Como funciona:\n' +
      '1. Acesse Frota → Veículos → criar ou editar veículo.\n' +
      '2. Preencha marca, modelo e ano do veículo.\n' +
      '3. O campo "Valor FIPE" é preenchido automaticamente com o valor de referência.\n' +
      '4. O valor pode ser usado para cálculo de seguro e depreciação.\n' +
      'Dica: atualize o valor FIPE periodicamente (recomendado mensalmente) para manter os cálculos de custo de capital atualizados.\n' +
      'Se o valor FIPE não carregou: verifique se marca/modelo/ano estão corretos e salve novamente.',
    tags: ['fipe', 'tabela fipe', 'valor veiculo', 'seguro', 'depreciacao', 'frota', 'veiculo', 'cadastro veiculo'],
  },
  {
    topic: 'frota-problemas',
    category: 'suporte',
    title: 'Status do ciclo de vida de uma manutenção',
    content:
      'Uma ordem de manutenção no HiperTMS percorre os seguintes status:\n' +
      '• Agendada — manutenção programada para data futura.\n' +
      '• Em execução — veículo na oficina, manutenção iniciada.\n' +
      '• Aguardando peças — execução pausada por falta de peça.\n' +
      '• Concluída — finalizada, veículo liberado e status muda para Disponível.\n' +
      '• Cancelada — cancelada antes da execução.\n' +
      'Para abrir as peças e serviços de uma manutenção: edite a ordem e acesse a aba "Peças e serviços".\n' +
      'Para anexar notas fiscais e laudos: acesse a aba "Anexos" na edição da manutenção.',
    tags: ['manutencao status', 'ordem manutencao', 'aguardando pecas', 'em execucao', 'manutencao concluida', 'frota', 'veiculo'],
  },

  // ══════════════════════════════════════════════════════════
  // VENDAS — COTAÇÕES E EMBARQUES
  // ══════════════════════════════════════════════════════════
  {
    topic: 'operacao-problemas',
    category: 'suporte',
    title: 'Como revalidar uma cotação vencida',
    content:
      'Cotações têm prazo de validade. Quando expiram, não podem ser convertidas em embarque sem revalidação.\n' +
      'Para revalidar:\n' +
      '1. Acesse Vendas → Cotações.\n' +
      '2. Localize a cotação com status "Vencida".\n' +
      '3. Abra o detalhe da cotação.\n' +
      '4. Clique no botão "Revalidar".\n' +
      'A validade é estendida por mais 15 dias sem necessidade de recriar o orçamento.\n' +
      'Útil para clientes que voltam depois do prazo original.',
    tags: ['cotacao vencida', 'revalidar', 'validade cotacao', 'cotacao expirada', 'vendas', 'cotacao'],
  },
  {
    topic: 'operacao-problemas',
    category: 'suporte',
    title: 'Como importar XML de NF-e do cliente no embarque',
    content:
      'O HiperTMS permite importar o XML da Nota Fiscal Eletrônica do cliente para pré-preencher os dados do embarque.\n' +
      'Dois caminhos:\n' +
      'Opção 1 — direto no embarque:\n' +
      '1. Acesse Vendas → Embarques → botão "Importar XML NF-e".\n' +
      '2. Faça upload do arquivo XML.\n' +
      '3. Os dados de remetente, destinatário, produtos, peso e valor são preenchidos automaticamente.\n' +
      'Opção 2 — via menu NFe XML:\n' +
      '1. Acesse Vendas → NFe XML e importe o XML.\n' +
      '2. Selecione a nota importada e clique em "Criar Embarque".\n' +
      'Ao importar múltiplos XMLs com mesma origem e destino, o sistema sugere consolidar em um único embarque.',
    tags: ['xml nfe', 'importar xml', 'nota fiscal', 'nf-e', 'embarque', 'vendas', 'remetente destinatario'],
  },

  // ══════════════════════════════════════════════════════════
  // PRECIFICAÇÃO — REAJUSTE E CONTRATOS
  // ══════════════════════════════════════════════════════════
  {
    topic: 'precificacao-erros',
    category: 'suporte',
    title: 'Como reajustar percentualmente uma tabela de preços',
    content:
      'Caminho: Precificação → Tabelas → ações da tabela → Reajustar preços.\n' +
      'O reajuste percentual aplica um aumento ou desconto sobre todos os valores de uma tabela de uma só vez.\n' +
      'Passo a passo:\n' +
      '1. Acesse Precificação → Tabelas de Frete.\n' +
      '2. Localize a tabela desejada e clique em "Reajustar preços".\n' +
      '3. Informe o percentual (positivo para aumento, negativo para desconto).\n' +
      '4. O sistema exibe um preview com os valores antigos e novos lado a lado antes de confirmar.\n' +
      '5. Revise e clique em Salvar.\n' +
      'Útil para repassar variações de combustível e pedágio sem editar cada valor manualmente.',
    tags: ['reajuste tabela', 'reajuste percentual', 'aumentar preco', 'tabela frete', 'precificacao', 'preview reajuste'],
  },
  {
    topic: 'precificacao-erros',
    category: 'suporte',
    title: 'Tipos de regra disponíveis em contratos comerciais',
    content:
      'Caminho: Precificação → Contratos Comerciais → criar contrato → seção "Regras".\n' +
      'Os contratos suportam 5 tipos de regra:\n' +
      '1. Tabela fixa — aplica uma tabela de preços específica para o cliente.\n' +
      '2. Desconto percentual — desconto calculado sobre a tabela padrão.\n' +
      '3. Frete mínimo — valor mínimo garantido por embarque.\n' +
      '4. Ad valorem — percentual calculado sobre o valor declarado da mercadoria.\n' +
      '5. Combinada — combina múltiplas regras com ordem de prioridade definida.\n' +
      'Atenção: apenas contratos com status ATIVO são aplicados automaticamente nas cotações.\n' +
      'Fluxo de status: Rascunho → Em análise → Aprovado → Ativo → Suspenso → Encerrado.',
    tags: ['contrato comercial', 'regra contrato', 'tabela fixa', 'desconto percentual', 'ad valorem', 'frete minimo', 'precificacao'],
  },
  {
    topic: 'precificacao-erros',
    category: 'suporte',
    title: 'CBS e IBS — reforma tributária no HiperTMS',
    content:
      'O HiperTMS contempla os novos tributos da reforma tributária brasileira:\n' +
      '• CBS — Contribuição sobre Bens e Serviços (federal)\n' +
      '• IBS — Imposto sobre Bens e Serviços (estadual/municipal)\n' +
      'Caminho para configurar: Precificação → Configurações → aba "Tributação".\n' +
      'Informe as alíquotas correspondentes para que sejam aplicadas automaticamente nos cálculos de precificação conforme as novas regras entrarem em vigor.\n' +
      'Dica: consulte o contador da empresa para obter as alíquotas vigentes de CBS e IBS aplicáveis ao regime tributário.',
    tags: ['cbs', 'ibs', 'reforma tributaria', 'tributacao', 'aliquota', 'precificacao', 'imposto', 'fiscal'],
  },

  // ══════════════════════════════════════════════════════════
  // CADASTROS — EMPRESAS E ENDEREÇOS
  // ══════════════════════════════════════════════════════════
  {
    topic: 'cadastro-problemas',
    category: 'suporte',
    title: 'Como cadastrar múltiplos endereços para uma empresa',
    content:
      'No HiperTMS cada empresa pode ter múltiplos endereços cadastrados (matriz, filiais, centros de distribuição).\n' +
      'Para adicionar um endereço:\n' +
      '1. Acesse Cadastros → Empresas (ou Clientes).\n' +
      '2. Abra o cadastro da empresa desejada.\n' +
      '3. Acesse a aba "Endereços".\n' +
      '4. Clique em "Adicionar Endereço" e preencha o endereço completo com CEP.\n' +
      'Ao criar embarques, o usuário escolhe qual endereço usar como origem ou destino.\n' +
      'Dica: mantenha os endereços com CEP completo para garantir a correta geração de documentos fiscais.',
    tags: ['multiplos enderecos', 'filial', 'endereço empresa', 'matriz', 'cadastros', 'empresa', 'origem destino'],
  },
  {
    topic: 'cadastro-problemas',
    category: 'suporte',
    title: 'Como importar empresas em lote (CSV) com validação de CNPJ',
    content:
      'Caminho: Cadastros → Empresas → botão "Importar".\n' +
      'Para importar múltiplas empresas de uma vez:\n' +
      '1. Acesse Cadastros → Empresas e clique em "Importar".\n' +
      '2. Baixe o modelo de importação disponível na tela.\n' +
      '3. Preencha o arquivo com os dados das empresas.\n' +
      '4. Faça o upload — o sistema valida automaticamente o CNPJ/CPF de cada linha.\n' +
      '5. Documentos inválidos são sinalizados; linhas válidas são importadas mesmo que outras tenham erros.\n' +
      'Dica: sempre use o modelo oficial para garantir que o arquivo esteja no formato correto.',
    tags: ['importar empresas', 'importacao lote', 'csv', 'cnpj', 'cadastros', 'empresa', 'bulk import', 'planilha'],
  },

  // ══════════════════════════════════════════════════════════
  // ADMINISTRAÇÃO — CERTIFICADO, PERMISSÕES E AUTOMAÇÃO
  // ══════════════════════════════════════════════════════════
  {
    topic: 'acesso-login',
    category: 'suporte',
    title: 'Como fazer upload do certificado digital A1 para emissão fiscal',
    content:
      'Caminho: Administração → Dados da Empresa → aba "Certificado Digital".\n' +
      'Para instalar ou renovar o certificado digital:\n' +
      '1. Acesse Administração → Dados da Empresa.\n' +
      '2. Clique na aba "Certificado Digital".\n' +
      '3. Faça o upload do arquivo .pfx ou .p12.\n' +
      '4. Informe a senha do certificado.\n' +
      '5. Salve — o certificado será usado para assinar CT-e, MDF-e e NFS-e.\n' +
      'O sistema emite um alerta 30 dias antes do vencimento.\n' +
      'Atenção: nunca compartilhe a senha do certificado. Ele é armazenado de forma segura e criptografada.',
    tags: ['certificado digital', 'a1', 'pfx', 'p12', 'certificado vencido', 'administracao', 'fiscal', 'upload certificado'],
  },
  {
    topic: 'acesso-login',
    category: 'suporte',
    title: 'Como ver as permissões efetivas de um usuário',
    content:
      'Caminho: Administração → Usuários → detalhe do usuário → aba "Permissões efetivas".\n' +
      'A aba Permissões efetivas exibe as permissões reais do usuário, considerando:\n' +
      '• O papel (role) atribuído ao usuário\n' +
      '• Permissões extras ou restrições individuais aplicadas\n' +
      'Use esta visão para auditar o que um usuário pode ou não fazer — especialmente em situações de troubleshooting de acesso.\n' +
      'Exemplo: se o usuário diz que não consegue acessar um módulo, verifique nesta aba se a permissão está habilitada.\n' +
      'Apenas administradores podem acessar esta tela.',
    tags: ['permissoes efetivas', 'auditoria permissao', 'usuario sem acesso', 'role', 'permissao modulo', 'administracao'],
  },
  {
    topic: 'cadastro-problemas',
    category: 'suporte',
    title: 'Automação no HiperTMS — 3 níveis de complexidade',
    content:
      'Caminho: Administração → Automação.\n' +
      'O módulo de automação suporta 3 níveis:\n' +
      '• L1 — Gatilho simples: uma condição dispara uma ação. Ex: CT-e autorizado → enviar e-mail ao cliente.\n' +
      '• L2 — Gatilho com condições: condição com filtros adicionais dispara uma ou mais ações. Ex: embarque com valor acima de R$ 10.000 → notificar o gerente.\n' +
      '• L3 — Fluxo complexo: sequência de etapas com suporte a aguardar, ramificações e loops para cenários avançados.\n' +
      'Para criar uma automação: Administração → Automação → Nova Automação → selecione o nível e configure o gatilho e as ações.\n' +
      'Apenas administradores podem criar e editar automações.',
    tags: ['automacao', 'gatilho', 'l1 l2 l3', 'workflow', 'notificacao automatica', 'administracao', 'regra automatica'],
  },
  {
    topic: 'acesso-login',
    category: 'suporte',
    title: 'Como configurar alertas automáticos por WhatsApp',
    content:
      'Caminho: Administração → Configurações → aba "Notificações" → WhatsApp.\n' +
      'O HiperTMS pode enviar alertas automáticos via WhatsApp para motoristas e clientes.\n' +
      'Eventos disponíveis: confirmação de coleta, entrega realizada, CT-e emitido, fatura próxima do vencimento, entre outros.\n' +
      'Pré-requisito: a integração com o provedor de WhatsApp Business deve estar configurada em Administração → Dados da Empresa → aba Integrações.\n' +
      'Para ativar:\n' +
      '1. Acesse Administração → Configurações → aba "Notificações".\n' +
      '2. Na seção WhatsApp, ative os eventos desejados.\n' +
      '3. Salve as configurações.\n' +
      'Apenas administradores podem configurar estas notificações.',
    tags: ['whatsapp', 'alerta whatsapp', 'notificacao whatsapp', 'motorista', 'cliente', 'administracao', 'integracao whatsapp'],
  },

  // ══════════════════════════════════════════════════════════
  // COMPRAS — KANBAN E INTEGRAÇÃO FINANCEIRO
  // ══════════════════════════════════════════════════════════
  {
    topic: 'cadastro-problemas',
    category: 'suporte',
    title: 'Visualização kanban no módulo de Compras',
    content:
      'Caminho: Compras → botão de visualização → Board.\n' +
      'A listagem de compras pode ser alternada entre lista e visualização kanban (Board).\n' +
      'No kanban os itens são agrupados por status em colunas. Funcionalidades:\n' +
      '• Arraste e solte um cartão para outra coluna para mudar o status sem abrir o detalhe.\n' +
      '• Passe o mouse sobre um item para ver os botões de ação inline (aprovar, rejeitar, solicitar revisão) sem precisar abrir o registro.\n' +
      '• Útil em reuniões de revisão para visualizar rapidamente o que está pendente, em análise ou aprovado.\n' +
      'A integração com o Financeiro é automática: ao aprovar uma compra para pagamento, o sistema gera automaticamente uma conta a pagar no módulo Financeiro.',
    tags: ['kanban', 'board', 'compras', 'visualizacao', 'solicitacao compra', 'aprovacao compra', 'financeiro compras'],
  },

  // ══════════════════════════════════════════════════════════
  // VENDAS — Cotações, Embarques e Oportunidades
  // ══════════════════════════════════════════════════════════
  {
    topic: 'vendas-cotacoes',
    category: 'suporte',
    title: 'Como exportar cotações para CSV',
    content:
      'Problema: preciso levar a lista de cotações para uma planilha ou análise externa.\n' +
      'Solução:\n' +
      '1. Acesse Vendas → Cotações.\n' +
      '2. Aplique os filtros desejados (data, cliente, status) — a exportação respeita os filtros ativos na tela.\n' +
      '3. Clique no botão "Exportar CSV".\n' +
      '4. O arquivo traz número, cliente, origem, destino, valor, status e data de cada cotação.\n' +
      'Obs: só saem as cotações visíveis conforme o filtro. Para exportar tudo, limpe os filtros antes.',
    tags: ['cotacoes', 'exportar', 'csv', 'vendas', 'planilha', 'relatorio'],
  },
  {
    topic: 'vendas-cotacoes',
    category: 'suporte',
    title: 'Ações em lote: cancelar ou arquivar várias cotações de uma vez',
    content:
      'Problema: preciso cancelar ou arquivar muitas cotações e fazer uma a uma é lento.\n' +
      'Solução:\n' +
      '1. Acesse Vendas → Cotações.\n' +
      '2. Marque o checkbox no início de cada linha desejada.\n' +
      '3. Ao selecionar, aparece a barra de ações em lote.\n' +
      '4. Escolha: Exportar selecionados, Cancelar em lote ou Arquivar em lote.\n' +
      'Obs: cotações arquivadas saem da listagem padrão mas continuam no histórico. Use para limpar cotações antigas sem perder o registro.',
    tags: ['cotacoes', 'acoes em lote', 'cancelar', 'arquivar', 'vendas', 'selecao'],
  },
  {
    topic: 'vendas-cotacoes',
    category: 'suporte',
    title: 'Cotação aprovada não virou embarque',
    content:
      'Problema: o cliente aprovou a cotação mas o embarque não foi criado.\n' +
      'Causa: a conversão em embarque não é automática — é uma ação manual.\n' +
      'Solução:\n' +
      '1. Acesse Vendas → Cotações e abra a cotação com status "Aprovada".\n' +
      '2. Clique em "Converter em Embarque".\n' +
      '3. O sistema cria o embarque com todos os dados já preenchidos (tomador, remetente, destinatário, carga, valor).\n' +
      '4. A cotação passa para o status "Convertida".\n' +
      'Obs: revise os dados antes de confirmar a conversão.',
    tags: ['cotacao', 'converter embarque', 'aprovada', 'convertida', 'vendas'],
  },
  {
    topic: 'vendas-embarques',
    category: 'suporte',
    title: 'Como gerar o e-mail de confirmação de coleta (Booking)',
    content:
      'Problema: preciso avisar o remetente sobre a coleta com os dados da operação.\n' +
      'Solução:\n' +
      '1. Acesse Vendas → Embarques e selecione o embarque.\n' +
      '2. Use a função "Gerar E-mail de Booking" — o sistema monta a mensagem automaticamente com os dados da operação.\n' +
      '3. Copie o texto gerado e envie ao remetente.\n' +
      'Personalização: para ajustar o modelo, acesse Vendas → Modelo de E-mail de Booking.',
    tags: ['booking', 'coleta', 'email', 'embarque', 'confirmacao', 'vendas'],
  },
  {
    topic: 'vendas-embarques',
    category: 'suporte',
    title: 'Emitir CT-e direto a partir do embarque',
    content:
      'Problema: quero emitir o CT-e sem redigitar os dados do embarque.\n' +
      'Solução:\n' +
      '1. Acesse Vendas → Embarques e abra o embarque (deve estar aprovado).\n' +
      '2. Clique no botão "Emitir CT-e".\n' +
      '3. O fluxo de emissão abre pré-preenchido com remetente, destinatário, mercadoria e valor.\n' +
      '4. Revise e confirme o envio à SEFAZ.\n' +
      'Alternativa: também é possível emitir manualmente em Operação → CT-e → "Criar CT-e" quando não houver embarque.',
    tags: ['cte', 'embarque', 'emitir', 'vendas', 'sefaz', 'fiscal'],
  },
  {
    topic: 'vendas-embarques',
    category: 'suporte',
    title: 'Consolidar vários XMLs de NF-e em um único embarque',
    content:
      'Problema: recebi várias notas com mesma origem e destino e quero um único frete.\n' +
      'Solução:\n' +
      '1. Acesse Vendas → NFe XML e importe os XMLs (individual ou em lote).\n' +
      '2. Quando houver NF-e com mesma origem e destino, o sistema sugere consolidar em um único embarque.\n' +
      '3. Aceite a consolidação para reduzir custo de frete e emissão de CT-e.\n' +
      'Obs: a consolidação agrupa as notas; o peso e o valor somados passam a compor um só embarque.',
    tags: ['xml', 'nfe', 'consolidar', 'embarque', 'vendas', 'importacao'],
  },
  {
    topic: 'vendas-embarques',
    category: 'suporte',
    title: 'Operação marcada como Redespacho automaticamente',
    content:
      'Problema: ao importar um XML, o sistema classificou a operação como "Redespacho".\n' +
      'Causa: o CNPJ destinatário do XML é um transportador cadastrado, não o consumidor final. O sistema detecta isso e sinaliza redespacho, ajustando as regras de tributação do CT-e.\n' +
      'O que fazer:\n' +
      '1. Confirme se o destinatário é mesmo um transportador (redespacho legítimo).\n' +
      '2. Se correto, siga a emissão normalmente — a tributação já foi ajustada.\n' +
      '3. Se foi engano no cadastro, corrija o tipo da empresa em Cadastros antes de emitir o CT-e.',
    tags: ['redespacho', 'xml', 'nfe', 'tributacao', 'cte', 'transportador'],
  },
  {
    topic: 'vendas-oportunidades',
    category: 'suporte',
    title: 'Como usar o funil de Oportunidades (SDR)',
    content:
      'Dúvida: onde acompanho a prospecção de novos clientes?\n' +
      'Solução:\n' +
      '1. Acesse Vendas → Oportunidades.\n' +
      '2. Cada oportunidade é uma empresa em potencial e avança pelos estágios: Prospecção, Qualificação, Proposta, Negociação e Ganho/Perdido.\n' +
      '3. Clique em uma oportunidade para registrar atividades, agendar follow-ups e ver o histórico de interações.\n' +
      '4. Mova a oportunidade entre estágios conforme o avanço comercial.\n' +
      'Obs: o histórico de prospecção também aparece na aba SDR do cadastro da empresa (Cadastros → Empresas).',
    tags: ['oportunidades', 'funil', 'sdr', 'prospeccao', 'vendas', 'crm'],
  },

  // ══════════════════════════════════════════════════════════
  // OPERAÇÃO — Cargas, Viagens, CT-e, MDF-e e GNRE
  // ══════════════════════════════════════════════════════════
  {
    topic: 'operacao-cargas',
    category: 'suporte',
    title: 'Como agendar uma carga (programação de cargas)',
    content:
      'Dúvida: como programo os embarques do dia em cargas?\n' +
      'Solução:\n' +
      '1. Acesse Operação → Cargas e clique em "Agendar Carga".\n' +
      '2. O modal é multi-step: passo 1 escolha o Tipo — "Carga própria" (frota da empresa) ou "Terceirizado" (transportadora contratada).\n' +
      '3. Passo 2: informe os embarques a incluir, volumes e peso.\n' +
      '4. Passo 3: atribua o veículo (própria) ou a transportadora (terceirizado).\n' +
      '5. Passo 4: revise o resumo e confirme.\n' +
      'Dica: use a aba "Cargas" com os filtros Tipo de carga e Status para acompanhar cada agendamento.',
    tags: ['cargas', 'agendar carga', 'programacao', 'operacao', 'embarques'],
  },
  {
    topic: 'operacao-cargas',
    category: 'suporte',
    title: 'Como atribuir ou trocar a transportadora de uma carga terceirizada',
    content:
      'Problema: preciso definir ou mudar a transportadora de uma carga do tipo "Terceirizado".\n' +
      'Solução:\n' +
      '1. Acesse Operação → Cargas e localize a carga terceirizada.\n' +
      '2. No menu de ações, escolha "Atribuir transportadora".\n' +
      '3. Use o modal de busca para selecionar a transportadora responsável.\n' +
      '4. Salve — não é necessário recriar a carga.\n' +
      'Obs: a transportadora precisa estar cadastrada em Cadastros → Terceiros para aparecer na busca.',
    tags: ['cargas', 'transportadora', 'terceirizado', 'atribuir', 'operacao'],
  },
  {
    topic: 'operacao-cargas',
    category: 'suporte',
    title: 'Diferença entre finalizar, reabrir e excluir uma carga',
    content:
      'Dúvida: quais ações existem para uma carga e quando usar cada uma?\n' +
      'Ações (Operação → Cargas → menu de ações):\n' +
      '1. Finalizar carga — marca como concluída.\n' +
      '2. Cancelar carga — cancela; exige justificativa obrigatória.\n' +
      '3. Reabrir carga — reabre uma carga finalizada para correções.\n' +
      '4. Excluir carga — remove permanentemente; disponível apenas para cargas sem movimentação.\n' +
      'Regra: se a carga já teve movimentação, ela não pode ser excluída — use cancelar ou reabrir.',
    tags: ['cargas', 'finalizar', 'reabrir', 'excluir', 'cancelar', 'operacao'],
  },
  {
    topic: 'operacao-viagens',
    category: 'suporte',
    title: 'Como gerar o PDF ou copiar os dados de uma viagem',
    content:
      'Dúvida: preciso do relatório da viagem em PDF ou copiar veículo/motorista/rota.\n' +
      'Solução:\n' +
      '1. Acesse Operação → Viagens.\n' +
      '2. Na linha da viagem, abra o menu de ações rápidas.\n' +
      '3. "Gerar PDF" exporta o relatório completo da viagem.\n' +
      '4. "Copiar dados" copia veículo, motorista e rota para a área de transferência.\n' +
      'Obs: a coluna Progresso mostra o percentual de paradas concluídas e a coluna Financeiro mostra o valor total e o status de pagamento.',
    tags: ['viagem', 'pdf', 'copiar dados', 'relatorio', 'operacao'],
  },
  {
    topic: 'operacao-viagens',
    category: 'suporte',
    title: 'Não consigo excluir uma viagem',
    content:
      'Problema: a opção de excluir viagem está bloqueada.\n' +
      'Causa: viagens que já têm CT-e emitido não podem ser excluídas nem canceladas diretamente.\n' +
      'Solução:\n' +
      '1. Verifique na aba Documentos da viagem se há CT-e emitido.\n' +
      '2. Se houver, cancele primeiro o(s) CT-e em Operação → CT-e.\n' +
      '3. Com os documentos fiscais cancelados, volte à viagem e use Excluir ou Cancelar viagem (justificativa obrigatória).\n' +
      'Obs: a exclusão só está disponível para viagens sem CT-e emitido.',
    tags: ['viagem', 'excluir', 'cancelar', 'cte', 'bloqueado', 'operacao'],
  },
  {
    topic: 'operacao-viagens',
    category: 'suporte',
    title: 'Como confirmar coletas e entregas na Gestão de Paradas',
    content:
      'Dúvida: onde registro que uma coleta ou entrega foi realizada?\n' +
      'Solução:\n' +
      '1. Acesse Operação → Gestão de Paradas para ver a sequência de coletas e entregas de todas as viagens ativas.\n' +
      '2. Registre a confirmação de coleta ou entrega diretamente na tela, no ponto correspondente da rota.\n' +
      '3. O status de cada parada é atualizado em tempo real.\n' +
      'Alternativa: eventos e ocorrências (avarias, atrasos, tentativas de entrega) são registrados na aba Eventos do embarque ou da viagem.',
    tags: ['gestao de paradas', 'coleta', 'entrega', 'confirmar', 'rota', 'operacao'],
  },
  {
    topic: 'operacao-cte',
    category: 'suporte',
    title: 'Status do CT-e diferente entre o sistema e a SEFAZ',
    content:
      'Problema: o CT-e aparece com um status no HiperTMS diferente do retorno da SEFAZ, ou a autorização está demorando.\n' +
      'Solução:\n' +
      '1. Acesse Operação → CT-e e localize o documento.\n' +
      '2. No menu de ações do registro, clique em "Atualizar status".\n' +
      '3. O sistema consulta o status mais recente direto na SEFAZ e sincroniza o registro local.\n' +
      'Quando usar: demora na resposta de autorização ou divergência de status. Se o serviço da SEFAZ estiver fora do ar, aguarde o restabelecimento antes de reemitir.',
    tags: ['cte', 'atualizar status', 'sefaz', 'divergencia', 'processamento', 'operacao'],
  },
  {
    topic: 'operacao-mdfe',
    category: 'suporte',
    title: 'Como baixar o DAMDFe para apresentar na fiscalização',
    content:
      'Dúvida: o motorista precisa do documento do MDF-e para a estrada.\n' +
      'Solução:\n' +
      '1. Acesse Operação → MDF-e e localize o manifesto autorizado.\n' +
      '2. No menu de ações do registro, clique em "Baixar DAMDFe".\n' +
      '3. O sistema gera o PDF do Documento Auxiliar do MDF-e.\n' +
      '4. Imprima ou disponibilize ao motorista — o DAMDFe deve acompanhar a carga e ser apresentado em fiscalizações nas rodovias.\n' +
      'Dica: para guarda fiscal, baixe também o XML em "Baixar XML".',
    tags: ['mdfe', 'damdfe', 'pdf', 'fiscalizacao', 'motorista', 'operacao'],
  },
  {
    topic: 'operacao-mdfe',
    category: 'suporte',
    title: 'Como cancelar um MDF-e autorizado',
    content:
      'Problema: preciso cancelar um MDF-e emitido por engano.\n' +
      'Solução:\n' +
      '1. Acesse Operação → MDF-e e localize o manifesto autorizado.\n' +
      '2. No menu de ações do registro, clique em "Cancelar".\n' +
      '3. Informe a justificativa respeitando o mínimo de caracteres exigido pela SEFAZ.\n' +
      '4. O cancelamento é enviado e o status muda para "Cancelado".\n' +
      'Atenção: só é possível cancelar ANTES do encerramento da viagem. Se o MDF-e já foi encerrado, o cancelamento não é permitido.',
    tags: ['mdfe', 'cancelar', 'sefaz', 'justificativa', 'fiscal', 'operacao'],
  },
  {
    topic: 'operacao-mdfe',
    category: 'suporte',
    title: 'Gerar uma viagem a partir de um MDF-e',
    content:
      'Dúvida: emiti o MDF-e e quero criar a viagem sem redigitar os dados.\n' +
      'Solução:\n' +
      '1. Acesse Operação → MDF-e e localize o manifesto autorizado.\n' +
      '2. No menu de ações do registro, clique em "Gerar viagem".\n' +
      '3. O sistema cria uma viagem vinculada, aproveitando veículo, motorista e percurso do manifesto.\n' +
      '4. Complete embarques e paradas se necessário e salve.\n' +
      'Obs: o caminho inverso também existe — no detalhe da viagem há a seção MDF-e com o botão "Emitir MDF-e".',
    tags: ['mdfe', 'viagem', 'gerar viagem', 'vinculo', 'operacao'],
  },
  {
    topic: 'operacao-gnre',
    category: 'suporte',
    title: 'Quando a GNRE é obrigatória na operação',
    content:
      'Dúvida: o cliente cobrou GNRE ou não sei se preciso emitir.\n' +
      'Regra: a GNRE (Guia Nacional de Recolhimento de Tributos Estaduais) é obrigatória para recolhimento de ICMS quando o destinatário está em UF diferente do emitente e não é contribuinte do ICMS — comum em entregas a consumidor final em outro estado.\n' +
      'Como emitir:\n' +
      '1. Acesse Operação → GNRE e clique em "Gerar GNRE".\n' +
      '2. Vincule ao CT-e — o sistema preenche código da receita, valor do ICMS e vencimento.\n' +
      '3. Baixe o PDF para pagamento na rede bancária ou via PIX.\n' +
      'Acompanhe status (Pendente, Paga, Cancelada) e período na própria listagem.',
    tags: ['gnre', 'icms', 'interestadual', 'obrigatoriedade', 'fiscal', 'operacao'],
  },

  // ══════════════════════════════════════════════════════════
  // CADASTROS — Terceiros e Empresas
  // ══════════════════════════════════════════════════════════
  {
    topic: 'cadastros-terceiros',
    category: 'suporte',
    title: 'Como cadastrar transportador parceiro (RNTRC/ANTT)',
    content:
      'Dúvida: onde cadastro transportadoras e agregados que eu contrato?\n' +
      'Solução:\n' +
      '1. Acesse Cadastros → Terceiros e clique para adicionar.\n' +
      '2. Informe os dados cadastrais e a documentação: RNTRC e ANTT.\n' +
      '3. Preencha os dados bancários para pagamento.\n' +
      '4. Salve — o transportador fica disponível para seleção nos pedidos de frete de terceiros e ao atribuir transportadora em cargas terceirizadas.\n' +
      'Obs: mantenha o RNTRC válido; ele é exigido em operações de transporte rodoviário de carga.',
    tags: ['terceiros', 'transportador', 'rntrc', 'antt', 'agregado', 'cadastros'],
  },
  {
    topic: 'cadastros-empresas',
    category: 'suporte',
    title: 'Diferença entre Cliente, Remetente/Destinatário, Terceiro e Fornecedor',
    content:
      'Dúvida: onde cadastro cada tipo de empresa e qual a diferença?\n' +
      'Referência:\n' +
      '1. Clientes (Cadastros → Clientes) — tomadores do serviço, quem contrata e paga o frete.\n' +
      '2. Remetentes e Destinatários (Cadastros → Remetentes e Destinatários) — pontos de coleta e entrega; podem ser diferentes de quem paga.\n' +
      '3. Terceiros (Cadastros → Terceiros) — transportadoras e autônomos parceiros que você contrata.\n' +
      '4. Fornecedores (Cadastros → Fornecedores) — quem fornece insumos e serviços (combustível, peças, manutenção).\n' +
      'Obs: sempre informe CNPJ/CPF para evitar duplicidade — o sistema alerta se o documento já existe.',
    tags: ['cadastros', 'cliente', 'remetente', 'destinatario', 'fornecedor', 'terceiro'],
  },
  {
    topic: 'cadastros-empresas',
    category: 'suporte',
    title: 'Como classificar empresas com tags e filtrar por elas',
    content:
      'Dúvida: quero segmentar clientes (ex: prioritário, inadimplente, lead quente).\n' +
      'Solução:\n' +
      '1. Acesse Cadastros → Empresas e abra o cadastro da empresa.\n' +
      '2. No campo "Tags", adicione tags livres para segmentação.\n' +
      '3. Na listagem, clique em "Filtros" para filtrar por tags, além de SDR responsável e UF.\n' +
      '4. Combine filtros para resultados mais precisos.\n' +
      'Dica: a listagem de empresas também tem "Exportar CSV" respeitando os filtros aplicados.',
    tags: ['empresas', 'tags', 'filtros', 'segmentacao', 'cadastros'],
  },

  // ══════════════════════════════════════════════════════════
  // FROTA — Abastecimento, Diárias e Veículos
  // ══════════════════════════════════════════════════════════
  {
    topic: 'frota-abastecimento',
    category: 'suporte',
    title: 'Fluxo de aprovação de abastecimentos',
    content:
      'Dúvida: registrei um abastecimento mas ele não entrou no custo da frota.\n' +
      'Causa: abastecimentos passam por aprovação antes de impactar os custos.\n' +
      'Fluxo (Frota → Abastecimentos):\n' +
      '1. Pendente — registrado, aguardando revisão.\n' +
      '2. Em revisão — gestor abriu para análise.\n' +
      '3. Aprovado — nas ações do registro clique em "Aprovar"; o consumo médio do veículo é atualizado e o valor lançado no centro de custo.\n' +
      '4. Rejeitado — clique em "Rejeitar" e informe a justificativa obrigatória; o valor não entra no custo.\n' +
      'Dica: filtre por status Pendente para processar as aprovações em lote.',
    tags: ['abastecimento', 'aprovacao', 'pendente', 'consumo', 'frota', 'combustivel'],
  },
  {
    topic: 'frota-diarias',
    category: 'suporte',
    title: 'Como configurar limites de diária por rota',
    content:
      'Dúvida: quero limitar o valor de diária que os motoristas recebem por destino.\n' +
      'Solução:\n' +
      '1. Acesse Frota → Configurações → Diárias de Motorista → Limites por Rota.\n' +
      '2. Defina o valor máximo por dia por categoria de destino: capital, interior ou outro estado.\n' +
      '3. Defina o número máximo de diárias por viagem.\n' +
      '4. Configure a regra de arredondamento — fração de dia como diária completa ou proporcional.\n' +
      'Obs: rotas internacionais podem ter limites específicos configurados separadamente.',
    tags: ['diarias', 'motorista', 'limites', 'rota', 'frota', 'adiantamento'],
  },
  {
    topic: 'frota-veiculos',
    category: 'suporte',
    title: 'Alertas de vencimento de CRLV e documentos do veículo',
    content:
      'Dúvida: como não perder o vencimento de CRLV, tacógrafo e extintor?\n' +
      'Solução:\n' +
      '1. Ao cadastrar o veículo em Frota → Veículos, preencha as datas de vencimento (CRLV, tacógrafo, extintor e outros).\n' +
      '2. Faça upload dos arquivos na aba "Documentos" do veículo.\n' +
      '3. O sistema alerta automaticamente quando um documento está próximo do vencimento.\n' +
      '4. Providencie a renovação com antecedência para não bloquear a operação do veículo.\n' +
      'Dica: revisões preventivas podem ser programadas na aba "Revisões" por km ou intervalo de tempo.',
    tags: ['veiculo', 'crlv', 'vencimento', 'documentos', 'alerta', 'frota'],
  },

  // ══════════════════════════════════════════════════════════
  // FINANCEIRO — Contas, Categorias e Bancário
  // ══════════════════════════════════════════════════════════
  {
    topic: 'financeiro-contas',
    category: 'suporte',
    title: 'Como lançar uma conta a pagar e registrar o pagamento',
    content:
      'Dúvida: como registro uma despesa e depois dou baixa?\n' +
      'Solução:\n' +
      '1. Acesse Financeiro → Contas a Pagar → "Nova Conta".\n' +
      '2. Preencha fornecedor/credor, descrição, categoria, valor, vencimento, parcelas e conta bancária.\n' +
      '3. Salve — a conta entra com status Pendente (Vencida se passar da data).\n' +
      '4. Para pagar, localize a conta e clique em "Pagar"; confirme data, valor e conta bancária.\n' +
      '5. O saldo da conta bancária é atualizado automaticamente e o status vira "Paga".\n' +
      'Obs: contas geradas por aprovação de compras já entram automaticamente aqui.',
    tags: ['contas a pagar', 'pagamento', 'financeiro', 'despesa', 'baixa', 'categoria'],
  },
  {
    topic: 'financeiro-contas',
    category: 'suporte',
    title: 'Recebível não foi gerado automaticamente após embarque ou fatura',
    content:
      'Problema: realizei o embarque/fatura mas não há conta a receber correspondente.\n' +
      'Causa: recebíveis são criados automaticamente a partir de embarques ou faturas; se a etapa não foi concluída, o recebível não é gerado.\n' +
      'Solução:\n' +
      '1. Confirme se a fatura do tomador foi realmente emitida (Financeiro → Faturas (tomador)).\n' +
      '2. Verifique o vínculo do embarque à fatura.\n' +
      '3. Se precisar de um recebível avulso, crie em Financeiro → Contas a Receber → "Nova Conta" com cliente, valor, vencimento e categoria.\n' +
      '4. Para dar baixa, clique em "Receber", confirme data, valor e conta bancária de destino (informe desconto/juros se houver).',
    tags: ['contas a receber', 'recebivel', 'financeiro', 'fatura', 'embarque'],
  },
  {
    topic: 'financeiro-categorias',
    category: 'suporte',
    title: 'Como organizar o plano de contas (categorias financeiras)',
    content:
      'Dúvida: como classifico receitas e despesas para os relatórios?\n' +
      'Solução:\n' +
      '1. Acesse Financeiro → Categorias.\n' +
      '2. Crie categorias de receita e de despesa conforme o seu plano de contas.\n' +
      '3. Organize as categorias em grupos para facilitar a leitura nos relatórios de orçamento e DRE.\n' +
      '4. Ao lançar contas a pagar/receber, selecione a categoria correspondente.\n' +
      'Impacto: a categorização correta alimenta o DRE, o Orçamento vs. Realizado e as análises por tipo de custo.',
    tags: ['categorias', 'plano de contas', 'financeiro', 'dre', 'orcamento'],
  },
  {
    topic: 'financeiro-bancario',
    category: 'suporte',
    title: 'Configurações avançadas da conta bancária (conta padrão, saldo mínimo, Asaas)',
    content:
      'Dúvida: como uso as opções avançadas da conta bancária?\n' +
      'Caminho: Financeiro → Contas Bancárias → criar ou editar conta → "Configurações avançadas" (restrito a administradores).\n' +
      'Opções:\n' +
      '1. Conta padrão — define o destino padrão de novos recebimentos, evitando seleção manual.\n' +
      '2. Limite de saldo mínimo — emite alerta quando o saldo cair abaixo do valor configurado.\n' +
      '3. Integração Asaas — vincula a conta à subconta Asaas para que boletos e PIX gerados sejam creditados corretamente.\n' +
      '4. Centro de custo padrão — associa todas as movimentações da conta a um centro de custo automaticamente.',
    tags: ['conta bancaria', 'asaas', 'saldo minimo', 'centro de custo', 'financeiro'],
  },

  // ══════════════════════════════════════════════════════════
  // EQUIPES — Tarefas, Times e Notificações
  // ══════════════════════════════════════════════════════════
  {
    topic: 'equipes-tarefas',
    category: 'suporte',
    title: 'Como criar e atribuir tarefas para a equipe',
    content:
      'Dúvida: como distribuo tarefas internas para o time?\n' +
      'Solução:\n' +
      '1. Acesse Equipes → Tarefas e clique em "Nova Tarefa".\n' +
      '2. Preencha título, responsável, data de vencimento, descrição e prioridade.\n' +
      '3. Salve — a tarefa nasce com status Pendente.\n' +
      '4. Acompanhe pelos status: Pendente, Em andamento, Concluída e Atrasada (passou do prazo).\n' +
      '5. Clique na tarefa para comentar ou marcar como concluída.\n' +
      'Obs: o responsável recebe notificação da atribuição e um alerta 24h antes do vencimento.',
    tags: ['tarefas', 'equipe', 'atribuir', 'responsavel', 'prazo', 'equipes'],
  },
  {
    topic: 'equipes-tarefas',
    category: 'suporte',
    title: 'Diferença entre Minhas Tarefas e Todas as Tarefas',
    content:
      'Dúvida: por que só vejo algumas tarefas, ou por que vejo as de todo mundo?\n' +
      'Explicação (Equipes → Tarefas):\n' +
      '1. Aba "Minhas tarefas" — exibe somente as tarefas atribuídas ao usuário logado.\n' +
      '2. Aba "Todas as tarefas" — exibe as tarefas de toda a equipe; visível para gestores e administradores.\n' +
      'Se você não vê "Todas as tarefas", é porque seu perfil não tem essa permissão — normal para membros sem função de gestão. Solicite ao administrador se precisar dessa visão.',
    tags: ['tarefas', 'minhas tarefas', 'permissao', 'gestor', 'equipes'],
  },
  {
    topic: 'equipes-times',
    category: 'suporte',
    title: 'Como criar times e definir papéis dos membros',
    content:
      'Dúvida: como organizo a equipe por área e controlo o que cada um faz no time?\n' +
      'Solução:\n' +
      '1. Acesse Equipes → Equipes e clique em "Novo Time" (ex: Comercial, Operação, Financeiro).\n' +
      '2. Adicione os membros.\n' +
      '3. Na aba "Membros", defina o papel de cada um: Administrador do time (adiciona/remove membros e edita configurações), Membro (participa das atividades) ou Observador (só visualiza).\n' +
      'Dica: a aba "Atividade" do time traz três feeds — atividades recentes, menções a você e notificações do sistema.',
    tags: ['times', 'equipes', 'papeis', 'membros', 'administrador', 'observador'],
  },
  {
    topic: 'equipes-times',
    category: 'suporte',
    title: 'Como arquivar um time sem perder o histórico',
    content:
      'Dúvida: um time não é mais usado; posso removê-lo sem perder os dados?\n' +
      'Solução:\n' +
      '1. Acesse Equipes → Equipes e abra o time.\n' +
      '2. No menu de ações, escolha "Arquivar time".\n' +
      '3. O time sai da listagem padrão, mas todo o histórico de atividades e tarefas é preservado para consulta futura.\n' +
      'Obs: prefira arquivar em vez de recriar times a cada mudança — assim o histórico continua auditável.',
    tags: ['times', 'arquivar', 'historico', 'equipes'],
  },
  {
    topic: 'equipes-notificacoes',
    category: 'suporte',
    title: 'Como configurar quais eventos geram notificação',
    content:
      'Dúvida: quero escolher o que me notifica e por qual canal.\n' +
      'Solução:\n' +
      '1. Acesse Equipes → Configurações de Notificação.\n' +
      '2. Ative os eventos desejados e o canal (in-app ou e-mail): nova tarefa atribuída, prazo de tarefa vencendo (24h antes), tarefa concluída por membro do time e menção em comentário.\n' +
      '3. Salve as preferências.\n' +
      'Se não recebe e-mails: confirme que o canal e-mail está ativo e verifique a caixa de spam. Notificações in-app aparecem em Equipes → Notificações.',
    tags: ['notificacoes', 'alertas', 'configuracao', 'email', 'equipes'],
  },
  // ══════════════════════════════════════════════════════════
  // COMPRAS — Pedidos e Estoque
  // ══════════════════════════════════════════════════════════
  {
    topic: 'compras-pedidos',
    category: 'suporte',
    title: 'Como criar um pedido de compra e registrar o recebimento',
    content:
      'Dúvida: como transformo uma solicitação em pedido e dou entrada nos itens?\n' +
      'Solução:\n' +
      '1. Acesse Compras → Pedidos → "Novo Pedido" (ou converta uma solicitação aprovada em pedido pela tela de Solicitações).\n' +
      '2. Informe fornecedor, itens e quantidades, valores unitários, condições de pagamento e data de entrega prevista.\n' +
      '3. Confirme o pedido.\n' +
      '4. Quando os itens chegarem, abra o pedido e clique em "Registrar Recebimento"; informe a quantidade recebida e a data.\n' +
      '5. O estoque é atualizado automaticamente.',
    tags: ['pedido de compra', 'recebimento', 'estoque', 'fornecedor', 'compras'],
  },
  {
    topic: 'compras-estoque',
    category: 'suporte',
    title: 'Campos NCM, SKU e código de barras no cadastro de produto',
    content:
      'Dúvida: para que servem NCM, SKU e código de barras no produto?\n' +
      'Caminho: Compras → Produtos → criar ou editar produto.\n' +
      'Campos:\n' +
      '1. NCM — código da Nomenclatura Comum do Mercosul para classificação fiscal do produto.\n' +
      '2. SKU — código interno para controle de estoque e identificação nas compras.\n' +
      '3. Código de barras — EAN-13 ou outros padrões para leitura com leitor óptico.\n' +
      'Dica: preencher esses campos facilita a integração com documentos fiscais e o controle de inventário.',
    tags: ['produto', 'ncm', 'sku', 'codigo de barras', 'estoque', 'compras'],
  },
  {
    topic: 'compras-estoque',
    category: 'suporte',
    title: 'Ponto de reposição e alerta de estoque mínimo',
    content:
      'Dúvida: como sou avisado quando um item está acabando?\n' +
      'Solução:\n' +
      '1. Acesse Compras → Produtos → detalhe → campo "Ponto de reposição".\n' +
      '2. Defina o estoque mínimo que dispara o alerta.\n' +
      '3. Quando o saldo disponível cair abaixo do ponto de reposição, o sistema notifica automaticamente o responsável pelo setor de compras.\n' +
      '4. Providencie um novo pedido para repor o item.\n' +
      'Obs: o estoque inicial e o mínimo também podem ser definidos ao cadastrar o produto em Compras → Estoque.',
    tags: ['ponto de reposicao', 'estoque minimo', 'alerta', 'produto', 'compras'],
  },
  {
    topic: 'compras-estoque',
    category: 'suporte',
    title: 'Como o custo médio do produto é calculado',
    content:
      'Dúvida: de onde vem o custo médio que aparece no produto?\n' +
      'Explicação:\n' +
      '1. Acesse Compras → Produtos → detalhe → campo "Custo médio".\n' +
      '2. O sistema calcula o custo médio ponderado com base nas entradas registradas.\n' +
      '3. O valor é recalculado automaticamente a cada novo recebimento de pedido.\n' +
      '4. Use o custo médio como referência para análise de rentabilidade e formação de preço interno.\n' +
      'Obs: entradas e saídas manuais também podem ser lançadas em "Nova Movimentação" dentro do produto.',
    tags: ['custo medio', 'produto', 'estoque', 'movimentacao', 'compras'],
  },

  // ══════════════════════════════════════════════════════════
  // ADMINISTRAÇÃO — Empresa, Configurações e Assinatura
  // ══════════════════════════════════════════════════════════
  {
    topic: 'administracao-empresa',
    category: 'suporte',
    title: 'As 8 abas de Dados da Empresa — onde configurar cada coisa',
    content:
      'Dúvida: onde fica cada configuração da empresa?\n' +
      'Caminho: Administração → Dados da Empresa. As 8 abas:\n' +
      '1. Geral — razão social, CNPJ e endereço da sede.\n' +
      '2. Fiscal — CT-e, MDF-e, NFS-e, série e numeração dos documentos.\n' +
      '3. Certificado Digital — upload e gestão do certificado A1.\n' +
      '4. E-mail — servidor SMTP para e-mails transacionais (faturas, cotações).\n' +
      '5. Operação — padrões de viagens, tipos de frete e CIOT.\n' +
      '6. Branding — logotipo, cores e personalização de documentos.\n' +
      '7. Assinaturas e Planos — plano atual, limites e faturamento.\n' +
      '8. Integrações — APIs e webhooks.\n' +
      'Acesso restrito a administradores.',
    tags: ['dados da empresa', 'configuracao', 'abas', 'administracao', 'fiscal', 'branding'],
  },
  {
    topic: 'administracao-empresa',
    category: 'suporte',
    title: 'Como transferir a propriedade da conta',
    content:
      'Dúvida: o dono da conta mudou; como passo a titularidade para outra pessoa?\n' +
      'Solução:\n' +
      '1. Acesse Administração → Dados da Empresa → seção "Propriedade".\n' +
      '2. Clique em "Transferir propriedade".\n' +
      '3. Escolha outro usuário administrador da empresa como novo proprietário.\n' +
      '4. A transferência exige confirmação por e-mail de ambas as partes antes de ser efetivada.\n' +
      'Obs: o novo proprietário precisa já ser administrador. Só o proprietário atual pode iniciar a transferência.',
    tags: ['propriedade', 'titularidade', 'transferir', 'administracao', 'proprietario'],
  },
  {
    topic: 'administracao-empresa',
    category: 'suporte',
    title: 'Configurar o servidor de e-mail (SMTP) para envio de faturas e cotações',
    content:
      'Problema: faturas e cotações não estão sendo enviadas por e-mail aos clientes.\n' +
      'Causa: o servidor SMTP da empresa não está configurado.\n' +
      'Solução:\n' +
      '1. Acesse Administração → Dados da Empresa → aba "E-mail".\n' +
      '2. Configure o servidor SMTP responsável pelo envio dos e-mails transacionais (faturas, cotações).\n' +
      '3. Salve e faça um envio de teste.\n' +
      'Obs: sem o SMTP configurado, os e-mails automáticos do sistema (booking, fatura, cotação) não saem. Acesso restrito a administradores.',
    tags: ['smtp', 'email', 'envio', 'faturas', 'cotacoes', 'administracao'],
  },
  {
    topic: 'administracao-configuracoes',
    category: 'suporte',
    title: 'Guardrails financeiros: desconto máximo e limite de crédito',
    content:
      'Dúvida: como impedir descontos abusivos e vendas acima do limite do cliente?\n' +
      'Caminho: Administração → Configurações → aba "Guardrails".\n' +
      'Configurações:\n' +
      '1. Desconto máximo por vendedor — percentual máximo que um vendedor concede sem aprovação de gestor.\n' +
      '2. Limite de crédito por cliente — ao atingir o limite, novas cotações para o cliente são bloqueadas automaticamente.\n' +
      '3. Prazo máximo de pagamento — prazo máximo permitido por perfil de cliente.\n' +
      'Obs: se uma cotação está sendo bloqueada, verifique se o cliente atingiu o limite de crédito nos guardrails.',
    tags: ['guardrails', 'desconto', 'limite de credito', 'bloqueio', 'administracao', 'vendas'],
  },
  {
    topic: 'administracao-assinatura',
    category: 'suporte',
    title: 'Como fazer downgrade ou cancelar a assinatura',
    content:
      'Dúvida: quero reduzir o plano ou encerrar a assinatura do HiperTMS.\n' +
      'Caminho: Administração → Assinaturas → ações do plano.\n' +
      'Opções:\n' +
      '1. Fazer downgrade — reduz para um plano menor; entra em vigor no próximo ciclo de faturamento e o plano atual permanece ativo até o fim do período já pago.\n' +
      '2. Cancelar assinatura — inicia o cancelamento com pesquisa de motivo. Após cancelar, os dados da empresa são mantidos por 90 dias, prazo em que é possível reativar a conta.\n' +
      'Dica: para consultar cobranças e baixar notas fiscais, use a aba "Extrato".',
    tags: ['assinatura', 'downgrade', 'cancelamento', 'plano', 'administracao', 'faturamento'],
  },

  // ══════════════════════════════════════════════════════════
  // RELATÓRIOS — Painel, Financeiro, Logística, Frota e Fiscal
  // ══════════════════════════════════════════════════════════
  {
    topic: 'relatorios',
    category: 'suporte',
    title: 'Onde ficam os relatórios e como usar o painel executivo',
    content:
      'Dúvida: onde acompanho os indicadores da operação?\n' +
      'Solução:\n' +
      '1. Acesse Relatórios no menu lateral para abrir o painel executivo do mês corrente.\n' +
      '2. No topo, os KPIs de destaque: Conversão de cotações, Pontualidade de entregas, A receber em aberto e Saldo projetado 30d (cada um com sinal verde/amarelo/vermelho).\n' +
      '3. No meio, gráficos de cotações do mês, status de viagens e pontualidade por tipo.\n' +
      '4. No rodapé, KPIs de frota (combustível, manutenção) e fiscal (CT-e/MDF-e autorizados).\n' +
      'Dica: cada cartão é clicável e leva direto ao relatório detalhado correspondente.',
    tags: ['relatorios', 'painel', 'kpi', 'dashboard', 'indicadores', 'executivo'],
  },
  {
    topic: 'relatorios-financeiro',
    category: 'suporte',
    title: 'Relatório de Contas em Atraso — faixas de inadimplência',
    content:
      'Dúvida: como vejo quem está inadimplente e há quanto tempo?\n' +
      'Solução:\n' +
      '1. Acesse Relatórios → Financeiro → Contas em Atraso.\n' +
      '2. Os recebíveis vencidos são agrupados por faixa: até 30 dias, 31–60 dias, 61–90 dias e acima de 90 dias (inadimplência crítica).\n' +
      '3. Clique em uma faixa para filtrar a tabela e ver só aquele grupo.\n' +
      '4. O rodapé mostra o valor total e a quantidade de contas por faixa.\n' +
      'Dica: acompanhe as faixas de 61–90 e acima de 90 dias para priorizar a cobrança.',
    tags: ['relatorios', 'contas em atraso', 'inadimplencia', 'financeiro', 'cobranca'],
  },
  {
    topic: 'relatorios-financeiro',
    category: 'suporte',
    title: 'Fluxo de Caixa Projetado — antecipar déficit de caixa',
    content:
      'Dúvida: como saber se vou ficar sem caixa nos próximos dias?\n' +
      'Solução:\n' +
      '1. Acesse Relatórios → Financeiro → Fluxo de Caixa.\n' +
      '2. O relatório projeta entradas e saídas dia a dia com base nos vencimentos cadastrados.\n' +
      '3. Use o seletor de período: 15, 30 (padrão), 60 ou 90 dias.\n' +
      '4. O saldo acumulado diário destaca em vermelho os dias com déficit projetado.\n' +
      'Ação: os dias em vermelho indicam necessidade de capital de giro — antecipe cobranças ou renegocie pagamentos.',
    tags: ['relatorios', 'fluxo de caixa', 'projecao', 'deficit', 'financeiro', 'capital de giro'],
  },
  {
    topic: 'relatorios-financeiro',
    category: 'suporte',
    title: 'Relatório Orçamento vs. Realizado está vazio',
    content:
      'Problema: abri Relatórios → Financeiro → Orçamento vs. Realizado e não aparecem dados.\n' +
      'Causa: o relatório compara o orçamento configurado com o realizado; sem orçamento definido, não há base de comparação.\n' +
      'Solução:\n' +
      '1. Acesse Financeiro → Orçamento e defina as metas de receita e limites de despesa por categoria.\n' +
      '2. Para agilizar, use "Calcular sugestão" — o sistema propõe valores com base nos últimos 12 meses.\n' +
      '3. Salve o orçamento.\n' +
      '4. Volte ao relatório — a comparação mês a mês por categoria já aparecerá.',
    tags: ['relatorios', 'orcamento', 'realizado', 'vazio', 'financeiro', 'categoria'],
  },
  {
    topic: 'relatorios-logistica',
    category: 'suporte',
    title: 'Relatórios de Conversão de Cotações e Pontualidade',
    content:
      'Dúvida: como meço o desempenho comercial e de entregas?\n' +
      'Conversão de Cotações (Relatórios → Logística → Conversão de Cotações): mostra total, ganhas, perdidas e a taxa de conversão do período. Use o filtro De/Até para comparar meses.\n' +
      'Pontualidade (Relatórios → Logística → Pontualidade de Coletas e Entregas): taxa de conclusão no prazo por tipo — Coleta, Transferência e Entrega. As barras indicam desempenho: verde ≥ 90%, amarelo ≥ 70%, vermelho abaixo de 70%.\n' +
      'Dica: pontualidade em vermelho aponta gargalos operacionais a investigar.',
    tags: ['relatorios', 'conversao', 'cotacoes', 'pontualidade', 'logistica', 'kpi'],
  },
  {
    topic: 'relatorios-logistica',
    category: 'suporte',
    title: 'Relatórios de NF-e: estatísticas e retrabalho de importação',
    content:
      'Dúvida: como monitoro a qualidade da importação de XML dos clientes?\n' +
      'Estatísticas de NF-e (Relatórios → Logística → Estatísticas de NF-e): volume de XMLs importados no período, detalhado por situação — válidos, com erro e duplicados.\n' +
      'Retrabalho de NF-e (Relatórios → Logística → Retrabalho de NF-e): lista as notas que precisaram de correção manual (dados inconsistentes, endereço não encontrado, itens sem correspondência no cadastro).\n' +
      'Ação: identifique clientes ou padrões que geram mais retrabalho e corrija os cadastros de origem para reduzir erros futuros.',
    tags: ['relatorios', 'nfe', 'xml', 'retrabalho', 'estatisticas', 'logistica'],
  },
  {
    topic: 'relatorios-frota',
    category: 'suporte',
    title: 'Relatórios de Consumo de Combustível e Custo de Manutenção',
    content:
      'Dúvida: como comparo o desempenho e o custo dos veículos?\n' +
      'Consumo de Combustível (Relatórios → Frota → Consumo de Combustível): litros abastecidos e custo total por veículo no período — alimentado pelos registros de Frota → Abastecimentos.\n' +
      'Custo de Manutenção (Relatórios → Frota → Custo de Manutenção): total de manutenções por veículo no período — alimentado por Frota → Manutenções.\n' +
      'Ação: veículos com consumo acima do esperado ou custo de manutenção elevado são candidatos a revisão ou renovação de frota.',
    tags: ['relatorios', 'combustivel', 'consumo', 'manutencao', 'frota', 'custo'],
  },
  // ══════════════════════════════════════════════════════════
  // EXPORTAÇÃO / DOWNLOAD DE DADOS (perguntas frequentes)
  // ══════════════════════════════════════════════════════════
  {
    topic: 'operacao-cte',
    category: 'suporte',
    title: 'Como exportar lista de CT-e em CSV ou Excel',
    content:
      'Dúvida: como baixar um relatório/planilha com os CT-e emitidos?\\n' +
      'Solução:\\n' +
      '1. Acesse Operação → CT-e.\\n' +
      '2. Use os filtros de período (De/Até), status ou tomador para selecionar os documentos desejados.\\n' +
      '3. Clique no botão \"Exportar\" (ícone de download) no canto superior direito da lista.\\n' +
      '4. Selecione o formato: CSV ou Excel (.xlsx).\\n' +
      '5. O arquivo é gerado e baixado automaticamente com: número do CT-e, data, tomador, valor, status e chave de acesso.\\n' +
      'Se o botão Exportar não aparecer: verifique se sua permissão inclui acesso a exportações (Administração → Perfis de Acesso).\\n' +
      'Para exportar apenas CT-e autorizados: filtre por Status = \"Autorizado\" antes de exportar.',
    tags: ['exportar', 'csv', 'excel', 'relatorio cte', 'download', 'planilha', 'cte', 'operacao'],
  },
  {
    topic: 'operacao-cte',
    category: 'suporte',
    title: 'Como baixar o DANFE do CT-e',
    content:
      'O DANFE (Documento Auxiliar do CT-e) é o PDF impresso do conhecimento de transporte.\\n' +
      'Como baixar:\\n' +
      '1. Acesse Operação → CT-e.\\n' +
      '2. Localize o CT-e desejado e clique para abrir.\\n' +
      '3. Clique em \"Imprimir DANFE\" ou no ícone de PDF.\\n' +
      '4. O PDF é gerado para impressão ou download.\\n' +
      'Para baixar em lote: selecione vários CT-e na lista (checkbox) → Ações → Baixar DANFE.\\n' +
      'Se o DANFE não gera: verifique se o CT-e está com status \"Autorizado\" — documentos rejeitados ou cancelados não têm DANFE válido.',
    tags: ['danfe', 'pdf', 'imprimir', 'baixar', 'cte', 'documento auxiliar', 'download'],
  },
  {
    topic: 'vendas-cotacoes',
    category: 'suporte',
    title: 'Como exportar cotações em CSV',
    content:
      'Dúvida: como baixar uma planilha com as cotações de frete?\\n' +
      'Solução:\\n' +
      '1. Acesse Vendas → Cotações.\\n' +
      '2. Aplique os filtros desejados (período, status, cliente).\\n' +
      '3. Clique em \"Exportar CSV\" no canto superior direito.\\n' +
      '4. O arquivo baixado contém: número, data, cliente, origem, destino, valor calculado e status.\\n' +
      'Para exportar todas as cotações do mês: filtre por Data de criação = mês desejado, depois exporte.',
    tags: ['exportar', 'csv', 'cotacoes', 'relatorio', 'download', 'planilha', 'vendas'],
  },
  {
    topic: 'relatorios-fiscal',
    category: 'suporte',
    title: 'Sumário CT-e e MDF-e — acompanhar a taxa de autorização',
    content:
      'Dúvida: como acompanho quantos documentos fiscais foram autorizados?\n' +
      'Sumário CT-e (Relatórios → Fiscal → Sumário CT-e): total emitido, autorizados, pendentes e rejeitados/cancelados no período, com o percentual de autorização.\n' +
      'Sumário MDF-e (Relatórios → Fiscal → Sumário MDF-e): mesmo formato, com distribuição por status (Autorizado, Encerrado, Cancelado).\n' +
      'Ação: um percentual baixo de autorização indica problemas recorrentes de emissão — revise causas de rejeição em Operação → CT-e/MDF-e. Use o filtro De/Até para o período.',
    tags: ['relatorios', 'sumario cte', 'sumario mdfe', 'autorizacao', 'fiscal'],
  },
];
