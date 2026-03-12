import { useState } from 'react';
import {
  format, subDays, parseISO,
  startOfWeek, endOfWeek, startOfMonth,
  addMonths, subMonths, getDay, getDaysInMonth,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, ChevronDown, X } from 'lucide-react';
import clsx from 'clsx';

/**
 * DateRangePicker
 *
 * Props:
 *   dateFrom  – 'YYYY-MM-DD' or ''
 *   dateTo    – 'YYYY-MM-DD' or ''
 *   onChange  – (from: string, to: string) => void
 *   clearable – shows "Qualquer período" + X button when no dates selected (default false)
 *   placeholder – label when no date selected and clearable=true (default 'Qualquer período')
 */
export function DateRangePicker({ dateFrom, dateTo, onChange, clearable = false, placeholder = 'Qualquer período' }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()));
  const [selecting, setSelecting] = useState(null); // null | 'end'
  const [hoverDate, setHoverDate] = useState(null);
  const [tempFrom, setTempFrom] = useState(dateFrom);

  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const lastWeekStart = format(startOfWeek(subDays(new Date(), 7), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const lastWeekEnd = format(endOfWeek(subDays(new Date(), 7), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const thisMonthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');

  const PRESETS = [
    { label: 'Hoje', from: today, to: today },
    { label: 'Ontem', from: yesterday, to: yesterday },
    { label: 'Últimos 3 dias', from: format(subDays(new Date(), 2), 'yyyy-MM-dd'), to: today },
    { label: 'Últimos 7 dias', from: format(subDays(new Date(), 6), 'yyyy-MM-dd'), to: today },
    { label: 'Semana passada', from: lastWeekStart, to: lastWeekEnd },
    { label: 'Este mês', from: thisMonthStart, to: today },
    { label: 'Últimos 30 dias', from: format(subDays(new Date(), 29), 'yyyy-MM-dd'), to: today },
  ];

  // Build calendar day grid for current viewDate month
  const daysInMonth = getDaysInMonth(viewDate);
  const firstDayOfWeek = getDay(startOfMonth(viewDate));
  const days = [];
  for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(format(new Date(viewDate.getFullYear(), viewDate.getMonth(), d), 'yyyy-MM-dd'));
  }

  const effectiveTo = selecting === 'end' ? (hoverDate || dateTo) : dateTo;
  const rangeFrom = selecting === 'end' ? tempFrom : dateFrom;

  const isDayInRange = (d) => d && rangeFrom && effectiveTo && d > rangeFrom && d < effectiveTo;
  const isDayStart = (d) => d === rangeFrom;
  const isDayEnd = (d) => d === effectiveTo;
  const isDaySingle = (d) => d === rangeFrom && rangeFrom === effectiveTo;

  const handleDayClick = (d) => {
    if (!d || d > today) return;
    if (!selecting) {
      setTempFrom(d);
      setSelecting('end');
    } else {
      let from = tempFrom;
      let to = d;
      if (to < from) [from, to] = [to, from];
      onChange(from, to);
      setSelecting(null);
      setHoverDate(null);
      setOpen(false);
    }
  };

  const handlePreset = ({ from, to }) => {
    onChange(from, to);
    setSelecting(null);
    setHoverDate(null);
    setOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('', '');
    setSelecting(null);
    setHoverDate(null);
  };

  const close = () => { setOpen(false); setSelecting(null); };

  const getLabel = () => {
    if (!dateFrom || !dateTo) return placeholder;
    const preset = PRESETS.find((p) => p.from === dateFrom && p.to === dateTo);
    if (preset) return preset.label;
    if (dateFrom === dateTo) return format(parseISO(dateFrom), 'dd/MM/yyyy', { locale: ptBR });
    return `${format(parseISO(dateFrom), 'dd/MM')} – ${format(parseISO(dateTo), 'dd/MM')}`;
  };

  const hasValue = Boolean(dateFrom || dateTo);

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(!open); setSelecting(null); }}
        className={clsx('btn-secondary flex items-center gap-2', hasValue && 'text-mave-700')}
      >
        <Calendar className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">{getLabel()}</span>
        {clearable && hasValue ? (
          <X className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 hover:text-gray-700" onClick={handleClear} />
        ) : (
          <ChevronDown className="w-4 h-4 flex-shrink-0" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute top-full mt-1 left-0 z-20 bg-white border border-gray-200 rounded-xl shadow-lg flex overflow-hidden">
            {/* Presets */}
            <div className="w-40 border-r border-gray-100 p-2 flex flex-col gap-0.5">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold px-2 py-1">Atalhos</p>
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePreset(preset)}
                  className={clsx(
                    'text-left px-3 py-1.5 rounded-lg text-sm transition-colors',
                    preset.from === dateFrom && preset.to === dateTo
                      ? 'bg-mave-50 text-mave-700 font-medium'
                      : 'hover:bg-gray-50 text-gray-700'
                  )}
                >
                  {preset.label}
                </button>
              ))}
              {clearable && hasValue && (
                <>
                  <div className="border-t border-gray-100 my-1" />
                  <button
                    onClick={() => { onChange('', ''); close(); }}
                    className="text-left px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                  >
                    Limpar período
                  </button>
                </>
              )}
            </div>

            {/* Calendar */}
            <div className="p-3 w-64">
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-1 rounded hover:bg-gray-100 text-lg leading-none text-gray-600">‹</button>
                <span className="text-sm font-semibold text-gray-800 capitalize">
                  {format(viewDate, 'MMMM yyyy', { locale: ptBR })}
                </span>
                <button onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-1 rounded hover:bg-gray-100 text-lg leading-none text-gray-600">›</button>
              </div>

              <div className="grid grid-cols-7 mb-1">
                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
                  <div key={i} className="text-center text-[10px] text-gray-400 font-semibold py-1">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-y-0.5">
                {days.map((d, idx) => {
                  if (!d) return <div key={`e-${idx}`} className="h-8" />;
                  const inRange = isDayInRange(d);
                  const isStart = isDayStart(d);
                  const isEnd = isDayEnd(d);
                  const isSingle = isDaySingle(d);
                  const isToday = d === today;
                  const isFuture = d > today;
                  return (
                    <button
                      key={d}
                      onClick={() => handleDayClick(d)}
                      onMouseEnter={() => selecting === 'end' && setHoverDate(d)}
                      onMouseLeave={() => selecting === 'end' && setHoverDate(null)}
                      disabled={isFuture}
                      className={clsx(
                        'h-8 w-full text-xs flex items-center justify-center transition-all select-none',
                        isFuture && 'opacity-30 cursor-not-allowed text-gray-400',
                        !isFuture && !inRange && !isStart && !isEnd && 'hover:bg-gray-100 rounded-full text-gray-700',
                        inRange && 'bg-mave-50 text-mave-800',
                        (isStart || isEnd) && !isSingle && 'bg-mave-600 text-white font-semibold',
                        isSingle && 'bg-mave-600 text-white font-semibold rounded-full',
                        isStart && !isSingle && 'rounded-l-full',
                        isEnd && !isSingle && 'rounded-r-full',
                        isToday && !isStart && !isEnd && 'font-bold',
                      )}
                    >
                      {parseInt(d.split('-')[2])}
                    </button>
                  );
                })}
              </div>

              {selecting === 'end' && (
                <p className="text-[11px] text-mave-500 text-center mt-2">Clique no dia final do período</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
