import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Users,
  UsersRound,
  TrendingUp,
  TrendingDown,
  MessageSquare,
  Clock,
  Star,
  Send,
} from 'lucide-react';
import * as api from '../lib/api';
import toast from 'react-hot-toast';

const TEAMS = [
  { key: 'closers', label: 'Closers', dbKey: 'closer' },
  { key: 'farmers', label: 'Farmers', dbKey: 'farmer' },
  { key: 'pre_sale', label: 'Pre-venda', dbKey: 'pre_sale' },
  { key: 'all', label: 'Todos', dbKey: null },
];

const TEAM_COLORS = {
  closers: '#4c6ef5',
  farmers: '#37b24d',
  pre_sale: '#f59f00',
};

const TEAM_LABELS = {
  closers: 'Closers',
  closer: 'Closers',
  farmers: 'Farmers',
  farmer: 'Farmers',
  pre_sale: 'Pre-venda',
};

function formatResponseTime(seconds) {
  if (seconds == null) return '--';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return `${hours}h${mins > 0 ? ` ${mins}m` : ''}`;
}

function formatScore(score) {
  if (score == null) return '--';
  return Number(score).toFixed(1);
}

function percentChange(current, previous) {
  if (previous == null || previous === 0 || current == null) return null;
  return ((current - previous) / previous) * 100;
}

