// Mock alerts data - 8 alerts, mutable in-memory

const now = new Date();
const ago = (days, hours = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours);
  return d.toISOString();
};

let alerts = [
  {
    id: 1,
    conversation_id: 10,
    seller_id: 2,
    seller_name: 'Luis Henrique',
    alert_type: 'tempo_resposta_alto',
    severity: 'high',
    message: 'Vendedor Luis Henrique com tempo medio de resposta acima de 30 minutos nas ultimas 24h.',
    created_at: ago(1),
    resolved: false,
    resolved_at: null,
  },
  {
    id: 2,
    conversation_id: 7,
    seller_id: 2,
    seller_name: 'Luis Henrique',
    alert_type: 'sentimento_negativo',
    severity: 'critical',
    message: 'Conversa com revenda Aldo Acessorios apresenta sentimento negativo persistente. Reclamacao de lote com defeito. Intervencao recomendada.',
    created_at: ago(5),
    resolved: true,
    resolved_at: ago(4, 12),
  },
  {
    id: 3,
    conversation_id: null,
    seller_id: 3,
    seller_name: 'Camila Ferreira',
    alert_type: 'inatividade',
    severity: 'medium',
    message: 'Vendedor Camila Ferreira sem enviar mensagens ha mais de 4 horas em horario comercial.',
    created_at: ago(2),
    resolved: false,
    resolved_at: null,
  },
  {
    id: 4,
    conversation_id: 10,
    seller_id: 2,
    seller_name: 'Luis Henrique',
    alert_type: 'oportunidade_perdida',
    severity: 'medium',
    message: 'Dipecar Distribuidora nao recebeu retorno em 72h. Oportunidade de R$ 12.000/mes perdida por tempo de resposta.',
    created_at: ago(14),
    resolved: true,
    resolved_at: ago(13),
  },
  {
    id: 5,
    conversation_id: 4,
    seller_id: 1,
    seller_name: 'Cintia Moraes',
    alert_type: 'volume_baixo',
    severity: 'low',
    message: 'Vendedor Cintia Moraes com volume de conversas 40% abaixo da media da equipe de pre-venda.',
    created_at: ago(3),
    resolved: false,
    resolved_at: null,
  },
  {
    id: 6,
    conversation_id: 15,
    seller_id: 3,
    seller_name: 'Camila Ferreira',
    alert_type: 'objecao_nao_tratada',
    severity: 'medium',
    message: 'Conversa com Rede Truck Center: objecao de preco do concorrente (8% menor) precisa de melhor tratamento.',
    created_at: ago(3),
    resolved: false,
    resolved_at: null,
  },
  {
    id: 7,
    conversation_id: null,
    seller_id: 1,
    seller_name: 'Cintia Moraes',
    alert_type: 'qualidade_baixa',
    severity: 'high',
    message: 'Score de qualidade do vendedor Cintia Moraes caiu abaixo de 5.0 no dia de hoje.',
    created_at: ago(6),
    resolved: true,
    resolved_at: ago(5, 8),
  },
  {
    id: 8,
    conversation_id: 13,
    seller_id: 3,
    seller_name: 'Camila Ferreira',
    alert_type: 'sentimento_negativo',
    severity: 'critical',
    message: 'Conversa com Casa do Caminhoneiro Autopecas apresenta sentimento negativo. Atraso de 5 dias na entrega. Intervencao recomendada.',
    created_at: ago(4),
    resolved: true,
    resolved_at: ago(4, -2),
  },
];

export function getAlerts({ seller_id, severity, resolved, limit = 50 } = {}) {
  let filtered = [...alerts];
  if (seller_id != null) {
    filtered = filtered.filter((a) => a.seller_id === Number(seller_id));
  }
  if (severity) {
    filtered = filtered.filter((a) => a.severity === severity);
  }
  if (resolved !== undefined && resolved !== null && resolved !== '') {
    const isResolved = resolved === true || resolved === 'true';
    filtered = filtered.filter((a) => a.resolved === isResolved);
  }
  filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return filtered.slice(0, limit);
}

export function resolveAlert(id) {
  const alert = alerts.find((a) => a.id === Number(id));
  if (alert) {
    alert.resolved = true;
    alert.resolved_at = new Date().toISOString();
    return alert;
  }
  return null;
}

export { alerts };
