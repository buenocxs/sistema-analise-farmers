import { X, Lightbulb } from 'lucide-react';
import { useState } from 'react';

const TIPS = [
  {
    title: 'Sincronize conversas',
    text: 'Acesse o perfil de um vendedor e clique em "Sincronizar" para puxar conversas do WhatsApp.',
  },
  {
    title: 'Analise com IA',
    text: 'Abra uma conversa e clique em "Analisar com IA" para obter sentimento, qualidade e resumo.',
  },
  {
    title: 'Configure alertas',
    text: 'Em Configurações > Alertas, defina limites de tempo de resposta e dias sem follow-up.',
  },
  {
    title: 'Acompanhe o dashboard',
    text: 'Use os filtros de período e equipe para acompanhar conversas, qualidade e sentimento.',
  },
];

export function WelcomeCard() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('mave_welcome_dismissed') === 'true'
  );

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem('mave_welcome_dismissed', 'true');
    setDismissed(true);
  };

  return (
    <div className="card border-mave-200 bg-gradient-to-r from-mave-50 to-orange-50 relative animate-fade-in">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-white/60 text-gray-400 hover:text-gray-600 transition-colors"
        title="Fechar"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-mave-100 flex items-center justify-center flex-shrink-0">
          <Lightbulb className="w-5 h-5 text-mave-600" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-900">Bem-vindo ao MAVE Monitoramento</h3>
          <p className="text-sm text-gray-500 mt-0.5">Aqui estão algumas dicas para começar:</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TIPS.map((tip, idx) => (
          <div key={idx} className="flex items-start gap-2.5 bg-white/70 rounded-lg p-3 border border-white">
            <div className="w-6 h-6 rounded-full bg-mave-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-mave-700">{idx + 1}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">{tip.title}</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{tip.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