function ChangeIndicator({ value, invertColor = false }) {
  if (value == null) return <span className="text-xs text-gray-400">--</span>;
  const isPositive = value >= 0;
  const displayPositive = invertColor ? !isPositive : isPositive;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        displayPositive ? 'text-emerald-600' : 'text-red-500'
      }`}
    >
      {isPositive ? (
        <TrendingUp className="w-3.5 h-3.5" />
      ) : (
        <TrendingDown className="w-3.5 h-3.5" />
      )}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export default function TeamView() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('closers');
  const [loading, setLoading] = useState(true);
  const [teamComparison, setTeamComparison] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [sellersLoading, setSellersLoading] = useState(false);
  const [trends, setTrends] = useState([]);
  const [trendsLoading, setTrendsLoading] = useState(true);

  // Load team comparison data
  useEffect(() => {
    loadTeamComparison();
    loadTrends();
  }, []);

  // Load sellers when tab changes
  useEffect(() => {
    loadSellers();
  }, [activeTab]);

  async function loadTeamComparison() {
    setLoading(true);
    try {
      const response = await api.getTeamComparison();
      setTeamComparison(response.data.teams || []);
    } catch (error) {
      toast.error('Erro ao carregar comparacao de equipes');
      console.error('Team comparison error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadSellers() {
    setSellersLoading(true);
    try {
      const activeTeamObj = TEAMS.find((t) => t.key === activeTab);
      const params = { active: true, limit: 100 };
      if (activeTeamObj?.dbKey) {
        params.team = activeTeamObj.dbKey;
      }
      const response = await api.getSellers(params);
      const sellerList = response.data.sellers || [];

      // Enrich sellers with metrics by fetching ranking data
      const rankingParams = { limit: 50 };
      if (activeTeamObj?.dbKey) {
        rankingParams.team = activeTeamObj.dbKey;
      }

      const [scoreRanking, rtRanking, convRanking, msgRanking] =
        await Promise.all([
          api
            .getRanking({ ...rankingParams, metric: 'score' })
            .catch(() => ({ data: { rankings: [] } })),
          api
            .getRanking({ ...rankingParams, metric: 'response_time' })
            .catch(() => ({ data: { rankings: [] } })),
          api
            .getRanking({ ...rankingParams, metric: 'conversations' })
            .catch(() => ({ data: { rankings: [] } })),
          api
            .getRanking({ ...rankingParams, metric: 'messages' })
            .catch(() => ({ data: { rankings: [] } })),
        ]);

      const scoreMap = {};
      (scoreRanking.data.rankings || []).forEach((r) => {
        scoreMap[r.seller_id] = r.value;
      });

      const rtMap = {};
      (rtRanking.data.rankings || []).forEach((r) => {
        rtMap[r.seller_id] = r.value;
      });

      const convMap = {};
      (convRanking.data.rankings || []).forEach((r) => {
        convMap[r.seller_id] = r.value;
      });

      const msgMap = {};
      (msgRanking.data.rankings || []).forEach((r) => {
        msgMap[r.seller_id] = r.value;
      });

      const enriched = sellerList.map((s) => ({
        ...s,
        conversations: convMap[s.id] ?? 0,
        messages: msgMap[s.id] ?? 0,
        responseTime: rtMap[s.id] ?? null,
        score: scoreMap[s.id] ?? null,
        sentimentAvg: null,
      }));

      // Sort by score descending
      enriched.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
      setSellers(enriched);
    } catch (error) {
      toast.error('Erro ao carregar vendedores');
      console.error('Sellers error:', error);
    } finally {
      setSellersLoading(false);
    }
  }

  async function loadTrends() {
    setTrendsLoading(true);
    try {
      const response = await api.getTrends({ weeks: 4 });
      setTrends(response.data.weeks || []);
    } catch (error) {
      toast.error('Erro ao carregar tendencias');
      console.error('Trends error:', error);
    } finally {
      setTrendsLoading(false);
    }
  }

  // Compute team stats for the active tab
  function getTeamStats() {
    if (activeTab === 'all') {
      const totalConversations = teamComparison.reduce(
        (sum, t) => sum + (t.total_conversations || 0),
        0
      );
      const totalSellers = teamComparison.reduce(
        (sum, t) => sum + (t.seller_count || 0),
        0
      );
      const scores = teamComparison
        .filter((t) => t.avg_score != null)
        .map((t) => t.avg_score);
      const rts = teamComparison
        .filter((t) => t.avg_response_time_seconds != null)
        .map((t) => t.avg_response_time_seconds);
      return {
        conversations: totalConversations,
        sellers: totalSellers,
        avgScore:
          scores.length > 0
            ? scores.reduce((a, b) => a + b, 0) / scores.length
            : null,
        avgResponseTime:
          rts.length > 0
            ? rts.reduce((a, b) => a + b, 0) / rts.length
            : null,
      };
    }
    // Map tab key to the DB team value (e.g. 'closers' -> 'closer')
    const activeTeamObj = TEAMS.find((t) => t.key === activeTab);
    const dbKey = activeTeamObj?.dbKey || activeTab;
    const team = teamComparison.find((t) => t.team === dbKey);
    if (!team)
      return {
        conversations: 0,
        sellers: 0,
        avgScore: null,
        avgResponseTime: null,
      };
    return {
      conversations: team.total_conversations || 0,
      sellers: team.seller_count || 0,
      avgScore: team.avg_score,
      avgResponseTime: team.avg_response_time_seconds,
    };
  }

  const stats = getTeamStats();

  // Build comparison chart data
  const comparisonData = teamComparison.map((t) => ({
    team: TEAM_LABELS[t.team] || t.team,
    Conversas: t.total_conversations || 0,
    'Score Medio': t.avg_score ? Number(t.avg_score) : 0,
    'Tempo Resp. (min)': t.avg_response_time_seconds
      ? Number((t.avg_response_time_seconds / 60).toFixed(1))
      : 0,
    Vendedores: t.seller_count || 0,
  }));

  // Build trends chart data
  const trendsData = trends.map((w) => ({
    week: w.week_start
      ? `${w.week_start.slice(5, 10)}`
      : '',
    Conversas: w.conversations || 0,
    Mensagens: w.messages || 0,
    Score: w.avg_score != null ? Number(w.avg_score) : 0,
    'Tempo Resp. (min)':
      w.avg_response_time_seconds != null
        ? Number((w.avg_response_time_seconds / 60).toFixed(1))
        : 0,
  }));

  // Week vs previous week change
  const weekChanges = (() => {
    if (trends.length < 2) return null;
    const current = trends[trends.length - 1];
    const previous = trends[trends.length - 2];
    return {
      conversations: percentChange(
        current.conversations,
        previous.conversations
      ),
      messages: percentChange(current.messages, previous.messages),
      score: percentChange(current.avg_score, previous.avg_score),
      responseTime: percentChange(
        current.avg_response_time_seconds,
        previous.avg_response_time_seconds
      ),
    };
  })();

  const statCards = [
    {
      label: 'Conversas',
      value: stats.conversations,
      icon: MessageSquare,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Vendedores',
      value: stats.sellers,
      icon: Users,
      color: 'text-violet-600',
      bgColor: 'bg-violet-50',
    },
    {
      label: 'Tempo Medio Resposta',
      value: formatResponseTime(stats.avgResponseTime),
      icon: Clock,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
    {
      label: 'Score Medio',
      value: formatScore(stats.avgScore),
      icon: Star,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Visao por Equipe
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Compare o desempenho entre as equipes de vendas
        </p>
      </div>

      {/* Team Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6" aria-label="Tabs">
          {TEAMS.map((team) => (
            <button
              key={team.key}
              onClick={() => setActiveTab(team.key)}
              className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors ${
                activeTab === team.key
                  ? 'border-mave-600 text-mave-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {team.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Team Stats Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse"
            >
              <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
              <div className="h-7 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-500">
                  {card.label}
                </p>
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center ${card.bgColor}`}
                >
                  <card.icon className={`w-4.5 h-4.5 ${card.color}`} />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {card.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Comparison Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Comparacao entre Equipes
        </h2>
        {loading ? (
          <div className="h-72 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-mave-200 border-t-mave-600 rounded-full animate-spin" />
          </div>
        ) : comparisonData.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
            Nenhum dado disponivel para comparacao
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={comparisonData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="team"
                tick={{ fontSize: 12, fill: '#6b7280' }}
                axisLine={{ stroke: '#e5e7eb' }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#6b7280' }}
                axisLine={{ stroke: '#e5e7eb' }}
              />
              <Tooltip
                contentStyle={{
                  background: '#1f2937',
                  border: 'none',
                  borderRadius: '0.5rem',
                  color: '#f9fafb',
                  fontSize: '0.75rem',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
              <Bar
                dataKey="Conversas"
                fill="#4c6ef5"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="Score Medio"
                fill="#37b24d"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="Tempo Resp. (min)"
                fill="#f59f00"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Team Members Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            Membros da Equipe
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Clique em um vendedor para ver o perfil detalhado
          </p>
        </div>
        {sellersLoading ? (
          <div className="p-8 flex justify-center">
            <div className="w-8 h-8 border-4 border-mave-200 border-t-mave-600 rounded-full animate-spin" />
          </div>
        ) : sellers.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            Nenhum vendedor encontrado nesta equipe
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    Nome
                  </th>
                  {activeTab === 'all' && (
                    <th className="px-6 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                      Equipe
                    </th>
                  )}
                  <th className="px-6 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider text-center">
                    Conversas
                  </th>
                  <th className="px-6 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider text-center">
                    Mensagens
                  </th>
                  <th className="px-6 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider text-center">
                    Tempo Resp.
                  </th>
                  <th className="px-6 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider text-center">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sellers.map((seller) => (
                  <tr
                    key={seller.id}
                    onClick={() => navigate(`/sellers/${seller.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-mave-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-mave-700">
                            {seller.name?.charAt(0)?.toUpperCase() || '?'}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {seller.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {seller.phone}
                          </p>
                        </div>
                      </div>
                    </td>
                    {activeTab === 'all' && (
                      <td className="px-6 py-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            seller.team === 'closer'
                              ? 'bg-blue-50 text-blue-700'
                              : seller.team === 'farmer'
                              ? 'bg-green-50 text-green-700'
                              : 'bg-yellow-50 text-yellow-700'
                          }`}
                        >
                          {TEAM_LABELS[seller.team] || seller.team}
                        </span>
                      </td>
                    )}
                    <td className="px-6 py-3.5 text-center text-gray-700">
                      {seller.conversations ?? 0}
                    </td>
                    <td className="px-6 py-3.5 text-center text-gray-700">
                      {seller.messages ?? 0}
                    </td>
                    <td className="px-6 py-3.5 text-center text-gray-700">
                      {formatResponseTime(seller.responseTime)}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      {seller.score != null ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            seller.score >= 7
                              ? 'bg-emerald-50 text-emerald-700'
                              : seller.score >= 4
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {Number(seller.score).toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-gray-400">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trends and Week vs Previous Week */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trends Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Tendencias (Ultimas 4 semanas)
          </h2>
          {trendsLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-mave-200 border-t-mave-600 rounded-full animate-spin" />
            </div>
          ) : trendsData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
              Nenhum dado de tendencia disponivel
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  axisLine={{ stroke: '#e5e7eb' }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  axisLine={{ stroke: '#e5e7eb' }}
                />
                <Tooltip
                  contentStyle={{
                    background: '#1f2937',
                    border: 'none',
                    borderRadius: '0.5rem',
                    color: '#f9fafb',
                    fontSize: '0.75rem',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                <Line
                  type="monotone"
                  dataKey="Conversas"
                  stroke="#4c6ef5"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="Score"
                  stroke="#37b24d"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="Tempo Resp. (min)"
                  stroke="#f59f00"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Week vs Previous Week */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Semana vs Anterior
          </h2>
          {trendsLoading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-3 bg-gray-200 rounded w-24 mb-2" />
                  <div className="h-5 bg-gray-200 rounded w-16" />
                </div>
              ))}
            </div>
          ) : !weekChanges ? (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400">
              Dados insuficientes para comparacao
            </div>
          ) : (
            <div className="space-y-5">
              <div className="p-3 rounded-lg bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-gray-600">Conversas</span>
                  </div>
                  <ChangeIndicator value={weekChanges.conversations} />
                </div>
                <p className="mt-1 text-lg font-bold text-gray-900">
                  {trends[trends.length - 1]?.conversations ?? 0}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-violet-500" />
                    <span className="text-sm text-gray-600">Mensagens</span>
                  </div>
                  <ChangeIndicator value={weekChanges.messages} />
                </div>
                <p className="mt-1 text-lg font-bold text-gray-900">
                  {trends[trends.length - 1]?.messages ?? 0}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm text-gray-600">Score Medio</span>
                  </div>
                  <ChangeIndicator value={weekChanges.score} />
                </div>
                <p className="mt-1 text-lg font-bold text-gray-900">
                  {formatScore(trends[trends.length - 1]?.avg_score)}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <span className="text-sm text-gray-600">
                      Tempo Resposta
                    </span>
                  </div>
                  <ChangeIndicator
                    value={weekChanges.responseTime}
                    invertColor
                  />
                </div>
                <p className="mt-1 text-lg font-bold text-gray-900">
                  {formatResponseTime(
                    trends[trends.length - 1]?.avg_response_time_seconds
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
