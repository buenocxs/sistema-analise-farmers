import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Bot, AlertTriangle, FileText,
  MessageSquare, Phone, User, Loader2, RefreshCw,
  CheckCircle, XCircle, StickyNote, Trash2, Send,
} from 'lucide-react';
import * as api from '../lib/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { HelpTooltip } from '../components/Tooltip';
import { EmptyState } from '../components/EmptyState';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SENTIMENT_STYLES = {
  positivo: { bg: 'bg-green-100', text: 'text-green-800' },
  positive: { bg: 'bg-green-100', text: 'text-green-800' },
  neutro: { bg: 'bg-gray-100', text: 'text-gray-800' },
  neutral: { bg: 'bg-gray-100', text: 'text-gray-800' },
  negativo: { bg: 'bg-red-100', text: 'text-red-800' },
  negative: { bg: 'bg-red-100', text: 'text-red-800' },
  frustrado: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  frustrated: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
};

const SEVERITY_STYLES = {
  low: 'bg-blue-100 text-blue-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function Skeleton({ className }) {
  return <div className={clsx('skeleton-shimmer rounded', className)} />;
}

function qualityLabel(score) {
  if (score >= 8.5) return 'Excelente';
  if (score >= 7) return 'Bom';
  if (score >= 4) return 'Regular';
  return 'Ruim';
}

function QualityBar({ score }) {
  if (score == null) return <span className="text-gray-400 text-sm">Sem dados</span>;
  const pct = Math.min((score / 10) * 100, 100);
  const color = score >= 7 ? '#22c55e' : score >= 4 ? '#f59e0b' : '#ef4444';

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
        <span className="text-sm font-bold tabular-nums" style={{ color }}>
          {Number(score).toFixed(1)}
        </span>
      </div>
      <p className="text-[11px] mt-1 font-medium" style={{ color }}>
        {qualityLabel(score)}
      </p>
    </div>
  );
}

const CRITERIA_LABELS = {
  abordagem_inicial:          { label: 'Abordagem Inicial',         peso: 1.0 },
  identificacao_necessidade:  { label: 'Identificação de Necessidade', peso: 1.5 },
  apresentacao_produto:       { label: 'Apresentação do Produto',   peso: 1.5 },
  tratamento_objecoes:        { label: 'Tratamento de Objeções',    peso: 2.0 },
  agilidade_resposta:         { label: 'Agilidade de Resposta',     peso: 1.0 },
  conducao_fechamento:        { label: 'Condução p/ Fechamento',    peso: 1.5 },
  profissionalismo:           { label: 'Profissionalismo',          peso: 1.5 },
};

