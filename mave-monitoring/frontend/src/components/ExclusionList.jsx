import { useState, useEffect } from 'react';
import {
  Ban,
  Plus,
  Trash2,
  Download,
  Search,
  AlertTriangle,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import * as api from '../lib/api';
import toast from 'react-hot-toast';

function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel, requireText }) {
  const [confirmInput, setConfirmInput] = useState('');

  useEffect(() => {
    if (open) setConfirmInput('');
  }, [open]);

  if (!open) return null;

  const canConfirm = requireText ? confirmInput === requireText : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">{message}</p>
        {requireText && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Digite <span className="font-bold text-red-600">{requireText}</span> para confirmar
            </label>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
              placeholder={requireText}
              autoFocus
            />
          </div>
        )}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmLabel || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ExclusionList() {
  const [numbers, setNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [numbersText, setNumbersText] = useState('');
  const [reason, setReason] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [stats, setStats] = useState(null);

  // Confirm dialogs
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  useEffect(() => {
    loadNumbers();
    loadStats();
  }, []);

  async function loadNumbers() {
    setLoading(true);
    try {
      const response = await api.getExclusionList({ limit: 500 });
      const data = response.data;
      // Support both array responses and paginated responses
      if (Array.isArray(data)) {
        setNumbers(data);
      } else if (data.items) {
        setNumbers(data.items);
      } else if (data.numbers) {
        setNumbers(data.numbers);
      } else {
        setNumbers([]);
      }
    } catch (error) {
      console.error('Error loading exclusion list:', error);
      toast.error('Erro ao carregar lista de exclusao');
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const response = await api.getExclusionStats();
      setStats(response.data);
    } catch (error) {
      console.error('Error loading exclusion stats:', error);
    }
  }

  async function handleAddNumbers() {
    if (!numbersText.trim()) {
      toast.error('Informe pelo menos um numero');
      return;
    }

    setAdding(true);
    try {
      const response = await api.addExcludedNumbers(numbersText, reason || null);
      const result = response.data;

      const added = result.added ?? 0;
      const skipped = result.skipped ?? result.duplicates ?? 0;
      const errors = result.errors?.length ?? result.invalid ?? 0;

      const parts = [];
      if (added > 0) parts.push(`${added} numero${added !== 1 ? 's' : ''} adicionado${added !== 1 ? 's' : ''}`);
      if (skipped > 0) parts.push(`${skipped} duplicado${skipped !== 1 ? 's' : ''}`);
      if (errors > 0) parts.push(`${errors} invalido${errors !== 1 ? 's' : ''}`);

      if (added > 0) {
        toast.success(parts.join(', '));
      } else if (parts.length > 0) {
        toast(parts.join(', '), { icon: '!' });
      } else {
        toast.success('Operacao concluida');
      }

      setNumbersText('');
      setReason('');
      loadNumbers();
      loadStats();
    } catch (error) {
      console.error('Error adding excluded numbers:', error);
      toast.error(error.response?.data?.detail || 'Erro ao adicionar numeros');
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveNumber(id) {
    try {
      await api.removeExcludedNumber(id);
      toast.success('Numero removido da lista');
      setNumbers((prev) => prev.filter((n) => n.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      loadStats();
    } catch (error) {
      console.error('Error removing number:', error);
      toast.error('Erro ao remover numero');
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    try {
      await api.bulkDeleteExcluded(Array.from(selectedIds));
      toast.success(`${selectedIds.size} numero${selectedIds.size !== 1 ? 's' : ''} removido${selectedIds.size !== 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      loadNumbers();
      loadStats();
    } catch (error) {
      console.error('Error bulk deleting:', error);
      toast.error('Erro ao remover numeros em lote');
    } finally {
      setConfirmBulkDelete(false);
    }
  }

  async function handleClearAll() {
    try {
      await api.clearExclusionList('CONFIRMAR');
      toast.success('Lista de exclusao limpa com sucesso');
      setNumbers([]);
      setSelectedIds(new Set());
      loadStats();
    } catch (error) {
      console.error('Error clearing exclusion list:', error);
      toast.error('Erro ao limpar lista de exclusao');
    } finally {
      setConfirmClearAll(false);
    }
  }

  async function handleExportCSV() {
    try {
      const response = await api.exportExclusionList();
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `exclusion_list_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Lista exportada com sucesso');
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast.error('Erro ao exportar lista');
    }
  }

  function toggleSelectAll() {
    const filteredNumbers = getFilteredNumbers();
    if (selectedIds.size === filteredNumbers.length && filteredNumbers.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredNumbers.map((n) => n.id)));
    }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function getFilteredNumbers() {
    if (!searchQuery.trim()) return numbers;
    const q = searchQuery.trim().toLowerCase();
    return numbers.filter(
      (n) =>
        (n.phone_normalized && n.phone_normalized.includes(q)) ||
        (n.original_format && n.original_format.toLowerCase().includes(q)) ||
        (n.reason && n.reason.toLowerCase().includes(q))
    );
  }

  const filteredNumbers = getFilteredNumbers();
  const allFilteredSelected =
    filteredNumbers.length > 0 &&
    filteredNumbers.every((n) => selectedIds.has(n.id));

  return (
    <div className="space-y-6">
      {/* Add Numbers Section */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-mave-600" />
          Adicionar Numeros
        </h3>
        <div className="space-y-3">
          <textarea
            value={numbersText}
            onChange={(e) => setNumbersText(e.target.value)}
            placeholder={
              'Cole os numeros aqui, um por linha.\n\nFormatos aceitos:\n+55 11 99999-0000\n5511999990000\n(11) 99999-0000\n11999990000'
            }
            rows={5}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-mave-400 focus:ring-2 focus:ring-mave-100 resize-y placeholder-gray-400"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo da exclusao (opcional)"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-mave-400 focus:ring-2 focus:ring-mave-100"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleAddNumbers}
              disabled={adding || !numbersText.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-mave-600 text-white text-sm font-medium rounded-lg hover:bg-mave-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {adding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Adicionar a Lista
            </button>
            <button
              onClick={() => {
                setNumbersText('');
                setReason('');
              }}
              disabled={!numbersText && !reason}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Limpar Campo
            </button>
          </div>
        </div>
      </div>

      {/* Current List Section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Ban className="w-4 h-4 text-red-500" />
              Numeros Excluidos ({numbers.length})
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar numero..."
                className="w-full sm:w-56 pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-mave-400 focus:ring-2 focus:ring-mave-100"
              />
            </div>
          </div>
        </div>

        {/* Selection Bar */}
        {filteredNumbers.length > 0 && (
          <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-gray-300 text-mave-600 focus:ring-mave-500"
              />
              {allFilteredSelected ? 'Desselecionar todos' : 'Selecionar todos'}
            </label>
            {selectedIds.size > 0 && (
              <button
                onClick={() => setConfirmBulkDelete(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remover selecionados ({selectedIds.size})
              </button>
            )}
          </div>
        )}

        {/* Numbers List */}
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-8 h-8 border-4 border-mave-200 border-t-mave-600 rounded-full animate-spin" />
          </div>
        ) : filteredNumbers.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            {searchQuery
              ? 'Nenhum numero encontrado com esse filtro'
              : 'Nenhum numero na lista de exclusao'}
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
            {filteredNumbers.map((number) => (
              <div
                key={number.id}
                className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(number.id)}
                  onChange={() => toggleSelect(number.id)}
                  className="w-4 h-4 rounded border-gray-300 text-mave-600 focus:ring-mave-500 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono font-medium text-gray-900">
                      {number.phone_normalized}
                    </span>
                    {number.original_format &&
                      number.original_format !== number.phone_normalized && (
                        <span className="text-xs text-gray-400">
                          (original: {number.original_format})
                        </span>
                      )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {number.added_at && (
                      <span className="text-xs text-gray-400">
                        Adicionado em{' '}
                        {new Date(number.added_at).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                    {number.reason && (
                      <span className="text-xs text-gray-500 truncate max-w-xs">
                        {number.reason}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setConfirmDelete(number.id)}
                  className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Remover numero"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCSV}
            disabled={numbers.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Exportar Lista (CSV)
          </button>
          <button
            onClick={() => setConfirmClearAll(true)}
            disabled={numbers.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-red-600 text-sm font-medium rounded-lg border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            Limpar Tudo
          </button>
        </div>

        {/* Stats */}
        {stats && stats.excluded_last_24h != null && (
          <p className="text-xs text-gray-500">
            {stats.excluded_last_24h} conversa{stats.excluded_last_24h !== 1 ? 's' : ''} excluida{stats.excluded_last_24h !== 1 ? 's' : ''} nas ultimas 24h
          </p>
        )}
      </div>

      {/* Confirm Delete Single */}
      <ConfirmDialog
        open={confirmDelete != null}
        title="Remover Numero"
        message="Tem certeza que deseja remover este numero da lista de exclusao? Conversas desse numero voltarao a ser monitoradas."
        confirmLabel="Remover"
        onConfirm={() => {
          if (confirmDelete != null) {
            handleRemoveNumber(confirmDelete);
          }
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Confirm Bulk Delete */}
      <ConfirmDialog
        open={confirmBulkDelete}
        title="Remover Selecionados"
        message={`Tem certeza que deseja remover ${selectedIds.size} numero${selectedIds.size !== 1 ? 's' : ''} da lista de exclusao?`}
        confirmLabel="Remover Todos"
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      {/* Confirm Clear All */}
      <ConfirmDialog
        open={confirmClearAll}
        title="Limpar Lista Completa"
        message="Esta acao ira remover TODOS os numeros da lista de exclusao. Essa acao nao pode ser desfeita."
        confirmLabel="Limpar Tudo"
        requireText="CONFIRMAR"
        onConfirm={handleClearAll}
        onCancel={() => setConfirmClearAll(false)}
      />
    </div>
  );
}
