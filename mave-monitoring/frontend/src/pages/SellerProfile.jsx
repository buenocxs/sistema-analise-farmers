import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  MessageSquare, Send, Clock, Star, AlertTriangle,
  ArrowLeft, Phone, UserCheck, UserX, RefreshCw, Brain, Calendar,
} from 'lucide-react';
import * as api from '../lib/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEAM_STYLES = {
  closer: { label: 'Closer', bg: 'bg-blue-100', text: 'text-blue-800' },
  farmer: { label: 'Farmer', bg: 'bg-green-100', text: 'text-green-800' },
  pre_sale: { label: 'Pré-venda', bg: 'bg-orange-100', text: 'text-orange-800' },
};

const SENTIMENT_BADGE = {
  positivo: 'badge-green',
  positive: 'badge-green',
  neutro: 'badge-gray',
  neutral: 'badge-gray',
  negativo: 'badge-red',
  negative: 'badge-red',
  frustrado: 'badge-yellow',
  frustrated: 'badge-yellow',
};

const SEVERITY_STYLES = {
  low: 'bg-blue-100 text-blue-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const RESP_TIME_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444'];

const SYNC_PERIODS = [
  { value: '7', label: '7 dias' },
  { value: '14', label: '2 semanas' },
  { value: '30', label: '1 mês' },
  { value: '60', label: '2 meses' },
  { value: '90', label: '3 meses' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Skeleton({ className }) {
  return <div className={clsx('animate-pulse bg-gray-200 rounded', className)} />;
}

function formatResponseTime(seconds) {
  if (!seconds || seconds === 0) return '0s';
  if (typeof seconds === 'string') return seconds;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function StatCard({ icon: Icon, label, value, color, loading }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  if (loading) {
    return (
      <div className="card">
        <Skeleton className="w-10 h-10 rounded-lg mb-3" />
        <Skeleton className="w-20 h-8" />
        <Skeleton className="w-32 h-4 mt-2" />
      </div>
    );
  }

  return (
    <div className="card animate-fade-in">
      <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center mb-3', colorMap[color])}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SellerProfile
// ---------------------------------------------------------------------------

function SellerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [seller, setSeller] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [conversationsTotal, setConversationsTotal] = useState(0);
  const [convPage, setConvPage] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [syncPeriod, setSyncPeriod] = useState('7');
  const [syncProgress, setSyncProgress] = useState(null);
  const [analyzeProgress, setAnalyzeProgress] = useState(null);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const syncPollRef = useRef(null);
  const analyzePollRef = useRef(null);

  const convLimit = 10;

  const fetchSeller = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const convParams = { skip: convPage * convLimit, limit: convLimit };
      if (filterDateFrom) convParams.date_from = filterDateFrom;
      if (filterDateTo) convParams.date_to = filterDateTo;

      const [sellerRes, convRes, alertsRes] = await Promise.allSettled([
        api.getSeller(id),
        api.getSellerConversations(id, convParams),
        api.getAlerts({ seller_id: id, resolved: false }),
      ]);

      if (sellerRes.status === 'fulfilled') {
        setSeller(sellerRes.value.data);
      } else {
        setError('Vendedor não encontrado');
      }

      if (convRes.status === 'fulfilled') {
        const raw = convRes.value.data;
        setConversations(raw?.conversations || raw?.items || []);
        setConversationsTotal(raw?.total || 0);
      }

      if (alertsRes.status === 'fulfilled') {
        const raw = alertsRes.value.data;
        setAlerts(Array.isArray(raw) ? raw : raw?.alerts || raw?.items || raw?.data || []);
      }
    } catch {
      setError('Erro ao carregar dados do vendedor');
    } finally {
      setLoading(false);
    }
  }, [id, convPage, filterDateFrom, filterDateTo]);

  useEffect(() => {
    fetchSeller();
  }, [fetchSeller]);

  const pollTask = useCallback((taskId, setProgress, setRunning, onComplete) => {
    const interval = setInterval(async () => {
      try {
        const res = await api.getTaskStatus(taskId);
        const t = res.data;
        setProgress(t);

        if (t.status === 'completed') {
          clearInterval(interval);
          setRunning(false);
          onComplete(t.result);
          setTimeout(() => setProgress(null), 3000);
          fetchSeller();
        } else if (t.status === 'failed') {
          clearInterval(interval);
          setRunning(false);
          toast.error(t.error || 'Erro na tarefa');
          setTimeout(() => setProgress(null), 5000);
        }
      } catch {
        clearInterval(interval);
        setRunning(false);
        setProgress(null);
      }
    }, 2000);
    return interval;
  }, [fetchSeller]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (syncPollRef.current) clearInterval(syncPollRef.current);
      if (analyzePollRef.current) clearInterval(analyzePollRef.current);
    };
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncProgress({ status: 'running', progress: 0, message: 'Iniciando...' });
    try {
      const res = await api.syncConversations(id, { days: Number(syncPeriod) });
      const { task_id } = res.data;
      if (!task_id) {
        setSyncing(false);
        setSyncProgress(null);
        toast.success('Nenhuma conversa para sincronizar');
        return;
      }
      syncPollRef.current = pollTask(task_id, setSyncProgress, setSyncing, (result) => {
        toast.success(
          `Sincronizado: ${result?.conversations_synced || 0} conversas, ${result?.messages_synced || 0} mensagens`
        );
      });
    } catch (err) {
      const detail = err.response?.data?.detail || 'Erro ao sincronizar conversas';
      toast.error(detail);
      setSyncing(false);
      setSyncProgress(null);
    }
  }, [id, syncPeriod, pollTask]);

  const handleAnalyzeAll = useCallback(async () => {
    setAnalyzing(true);
    setAnalyzeProgress({ status: 'running', progress: 0, message: 'Iniciando...' });
    try {
      const res = await api.analyzeAllConversations(id, false);
      const { task_id, total } = res.data;
      if (!task_id) {
        setAnalyzing(false);
        setAnalyzeProgress(null);
        toast.success('Nenhuma conversa para analisar');
        return;
      }
      analyzePollRef.current = pollTask(task_id, setAnalyzeProgress, setAnalyzing, (result) => {
        toast.success(
          `Análise concluída: ${result?.analyzed || 0} analisadas, ${result?.skipped || 0} sem mensagens, ${result?.errors || 0} erros`
        );
      });
    } catch (err) {
      const detail = err.response?.data?.detail || 'Erro ao analisar conversas';
      toast.error(detail);
      setAnalyzing(false);
      setAnalyzeProgress(null);
    }
  }, [id, pollTask]);

  // Build performance chart data from recent_metrics
  const metricsData = (seller?.recent_metrics || [])
    .slice()
    .sort((a, b) => parseISO(a.date) - parseISO(b.date))
    .map((m) => ({
      date: m.date,
      conversas: m.conversations_started,
      mensagens: m.messages_sent,
      qualidade: m.quality_avg,
    }));

  // Build response time distribution from aggregated recent_metrics
  const responseTimeDist = (() => {
    if (!seller?.recent_metrics || seller.recent_metrics.length === 0) return [];
    let under5 = 0;
    let five30 = 0;
    let thirty60 = 0;
    let over60 = 0;
    seller.recent_metrics.forEach((m) => {
      under5 += m.response_under_5min || 0;
      five30 += m.response_5_30min || 0;
      thirty60 += m.response_30_60min || 0;
      over60 += m.response_over_60min || 0;
    });
    const total = under5 + five30 + thirty60 + over60;
    if (total === 0) return [];
    return [
      { label: '< 5 min', value: under5, pct: ((under5 / total) * 100).toFixed(1), color: RESP_TIME_COLORS[0] },
      { label: '5-30 min', value: five30, pct: ((five30 / total) * 100).toFixed(1), color: RESP_TIME_COLORS[1] },
      { label: '30-60 min', value: thirty60, pct: ((thirty60 / total) * 100).toFixed(1), color: RESP_TIME_COLORS[2] },
      { label: '> 60 min', value: over60, pct: ((over60 / total) * 100).toFixed(1), color: RESP_TIME_COLORS[3] },
    ];
  })();

  // Error state
  if (error && !seller) {
    return (
      <div className="animate-fade-in">
        <button onClick={() => navigate('/sellers')} className="btn-ghost mb-4 flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
        <div className="card text-center py-12">
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  const teamStyle = seller
    ? TEAM_STYLES[seller.team] || { label: seller.team, bg: 'bg-gray-100', text: 'text-gray-800' }
    : null;

  // Compute total messages from metrics
  const totalMessages = seller?.recent_metrics
    ? seller.recent_metrics.reduce((s, m) => s + (m.messages_sent || 0), 0)
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back button */}
      <button onClick={() => navigate('/sellers')} className="btn-ghost flex items-center gap-2">
        <ArrowLeft className="w-4 h-4" />
        Voltar para Vendedores
      </button>

      {/* Header */}
      {loading ? (
        <div className="card">
          <div className="flex items-center gap-4">
            <Skeleton className="w-14 h-14 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="w-48 h-6" />
              <Skeleton className="w-32 h-4" />
            </div>
          </div>
        </div>
      ) : seller ? (
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-mave-100 flex items-center justify-center flex-shrink-0">
                <span className="text-mave-700 text-xl font-bold">
                  {seller.name?.charAt(0)?.toUpperCase()}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-gray-900">{seller.name}</h2>
                  <span className={clsx('badge', teamStyle.bg, teamStyle.text)}>
                    {teamStyle.label}
                  </span>
                  {seller.active ? (
                    <span className="badge-green flex items-center gap-1">
                      <UserCheck className="w-3 h-3" /> Ativo
                    </span>
                  ) : (
                    <span className="badge-red flex items-center gap-1">
                      <UserX className="w-3 h-3" /> Inativo
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                  <Phone className="w-3.5 h-3.5" />
                  {seller.phone}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <button
                  onClick={handleAnalyzeAll}
                  disabled={analyzing}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  <Brain className={clsx('w-4 h-4', analyzing && 'animate-pulse')} />
                  {analyzing ? 'Analisando...' : 'Analisar Conversas'}
                </button>
                <select
                  value={syncPeriod}
                  onChange={(e) => setSyncPeriod(e.target.value)}
                  disabled={syncing}
                  className="select-field w-auto text-sm py-2"
                >
                  {SYNC_PERIODS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  <RefreshCw className={clsx('w-4 h-4', syncing && 'animate-spin')} />
                  {syncing ? 'Sincronizando...' : 'Sincronizar'}
                </button>
              </div>
              {(analyzeProgress || syncProgress) && (
                <div className="w-80">
                  {analyzeProgress && (
                    <div className="mb-1">
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>{analyzeProgress.message || 'Analisando...'}</span>
                        <span className="font-medium tabular-nums">
                          {analyzeProgress.current || 0}/{analyzeProgress.total || '?'} ({analyzeProgress.progress || 0}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={clsx(
                            'h-2 rounded-full transition-all duration-500',
                            analyzeProgress.status === 'failed' ? 'bg-red-500' :
                            analyzeProgress.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
                          )}
                          style={{ width: `${analyzeProgress.progress || 0}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {syncProgress && (
                    <div>
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>{syncProgress.message || 'Sincronizando...'}</span>
                        <span className="font-medium tabular-nums">
                          {syncProgress.current || 0}/{syncProgress.total || '?'} ({syncProgress.progress || 0}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={clsx(
                            'h-2 rounded-full transition-all duration-500',
                            syncProgress.status === 'failed' ? 'bg-red-500' :
                            syncProgress.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
                          )}
                          style={{ width: `${syncProgress.progress || 0}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={MessageSquare}
          label="Total Conversas"
          value={seller?.total_conversations?.toLocaleString('pt-BR') || '0'}
          color="blue"
          loading={loading}
        />
        <StatCard
          icon={Send}
          label="Mensagens Enviadas"
          value={totalMessages.toLocaleString('pt-BR')}
          color="green"
          loading={loading}
        />
        <StatCard
          icon={Clock}
          label="Tempo Médio Resposta"
          value={formatResponseTime(seller?.avg_response_time_seconds)}
          color="orange"
          loading={loading}
        />
        <StatCard
          icon={Star}
          label="Score Médio Qualidade"
          value={seller?.avg_score != null ? Number(seller.avg_score).toFixed(1) : '0.0'}
          color="purple"
          loading={loading}
        />
      </div>

      {/* Performance Chart */}
      <div className="card">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Desempenho Diário (Últimos 30 dias)</h3>
        {loading ? (
          <Skeleton className="w-full h-[280px]" />
        ) : metricsData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={metricsData}>
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
                contentStyle={{ borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}
              />
              <Legend />
              <Line type="monotone" dataKey="conversas" name="Conversas" stroke="#4c6ef5" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="mensagens" name="Mensagens" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="qualidade" name="Qualidade" stroke="#a855f7" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
            Sem dados de desempenho para o período
          </div>
        )}
      </div>

      {/* Response Time Distribution */}
      <div className="card">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Distribuição de Tempo de Resposta</h3>
        {loading ? (
          <Skeleton className="w-full h-[160px]" />
        ) : responseTimeDist.length > 0 ? (
          <div className="space-y-4">
            {responseTimeDist.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-sm text-gray-600 w-20 text-right flex-shrink-0">{item.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-7 overflow-hidden relative">
                  <div
                    className="h-full rounded-full flex items-center transition-all duration-700 ease-out"
                    style={{ width: `${Math.max(Number(item.pct), 3)}%`, backgroundColor: item.color }}
                  >
                    {Number(item.pct) > 10 && (
                      <span className="text-white text-xs font-medium pl-3">{item.pct}%</span>
                    )}
                  </div>
                </div>
                <span className="text-sm text-gray-700 w-24 flex-shrink-0 tabular-nums">
                  {item.value} ({item.pct}%)
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-[160px] flex items-center justify-center text-gray-400 text-sm">
            Sem dados de tempo de resposta
          </div>
        )}
      </div>

      {/* Recent Conversations Table */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-base font-semibold text-gray-900">Conversas</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => { setFilterDateFrom(e.target.value); setConvPage(0); }}
              className="select-field w-auto text-sm py-1.5"
              placeholder="De"
            />
            <span className="text-xs text-gray-400">até</span>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => { setFilterDateTo(e.target.value); setConvPage(0); }}
              className="select-field w-auto text-sm py-1.5"
              placeholder="Até"
            />
            {(filterDateFrom || filterDateTo) && (
              <button
                onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setConvPage(0); }}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
                Limpar
              </button>
            )}
            <span className="text-xs text-gray-500 ml-1">{conversationsTotal} resultado{conversationsTotal !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="w-full h-12" />)}
          </div>
        ) : conversations.length > 0 ? (
          <>
            <div className="overflow-x-auto -mx-6">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="table-header">Cliente</th>
                    <th className="table-header">Última msg</th>
                    <th className="table-header text-center">Mensagens</th>
                    <th className="table-header">Sentimento</th>
                    <th className="table-header text-center">Score</th>
                    <th className="table-header">Estágio</th>
                  </tr>
                </thead>
                <tbody>
                  {conversations.map((conv) => {
                    const sentimentKey = conv.analysis?.sentiment_label || conv.sentiment_label || '';
                    const qualityScore = conv.analysis?.quality_score ?? conv.quality_score;
                    const stageVal = conv.analysis?.stage || conv.stage || '';

                    return (
                      <tr
                        key={conv.id}
                        onClick={() => navigate(`/conversations/${conv.id}`)}
                        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="table-cell">
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-medium text-gray-900">{conv.customer_name || conv.customer_phone}</p>
                              {conv.customer_name && (
                                <p className="text-xs text-gray-400">{conv.customer_phone}</p>
                              )}
                            </div>
                            {conv.status === 'excluded' && (
                              <span className="badge bg-orange-100 text-orange-700 border border-orange-200 text-[10px] px-1.5 py-0.5">Interno</span>
                            )}
                          </div>
                        </td>
                        <td className="table-cell text-gray-500 whitespace-nowrap">
                          {conv.last_message_at
                            ? format(parseISO(conv.last_message_at), "dd/MM/yy HH:mm", { locale: ptBR })
                            : '-'}
                        </td>
                        <td className="table-cell text-center">
                          <span className="inline-flex items-center gap-1 text-gray-600">
                            <MessageSquare className="w-3.5 h-3.5" />
                            {conv.message_count}
                          </span>
                        </td>
                        <td className="table-cell">
                          {sentimentKey ? (
                            <span className={clsx('badge', SENTIMENT_BADGE[sentimentKey.toLowerCase()] || 'badge-gray')}>
                              {sentimentKey}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="table-cell text-center">
                          {qualityScore != null ? (
                            <span className={clsx(
                              'font-semibold text-sm',
                              qualityScore >= 7 ? 'text-green-600' : qualityScore >= 4 ? 'text-yellow-600' : 'text-red-600'
                            )}>
                              {Number(qualityScore).toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="table-cell">
                          {stageVal ? (
                            <span className="badge badge-blue">{stageVal}</span>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {conversationsTotal > convLimit && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  {convPage * convLimit + 1}-{Math.min((convPage + 1) * convLimit, conversationsTotal)} de {conversationsTotal}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConvPage((p) => Math.max(0, p - 1))}
                    disabled={convPage === 0}
                    className="btn-secondary text-sm py-1 px-3"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setConvPage((p) => p + 1)}
                    disabled={(convPage + 1) * convLimit >= conversationsTotal}
                    className="btn-secondary text-sm py-1 px-3"
                  >
                    Próximo
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-400 text-center py-6">Nenhuma conversa encontrada</p>
        )}
      </div>

      {/* Alerts for this seller */}
      <div className="card">
        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          Alertas Ativos
        </h3>
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="w-full h-12" />)}
          </div>
        ) : alerts.length > 0 ? (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div key={alert.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={clsx('badge flex-shrink-0', SEVERITY_STYLES[alert.severity] || 'bg-gray-100 text-gray-800')}>
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
                {alert.conversation_id && (
                  <Link
                    to={`/conversations/${alert.conversation_id}`}
                    className="btn-ghost text-xs flex-shrink-0 ml-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Ver conversa
                  </Link>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">Nenhum alerta ativo</p>
        )}
      </div>
    </div>
  );
}

export default SellerProfile;
