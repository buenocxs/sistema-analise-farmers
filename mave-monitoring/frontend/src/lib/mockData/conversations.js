// Mock conversations data - 15 conversas B2B realistas
// Clientes: revendas, ferragens, autopeças, transportadoras, postos, lojas agrícolas, implementos
// Produtos: catálogo real MAVE (cintas, catracas, conjuntos, extensores, barrigueiras, etc.)

const now = new Date();
const ago = (days, hours = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours);
  return d.toISOString();
};

const msgTime = (base, addMinutes) => {
  const d = new Date(base);
  d.setMinutes(d.getMinutes() + addMinutes);
  return d.toISOString();
};

// Quality breakdown helpers
const highBreakdown = () => ({
  abordagem_inicial: +(7.5 + Math.random() * 2.5).toFixed(1),
  identificacao_necessidade: +(7.0 + Math.random() * 3.0).toFixed(1),
  apresentacao_produto: +(7.0 + Math.random() * 3.0).toFixed(1),
  tratamento_objecoes: +(6.5 + Math.random() * 3.5).toFixed(1),
  agilidade_resposta: +(7.0 + Math.random() * 3.0).toFixed(1),
  conducao_fechamento: +(7.0 + Math.random() * 3.0).toFixed(1),
  profissionalismo: +(8.0 + Math.random() * 2.0).toFixed(1),
});

const midBreakdown = () => ({
  abordagem_inicial: +(5.0 + Math.random() * 3.0).toFixed(1),
  identificacao_necessidade: +(5.0 + Math.random() * 3.0).toFixed(1),
  apresentacao_produto: +(4.5 + Math.random() * 3.5).toFixed(1),
  tratamento_objecoes: +(4.0 + Math.random() * 3.5).toFixed(1),
  agilidade_resposta: +(5.0 + Math.random() * 3.0).toFixed(1),
  conducao_fechamento: +(4.5 + Math.random() * 3.0).toFixed(1),
  profissionalismo: +(5.5 + Math.random() * 3.0).toFixed(1),
});

const lowBreakdown = () => ({
  abordagem_inicial: +(3.0 + Math.random() * 3.0).toFixed(1),
  identificacao_necessidade: +(3.0 + Math.random() * 2.5).toFixed(1),
  apresentacao_produto: +(2.5 + Math.random() * 3.0).toFixed(1),
  tratamento_objecoes: +(2.0 + Math.random() * 2.5).toFixed(1),
  agilidade_resposta: +(2.5 + Math.random() * 3.0).toFixed(1),
  conducao_fechamento: +(2.0 + Math.random() * 2.5).toFixed(1),
  profissionalismo: +(4.0 + Math.random() * 3.0).toFixed(1),
});

let msgId = 1;
const m = (sender_type, sender_name, content, timestamp) => ({
  id: msgId++,
  sender_type,
  sender_name,
  content,
  timestamp,
});

