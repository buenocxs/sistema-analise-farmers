import { HelpCircle } from 'lucide-react';

const positions = {
  top: {
    box: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    arrow: 'top-full left-1/2 -translate-x-1/2 border-t-gray-800 border-x-transparent border-b-transparent border-4',
  },
  bottom: {
    box: 'top-full left-1/2 -translate-x-1/2 mt-2',
    arrow: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-800 border-x-transparent border-t-transparent border-4',
  },
  left: {
    box: 'right-full top-1/2 -translate-y-1/2 mr-2',
    arrow: 'left-full top-1/2 -translate-y-1/2 border-l-gray-800 border-y-transparent border-r-transparent border-4',
  },
  right: {
    box: 'left-full top-1/2 -translate-y-1/2 ml-2',
    arrow: 'right-full top-1/2 -translate-y-1/2 border-r-gray-800 border-y-transparent border-l-transparent border-4',
  },
};

export function HelpTooltip({ text, position = 'top', className = '' }) {
  const pos = positions[position] || positions.top;

  return (
    <span className={`relative inline-flex group ${className}`}>
      <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-mave-500 cursor-help transition-colors" />
      <span
        className={`absolute ${pos.box} z-50 px-3 py-2 text-xs text-white bg-gray-800 rounded-lg shadow-lg
          whitespace-normal max-w-[240px] leading-relaxed
          opacity-0 invisible group-hover:opacity-100 group-hover:visible
          transition-all duration-200 pointer-events-none`}
      >
        {text}
        <span className={`absolute ${pos.arrow}`} />
      </span>
    </span>
  );
}
