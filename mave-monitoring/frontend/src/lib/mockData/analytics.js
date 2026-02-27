// Mock analytics data

const today = new Date();
const fmt = (d) => d.toISOString().split('T')[0];

// Dashboard stats
export const dashboardStats = {
  total_conversations: 115,
  total_messages_today: 47,
  response_time_avg_seconds: 204.5,
  avg_quality: 7.3,
  conversations_change: 12.5,
  messages_change: -3.2,
  response_time_change: -8.4,
  quality_change: 5.1,
  sentiment_distribution: {
    positivo: 48,
    neutro: 39,
    negativo: 22,
    frustrado: 6,
  },
};

// 30-day time series
export function generateTimeSeries(days = 30) {
  const items = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    items.push({
      date: fmt(d),
      conversations: 8 + Math.floor(Math.random() * 15),
      messages: 40 + Math.floor(Math.random() * 80),
      avg_score: +(5.5 + Math.random() * 3.5).toFixed(1),
      quality_avg: +(5.5 + Math.random() * 3.5).toFixed(1),
      avg_response_time_seconds: +(120 + Math.random() * 400).toFixed(1),
    });
  }
  return items;
}

// Heatmap 7 days x 24 hours
export function generateHeatmap() {
  const data = [];
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      let count = 0;
      // Business hours (8-18, Mon-Fri) have more activity
      if (day >= 1 && day <= 5) {
        if (hour >= 8 && hour <= 12) {
          count = 5 + Math.floor(Math.random() * 20);
        } else if (hour >= 13 && hour <= 18) {
          count = 3 + Math.floor(Math.random() * 15);
        } else if (hour >= 6 && hour < 8) {
          count = Math.floor(Math.random() * 5);
        } else {
          count = Math.floor(Math.random() * 2);
        }
      } else {
        // Weekends - low activity
        if (hour >= 9 && hour <= 14) {
          count = Math.floor(Math.random() * 4);
        } else {
          count = Math.floor(Math.random() * 1);
        }
      }
      data.push({
        day_of_week: day,
        day_name: dayNames[day],
        hour,
        count,
      });
    }
  }
  return data;
}

// Ranking data
export function generateRanking(metric = 'score') {
  const sellers = [
    { seller_id: 1, seller_name: 'Cintia Moraes', team: 'pre_sale' },
    { seller_id: 2, seller_name: 'Luis Henrique', team: 'closer' },
    { seller_id: 3, seller_name: 'Camila Ferreira', team: 'pre_sale' },
  ];

  return sellers
    .map((s) => {
      let value;
      switch (metric) {
        case 'score':
          value = +(6.0 + Math.random() * 3.5).toFixed(1);
          break;
        case 'response_time':
          value = +(120 + Math.random() * 400).toFixed(1);
          break;
        case 'conversations':
          value = 15 + Math.floor(Math.random() * 30);
          break;
        case 'messages':
          value = 80 + Math.floor(Math.random() * 200);
          break;
        default:
          value = +(6.0 + Math.random() * 3.5).toFixed(1);
      }
      return { ...s, value, metric };
    })
    .sort((a, b) => {
      if (metric === 'response_time') return a.value - b.value;
      return b.value - a.value;
    });
}

// Team comparison
export const teamComparison = {
  teams: [
    {
      team: 'closer',
      seller_count: 1,
      total_conversations: 35,
      conversations_total: 35,
      messages_total: 245,
      avg_quality: 8.1,
      avg_response_time_seconds: 245.8,
      avg_score: 8.1,
    },
    {
      team: 'pre_sale',
      seller_count: 2,
      total_conversations: 80,
      conversations_total: 80,
      messages_total: 520,
      avg_quality: 7.15,
      avg_response_time_seconds: 183.9,
      avg_score: 7.15,
    },
  ],
};

// Trends (4 weeks)
export function generateTrends(weeks = 4) {
  const data = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const d = new Date(today);
    d.setDate(d.getDate() - w * 7);
    data.push({
      week_start: fmt(d),
      conversations: 20 + Math.floor(Math.random() * 30),
      messages: 120 + Math.floor(Math.random() * 150),
      avg_score: +(6.0 + Math.random() * 3.0).toFixed(1),
      avg_response_time_seconds: +(150 + Math.random() * 300).toFixed(1),
    });
  }
  return data;
}

// Sentiment distribution
export const sentimentDistribution = {
  positivo: 48,
  neutro: 39,
  negativo: 22,
  frustrado: 6,
};

// Response time distribution
export const responseTimeDistribution = {
  under_5min: 45,
  '5_30min': 28,
  '30_60min': 15,
  over_60min: 12,
};
