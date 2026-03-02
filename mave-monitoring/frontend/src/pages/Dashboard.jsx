import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  MessageSquare, Send, Clock, Star, AlertTriangle,
  TrendingUp, TrendingDown, Calendar, ChevronDown,
} from 'lucide-react';
import * as api from '../lib/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { format, subDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SENTIMENT_COLORS = {
  positivo: '#22c55e',
  neutro: '#6b7280',
  negativo: '#ef4444',
  frustrado: '#f59e0b',
  positive: '#22c55e',
  neutral: '#6b7280',
  negative: '#ef4444',
  frustrated: '#f59e0b',
};

const SEVERITY_STYLES = {
  low: 'bg-blue-100 text-blue-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const PERIODS = [
  { label: 'Hoje', value: '1d', days: 0 },
  { label: 'Ontem', value: 'yesterday', days: null },
  { label: 'Últimos 3 dias', value: '3d', days: 3 },
  { label: 'Últimos 7 dias', value: '7d', days: 7 },
  { label: 'Últimos 15 dias', value: '15d', days: 15 },
  { label: 'Últimos 30 dias', value: '30d', days: 30 },
  { label: 'Personalizado', value: 'custom', days: null },
];

const DAYS_OF_WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}h`);

const TEAM_LABELS = { closer: 'Closers', farmer: 'Farmers', pre_sale: 'Pré-venda' };
const TEAM_COLORS = { closer: 'blue', farmer: 'green', pre_sale: 'orange' };

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function Skeleton({ className }) {
  return <div className={clsx('animate-pulse bg-gray-200 rounded', className)} />;
}

function StatCard({ icon: Icon, label, value, change, color, loading }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-start justify-between">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <Skeleton className="w-16 h-5" />
        </div>
        <Skeleton className="w-20 h-8 mt-3" />
        <Skeleton className="w-32 h-4 mt-2" />
      </div>
    );
  }

  const isPositive = change >= 0;

  return (
    <div className="card animate-fade-in">
      <div className="flex items-start justify-between">
        <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', colorMap[color])}>
          <Icon className="w-5 h-5" />
        </div>
        {change !== null && change !== undefined && (
          <span
            className={clsx(
              'inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full',
              isPositive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            )}
          >
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function HeatmapCell({ value, maxValue }) {
  const intensity = maxValue > 0 ? value / maxValue : 0;
  const bg =
    intensity === 0
      ? 'bg-gray-50'
      : intensity < 0.25
        ? 'bg-mave-100'
        : intensity < 0.5
          ? 'bg-mave-200'
          : intensity < 0.75
            ? 'bg-mave-400'
            : 'bg-mave-600';
  const textColor = intensity >= 0.5 ? 'text-white' : 'text-gray-700';

  return (
    <div
      className={clsx('w-full aspect-square rounded-sm flex items-center justify-center text-[10px] font-medium transition-colors', bg, textColor)}
      title={`${value} conversas`}
    >
      {value > 0 ? value : ''}
    </div>
  );
}

function formatResponseTime(seconds) {
  if (!seconds || seconds === 0) return '0s';
  if (typeof seconds === 'string') return seconds;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState(() => localStorage.getItem('mave_dashboard_period') || '7d');
  const [dateFrom, setDateFrom] = useState(() => {
    const saved = localStorage.getItem('mave_dashboard_period') || '7d';
    const p = PERIODS.find(pp => pp.value === saved);
    return format(subDays(new Date(), p?.days ?? 7), 'yyyy-MM-dd');
  });
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);

  const [selectedTeam, setSelectedTeam] = useState('');

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [systemStatus, setSystemStatus] = useState(null);
  const [conversationsPerDay, setConversationsPerDay] = useState([]);
  const [sentimentDist, setSentimentDist] = useState([]);
  const [sellerRanking, setSellerRanking] = useState([]);
  const [peakHours, setPeakHours] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [teamSummary, setTeamSummary] = useState([]);
  const [funnelData, setFunnelData] = useState([]);

  const getDateParams = useCallback(() => {
    const params = {};
    if (period === 'custom') {
      params.date_from = dateFrom;
      params.date_to = dateTo;
    } else if (period === 'yesterday') {
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      params.date_from = yesterday;
      params.date_to = yesterday;
    } else if (period === '1d') {
      const today = format(new Date(), 'yyyy-MM-dd');
      params.date_from = today;
      params.date_to = today;
    } else {
      const found = PERIODS.find((p) => p.value === period);
      const days = found?.days || 7;
      params.date_from = format(subDays(new Date(), days), 'yyyy-MM-dd');
      params.date_to = format(new Date(), 'yyyy-MM-dd');
    }
    if (selectedTeam) {
      params.team = selectedTeam;
    }
    return params;
  }, [period, dateFrom, dateTo, selectedTeam]);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    const params = getDateParams();

    try {
      const [
        statsRes,
        convPerDayRes,
        sentimentRes,
        rankingRes,
        peakRes,
        alertsRes,
        teamRes,
        sysStatusRes,
        funnelRes,
      ] = await Promise.allSettled([
        api.getDashboardStats(params),
        api.getMetrics({ ...params, group_by: 'day' }),
        api.getSentimentDistribution(params),
        api.getRanking(params),
        api.getHeatmap(params),
        api.getAlerts({ resolved: false, limit: 10 }),
        api.getTeamComparison(params),
        api.getSystemStatus(),
        api.getFunnel(params),
      ]);

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data);
      }

      if (sysStatusRes.status === 'fulfilled') {
        setSystemStatus(sysStatusRes.value.data);
      }

      if (convPerDayRes.status === 'fulfilled') {
        const raw = convPerDayRes.value.data;
        const items = Array.isArray(raw) ? raw : raw?.data || raw?.weeks || raw?.trends || [];
        // Normalize: metrics endpoint returns { period, conversations, messages, avg_quality }
        // Chart expects { date, conversations, messages, avg_score }
        const normalized = items.map((item) => ({
          date: item.date || item.period,
          conversations: item.conversations || 0,
          messages: item.messages || 0,
          avg_score: item.avg_score ?? item.avg_quality ?? null,
        }));
        setConversationsPerDay(normalized);
      }

      if (sentimentRes.status === 'fulfilled') {
        const raw = sentimentRes.value.data;
        let data = Array.isArray(raw) ? raw : raw?.data || [];
        // Normalize: API may return { positivo: 10, neutro: 5 } object
        if (!Array.isArray(data) && typeof data === 'object') {
          data = Object.entries(data).map(([name, value]) => ({ name, value }));
        }
        // If API returns { sentiment_distribution: {...} } inside stats
        if (data.length === 0 && stats?.sentiment_distribution) {
          data = Object.entries(stats.sentiment_distribution).map(([name, value]) => ({
            name: name.charAt(0).toUpperCase() + name.slice(1),
            value,
          }));
        }
        setSentimentDist(data);
      }

      if (rankingRes.status === 'fulfilled') {
        const raw = rankingRes.value.data;
        setSellerRanking(Array.isArray(raw) ? raw : raw?.rankings || raw?.data || raw?.ranking || []);
      }

      if (peakRes.status === 'fulfilled') {
        const raw = peakRes.value.data;
        setPeakHours(Array.isArray(raw) ? raw : raw?.data || raw?.heatmap || []);
      }

      if (alertsRes.status === 'fulfilled') {
        const raw = alertsRes.value.data;
        setAlerts(Array.isArray(raw) ? raw : raw?.alerts || raw?.items || raw?.data || []);
      }

      if (teamRes.status === 'fulfilled') {
        const raw = teamRes.value.data;
        setTeamSummary(Array.isArray(raw) ? raw : raw?.data || raw?.teams || []);
      }

      if (funnelRes.status === 'fulfilled') {
        const raw = funnelRes.value.data;
        setFunnelData(Array.isArray(raw) ? raw : raw?.stages || raw?.data || []);
      }
    } catch (err) {
      toast.error('Erro ao carregar dados do dashboard');
    } finally {
      setLoading(false);
    }
  }, [getDateParams]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Also try to build sentiment from stats if API call failed but stats has it
  useEffect(() => {
    if (!loading && sentimentDist.length === 0 && stats?.sentiment_distribution) {
      const data = Object.entries(stats.sentiment_distribution).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
      }));
      setSentimentDist(data);
    }
  }, [loading, stats, sentimentDist.length]);

  const handlePeriodChange = (value) => {
    setPeriod(value);
    if (value !== 'custom') localStorage.setItem('mave_dashboard_period', value);
    setShowPeriodDropdown(false);
    if (value === 'yesterday') {
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      setDateFrom(yesterday);
      setDateTo(yesterday);
    } else if (value === '1d') {
      const today = format(new Date(), 'yyyy-MM-dd');
      setDateFrom(today);
      setDateTo(today);
    } else if (value !== 'custom') {
      const days = PERIODS.find((p) => p.value === value)?.days || 7;
      setDateFrom(format(subDays(new Date(), days), 'yyyy-MM-dd'));
      setDateTo(format(new Date(), 'yyyy-MM-dd'));
    }
  };

  const handleResolveAlert = async (alertId) => {
    try {
      await api.resolveAlert(alertId);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      toast.success('Alerta resolvido');
    } catch {
      toast.error('Erro ao resolver alerta');
    }
  };

  // Build heatmap grid (7 days x 24 hours)
  const heatmapGrid = [];
  let heatmapMax = 0;
  if (peakHours.length > 0) {
    for (let day = 0; day < 7; day++) {
      const row = [];
      for (let hour = 0; hour < 24; hour++) {
        const entry = peakHours.find(
          (e) =>
            (e.day_of_week === day || e.day === day) &&
            e.hour === hour
        );
        const count = entry?.count || entry?.conversations || entry?.value || 0;
        if (count > heatmapMax) heatmapMax = count;
        row.push(count);
      }
      heatmapGrid.push(row);
    }
  }

  // Extract stats with fallbacks for different API shapes
  const totalConversas = stats?.total_conversations ?? stats?.totalConversations ?? 0;
  const messagesSent = stats?.total_messages_today ?? stats?.messages_sent ?? stats?.totalMessages ?? 0;
  const avgRespTime = stats?.response_time_avg_seconds ?? stats?.avg_response_time ?? stats?.avg_response_time_seconds ?? 0;
  const avgQuality = stats?.avg_quality ?? stats?.avgQuality ?? stats?.avg_score ?? 0;
  const convChange = stats?.conversations_change ?? stats?.conversationsChange ?? null;
  const msgChange = stats?.messages_change ?? stats?.messagesChange ?? null;
  const respChange = stats?.response_time_change ?? stats?.responseTimeChange ?? null;
  const qualChange = stats?.quality_change ?? stats?.qualityChange ?? stats?.score_change ?? null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setShowPeriodDropdown(!showPeriodDropdown)}
            className="btn-secondary flex items-center gap-2"
          >
            <Calendar className="w-4 h-4" />
            {PERIODS.find((p) => p.value === period)?.label}
            <ChevronDown className="w-4 h-4" />
          </button>
          {showPeriodDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowPeriodDropdown(false)} />
              <div className="absolute top-full mt-1 left-0 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                {PERIODS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => handlePeriodChange(p.value)}
                    className={clsx(
                      'w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors',
                      period === p.value ? 'bg-mave-50 text-mave-700 font-medium' : 'text-gray-700'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input-field w-auto"
            />
            <span className="text-gray-400 text-sm">a</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input-field w-auto"
            />
          </div>
        )}

        <select
          value={selectedTeam}
          onChange={(e) => setSelectedTeam(e.target.value)}
          className="select-field w-auto"
        >
          <option value="">Todas as Equipes</option>
          {Object.entries(TEAM_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* System Status Banner */}
      {systemStatus && systemStatus.whatsapp !== 'connected' && (
        <div className="rounded-lg px-4 py-3 flex items-center gap-3 text-sm font-medium bg-yellow-50 border border-yellow-200 text-yellow-800">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div>
            <span>WhatsApp desconectado (estado: {systemStatus.whatsapp_state}) — necessario re-escanear QR code</span>
          </div>
        </div>
      )}

      {/* System Status Card */}
      {systemStatus && (
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <span className={clsx(
              'w-2 h-2 rounded-full',
              systemStatus.whatsapp === 'connected' ? 'bg-green-500' : systemStatus.whatsapp === 'disconnected' ? 'bg-yellow-500' : 'bg-red-500'
            )} />
            <span className="text-gray-600">WhatsApp: {systemStatus.whatsapp === 'connected' ? 'Conectado' : systemStatus.whatsapp === 'disconnected' ? 'Desconectado' : 'Indisponivel'}</span>
          </div>
          <span className="text-gray-400">Instancia: {systemStatus.instance_name}</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={MessageSquare}
          label="Total Conversas"
          value={totalConversas.toLocaleString('pt-BR')}
          change={convChange}
          color="blue"
          loading={loading}
        />
        <StatCard
          icon={Send}
          label="Mensagens Enviadas"
          value={messagesSent.toLocaleString('pt-BR')}
          change={msgChange}
          color="green"
          loading={loading}
        />
        <StatCard
          icon={Clock}
          label="Tempo Médio Resposta"
          value={formatResponseTime(avgRespTime)}
          change={respChange}
          color="orange"
          loading={loading}
        />
        <StatCard
          icon={Star}
          label="Score Médio Qualidade"
          value={avgQuality ? Number(avgQuality).toFixed(1) : '0.0'}
          change={qualChange}
          color="purple"
          loading={loading}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Line chart: Conversas por Dia */}
        <div className="card lg:col-span-2">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Conversas por Dia</h3>
          {loading ? (
            <Skeleton className="w-full h-[280px]" />
          ) : conversationsPerDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={conversationsPerDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => {
                    try { return format(parseISO(v), 'dd/MM', { locale: ptBR }); } catch { return v; }
                  }}
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                />
                <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <Tooltip
                  labelFormatter={(v) => {
                    try { return format(parseISO(v), 'dd/MM/yyyy', { locale: ptBR }); } catch { return v; }
                  }}
                  contentStyle={{ borderRadius: '0.5rem', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend />
                <Line type="monotone" dataKey="conversations" name="Conversas" stroke="#4c6ef5" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                {conversationsPerDay[0]?.messages !== undefined && (
                  <Line type="monotone" dataKey="messages" name="Mensagens" stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                )}
                {conversationsPerDay[0]?.avg_score !== undefined && (
                  <Line type="monotone" dataKey="avg_score" name="Score Médio" stroke="#a855f7" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
              Sem dados para o período selecionado
            </div>
          )}
        </div>

        {/* Pie chart: Distribuição de Sentimentos */}
        <div className="card">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Distribuição de Sentimentos</h3>
          {loading ? (
            <Skeleton className="w-full h-[280px]" />
          ) : sentimentDist.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={sentimentDist}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    dataKey="value"
                    nameKey="name"
                    paddingAngle={3}
                  >
                    {sentimentDist.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill={
                          SENTIMENT_COLORS[entry.name?.toLowerCase()] ||
                          SENTIMENT_COLORS[entry.label?.toLowerCase()] ||
                          '#6b7280'
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '0.5rem', border: '1px solid #e5e7eb' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap items-center justify-center gap-3 mt-1">
                {sentimentDist.map((item) => {
                  const key = (item.name || item.label || '').toLowerCase();
                  return (
                    <div key={item.name || item.label} className="flex items-center gap-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: SENTIMENT_COLORS[key] || '#6b7280' }}
                      />
                      <span className="text-xs text-gray-600">
                        {item.name || item.label} ({item.value})
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
              Sem dados de sentimento
            </div>
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bar chart: Ranking de Vendedores */}
        <div className="card">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Ranking de Vendedores</h3>
          {loading ? (
            <Skeleton className="w-full h-[320px]" />
          ) : sellerRanking.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={sellerRanking.slice(0, 10)}
                layout="vertical"
                margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={110}
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                />
                <Tooltip contentStyle={{ borderRadius: '0.5rem', border: '1px solid #e5e7eb' }} />
                <Bar
                  dataKey={sellerRanking[0]?.score !== undefined ? 'score' : sellerRanking[0]?.value !== undefined ? 'value' : sellerRanking[0]?.quality_avg !== undefined ? 'quality_avg' : 'conversations'}
                  name="Score"
                  fill="#4c6ef5"
                  radius={[0, 4, 4, 0]}
                  barSize={18}
                >
                  {sellerRanking.slice(0, 10).map((_, idx) => (
                    <Cell key={idx} fill={idx < 3 ? '#4c6ef5' : '#bac8ff'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[320px] flex items-center justify-center text-gray-400 text-sm">
              Sem dados de ranking
            </div>
          )}
        </div>

        {/* Heatmap: Horários de Pico */}
        <div className="card">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Horários de Pico</h3>
          {loading ? (
            <Skeleton className="w-full h-[320px]" />
          ) : heatmapGrid.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-[520px]">
                {/* Hour headers */}
                <div className="flex gap-[2px] mb-[2px] pl-10">
                  {HOURS.map((h) => (
                    <div key={h} className="flex-1 text-center text-[9px] text-gray-400 font-medium">
                      {parseInt(h) % 3 === 0 ? h : ''}
                    </div>
                  ))}
                </div>
                {/* Rows */}
                {heatmapGrid.map((row, dayIdx) => (
                  <div key={dayIdx} className="flex gap-[2px] mb-[2px] items-center">
                    <div className="w-10 text-right text-xs text-gray-500 font-medium pr-2 flex-shrink-0">
                      {DAYS_OF_WEEK[dayIdx]}
                    </div>
                    {row.map((val, hourIdx) => (
                      <div key={hourIdx} className="flex-1">
                        <HeatmapCell value={val} maxValue={heatmapMax} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-1.5 mt-3 justify-end">
                <span className="text-[10px] text-gray-400">Menos</span>
                <div className="w-3.5 h-3.5 rounded-sm bg-gray-50 border border-gray-200" />
                <div className="w-3.5 h-3.5 rounded-sm bg-mave-100" />
                <div className="w-3.5 h-3.5 rounded-sm bg-mave-200" />
                <div className="w-3.5 h-3.5 rounded-sm bg-mave-400" />
                <div className="w-3.5 h-3.5 rounded-sm bg-mave-600" />
                <span className="text-[10px] text-gray-400">Mais</span>
              </div>
            </div>
          ) : (
            <div className="h-[320px] flex items-center justify-center text-gray-400 text-sm">
              Sem dados de horários
            </div>
          )}
        </div>
      </div>

      {/* Sales Funnel */}
      <div className="card">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Funil de Vendas</h3>
        {loading ? (
          <Skeleton className="w-full h-[200px]" />
        ) : funnelData.length > 0 && funnelData.some((s) => s.count > 0) ? (
          <div className="space-y-2">
            {(() => {
              const maxCount = Math.max(...funnelData.map((s) => s.count), 1);
              const stageColors = [
                'bg-blue-200 text-blue-900',
                'bg-blue-300 text-blue-900',
                'bg-blue-400 text-white',
                'bg-blue-500 text-white',
                'bg-blue-600 text-white',
              ];
              return funnelData.map((stage, idx) => {
                const widthPct = Math.max((stage.count / maxCount) * 100, 8);
                const colorClass = stageColors[idx % stageColors.length];
                return (
                  <div key={stage.stage} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-28 text-right shrink-0 truncate capitalize">
                      {stage.stage}
                    </span>
                    <div className="flex-1 relative">
                      <div
                        className={clsx('rounded-md py-1.5 px-3 text-xs font-medium transition-all duration-500 flex items-center justify-between', colorClass)}
                        style={{ width: `${widthPct}%`, minWidth: 'fit-content' }}
                      >
                        <span>{stage.count}</span>
                        <span className="ml-2 opacity-75">{stage.percentage}%</span>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">
            Sem dados de funil — analise conversas para ver os estágios
          </div>
        )}
      </div>

      {/* Alerts Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Alertas Recentes
          </h3>
          <span className="text-xs text-gray-500">
            {alerts.length} pendente{alerts.length !== 1 ? 's' : ''}
          </span>
        </div>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="w-full h-14" />)}
          </div>
        ) : alerts.length > 0 ? (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={clsx(
                      'badge flex-shrink-0',
                      SEVERITY_STYLES[alert.severity] || 'bg-gray-100 text-gray-800'
                    )}
                  >
                    {alert.severity}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 truncate">{alert.message}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {alert.alert_type || alert.type}
                      {alert.created_at && (
                        <> &middot; {format(parseISO(alert.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleResolveAlert(alert.id)}
                  className="btn-ghost text-xs flex-shrink-0 ml-2"
                >
                  Resolver
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-6">Nenhum alerta pendente</p>
        )}
      </div>

      {/* Team Summary */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-4">Resumo por Equipe</h3>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="w-full h-44 rounded-xl" />)}
          </div>
        ) : teamSummary.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {teamSummary.map((team) => {
              const teamKey = team.team || team.name?.toLowerCase();
              const teamLabel = TEAM_LABELS[teamKey] || team.team || team.name || teamKey;
              const color = TEAM_COLORS[teamKey] || 'blue';
              const borderClass =
                color === 'blue' ? 'border-l-blue-500' :
                color === 'green' ? 'border-l-green-500' : 'border-l-orange-500';

              return (
                <div key={teamKey} className={clsx('card border-l-4', borderClass)}>
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">{teamLabel}</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Vendedores</span>
                      <span className="font-medium text-gray-900">{team.seller_count ?? team.sellers ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Conversas</span>
                      <span className="font-medium text-gray-900">{team.conversations_total ?? team.conversations ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Mensagens</span>
                      <span className="font-medium text-gray-900">{team.messages_total ?? team.messages ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Qualidade Média</span>
                      <span className="font-medium text-gray-900">
                        {team.avg_quality != null ? Number(team.avg_quality).toFixed(1) : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Tempo Médio Resposta</span>
                      <span className="font-medium text-gray-900">
                        {team.avg_response_time_seconds != null
                          ? formatResponseTime(team.avg_response_time_seconds)
                          : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card">
            <p className="text-sm text-gray-400 text-center py-4">Sem dados de equipe para o período</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