const conversations = [
  // =====================================================================
  // CÍNTIA (id=1, pre_sale/SDR) — 5 conversas
  // =====================================================================

  // 1. Ferragem pedindo catálogo completo - qualificação
  {
    id: 1,
    seller_id: 1,
    customer_name: 'Casa das Ferragens Maringá',
    customer_phone: '5544999110001',
    message_count: 10,
    started_at: ago(2),
    last_message_at: ago(2, -3),
    status: 'active',
    analysis: {
      sentiment_label: 'positivo',
      sentiment_score: 0.72,
      quality_score: 8.6,
      quality_breakdown: highBreakdown(),
      stage: 'qualificacao',
      tone: 'profissional',
      summary: 'Lead qualificado: ferragem de Maringá com 3 lojas quer se tornar revenda MAVE. Vendedora enviou catálogo digital e tabela de preços. Follow-up agendado para terça-feira.',
      keywords: ['revenda', 'catalogo', 'tabela', 'ferragem', 'cintas', 'extensores', 'catracas'],
      objections: [],
      objections_handled: [],
      analyzed_at: ago(2, -2),
    },
    messages: (() => {
      const base = ago(2);
      return [
        m('seller', 'Cintia Moraes', 'Ola! Aqui e a Cintia da MAVE. Vi que voce se cadastrou no nosso site pedindo informacoes sobre revenda. Posso te ajudar?', base),
        m('customer', 'Casa das Ferragens Maringá', 'Oi Cintia! Sim, sou o Marcelo, gerente de compras da Casa das Ferragens. Temos 3 lojas aqui em Maringa e regiao e estamos querendo incluir amarracao de carga no mix', msgTime(base, 12)),
        m('seller', 'Cintia Moraes', 'Que legal, Marcelo! A MAVE tem uma linha completa pra ferragens. Trabalhamos com cintas, catracas, conjuntos de amarracao, extensores elasticos e acessorios. Voce ja trabalha com alguma marca?', msgTime(base, 16)),
        m('customer', 'Casa das Ferragens Maringá', 'Temos so uns extensores genericos que compro de um distribuidor, mas nada de marca. O pessoal pede bastante cinta com catraca e a gente nao tem', msgTime(base, 28)),
        m('seller', 'Cintia Moraes', 'Entao voce vai adorar! Nossos conjuntos de cinta e catraca sao os mais procurados. Temos de 1.500kg ate 10.000kg, com gancho J ou Sider. Tudo com certificacao NBR 15883-2. Posso te mandar nosso catalogo digital?', msgTime(base, 32)),
        m('customer', 'Casa das Ferragens Maringá', 'Manda sim! E se tiver tabela de precos pra revenda melhor ainda', msgTime(base, 40)),
        m('seller', 'Cintia Moraes', 'Vou enviar o catalogo completo e a tabela com condicoes especiais pra revenda. Qual seu email pra eu mandar a planilha?', msgTime(base, 43)),
        m('customer', 'Casa das Ferragens Maringá', 'marcelo@casadasferragens.com.br', msgTime(base, 48)),
        m('seller', 'Cintia Moraes', 'Enviado! Mandei o catalogo com todos os produtos, a tabela de revenda e um material de apoio pra voce expor na loja. Da uma olhada e qualquer duvida estou aqui. Posso te ligar na terca pra gente conversar melhor?', msgTime(base, 55)),
        m('customer', 'Casa das Ferragens Maringá', 'Pode sim, terca de manha ta otimo. Obrigado!', msgTime(base, 62)),
      ];
    })(),
  },

  // 2. Autopeças do interior consultando conjuntos graneleiro
  {
    id: 2,
    seller_id: 1,
    customer_name: 'Autopecas Rodovel LTDA',
    customer_phone: '5518999220002',
    message_count: 8,
    started_at: ago(4),
    last_message_at: ago(4, -3),
    status: 'active',
    analysis: {
      sentiment_label: 'neutro',
      sentiment_score: 0.18,
      quality_score: 7.0,
      quality_breakdown: midBreakdown(),
      stage: 'qualificacao',
      tone: 'cordial',
      summary: 'Autopeças de Presidente Prudente solicitou informações sobre conjunto graneleiro 1500kg e 3000kg. Cliente atende muitos caminhoneiros de grãos na região. Aguardando retorno após envio de ficha técnica.',
      keywords: ['graneleiro', 'conjunto', 'cinta', 'catraca', '1500kg', '3000kg', 'autopecas'],
      objections: [],
      objections_handled: [],
      analyzed_at: ago(4, -2),
    },
    messages: (() => {
      const base = ago(4);
      return [
        m('customer', 'Autopecas Rodovel LTDA', 'Bom dia, voces tem conjunto graneleiro? Aqui na regiao sai bastante', base),
        m('seller', 'Cintia Moraes', 'Bom dia! Temos sim! A MAVE tem o Conjunto Graneleiro em duas versoes: 1.500kg 35mm e 3.000kg. Sao usados pra fixacao da lona do graneleiro. Voce e revenda ou transportadora?', msgTime(base, 6)),
        m('customer', 'Autopecas Rodovel LTDA', 'Somos autopecas aqui em Presidente Prudente. Atendo muito caminhoneiro de graos que precisa repor. Quero saber preco pra revenda', msgTime(base, 18)),
        m('seller', 'Cintia Moraes', 'Perfeito! A regiao de Prudente realmente tem muita demanda pra graneleiro. Nossos conjuntos vem com cinta em poliester 100% e catraca, seguem a NBR 15883-2. O de 1.500kg e o mais vendido', msgTime(base, 24)),
        m('customer', 'Autopecas Rodovel LTDA', 'Quanto sai o kit? Quero montar um estoque de uns 50 conjuntos pra comecar', msgTime(base, 35)),
        m('seller', 'Cintia Moraes', 'Pra 50 conjuntos consigo uma condicao especial. Vou montar a proposta com o de 1.500kg e o de 3.000kg pra voce comparar. Posso mandar a ficha tecnica tambem?', msgTime(base, 40)),
        m('customer', 'Autopecas Rodovel LTDA', 'Manda a ficha sim. Preciso ver as especificacoes pra montar a exposicao na loja', msgTime(base, 50)),
        m('seller', 'Cintia Moraes', '[Midia]', msgTime(base, 55)),
      ];
    })(),
  },

  // 3. Posto de combustível — primeiro contato via site
  {
    id: 3,
    seller_id: 1,
    customer_name: 'Posto Rota Sul Combustiveis',
    customer_phone: '5551999330003',
    message_count: 6,
    started_at: ago(1),
    last_message_at: ago(1, -1),
    status: 'active',
    analysis: {
      sentiment_label: 'positivo',
      sentiment_score: 0.58,
      quality_score: 7.8,
      quality_breakdown: highBreakdown(),
      stage: 'primeiro_contato',
      tone: 'amigavel',
      summary: 'Posto de combustível na BR-116 quer montar expositor com produtos MAVE. Alta demanda de caminhoneiros que param para abastecer. Vendedora identificou oportunidade e encaminhou para consultor comercial.',
      keywords: ['posto', 'combustivel', 'caminhoneiro', 'expositor', 'extensores', 'cintas', 'BR-116'],
      objections: [],
      objections_handled: [],
      analyzed_at: ago(1),
    },
    messages: (() => {
      const base = ago(1);
      return [
        m('customer', 'Posto Rota Sul Combustiveis', 'Boa tarde! Somos um posto na BR-116 e queremos vender acessorios de amarracao de carga. Como funciona pra ser revendedor?', base),
        m('seller', 'Cintia Moraes', 'Boa tarde! Que legal! Postos de combustivel sao um dos melhores canais da MAVE, o caminhoneiro ja para ali e sempre precisa repor cinta, catraca ou extensor. Voces tem espaco pra expositor?', msgTime(base, 5)),
        m('customer', 'Posto Rota Sul Combustiveis', 'Temos sim, uma area de conveniencia grande. Passam uns 200 caminhoes por dia aqui', msgTime(base, 15)),
        m('seller', 'Cintia Moraes', 'Excelente! Com esse fluxo a saida e garantida. A MAVE tem um kit expositor proprio pra postos com os produtos mais vendidos: conjuntos de cinta e catraca 5.000kg, extensores elasticos e linha leve. Posso agendar uma visita do nosso consultor da regiao Sul?', msgTime(base, 20)),
        m('customer', 'Posto Rota Sul Combustiveis', 'Pode sim! Estamos em Camaqua, RS. Quando seria?', msgTime(base, 30)),
        m('seller', 'Cintia Moraes', 'Vou verificar a agenda do consultor e te retorno com data e horario. Enquanto isso vou te enviar nosso catalogo e condicoes pra postos. Obrigada pelo interesse!', msgTime(base, 34)),
      ];
    })(),
  },

  // 4. Loja agrícola — lead sem resposta
  {
    id: 4,
    seller_id: 1,
    customer_name: 'Agropecuaria Campo Forte',
    customer_phone: '5566999440004',
    message_count: 3,
    started_at: ago(8),
    last_message_at: ago(6),
    status: 'inactive',
    analysis: {
      sentiment_label: 'neutro',
      sentiment_score: 0.02,
      quality_score: 5.5,
      quality_breakdown: midBreakdown(),
      stage: 'sem_resposta',
      tone: 'neutro',
      summary: 'Loja agrícola de Mato Grosso não respondeu após 3 tentativas de contato. Lead possivelmente frio. Originated do formulário do site.',
      keywords: ['agropecuaria', 'loja agricola', 'follow-up', 'sem resposta', 'MT'],
      objections: [],
      objections_handled: [],
      analyzed_at: ago(6),
    },
    messages: (() => {
      const base = ago(8);
      return [
        m('seller', 'Cintia Moraes', 'Ola! Aqui e a Cintia da MAVE. Vi que voce solicitou orcamento de cintas de amarracao pelo nosso site. Posso ajudar?', base),
        m('seller', 'Cintia Moraes', 'Oi, tudo bem? Passando pra saber se conseguiu ver as informacoes. Temos condicoes especiais pra lojas agricolas!', msgTime(base, 1440)),
        m('seller', 'Cintia Moraes', 'Bom dia! Seguimos a disposicao caso precise de cintas e acessorios de amarracao. A MAVE e lider no segmento. Qualquer duvida me chame!', msgTime(base, 2880)),
      ];
    })(),
  },

  // 5. Implementadora rodoviária — qualificação técnica
  {
    id: 5,
    seller_id: 1,
    customer_name: 'Implementos Rodosul',
    customer_phone: '5554999550005',
    message_count: 9,
    started_at: ago(3),
    last_message_at: ago(3, -4),
    status: 'active',
    analysis: {
      sentiment_label: 'positivo',
      sentiment_score: 0.65,
      quality_score: 8.2,
      quality_breakdown: highBreakdown(),
      stage: 'qualificacao',
      tone: 'profissional',
      summary: 'Fabricante de implementos rodoviários quer incluir produtos MAVE como acessório original nas carretas que fabrica. Oportunidade de fornecimento recorrente OEM. Vendedora coletou especificações técnicas e encaminhou para engenharia.',
      keywords: ['implementos', 'OEM', 'catraca fixa', 'sider', 'carretas', 'NBR', 'homologacao'],
      objections: [],
      objections_handled: [],
      analyzed_at: ago(3, -3),
    },
    messages: (() => {
      const base = ago(3);
      return [
        m('customer', 'Implementos Rodosul', 'Bom dia, somos fabricantes de implementos rodviarios em Erechim/RS. Queremos incluir catracas fixas MAVE como acessorio original nas nossas carretas sider', base),
        m('seller', 'Cintia Moraes', 'Bom dia! Que oportunidade excelente! A MAVE ja fornece pra varios fabricantes de implementos. Temos a linha de catracas fixas em diversas configuracoes. Qual modelo de carreta voces fabricam?', msgTime(base, 8)),
        m('customer', 'Implementos Rodosul', 'Fabricamos sider, bau e graneleiro. Pro sider preciso de catraca fixa 5000kg com 5 furos zincada. Producao mensal de 40 carretas', msgTime(base, 18)),
        m('seller', 'Cintia Moraes', 'Temos exatamente esse modelo: Catraca Fixa Sider 5000kg Cinco Furos Zincada. Pra 40 unidades/mes consigo condicao de fornecimento OEM com preco diferenciado', msgTime(base, 24)),
        m('customer', 'Implementos Rodosul', 'Preciso de ficha tecnica detalhada, certificado NBR e laudo de carga pra homologacao interna', msgTime(base, 35)),
        m('seller', 'Cintia Moraes', 'Claro! Vou encaminhar pro nosso departamento de engenharia. A MAVE tem toda documentacao de conformidade com a NBR 15883-2. Te envio ate amanha', msgTime(base, 40)),
        m('customer', 'Implementos Rodosul', 'Perfeito. Alem da catraca fixa, vou precisar tambem da Cinta Lateral Sider 45mm com fixador e da Fivela Lateral Sider. Tudo pro mesmo modelo de carreta', msgTime(base, 52)),
        m('seller', 'Cintia Moraes', 'Anotado! Vou montar um pacote completo: Catraca Fixa 5000kg + Cinta Lateral Sider 45mm com Fixador + Fivela Lateral. Tudo pra sider, 40 kits/mes. Encaminho proposta tecnica e comercial ate amanha 10h', msgTime(base, 58)),
        m('customer', 'Implementos Rodosul', 'Combinado, aguardo. Meu email e compras@rodosul.com.br', msgTime(base, 65)),
      ];
    })(),
  },

  // =====================================================================
  // LUIS (id=2, closer) — 5 conversas
  // =====================================================================

  // 6. Distribuidora — fechamento de pedido grande
  {
    id: 6,
    seller_id: 2,
    customer_name: 'TP Distribuidora',
    customer_phone: '5511999660006',
    message_count: 10,
    started_at: ago(3),
    last_message_at: ago(3, -5),
    status: 'active',
    analysis: {
      sentiment_label: 'positivo',
      sentiment_score: 0.88,
      quality_score: 9.3,
      quality_breakdown: highBreakdown(),
      stage: 'fechamento',
      tone: 'amigavel',
      summary: 'Venda fechada para TP Distribuidora. Pedido de 100 conjuntos de cinta e catraca 5000kg 9m J + 200 extensores elásticos metal. Desconto progressivo de 18% aprovado. Pagamento faturado 30/60. Excelente negociação.',
      keywords: ['distribuidora', 'conjunto', '5000kg', 'extensores', 'desconto progressivo', 'faturado', 'lote'],
      objections: [{ tipo: 'preco', descricao: 'Pediu desconto maior pelo volume' }],
      objections_handled: [{ tipo: 'desconto', descricao: 'Desconto progressivo de 18% aprovado pela gerencia' }],
      analyzed_at: ago(3, -4),
    },
    messages: (() => {
      const base = ago(3);
      return [
        m('customer', 'TP Distribuidora', 'Luis, bom dia! Aqui e o Renato da TP. Preciso repor estoque, o giro foi muito bom esse mes', base),
        m('seller', 'Luis Henrique', 'Renato! Bom dia, que noticia boa! O que voce ta precisando?', msgTime(base, 4)),
        m('customer', 'TP Distribuidora', 'Preciso de 100 conjuntos de cinta e catraca 5000kg 9m J e 200 extensores elasticos metal azul premium 6mm', msgTime(base, 12)),
        m('seller', 'Luis Henrique', 'Pedido bom! Deixa eu consultar o estoque. O conjunto 5000kg J ta com saida forte, mas acho que consigo separar. Os extensores metal azul premium temos em pronta entrega', msgTime(base, 18)),
        m('customer', 'TP Distribuidora', 'Preciso de um preco bom nesse lote ein, Luis. Meu concorrente ta com preco agressivo', msgTime(base, 28)),
        m('seller', 'Luis Henrique', 'Entendo, Renato. Pra esse volume consigo o desconto progressivo de 18%. Deixa eu confirmar com a gerencia e te passo os valores finais', msgTime(base, 34)),
        m('seller', 'Luis Henrique', 'Confirmado! 100 conjuntos 5000kg + 200 extensores premium = R$ 47.560,00 com 18% de desconto. Faturado 30/60 conforme nosso cadastro', msgTime(base, 90)),
        m('customer', 'TP Distribuidora', 'Fechado! Manda o pedido pro faturamento. Entrega no nosso CD de Osasco', msgTime(base, 100)),
        m('seller', 'Luis Henrique', 'Pedido registrado! NF sai amanha e entrega em 3 dias uteis no CD de Osasco. Vou te mandar o rastreio assim que sair. Obrigado pela parceria, Renato!', msgTime(base, 108)),
        m('customer', 'TP Distribuidora', 'Valeu, Luis! Semana que vem ja vou precisar de toldo de lona tambem. Te chamo', msgTime(base, 115)),
      ];
    })(),
  },

  // 7. Revenda reclamando de produto — pós-venda negativo
  {
    id: 7,
    seller_id: 2,
    customer_name: 'Aldo Acessorios',
    customer_phone: '5521999770007',
    message_count: 10,
    started_at: ago(5),
    last_message_at: ago(5, -4),
    status: 'active',
    analysis: {
      sentiment_label: 'negativo',
      sentiment_score: -0.52,
      quality_score: 5.8,
      quality_breakdown: lowBreakdown(),
      stage: 'pos_venda',
      tone: 'insatisfeito',
      summary: 'Revenda Aldo Acessórios reclamou de lote de catracas 3000kg com mecanismo travando. 5 unidades com defeito de um lote de 30. Vendedor acionou garantia e organizou troca com frete reverso por conta da MAVE. Cliente insatisfeito mas aceitou resolução.',
      keywords: ['catraca', '3000kg', 'defeito', 'travando', 'garantia', 'troca', 'lote', 'frete reverso'],
      objections: [{ tipo: 'qualidade', descricao: 'Lote com catracas defeituosas' }],
      objections_handled: [{ tipo: 'diferencial', descricao: 'Troca imediata com frete reverso por conta da MAVE' }],
      analyzed_at: ago(5, -3),
    },
    messages: (() => {
      const base = ago(5);
      return [
        m('customer', 'Aldo Acessorios', 'Luis, preciso falar urgente. Recebi reclamacao de cliente sobre as catracas 3000kg J do ultimo lote', base),
        m('seller', 'Luis Henrique', 'Oi! O que aconteceu?', msgTime(base, 5)),
        m('customer', 'Aldo Acessorios', 'O mecanismo da catraca ta travando em 5 pecas. O cliente devolveu tudo na loja. Comprou 30 e 5 vieram com problema', msgTime(base, 12)),
        m('seller', 'Luis Henrique', 'Sinto muito por isso. Pode me mandar o numero da NF e fotos do defeito? Vou acionar a garantia imediatamente', msgTime(base, 16)),
        m('customer', 'Aldo Acessorios', 'NF 4587. To mandando as fotos', msgTime(base, 22)),
        m('customer', 'Aldo Acessorios', '[Midia]', msgTime(base, 24)),
        m('seller', 'Luis Henrique', 'Recebi. Realmente parece problema no mecanismo de travamento. Vou autorizar a troca das 5 unidades. Voce quer que a gente mande as novas antes e voce devolve as defeituosas depois?', msgTime(base, 32)),
        m('customer', 'Aldo Acessorios', 'Sim, preciso repor logo senao perco o cliente. Mas o frete tem que ser por conta de voces, nao vou pagar frete por defeito de fabrica', msgTime(base, 38)),
        m('seller', 'Luis Henrique', 'Com certeza, frete reverso por conta da MAVE. Vou despachar as 5 catracas novas hoje mesmo via transportadora expressa. Chega ate sexta. Peco desculpas pelo transtorno', msgTime(base, 44)),
        m('customer', 'Aldo Acessorios', 'Ta bom, aguardo. Mas isso nao pode se repetir, Luis. Compromete minha credibilidade aqui', msgTime(base, 50)),
      ];
    })(),
  },

  // 8. Negociação com transportadora — pedido frota
  {
    id: 8,
    seller_id: 2,
    customer_name: 'TransNorte Logistica S/A',
    customer_phone: '5592999880008',
    message_count: 10,
    started_at: ago(6),
    last_message_at: ago(5, 12),
    status: 'active',
    analysis: {
      sentiment_label: 'positivo',
      sentiment_score: 0.75,
      quality_score: 8.8,
      quality_breakdown: highBreakdown(),
      stage: 'negociacao',
      tone: 'profissional',
      summary: 'Transportadora de Manaus com 40 carretas precisa equipar toda frota com conjuntos de amarração. Orçamento de R$ 89.600 para kits completos. Proposta enviada, aguardando aprovação da diretoria. Cliente exige certificação INMETRO e NF com CFOP específico.',
      keywords: ['frota', 'transportadora', 'kit completo', '40 carretas', 'INMETRO', 'CFOP', 'Manaus'],
      objections: [{ tipo: 'orcamento', descricao: 'Precisa de aprovacao da diretoria' }],
      objections_handled: [{ tipo: 'desconto', descricao: 'Desconto de 15% no lote + frete CIF' }],
      analyzed_at: ago(5, 14),
    },
    messages: (() => {
      const base = ago(6);
      return [
        m('customer', 'TransNorte Logistica S/A', 'Bom dia! Sou gerente de frota da TransNorte. Precisamos equipar 40 carretas com conjuntos de amarracao que atendam a legislacao. Pode montar um orcamento?', base),
        m('seller', 'Luis Henrique', 'Bom dia! Claro! Pra 40 carretas temos kits completos. Quais tipos de carreta? Sider, bau, graneleiro?', msgTime(base, 8)),
        m('customer', 'TransNorte Logistica S/A', 'Misto: 20 sider, 12 bau e 8 graneleiro. Cada uma precisa ter no minimo 4 conjuntos de amarracao conforme a resolucao do CONTRAN', msgTime(base, 20)),
        m('seller', 'Luis Henrique', 'Perfeito, vou montar 3 kits diferentes. Pro sider recomendo o Conjunto 5000kg 9m Sider + Catraca Fixa. Pro bau o Conjunto 5000kg 9m J. Pro graneleiro o Conjunto Graneleiro 3000kg. Todos com certificacao NBR', msgTime(base, 30)),
        m('customer', 'TransNorte Logistica S/A', 'Preciso que tudo tenha rastreabilidade e certificado. E a NF tem que sair com CFOP de venda interestadual, 6102. Estamos em Manaus', msgTime(base, 42)),
        m('seller', 'Luis Henrique', 'Sem problema! A MAVE emite NF com qualquer CFOP necessario e nosso departamento fiscal cuida disso. Todos os produtos acompanham certificado de conformidade', msgTime(base, 48)),
        m('customer', 'TransNorte Logistica S/A', 'Qual o prazo de entrega pra Manaus e o valor total?', msgTime(base, 58)),
        m('seller', 'Luis Henrique', 'Montei a proposta: 160 conjuntos divididos nos 3 kits + catracas fixas pro sider. Total: R$ 89.600,00 com 15% de desconto no lote. Frete CIF, prazo de 8 dias uteis pra Manaus via transportadora', msgTime(base, 1500)),
        m('seller', 'Luis Henrique', '[Midia]', msgTime(base, 1502)),
        m('customer', 'TransNorte Logistica S/A', 'Vou apresentar pra diretoria. Aprovacao leva uns 5 dias uteis. Te confirmo assim que sair', msgTime(base, 1520)),
      ];
    })(),
  },

  // 9. Venda rápida pra ferragem — fechamento
  {
    id: 9,
    seller_id: 2,
    customer_name: 'FM Ferragens',
    customer_phone: '5547999990009',
    message_count: 8,
    started_at: ago(1),
    last_message_at: ago(0, 8),
    status: 'active',
    analysis: {
      sentiment_label: 'positivo',
      sentiment_score: 0.70,
      quality_score: 8.2,
      quality_breakdown: highBreakdown(),
      stage: 'fechamento',
      tone: 'cordial',
      summary: 'Recompra rápida de FM Ferragens. 30 conjuntos MAVE Pro 1500kg 40mm com case + 50 extensores plástico variados. Cliente fidelizado com desconto de 12%. Pagamento via boleto faturado.',
      keywords: ['recompra', 'MAVE Pro', '1500kg', 'case', 'extensores', 'fidelidade', 'ferragem'],
      objections: [],
      objections_handled: [],
      analyzed_at: ago(0, 7),
    },
    messages: (() => {
      const base = ago(1);
      return [
        m('customer', 'FM Ferragens', 'Luis, bom dia! Preciso repor. Me manda preco de 30 conjuntos MAVE Pro 1500kg com case e 50 extensores plastico sortidos', base),
        m('seller', 'Luis Henrique', 'Bom dia! Ja to cotando. O MAVE Pro 1500kg 40mm com case ta saindo bem ne?', msgTime(base, 6)),
        m('customer', 'FM Ferragens', 'Demais! O case faz toda diferenca na exposicao. O pessoal leva como presente ate. E os extensores a gente vende todo dia', msgTime(base, 14)),
        m('seller', 'Luis Henrique', 'Que bom! Pra voce: 30 MAVE Pro + 50 extensores plastico (10 de cada cor) = R$ 8.940,00 com seu desconto de cliente fidelizado de 12%', msgTime(base, 22)),
        m('customer', 'FM Ferragens', 'Fecha! Boleto faturado como sempre?', msgTime(base, 30)),
        m('seller', 'Luis Henrique', 'Isso! Boleto 21 dias. Entrega em 3 dias uteis em Blumenau. Vou registrar o pedido agora', msgTime(base, 34)),
        m('customer', 'FM Ferragens', 'Perfeito! Manda confirmacao pro meu email. Obrigado!', msgTime(base, 40)),
        m('seller', 'Luis Henrique', 'Registrado e confirmacao enviada! Obrigado pela preferencia. Qualquer coisa me chame!', msgTime(base, 45)),
      ];
    })(),
  },

  // 10. Venda perdida — demora no retorno
  {
    id: 10,
    seller_id: 2,
    customer_name: 'Dipecar Distribuidora',
    customer_phone: '5531999100010',
    message_count: 6,
    started_at: ago(14),
    last_message_at: ago(14, -4),
    status: 'inactive',
    analysis: {
      sentiment_label: 'negativo',
      sentiment_score: -0.58,
      quality_score: 3.9,
      quality_breakdown: lowBreakdown(),
      stage: 'perdido',
      tone: 'formal',
      summary: 'Venda perdida para Dipecar Distribuidora. Cliente solicitou orçamento urgente de cintas de elevação e vendedor demorou 3 dias para responder. Cliente fechou com concorrente. Perda estimada em R$ 12.000/mês recorrente.',
      keywords: ['cinta elevacao', 'demora', 'concorrente', 'perdido', 'distribuidora', 'urgente'],
      objections: [{ tipo: 'prazo', descricao: 'Demora de 3 dias no retorno' }],
      objections_handled: [],
      analyzed_at: ago(14, -3),
    },
    messages: (() => {
      const base = ago(14);
      return [
        m('customer', 'Dipecar Distribuidora', 'Oi Luis, preciso urgente de orcamento de cintas de elevacao: 20 unidades de 2t, 15 de 3t e 10 de 5t. Fecha ate amanha?', base),
        m('seller', 'Luis Henrique', 'Ola! Desculpe a demora no retorno. Segue o orcamento das cintas de elevacao: 20x 2t + 15x 3t + 10x 5t = R$ 14.250,00', msgTime(base, 4320)),
        m('customer', 'Dipecar Distribuidora', 'Luis, 3 dias pra responder um orcamento? Ja fechei com outro fornecedor. Precisava disso na segunda', msgTime(base, 4380)),
        m('seller', 'Luis Henrique', 'Peco desculpas, realmente falhei no prazo. Posso oferecer uma condicao especial pra proximo pedido pra compensar?', msgTime(base, 4400)),
        m('customer', 'Dipecar Distribuidora', 'Nao, ja assinei contrato de fornecimento mensal com o outro. Eram R$ 12.000 por mes. Fica pra proxima', msgTime(base, 4420)),
        m('seller', 'Luis Henrique', 'Entendo e lamento. Fico a disposicao caso precise no futuro. Nao vai se repetir', msgTime(base, 4440)),
      ];
    })(),
  },

  // =====================================================================
  // CAMILA (id=3, pre_sale/BDR) — 5 conversas
  // =====================================================================

  // 11. Rede de ferragens — oportunidade grande
  {
    id: 11,
    seller_id: 3,
    customer_name: 'Diasa Distribuidora de Acessorios',
    customer_phone: '5562999110011',
    message_count: 10,
    started_at: ago(2),
    last_message_at: ago(2, -5),
    status: 'active',
    analysis: {
      sentiment_label: 'positivo',
      sentiment_score: 0.80,
      quality_score: 9.0,
      quality_breakdown: highBreakdown(),
      stage: 'negociacao',
      tone: 'empolgado',
      summary: 'Distribuidora de acessórios de Goiânia com 150 clientes quer incluir linha MAVE no portfólio. Oportunidade de fornecimento para toda a rede de revendas do Centro-Oeste. Reunião online agendada para apresentação comercial completa.',
      keywords: ['distribuidora', 'rede', 'Centro-Oeste', 'portfolio', 'revendas', '150 clientes', 'reuniao'],
      objections: [{ tipo: 'orcamento', descricao: 'Quer exclusividade regional' }],
      objections_handled: [{ tipo: 'condicao_especial', descricao: 'Ofereceu condições de distribuidor com tabela diferenciada' }],
      analyzed_at: ago(2, -4),
    },
    messages: (() => {
      const base = ago(2);
      return [
        m('customer', 'Diasa Distribuidora de Acessorios', 'Boa tarde! Somos a Diasa, distribuidora de acessorios automotivos em Goiania. Atendemos 150 revendas no Centro-Oeste. Queremos incluir MAVE no nosso portfolio', base),
        m('seller', 'Camila Ferreira', 'Boa tarde! Que prazer! Conheco a Diasa de nome, referencia no Centro-Oeste. A MAVE tem muito interesse em ter voces como distribuidor. Quais linhas teriam mais saida pra voces?', msgTime(base, 6)),
        m('customer', 'Diasa Distribuidora de Acessorios', 'Cintas com catraca e extensores sao o carro-chefe pra nossos clientes. Ferragens, autopecas e lojas agricolas. Temos CD proprio e frota de entrega', msgTime(base, 15)),
        m('seller', 'Camila Ferreira', 'Perfeito! Com essa capilaridade voces seriam um parceiro estrategico. A MAVE tem tabela especial pra distribuidores com margem diferenciada. Posso agendar uma reuniao online com nosso gerente comercial?', msgTime(base, 20)),
        m('customer', 'Diasa Distribuidora de Acessorios', 'Pode sim! Seria importante a gente ver toda a linha, precos de distribuidor e se tem exclusividade de regiao', msgTime(base, 32)),
        m('seller', 'Camila Ferreira', 'Sobre exclusividade vamos conversar na reuniao, mas ja adianto que temos politica de protecao territorial pra distribuidores de alto volume. Qual dia fica bom?', msgTime(base, 38)),
        m('customer', 'Diasa Distribuidora de Acessorios', 'Quarta as 14h funciona?', msgTime(base, 45)),
        m('seller', 'Camila Ferreira', 'Agendado! Quarta 14h via Google Meet. Vou enviar o link e uma previa do catalogo com a tabela distribuidor pra voces ja irem vendo. Participam voce e mais alguem?', msgTime(base, 48)),
        m('customer', 'Diasa Distribuidora de Acessorios', 'Eu e o diretor comercial, Ricardo. Manda o link pro email comercial@diasa.com.br', msgTime(base, 55)),
        m('seller', 'Camila Ferreira', 'Link e material enviados! Ate quarta. Obrigada pela oportunidade!', msgTime(base, 62)),
      ];
    })(),
  },

  // 12. Recompra — cliente fidelizado
  {
    id: 12,
    seller_id: 3,
    customer_name: 'SIM Distribuidora',
    customer_phone: '5541999220012',
    message_count: 9,
    started_at: ago(7),
    last_message_at: ago(7, -4),
    status: 'active',
    analysis: {
      sentiment_label: 'positivo',
      sentiment_score: 0.85,
      quality_score: 9.2,
      quality_breakdown: highBreakdown(),
      stage: 'recompra',
      tone: 'amigavel',
      summary: 'Recompra de SIM Distribuidora, cliente fidelizado há 2 anos. Pedido de reposição: 80 conjuntos 3000kg J + 40 conjuntos 1500kg Sider + 100 extensores metal. Desconto de fidelidade 14%. Logística rápida para Curitiba.',
      keywords: ['recompra', 'fidelidade', 'distribuidora', 'conjuntos', '3000kg', '1500kg', 'extensores'],
      objections: [],
      objections_handled: [],
      analyzed_at: ago(7, -3),
    },
    messages: (() => {
      const base = ago(7);
      return [
        m('seller', 'Camila Ferreira', 'Oi Sandra! Tudo bem? Vi que faz 45 dias do ultimo pedido. Precisa repor alguma coisa?', base),
        m('customer', 'SIM Distribuidora', 'Oi Camila! Preciso sim, o giro ta excelente. Vou te mandar a lista', msgTime(base, 18)),
        m('customer', 'SIM Distribuidora', '80 conjuntos cinta e catraca 3000kg 9m J\n40 conjuntos 1500kg 9m Sider\n100 extensores metal variados (pode sortir as cores)', msgTime(base, 22)),
        m('seller', 'Camila Ferreira', 'Otimo pedido! Como voce ja e cliente ha 2 anos, seu desconto de fidelidade e de 14%. Vou montar o orcamento rapidinho', msgTime(base, 28)),
        m('customer', 'SIM Distribuidora', 'Perfeito! Preciso que chegue ate sexta se possivel, temos um evento de vendas no sabado', msgTime(base, 35)),
        m('seller', 'Camila Ferreira', 'Segue: 80x 3000kg J + 40x 1500kg Sider + 100 extensores metal = R$ 32.480,00 com 14% desc = R$ 27.932,80. Consigo despachar amanha e chega ate quinta em Curitiba!', msgTime(base, 50)),
        m('customer', 'SIM Distribuidora', 'Aprovado! Fatura no mesmo CNPJ. E manda uns catalogos extras pro evento', msgTime(base, 58)),
        m('seller', 'Camila Ferreira', 'Registrado! Vou incluir 50 catalogos e uns display de mesa MAVE pro evento. Sem custo. Pedido sai amanha cedo!', msgTime(base, 64)),
        m('customer', 'SIM Distribuidora', 'Arrasou! Obrigada, Camila. A MAVE e sempre nossa melhor parceira', msgTime(base, 70)),
      ];
    })(),
  },

  // 13. Reclamação de atraso — pós-venda negativo
  {
    id: 13,
    seller_id: 3,
    customer_name: 'Casa do Caminhoneiro Autopecas',
    customer_phone: '5585999330013',
    message_count: 9,
    started_at: ago(4),
    last_message_at: ago(4, -5),
    status: 'active',
    analysis: {
      sentiment_label: 'negativo',
      sentiment_score: -0.40,
      quality_score: 6.5,
      quality_breakdown: midBreakdown(),
      stage: 'pos_venda',
      tone: 'urgente',
      summary: 'Autopeças de Fortaleza reclamou de atraso de 5 dias na entrega de conjuntos de amarração. Pedido travado na transportadora. Vendedora resolveu reenviando via aéreo sem custo. Cliente aceitou mas alertou sobre futuros pedidos.',
      keywords: ['atraso', 'entrega', 'transportadora', 'Fortaleza', 'via aerea', 'urgente', 'autopecas'],
      objections: [{ tipo: 'prazo', descricao: 'Atraso de 5 dias na entrega' }],
      objections_handled: [{ tipo: 'frete_gratis', descricao: 'Reenvio via aéreo sem custo adicional' }],
      analyzed_at: ago(4, -4),
    },
    messages: (() => {
      const base = ago(4);
      return [
        m('customer', 'Casa do Caminhoneiro Autopecas', 'Camila, meu pedido 5832 era pra ter chegado segunda e nada ate agora. Ja sao 5 dias de atraso!', base),
        m('seller', 'Camila Ferreira', 'Oi! Peco desculpas! Deixa eu rastrear agora. Qual a NF?', msgTime(base, 4)),
        m('customer', 'Casa do Caminhoneiro Autopecas', 'NF 23.847. Sao 40 conjuntos 5000kg que meu cliente ta cobrando. Perdi venda por causa disso', msgTime(base, 10)),
        m('seller', 'Camila Ferreira', 'Rastreei aqui: a carga ta parada no hub da transportadora em Salvador ha 3 dias. Problema de redistribuicao deles. Vou resolver agora', msgTime(base, 18)),
        m('customer', 'Casa do Caminhoneiro Autopecas', 'Nao adianta ficar esperando transportadora. Preciso disso URGENTE, Camila', msgTime(base, 25)),
        m('seller', 'Camila Ferreira', 'Entendo perfeitamente. Vou separar 40 conjuntos do nosso estoque e enviar via aerea pra Fortaleza. Chega amanha. Sem custo adicional, e responsabilidade nossa', msgTime(base, 32)),
        m('customer', 'Casa do Caminhoneiro Autopecas', 'Via aerea? Serio? Ok, se chegar amanha resolve meu problema', msgTime(base, 38)),
        m('seller', 'Camila Ferreira', 'Confirmado! Despacho via LATAM Cargo hoje, chega amanha ate 14h no aeroporto de Fortaleza. Vou te mandar o AWB. E o outro envio quando chegar voce pode recusar ou manter como estoque extra', msgTime(base, 48)),
        m('customer', 'Casa do Caminhoneiro Autopecas', 'Ta bom, Camila. Agradeco a solucao rapida, mas preciso que isso nao se repita. Meus clientes nao aceitam atraso', msgTime(base, 55)),
      ];
    })(),
  },

  // 14. Indicação de cliente — pós-venda positivo
  {
    id: 14,
    seller_id: 3,
    customer_name: 'Rodoviario Gauchos Autopecas',
    customer_phone: '5555999440014',
    message_count: 7,
    started_at: ago(5),
    last_message_at: ago(5, -3),
    status: 'active',
    analysis: {
      sentiment_label: 'positivo',
      sentiment_score: 0.82,
      quality_score: 8.5,
      quality_breakdown: highBreakdown(),
      stage: 'pos_venda',
      tone: 'cordial',
      summary: 'Cliente satisfeito indicou 2 autopeças da região para se tornarem revendas MAVE. Vendedora aproveitou para oferecer desconto de indicação. Relacionamento excelente com a revenda gaúcha.',
      keywords: ['indicacao', 'revenda', 'autopecas', 'satisfeito', 'desconto', 'Rio Grande do Sul'],
      objections: [],
      objections_handled: [],
      analyzed_at: ago(5, -2),
    },
    messages: (() => {
      const base = ago(5);
      return [
        m('customer', 'Rodoviario Gauchos Autopecas', 'Oi Camila! Os conjuntos 5000kg J Compacto Laranja que mandou sao show! Os clientes adoraram o tamanho menor da catraca. Mais pratico', base),
        m('seller', 'Camila Ferreira', 'Oi Seu Jorge! Que bom ouvir isso! O modelo compacto realmente caiu no gosto do caminhoneiro. Menos peso e mesmo desempenho', msgTime(base, 8)),
        m('customer', 'Rodoviario Gauchos Autopecas', 'Olha, to te indicando pra duas autopecas aqui da regiao de Passo Fundo que nao tem MAVE ainda. O Mundo do Truck e a Truckao Pecas. Os donos sao meus amigos', msgTime(base, 18)),
        m('seller', 'Camila Ferreira', 'Que maravilha, Seu Jorge! Pode passar meu contato sim. Vou entrar em contato com eles tambem. E como agradecimento, no seu proximo pedido voce ganha 10% extra de desconto!', msgTime(base, 22)),
        m('customer', 'Rodoviario Gauchos Autopecas', 'Opa! Anota ai: Mundo do Truck - Carlos, 55 99771-2233. Truckao Pecas - Beto, 55 99882-3344', msgTime(base, 30)),
        m('seller', 'Camila Ferreira', 'Anotado! Vou ligar pra eles hoje ainda. Obrigada pela confianca, Seu Jorge. A MAVE agradece parceiros como voce!', msgTime(base, 35)),
        m('customer', 'Rodoviario Gauchos Autopecas', 'Imagina! Produto bom a gente indica. Ate mais, Camila!', msgTime(base, 42)),
      ];
    })(),
  },

  // 15. Cotação concorrida — negociação tensa
  {
    id: 15,
    seller_id: 3,
    customer_name: 'Rede Truck Center (8 lojas)',
    customer_phone: '5519999550015',
    message_count: 9,
    started_at: ago(3),
    last_message_at: ago(3, -4),
    status: 'active',
    analysis: {
      sentiment_label: 'neutro',
      sentiment_score: 0.08,
      quality_score: 7.1,
      quality_breakdown: midBreakdown(),
      stage: 'negociacao',
      tone: 'formal',
      summary: 'Rede com 8 lojas de autopeças para caminhões no interior de SP fazendo cotação com 3 fornecedores. Cliente quer preço agressivo, exclusividade de região e suporte de merchandising. Vendedora apresentou diferenciais mas cliente ainda está comparando.',
      keywords: ['rede', 'cotacao', 'concorrencia', '8 lojas', 'merchandising', 'exclusividade', 'SP'],
      objections: [
        { tipo: 'preco', descricao: 'Concorrente esta com preco 8% menor' },
        { tipo: 'concorrencia', descricao: 'Cotando com 3 fornecedores' },
      ],
      objections_handled: [{ tipo: 'diferencial', descricao: 'Destacou certificacao NBR, garantia e suporte de merchandising' }],
      analyzed_at: ago(3, -3),
    },
    messages: (() => {
      const base = ago(3);
      return [
        m('customer', 'Rede Truck Center (8 lojas)', 'Boa tarde. Somos a Rede Truck Center, 8 lojas de autopecas pra caminhao no interior de SP. Estamos cotando cintas de amarracao com 3 fornecedores. Pode mandar proposta?', base),
        m('seller', 'Camila Ferreira', 'Boa tarde! Conhaco a Rede Truck Center! Sera um prazer atender voces. Quais produtos e quantidades precisa pra eu montar a proposta?', msgTime(base, 8)),
        m('customer', 'Rede Truck Center (8 lojas)', 'Pra cada loja: 15 conjuntos 5000kg J, 10 conjuntos 3000kg J, 20 conjuntos 1500kg com case e 30 extensores. Vezes 8 lojas', msgTime(base, 18)),
        m('seller', 'Camila Ferreira', 'Pedido expressivo! Sao 120 conj 5000kg + 80 conj 3000kg + 160 MAVE Pro 1500kg + 240 extensores. Vou montar com nossa melhor condicao de rede', msgTime(base, 24)),
        m('customer', 'Rede Truck Center (8 lojas)', 'Preciso de preco competitivo. O outro fornecedor ta 8% mais barato. E queremos exclusividade na regiao de Campinas e Ribeirao', msgTime(base, 35)),
        m('seller', 'Camila Ferreira', 'Entendo. Nosso diferencial em relacao a concorrencia: certificacao NBR 15883-2, garantia de 2 anos, reposicao em 48h e suporte de merchandising com displays, banners e treinamento pra equipe de vendas das 8 lojas', msgTime(base, 42)),
        m('customer', 'Rede Truck Center (8 lojas)', 'O merchandising me interessa. Manda proposta completa com valor, prazo e o que inclui de suporte. Decido ate sexta', msgTime(base, 52)),
        m('seller', 'Camila Ferreira', 'Proposta enviada por email! Inclui: preco de rede com desconto de 16%, display expositor pra cada loja, 200 catalogos, banner e treinamento presencial. Prazo de entrega 5 dias uteis. Posso ligar quinta pra esclarecer duvidas?', msgTime(base, 120)),
        m('customer', 'Rede Truck Center (8 lojas)', 'Pode ligar quinta as 15h. Vou analisar a proposta junto com as outras', msgTime(base, 135)),
      ];
    })(),
  },
];

