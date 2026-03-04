import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, Filter, Download, ChevronLeft, ChevronRight, X,
  MessageSquare, Loader2,
} from 'lucide-react';
import * as api from '../lib/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { EmptyState } from '../components/EmptyState';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

const SENTIMENT_OPTIONS = [
  { value: '', label: 'Todos os Sentimentos' },
  { value: 'positivo', label: 'Positivo' },
  { value: 'neutro', label: 'Neutro' },
  { value: 'negativo', label: 'Negativo' },
  { value: 'frustrado', label: 'Frustrado' },
];

const STAGE_OPTIONS = [
  { value: '', label: 'Todos os Estágios' },
  { value: 'prospecção', label: 'Prospecção' },
  { value: 'negociação', label: 'Negociação' },
  { value: 'fechamento', label: 'Fechamento' },
  { value: 'pós-venda', label: 'Pós-venda' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os Status' },
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
];

const TEAM_OPTIONS = [
  { value: '', label: 'Todas as Equipes' },
  { value: 'closer', label: 'Closers' },
  { value: 'farmer', label: 'Farmers' },
  { value: 'pre_sale', label: 'Pré-venda' },
];

function Skeleton({ className }) {
  return <div className={clsx('skeleton-shimmer rounded', className)} />;
}

// ---------------------------------------------------------------------------
// ConversationsList
// ---------------------------------------------------------------------------

function ConversationsList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filter state (initialized from URL params)
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const debounceTimer = useRef(null);
  const [sellerId, setSellerId] = useState(searchParams.get('seller_id') || '');
  const [team, setTeam] = useState(searchParams.get('team') || '');
  const [sentiment, setSentiment] = useState(searchParams.get('sentiment') || '');
  const [stage, setStage] = useState(searchParams.get('stage') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('date_from') || '');
  const [dateTo, setDateTo] = useState(searchParams.get('date_to') || '');

  // Data state
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '0', 10));
  const [sellers, setSellers] = useState([]);
  const [exporting, setExporting] = useState(false);

  const limit = 20;

  // Load sellers for dropdown on mount
  useEffect(() => {
    api.getSellers({ limit: 200, active: true })
      .then((res) => {
        setSellers(res.data?.sellers || []);
      })
      .catch(() => {
        // Non-critical failure
      });
  }, []);

  // Debounce search input (400ms)
  useEffect(() => {
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 400);
    return () => clearTimeout(debounceTimer.current);
  }, [search]);

  const buildParams = useCallback(() => {
    const params = { skip: page * limit, limit };
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (sellerId) params.seller_id = parseInt(sellerId, 10);
    if (team) params.team = team;
    if (sentiment) params.sentiment = sentiment;
    if (stage) params.stage = stage;
    if (status) params.status = status;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    return params;
  }, [debouncedSearch, sellerId, team, sentiment, stage, status, dateFrom, dateTo, page]);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams();
      const res = await api.getConversations(params);
      const data = res.data;
      setConversations(data?.conversations || data?.items || []);
      setTotal(data?.total || 0);
    } catch (err) {
      toast.error('Erro ao carregar conversas');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Sync filters to URL params
  useEffect(() => {
    const params = {};
    if (search) params.search = search;
    if (sellerId) params.seller_id = sellerId;
    if (team) params.team = team;
    if (sentiment) params.sentiment = sentiment;
    if (stage) params.stage = stage;
    if (status) params.status = status;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (page > 0) params.page = String(page);
    setSearchParams(params, { replace: true });
  }, [search, sellerId, team, sentiment, stage, status, dateFrom, dateTo, page, setSearchParams]);

  const clearFilters = () => {
    setSearch('');
    setSellerId('');
    setTeam('');
    setSentiment('');
    setStage('');
    setStatus('');
    setDateFrom('');
    setDateTo('');
    setPage(0);
  };

  const hasFilters = search || sellerId || team || sentiment || stage || status || dateFrom || dateTo;

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const params = buildParams();
      delete params.skip;
      delete params.limit;
      const blob = await api.exportConversations(params);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `conversas_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Exportação concluída');
    } catch {
      toast.error('Erro ao exportar dados');
    } finally {
      setExporting(false);
    }
  };

  // Filter sellers by team if selected
  const filteredSellers = team ? sellers.filter((s) => s.team === team) : sellers;
  const totalPages = Math.ceil(total / limit);

  const getSellerName = (sid) => {
    const s = sellers.find((x) => x.id === sid);
    return s?.name || `Vendedor #${sid}`;
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Filters Bar */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">Filtros</h3>
          {hasFilters && (
            <button onClick={clearFilters} className="ml-auto btn-ghost text-xs flex items-center gap-1 py-1 px-2">
              <X className="w-3 h-3" />
              Limpar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente ou telefone..."
              className="input-field pl-9"
            />
          </div>

          {/* Vendedor */}
          <select
            value={sellerId}
            onChange={(e) => { setSellerId(e.target.value); setPage(0); }}
            className="select-field"
          >
            <option value="">Todos os Vendedores</option>
            {filteredSellers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* Equipe */}
          <select
            value={team}
            onChange={(e) => { setTeam(e.target.value); setSellerId(''); setPage(0); }}
            className="select-field"
          >
            {TEAM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Sentimento */}
          <select
            value={sentiment}
            onChange={(e) => { setSentiment(e.target.value); setPage(0); }}
            className="select-field"
          >
            {SENTIMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Estágio */}
          <select
            value={stage}
            onChange={(e) => { setStage(e.target.value); setPage(0); }}
            className="select-field"
          >
            {STAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Status */}
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(0); }}
            className="select-field"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Date range */}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            className="input-field"
            title="Data início"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            className="input-field"
            title="Data fim"
          />
        </div>
      </div>

      {/* Table header with count and export */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {loading ? 'Carregando...' : `${total} conversa${total !== 1 ? 's' : ''} encontrada${total !== 1 ? 's' : ''}`}
        </p>
        <button
          onClick={handleExportCsv}
          disabled={exporting || total === 0}
          className="btn-secondary text-sm flex items-center gap-2"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Exportar CSV
        </button>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="w-full h-12" />)}
          </div>
        ) : conversations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] table-striped">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="table-header">Vendedor</th>
                  <th className="table-header">Cliente</th>
                  <th className="table-header">Telefone</th>
                  <th className="table-header text-center">Msgs</th>
                  <th className="table-header">Última msg</th>
                  <th className="table-header">Sentimento</th>
                  <th className="table-header text-center">Score</th>
                  <th className="table-header">Estágio</th>
                  <th className="table-header">Status</th>
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
                        <span className="font-medium text-gray-900">{getSellerName(conv.seller_id)}</span>
                      </td>
                      <td className="table-cell text-gray-700">
                        {conv.customer_name || '-'}
                      </td>
                      <td className="table-cell text-gray-500 font-mono text-xs">
                        {conv.customer_phone}
                      </td>
                      <td className="table-cell text-center">
                        <span className="inline-flex items-center gap-1 text-gray-600">
                          <MessageSquare className="w-3.5 h-3.5" />
                          {conv.message_count}
                        </span>
                      </td>
                      <td className="table-cell text-gray-500 whitespace-nowrap">
                        {conv.last_message_at
                          ? format(parseISO(conv.last_message_at), "dd/MM/yy HH:mm", { locale: ptBR })
                          : '-'}
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
                      <td className="table-cell">
                        <div className="flex items-center gap-1.5">
                          {conv.status === 'excluded' && (
                            <span className="badge bg-orange-100 text-orange-700 border border-orange-200">Interno</span>
                          )}
                          <span className={clsx(
                            'badge',
                            conv.status === 'active' ? 'badge-green' : conv.status === 'excluded' ? 'bg-orange-50 text-orange-500' : 'badge-gray'
                          )}>
                            {conv.status === 'active' ? 'Ativo' : conv.status === 'inactive' ? 'Inativo' : conv.status === 'excluded' ? 'Excluido' : conv.status}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={MessageSquare}
            title="Nenhuma conversa encontrada"
            description={hasFilters ? 'Tente ajustar os filtros de busca.' : 'Sincronize conversas de um vendedor para começar.'}
            action={hasFilters ? clearFilters : undefined}
            actionLabel={hasFilters ? 'Limpar filtros' : undefined}
            className="py-16"
          />
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Página {page + 1} de {totalPages} ({total} resultados)
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(0)}
              disabled={page === 0}
              className="btn-secondary text-sm py-1.5 px-2.5 flex items-center"
              title="Primeira página"
            >
              <ChevronLeft className="w-4 h-4" />
              <ChevronLeft className="w-4 h-4 -ml-2.5" />
            </button>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-secondary text-sm py-1.5 px-3"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Page numbers */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i;
              } else if (page < 3) {
                pageNum = i;
              } else if (page > totalPages - 4) {
                pageNum = totalPages - 5 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={clsx(
                    'w-9 h-9 rounded-lg text-sm font-medium transition-colors',
                    page === pageNum
                      ? 'bg-mave-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  {pageNum + 1}
                </button>
              );
            })}

            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="btn-secondary text-sm py-1.5 px-3"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={page >= totalPages - 1}
              className="btn-secondary text-sm py-1.5 px-2.5 flex items-center"
              title="Última página"
            >
              <ChevronRight className="w-4 h-4" />
              <ChevronRight className="w-4 h-4 -ml-2.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConversationsList;
