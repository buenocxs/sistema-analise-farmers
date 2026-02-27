import { useState, useRef, useEffect } from 'react';
import { Bot, Send, User, Sparkles } from 'lucide-react';
import * as api from '../lib/api';
import toast from 'react-hot-toast';

const SUGGESTED_QUESTIONS = [
  'Como esta o desempenho do Luis?',
  'Qual vendedor tem melhor qualidade de atendimento?',
  'Quais objecoes mais comuns da Camila?',
  'Compare o desempenho da equipe de pre-venda',
  'Quem sao os 3 melhores vendedores do mes?',
  'Quais alertas estao pendentes?',
];

function formatAIResponse(text) {
  if (!text) return '';

  // Process markdown-like formatting to HTML
  let html = text;

  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic: *text*
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  // Headers: ### Header
  html = html.replace(
    /^### (.+)$/gm,
    '<h4 class="text-sm font-bold text-gray-800 mt-3 mb-1">$1</h4>'
  );
  html = html.replace(
    /^## (.+)$/gm,
    '<h3 class="text-base font-bold text-gray-800 mt-3 mb-1">$1</h3>'
  );
  html = html.replace(
    /^# (.+)$/gm,
    '<h2 class="text-lg font-bold text-gray-800 mt-3 mb-2">$1</h2>'
  );

  // Unordered list: - item
  html = html.replace(
    /^- (.+)$/gm,
    '<li class="ml-4 list-disc text-gray-700">$1</li>'
  );

  // Ordered list: 1. item
  html = html.replace(
    /^\d+\.\s(.+)$/gm,
    '<li class="ml-4 list-decimal text-gray-700">$1</li>'
  );

  // Line breaks
  html = html.replace(/\n\n/g, '<br/><br/>');
  html = html.replace(/\n/g, '<br/>');

  return html;
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 max-w-3xl">
      <div className="w-8 h-8 rounded-lg bg-mave-600 flex items-center justify-center flex-shrink-0">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="bg-white rounded-2xl rounded-tl-md px-4 py-3 border border-gray-200 shadow-sm">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

function ChatMessage({ message }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex items-start gap-3 max-w-3xl ml-auto flex-row-reverse">
        <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0">
          <User className="w-4 h-4 text-white" />
        </div>
        <div className="bg-mave-600 text-white rounded-2xl rounded-tr-md px-4 py-3 shadow-sm">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 max-w-3xl">
      <div className="w-8 h-8 rounded-lg bg-mave-600 flex items-center justify-center flex-shrink-0">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="bg-white rounded-2xl rounded-tl-md px-4 py-3 border border-gray-200 shadow-sm flex-1 min-w-0">
        <div
          className="text-sm text-gray-700 leading-relaxed prose-sm break-words"
          dangerouslySetInnerHTML={{ __html: formatAIResponse(message.content) }}
        />
      </div>
    </div>
  );
}

export default function AgentChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  async function handleSend(questionText) {
    const question = (questionText || input).trim();
    if (!question || isLoading) return;

    // Add user message
    const userMessage = { role: 'user', content: question };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await api.agentChat(question);
      const answer = response.data.answer || response.data.response || 'Sem resposta do agente.';
      const aiMessage = { role: 'assistant', content: answer };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error('Agent chat error:', error);
      const errorMessage =
        error.response?.data?.detail ||
        'Erro ao comunicar com o agente de IA. Tente novamente.';
      toast.error(errorMessage);
      const aiMessage = {
        role: 'assistant',
        content:
          'Desculpe, ocorreu um erro ao processar sua pergunta. Por favor, tente novamente.',
      };
      setMessages((prev) => [...prev, aiMessage]);
    } finally {
      setIsLoading(false);
      // Re-focus input
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSuggestedClick(question) {
    handleSend(question);
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex-shrink-0 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-mave-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Agente IA
            </h1>
            <p className="text-sm text-gray-500">
              Pergunte sobre o desempenho da equipe, conversas e metricas
            </p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-6 space-y-4"
      >
        {isEmpty && !isLoading ? (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-mave-100 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-mave-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Como posso ajudar?
            </h2>
            <p className="text-sm text-gray-500 mb-8 text-center max-w-md">
              Faca perguntas sobre o desempenho dos vendedores, metricas das
              equipes, analise de conversas e muito mais.
            </p>

            {/* Suggested Questions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
              {SUGGESTED_QUESTIONS.map((question, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestedClick(question)}
                  className="text-left p-3.5 rounded-xl border border-gray-200 bg-white hover:border-mave-300 hover:bg-mave-50 transition-all text-sm text-gray-700 hover:text-mave-700 group"
                >
                  <div className="flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-gray-400 group-hover:text-mave-500 mt-0.5 flex-shrink-0" />
                    <span>{question}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <ChatMessage key={idx} message={msg} />
            ))}
            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 mt-4">
        <div className="relative flex items-end gap-2 bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 focus-within:border-mave-400 focus-within:ring-2 focus-within:ring-mave-100 transition-all">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua pergunta sobre vendas, equipes ou metricas..."
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none disabled:opacity-50 max-h-32 overflow-y-auto"
            style={{
              minHeight: '1.5rem',
              height: 'auto',
            }}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
              input.trim() && !isLoading
                ? 'bg-mave-600 text-white hover:bg-mave-700 shadow-sm'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">
          O agente IA consulta os dados reais do sistema MAVE para responder suas perguntas
        </p>
      </div>
    </div>
  );
}