export function getConversationById(id) {
  return conversations.find((c) => c.id === Number(id)) || null;
}

export function filterConversations({
  search,
  seller_id,
  team,
  sentiment,
  stage,
  status,
  date_from,
  date_to,
  skip = 0,
  limit = 20,
} = {}) {
  let filtered = [...conversations];

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.customer_name.toLowerCase().includes(q) ||
        c.customer_phone.includes(q)
    );
  }
  if (seller_id) {
    filtered = filtered.filter((c) => c.seller_id === Number(seller_id));
  }
  if (team) {
    const teamSellerIds = { closer: [2], pre_sale: [1, 3] };
    const ids = teamSellerIds[team] || [];
    filtered = filtered.filter((c) => ids.includes(c.seller_id));
  }
  if (sentiment) {
    filtered = filtered.filter(
      (c) => c.analysis?.sentiment_label === sentiment
    );
  }
  if (stage) {
    filtered = filtered.filter((c) => c.analysis?.stage === stage);
  }
  if (status) {
    filtered = filtered.filter((c) => c.status === status);
  }
  if (date_from) {
    filtered = filtered.filter((c) => c.last_message_at >= date_from);
  }
  if (date_to) {
    filtered = filtered.filter(
      (c) => c.last_message_at <= date_to + 'T23:59:59Z'
    );
  }

  // Sort by most recent
  filtered.sort(
    (a, b) => new Date(b.last_message_at) - new Date(a.last_message_at)
  );

  const total = filtered.length;
  const items = filtered.slice(skip, skip + limit);

  return {
    conversations: items,
    total,
    total_pages: Math.ceil(total / limit),
  };
}

export { conversations };