function QualityBreakdown({ breakdown }) {
  if (!breakdown) return null;

  return (
    <div className="mt-3 space-y-2 bg-gray-50 rounded-lg p-3 border border-gray-100">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-2">
        Detalhamento dos Critérios
      </p>
      {Object.entries(CRITERIA_LABELS).map(([key, { label, peso }]) => {
        const score = breakdown[key];
        if (score == null) return null;
        const pct = Math.min((score / 10) * 100, 100);
        const color = score >= 7 ? '#22c55e' : score >= 4 ? '#f59e0b' : '#ef4444';

        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[11px] text-gray-600 w-[150px] shrink-0 truncate" title={label}>
              {label}
            </span>
            <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
            <span className="text-[11px] font-semibold tabular-nums w-7 text-right" style={{ color }}>
              {Number(score).toFixed(1)}
            </span>
            <span className="text-[9px] text-gray-400 w-8 text-right" title="Peso do critério">
              x{peso}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MessageBubble({ message, isGroupStart }) {
  const isSeller = message.sender_type === 'seller';

  return (
    <div className={clsx('flex', isSeller ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm',
          isSeller
            ? 'bg-mave-100 text-gray-900 rounded-tr-sm'
            : 'bg-white text-gray-900 rounded-tl-sm border border-gray-100'
        )}
      >
        {!isSeller && isGroupStart && message.sender_name && (
          <p className="text-xs font-semibold text-mave-600 mb-0.5">
            {message.sender_name}
          </p>
        )}
        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
          {message.content || message.text || message.body || ''}
        </p>
        <p className={clsx('text-[10px] mt-1 text-right', isSeller ? 'text-mave-400' : 'text-gray-400')}>
          {message.timestamp
            ? format(parseISO(message.timestamp), 'HH:mm', { locale: ptBR })
            : ''}
        </p>
      </div>
    </div>
  );
}

function DateSeparator({ date }) {
  let label = 'Data desconhecida';
  try {
    label = format(parseISO(date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  } catch {
    label = date;
  }

  return (
    <div className="flex items-center justify-center my-4">
      <span className="text-[10px] text-gray-400 bg-white px-3 py-1 rounded-full border border-gray-100 shadow-sm">
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConversationDetail
// ---------------------------------------------------------------------------

function ConversationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getConversation(id);
      const data = res.data;
      setConversation(data);
      setMessages(data?.messages || []);
      setAnalysis(data?.analysis || null);

      // Fetch alerts and notes for this conversation
      try {
        const alertsRes = await api.getAlerts({ conversation_id: id, resolved: false });
        const alertsData = alertsRes.data;
        setAlerts(Array.isArray(alertsData) ? alertsData : alertsData?.alerts || alertsData?.items || alertsData?.data || []);
      } catch {
        // Alerts fetch is non-critical
      }
      try {
        const notesRes = await api.getNotes(id);
        const notesData = notesRes.data;
        setNotes(Array.isArray(notesData) ? notesData : notesData?.notes || []);
      } catch {
        // Notes fetch is non-critical
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Conversa não encontrada');
      } else {
        setError('Erro ao carregar conversa');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Scroll to bottom when messages load
  useEffect(() => {
    if (messages.length > 0 && messagesEndRef.current) {
      // Small delay to let DOM render
      const timer = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await api.analyzeConversation(id);
      setAnalysis(res.data);
      toast.success('Análise concluída com sucesso');
    } catch (err) {
      toast.error(err.message || 'Erro ao analisar conversa');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAddNote = async () => {
    const text = newNote.trim();
    if (!text) return;
    setSavingNote(true);
    try {
      const res = await api.createNote(id, text);
      const note = res.data;
      setNotes((prev) => [note, ...prev]);
      setNewNote('');
      toast.success('Anotação adicionada');
    } catch {
      toast.error('Erro ao salvar anotação');
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      await api.deleteNote(id, noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      toast.success('Anotação removida');
    } catch {
      toast.error('Erro ao remover anotação');
    }
  };

  // Error state
  if (error && !conversation) {
    return (
      <div className="animate-fade-in">
        <button onClick={() => navigate('/conversations')} className="btn-ghost mb-4 flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
        <div className="card text-center py-12">
          <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{error}</p>
          <Link to="/conversations" className="btn-primary mt-4 inline-flex">
            Voltar para lista
          </Link>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="animate-fade-in space-y-4">
        <Skeleton className="w-40 h-8" />
        <Skeleton className="w-full h-20 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3">
            <Skeleton className="w-full h-[500px] rounded-xl" />
          </div>
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="w-full h-56 rounded-xl" />
            <Skeleton className="w-full h-36 rounded-xl" />
            <Skeleton className="w-full h-28 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const seller = conversation?.seller;
  const sortedMessages = [...messages].sort(
    (a, b) => parseISO(a.timestamp) - parseISO(b.timestamp)
  );

  // Group messages by date for date separators
  const messagesWithDates = [];
  let lastDate = null;
  sortedMessages.forEach((msg, idx) => {
    const msgDate = msg.timestamp
      ? format(parseISO(msg.timestamp), 'yyyy-MM-dd')
      : null;
    if (msgDate && msgDate !== lastDate) {
      messagesWithDates.push({ type: 'date', date: msg.timestamp, key: `date-${idx}` });
      lastDate = msgDate;
    }
    // Determine if this is the start of a new sender group
    const prev = sortedMessages[idx - 1];
    const isGroupStart = !prev || prev.sender_type !== msg.sender_type;
    messagesWithDates.push({ type: 'message', data: msg, isGroupStart, key: `msg-${msg.id || idx}` });
  });

  // Build objections list from analysis
  const objectionsList = [];
  if (analysis?.objections) {
    const objections = analysis.objections;
    const handled = analysis.objections_handled;

    if (Array.isArray(objections)) {
      objections.forEach((item) => {
        if (typeof item === 'string') {
          const isHandled = handled
            ? Array.isArray(handled) ? handled.includes(item) : Boolean(handled[item])
            : false;
          objectionsList.push({ text: item, handled: isHandled });
        } else if (typeof item === 'object' && item !== null) {
          objectionsList.push({
            text: item.text || item.objection || item.description || JSON.stringify(item),
            handled: Boolean(item.handled ?? item.resolved),
          });
        }
      });
    } else if (typeof objections === 'object') {
      Object.entries(objections).forEach(([key, value]) => {
        const isHandled = handled
          ? (Array.isArray(handled) ? handled.includes(key) : Boolean(handled[key]))
          : false;
        objectionsList.push({
          text: typeof value === 'string' ? value : key,
          handled: isHandled,
        });
      });
    }
  }

  const sentimentKey = (analysis?.sentiment_label || '').toLowerCase();
  const sentimentStyle = SENTIMENT_STYLES[sentimentKey] || { bg: 'bg-gray-100', text: 'text-gray-800' };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Back + Header */}
      <button onClick={() => navigate('/conversations')} className="btn-ghost flex items-center gap-2">
        <ArrowLeft className="w-4 h-4" />
        Voltar para Conversas
      </button>

      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <User className="w-6 h-6 text-gray-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {conversation?.customer_name || conversation?.customer_phone || 'Conversa'}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mt-0.5">
                {conversation?.customer_phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    {conversation.customer_phone}
                  </span>
                )}
                {seller && (
                  <Link
                    to={`/sellers/${seller.id}`}
                    className="flex items-center gap-1 text-mave-600 hover:text-mave-700 font-medium"
                  >
                    <User className="w-3.5 h-3.5" />
                    {seller.name}
                  </Link>
                )}
                <span className="flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5" />
                  {conversation?.message_count || messages.length} mensagens
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="btn-primary flex items-center gap-2 text-sm flex-shrink-0"
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {analyzing ? 'Analisando...' : 'Analisar com IA'}
          </button>
        </div>
      </div>

      {/* Main content: Messages (60%) + Analysis (40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left panel: Messages */}
        <div className="lg:col-span-3">
          <div
            className="card p-0 flex flex-col overflow-hidden"
            style={{ height: 'calc(100vh - 340px)', minHeight: '450px' }}
          >
            <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0 bg-white">
              <h3 className="text-sm font-semibold text-gray-700">Mensagens</h3>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-gradient-to-b from-gray-50/50 to-gray-50">
              {sortedMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">Nenhuma mensagem</p>
                  </div>
                </div>
              ) : (
                messagesWithDates.map((item) => {
                  if (item.type === 'date') {
                    return <DateSeparator key={item.key} date={item.date} />;
                  }
                  return (
                    <MessageBubble
                      key={item.key}
                      message={item.data}
                      isGroupStart={item.isGroupStart}
                    />
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        {/* Right panel: Analysis */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-[80px] space-y-4 lg:max-h-[calc(100vh-100px)] lg:overflow-y-auto lg:pr-1">
          {/* Análise IA */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4">
              <Bot className="w-4 h-4 text-mave-600" />
              Análise IA
            </h3>

            {analysis ? (
              <div className="space-y-4">
                {/* Sentimento */}
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    Sentimento
                    <HelpTooltip text="Humor do cliente: positivo, neutro, negativo ou frustrado." />
                  </p>
                  <div className="flex items-center gap-2">
                    <span className={clsx('badge', sentimentStyle.bg, sentimentStyle.text)}>
                      {analysis.sentiment_label || '-'}
                    </span>
                    {analysis.sentiment_score != null && (
                      <span className="text-xs text-gray-500">
                        (score: {Number(analysis.sentiment_score).toFixed(2)})
                      </span>
                    )}
                  </div>
                </div>

                {/* Qualidade */}
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    Qualidade
                    <HelpTooltip text="Nota de 0 a 10 baseada em 7 critérios: abordagem, necessidade, produto, objeções, agilidade, fechamento e profissionalismo." />
                  </p>
                  <QualityBar score={analysis.quality_score} />
                  <QualityBreakdown breakdown={analysis.quality_breakdown} />
                </div>

                {/* Estágio */}
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    Estágio
                    <HelpTooltip text="Fase atual da negociação no funil de vendas." />
                  </p>
                  <span className="badge badge-blue">{analysis.stage || '-'}</span>
                </div>

                {/* Tom */}
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    Tom
                    <HelpTooltip text="Tom geral da comunicação do vendedor." />
                  </p>
                  <span className="badge badge-gray">{analysis.tone || '-'}</span>
                </div>

                {/* Resumo */}
                {analysis.summary && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">Resumo</p>
                    <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100">
                      {analysis.summary}
                    </p>
                  </div>
                )}

                <p className="text-[10px] text-gray-400 text-right pt-1">
                  Analisado em{' '}
                  {analysis.analyzed_at
                    ? format(parseISO(analysis.analyzed_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })
                    : '-'}
                </p>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <Bot className="w-7 h-7 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-600 mb-1">Conversa não analisada</p>
                <p className="text-xs text-gray-400 mb-4 max-w-[220px] mx-auto">
                  Clique abaixo para a IA analisar sentimento, qualidade e objeções.
                </p>
                <button onClick={handleAnalyze} disabled={analyzing} className="btn-primary text-sm">
                  {analyzing ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analisando...
                    </span>
                  ) : (
                    'Analisar Agora'
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Anotações do Gestor */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
              <StickyNote className="w-4 h-4 text-amber-500" />
              Anotações
              <HelpTooltip text="Notas do gestor sobre esta conversa. Visível apenas para gestores." position="right" />
            </h3>
            {notes.length > 0 && (
              <div className="space-y-2 mb-3">
                {notes.map((note) => (
                  <div key={note.id} className="p-2.5 bg-amber-50 rounded-lg border border-amber-100 group">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-gray-700 leading-relaxed flex-1 whitespace-pre-wrap">{note.text}</p>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all flex-shrink-0"
                        title="Remover"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {note.user_name}
                      {note.created_at && (
                        <> &middot; {format(parseISO(note.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAddNote()}
                placeholder="Adicionar anotação..."
                className="input-field flex-1 text-sm"
              />
              <button
                onClick={handleAddNote}
                disabled={savingNote || !newNote.trim()}
                className="btn-primary p-2 flex-shrink-0"
                title="Adicionar"
              >
                {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Objeções */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-orange-500" />
              Objeções
              <HelpTooltip text="Objeções do cliente. Verde = tratada pelo vendedor. Vermelho = não tratada." position="right" />
            </h3>
            {objectionsList.length > 0 ? (
              <div className="space-y-2">
                {objectionsList.map((obj, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 p-2.5 bg-gray-50 rounded-lg">
                    {obj.handled ? (
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-700 leading-relaxed">{obj.text}</p>
                      <p className={clsx('text-xs mt-1 font-medium', obj.handled ? 'text-green-600' : 'text-red-500')}>
                        {obj.handled ? 'Tratada' : 'Não tratada'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={FileText}
                title={analysis ? 'Nenhuma objeção identificada' : 'Aguardando análise'}
                description={analysis ? 'A IA não encontrou objeções nesta conversa.' : 'Analise a conversa para ver objeções detectadas.'}
                className="py-4"
              />
            )}
          </div>

          {/* Alertas */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              Alertas
              <HelpTooltip text="Alertas gerados automaticamente quando limites de tempo de resposta ou follow-up são ultrapassados." position="right" />
            </h3>
            {alerts.length > 0 ? (
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div key={alert.id} className="p-2.5 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={clsx('badge text-[10px]', SEVERITY_STYLES[alert.severity] || 'badge-gray')}>
                        {alert.severity}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {alert.alert_type || alert.type}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-auto">
                        {alert.created_at
                          ? format(parseISO(alert.created_at), "dd/MM HH:mm", { locale: ptBR })
                          : ''}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{alert.message}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={AlertTriangle}
                title="Nenhum alerta ativo"
                description="Alertas aparecem quando limites configurados são ultrapassados."
                className="py-4"
              />
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConversationDetail;
