// Mock sellers data - 3 sellers with 30 days of metrics

const today = new Date();
const fmt = (d) => d.toISOString().split('T')[0];

function generateMetrics(team, days = 30) {
  const metrics = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    // Skip some weekends
    if (d.getDay() === 0 && Math.random() < 0.7) continue;

    let convs, msgs, quality, avgResp;
    if (team === 'pre_sale') {
      convs = 8 + Math.floor(Math.random() * 12);
      msgs = 30 + Math.floor(Math.random() * 70);
      quality = +(5.5 + Math.random() * 3.0).toFixed(1);
      avgResp = +(60 + Math.random() * 300).toFixed(1);
    } else if (team === 'closer') {
      convs = 4 + Math.floor(Math.random() * 8);
      msgs = 20 + Math.floor(Math.random() * 60);
      quality = +(6.5 + Math.random() * 3.0).toFixed(1);
      avgResp = +(120 + Math.random() * 400).toFixed(1);
    } else {
      convs = 3 + Math.floor(Math.random() * 6);
      msgs = 15 + Math.floor(Math.random() * 40);
      quality = +(5.0 + Math.random() * 3.5).toFixed(1);
      avgResp = +(180 + Math.random() * 600).toFixed(1);
    }

    const totalResp = 5 + Math.floor(Math.random() * convs * 2);
    const under5 = Math.floor(totalResp * (0.3 + Math.random() * 0.4));
    const r530 = Math.floor(totalResp * (0.1 + Math.random() * 0.2));
    const r3060 = Math.floor(totalResp * (0.05 + Math.random() * 0.1));
    const over60 = Math.max(0, totalResp - under5 - r530 - r3060);

    metrics.push({
      date: fmt(d),
      conversations_started: convs,
      messages_sent: msgs,
      quality_avg: quality,
      avg_response_time_seconds: avgResp,
      response_under_5min: under5,
      response_5_30min: r530,
      response_30_60min: r3060,
      response_over_60min: over60,
    });
  }
  return metrics;
}

export const sellers = [
  {
    id: 1,
    name: 'Cintia Moraes',
    phone: '5511999003001',
    team: 'pre_sale',
    instance_name: 'mave-cintia',
    is_active: true,
    active: true,
    total_conversations: 42,
    conversation_count: 42,
    avg_response_time_seconds: 195.3,
    avg_score: 7.4,
    recent_metrics: generateMetrics('pre_sale'),
  },
  {
    id: 2,
    name: 'Luis Henrique',
    phone: '5511999001001',
    team: 'closer',
    instance_name: 'mave-luis',
    is_active: true,
    active: true,
    total_conversations: 35,
    conversation_count: 35,
    avg_response_time_seconds: 245.8,
    avg_score: 8.1,
    recent_metrics: generateMetrics('closer'),
  },
  {
    id: 3,
    name: 'Camila Ferreira',
    phone: '5511999003002',
    team: 'pre_sale',
    instance_name: 'mave-camila',
    is_active: true,
    active: true,
    total_conversations: 38,
    conversation_count: 38,
    avg_response_time_seconds: 172.6,
    avg_score: 6.9,
    recent_metrics: generateMetrics('pre_sale'),
  },
];

export function getSellerById(id) {
  return sellers.find((s) => s.id === Number(id)) || null;
}

export function filterSellers({ page = 1, page_size = 20, search, team, limit } = {}) {
  let filtered = [...sellers];
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (s) => s.name.toLowerCase().includes(q) || s.phone.includes(q)
    );
  }
  if (team) {
    filtered = filtered.filter((s) => s.team === team);
  }
  const size = limit || page_size || 20;
  const p = page || 1;
  const start = (p - 1) * size;
  const items = filtered.slice(start, start + size);
  return {
    items,
    total: filtered.length,
    total_pages: Math.ceil(filtered.length / size),
    page: p,
  };
}
