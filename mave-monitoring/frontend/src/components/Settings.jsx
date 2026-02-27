import { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Users,
  Link,
  Bell,
  Ban,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import * as api from '../lib/api';
import toast from 'react-hot-toast';
import ExclusionList from './ExclusionList';

const TABS = [
  { key: 'sellers', label: 'Vendedores', icon: Users },
  { key: 'integration', label: 'Integracao', icon: Link },
  { key: 'alerts', label: 'Alertas', icon: Bell },
  { key: 'exclusion', label: 'Lista de Exclusao', icon: Ban },
];

const TEAM_OPTIONS = [
  { value: 'closer', label: 'Closer' },
  { value: 'farmer', label: 'Farmer' },
  { value: 'pre_sale', label: 'Pre-venda' },
];

const TEAM_LABELS = {
  closer: 'Closer',
  farmer: 'Farmer',
  pre_sale: 'Pre-venda',
};

// ========================
// Sellers Tab
// ========================
function SellersTab() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSeller, setEditingSeller] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Add form state
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newTeam, setNewTeam] = useState('closer');
  const [newInstanceName, setNewInstanceName] = useState('');
  const [newZapiId, setNewZapiId] = useState('');
  const [newZapiToken, setNewZapiToken] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // Edit modal state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editTeam, setEditTeam] = useState('closer');
  const [editInstanceName, setEditInstanceName] = useState('');
  const [editZapiId, setEditZapiId] = useState('');
  const [editZapiToken, setEditZapiToken] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    loadSellers();
  }, []);

  async function loadSellers() {
    setLoading(true);
    try {
      const response = await api.getSellers({ limit: 200 });
      setSellers(response.data.sellers || []);
    } catch (error) {
      toast.error('Erro ao carregar vendedores');
      console.error('Load sellers error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddSeller(e) {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) {
      toast.error('Preencha nome e telefone');
      return;
    }
    setAddLoading(true);
    try {
      await api.createSeller({
        name: newName.trim(),
        phone: newPhone.trim(),
        team: newTeam,
        instance_name: newInstanceName.trim() || null,
        zapi_instance_id: newZapiId.trim() || null,
        zapi_instance_token: newZapiToken.trim() || null,
        active: true,
      });
      toast.success('Vendedor adicionado com sucesso');
      setNewName('');
      setNewPhone('');
      setNewTeam('closer');
      setNewInstanceName('');
      setNewZapiId('');
      setNewZapiToken('');
      setShowAddForm(false);
      loadSellers();
    } catch (error) {
      const msg = error.response?.data?.detail || 'Erro ao adicionar vendedor';
      toast.error(msg);
    } finally {
      setAddLoading(false);
    }
  }

  function openEditModal(seller) {
    setEditingSeller(seller);
    setEditName(seller.name);
    setEditPhone(seller.phone);
    setEditTeam(seller.team);
    setEditInstanceName(seller.instance_name || '');
    setEditZapiId(seller.zapi_instance_id || '');
    setEditZapiToken(seller.zapi_instance_token || '');
  }

  async function handleEditSeller(e) {
    e.preventDefault();
    if (!editingSeller) return;
    setEditLoading(true);
    try {
      await api.updateSeller(editingSeller.id, {
        name: editName.trim(),
        phone: editPhone.trim(),
        team: editTeam,
        instance_name: editInstanceName.trim() || null,
        zapi_instance_id: editZapiId.trim() || null,
        zapi_instance_token: editZapiToken.trim() || null,
      });
      toast.success('Vendedor atualizado com sucesso');
      setEditingSeller(null);
      loadSellers();
    } catch (error) {
      const msg = error.response?.data?.detail || 'Erro ao atualizar vendedor';
      toast.error(msg);
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDeleteSeller(id) {
    try {
      await api.deleteSeller(id);
      toast.success('Vendedor desativado com sucesso');
      setDeletingId(null);
      loadSellers();
    } catch (error) {
      toast.error('Erro ao desativar vendedor');
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            Gerenciar Vendedores
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Adicione, edite ou desative vendedores do sistema
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-mave-600 text-white text-sm font-medium rounded-lg hover:bg-mave-700 transition-colors"
        >
          {showAddForm ? (
            <>
              <X className="w-4 h-4" />
              Cancelar
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              Novo Vendedor
            </>
          )}
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddSeller}
          className="bg-gray-50 rounded-xl border border-gray-200 p-5"
        >
          <h4 className="text-sm font-semibold text-gray-800 mb-3">
            Novo Vendedor
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Nome
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome completo"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-mave-400 focus:ring-2 focus:ring-mave-100"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Telefone
              </label>
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="5511999990000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-mave-400 focus:ring-2 focus:ring-mave-100"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Equipe
              </label>
              <select
                value={newTeam}
                onChange={(e) => setNewTeam(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-mave-400 focus:ring-2 focus:ring-mave-100 bg-white"
              >
                {TEAM_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Instancia WhatsApp (label)
              </label>
              <input
                type="text"
                value={newInstanceName}
                onChange={(e) => setNewInstanceName(e.target.value)}
                placeholder="Nome da instancia (ex: mave-joao)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-mave-400 focus:ring-2 focus:ring-mave-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Z-API Instance ID
              </label>
              <input
                type="text"
                value={newZapiId}
                onChange={(e) => setNewZapiId(e.target.value)}
                placeholder="Cole aqui o Instance ID do Z-API"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:border-mave-400 focus:ring-2 focus:ring-mave-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Z-API Instance Token
              </label>
              <input
                type="text"
                value={newZapiToken}
                onChange={(e) => setNewZapiToken(e.target.value)}
                placeholder="Cole aqui o Token da instancia Z-API"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:border-mave-400 focus:ring-2 focus:ring-mave-100"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={addLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-mave-600 text-white text-sm font-medium rounded-lg hover:bg-mave-700 transition-colors disabled:opacity-50"
            >
              {addLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Adicionar
            </button>
          </div>
        </form>
      )}

      {/* Sellers Table */}
      {loading ? (
        <div className="flex justify-center p-8">
          <div className="w-8 h-8 border-4 border-mave-200 border-t-mave-600 rounded-full animate-spin" />
        </div>
      ) : sellers.length === 0 ? (
        <div className="text-center p-8 text-sm text-gray-400">
          Nenhum vendedor cadastrado
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    Nome
                  </th>
                  <th className="px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    Telefone
                  </th>
                  <th className="px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    Equipe
                  </th>
                  <th className="px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    Instancia
                  </th>
                  <th className="px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider text-center">
                    Status
                  </th>
                  <th className="px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider text-right">
                    Acoes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sellers.map((seller) => (
                  <tr key={seller.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {seller.name}
                    </td>
                    <td className="px-5 py-3 text-gray-600 font-mono text-xs">
                      {seller.phone}
                    </td>
                    <td className="px-5 py-3">
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
                    <td className="px-5 py-3">
                      <span className="text-xs font-mono text-gray-600">
                        {seller.instance_name || <span className="text-gray-300 italic">padrao</span>}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          seller.active
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {seller.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditModal(seller)}
                          className="w-8 h-8 rounded-md flex items-center justify-center text-gray-400 hover:text-mave-600 hover:bg-mave-50 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {seller.active && (
                          <button
                            onClick={() => setDeletingId(seller.id)}
                            className="w-8 h-8 rounded-md flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Desativar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingSeller && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Editar Vendedor
              </h3>
              <button
                onClick={() => setEditingSeller(null)}
                className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleEditSeller} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nome
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-mave-400 focus:ring-2 focus:ring-mave-100"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Telefone
                </label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-mave-400 focus:ring-2 focus:ring-mave-100"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Equipe
                </label>
                <select
                  value={editTeam}
                  onChange={(e) => setEditTeam(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-mave-400 focus:ring-2 focus:ring-mave-100 bg-white"
                >
                  {TEAM_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Instancia WhatsApp (label)
                </label>
                <input
                  type="text"
                  value={editInstanceName}
                  onChange={(e) => setEditInstanceName(e.target.value)}
                  placeholder="Nome da instancia (ex: mave-joao)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-mave-400 focus:ring-2 focus:ring-mave-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Z-API Instance ID
                </label>
                <input
                  type="text"
                  value={editZapiId}
                  onChange={(e) => setEditZapiId(e.target.value)}
                  placeholder="Cole aqui o Instance ID do Z-API"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:border-mave-400 focus:ring-2 focus:ring-mave-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Z-API Instance Token
                </label>
                <input
                  type="text"
                  value={editZapiToken}
                  onChange={(e) => setEditZapiToken(e.target.value)}
                  placeholder="Cole aqui o Token da instancia Z-API"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:border-mave-400 focus:ring-2 focus:ring-mave-100"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingSeller(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-mave-600 text-white text-sm font-medium rounded-lg hover:bg-mave-700 transition-colors disabled:opacity-50"
                >
                  {editLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                Desativar Vendedor
              </h3>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              Tem certeza que deseja desativar este vendedor? As conversas existentes serao mantidas, mas nenhuma nova conversa sera monitorada.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteSeller(deletingId)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Desativar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================
// Integration Tab
// ========================
function IntegrationTab() {
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);

  async function handleTestConnection() {
    setTesting(true);
    setConnectionStatus(null);
    try {
      const response = await api.getSystemStatus();
      if (response) {
        setConnectionStatus('connected');
        toast.success('Conexao com a API funcionando corretamente');
      }
    } catch (error) {
      setConnectionStatus('error');
      toast.error('Erro ao testar conexao com a API');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900">
          Integracao WhatsApp
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Status da integracao com o WhatsApp via Z-API
        </p>
      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="pt-2">
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-mave-600 text-white text-sm font-medium rounded-lg hover:bg-mave-700 transition-colors disabled:opacity-50"
          >
            {testing ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Link className="w-4 h-4" />
            )}
            Testar Conexao
          </button>
        </div>
      </div>

      {/* Connection Status */}
      {connectionStatus && (
        <div
          className={`rounded-xl border p-4 ${
            connectionStatus === 'connected'
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-500'
                  : 'bg-red-500'
              }`}
            />
            <span
              className={`text-sm font-medium ${
                connectionStatus === 'connected'
                  ? 'text-emerald-700'
                  : 'text-red-700'
              }`}
            >
              {connectionStatus === 'connected'
                ? 'API conectada e funcionando'
                : 'Falha na conexao com a API'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================
// Alerts Tab
// ========================
function AlertsTab() {
  const [maxResponseTime, setMaxResponseTime] = useState(30);
  const [daysWithoutFollowUp, setDaysWithoutFollowUp] = useState(3);
  const [unhandledObjectionHours, setUnhandledObjectionHours] = useState(24);
  const [saving, setSaving] = useState(false);

  // Carregar configuracao na montagem (fallback para localStorage)
  useEffect(() => {
    async function loadConfig() {
      try {
        const { data } = await api.default.get('/alert-config');
        if (data.maxResponseTime != null) setMaxResponseTime(data.maxResponseTime);
        if (data.daysWithoutFollowUp != null) setDaysWithoutFollowUp(data.daysWithoutFollowUp);
        if (data.unhandledObjectionHours != null) setUnhandledObjectionHours(data.unhandledObjectionHours);
      } catch (e) {
        // Fallback to localStorage if API fails
        try {
          const saved = JSON.parse(localStorage.getItem('mave_alert_thresholds') || '{}');
          if (saved.maxResponseTime != null) setMaxResponseTime(saved.maxResponseTime);
          if (saved.daysWithoutFollowUp != null) setDaysWithoutFollowUp(saved.daysWithoutFollowUp);
          if (saved.unhandledObjectionHours != null) setUnhandledObjectionHours(saved.unhandledObjectionHours);
        } catch (e2) {
          console.error('Error loading alert thresholds:', e2);
        }
      }
    }
    loadConfig();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const thresholds = {
        maxResponseTime,
        daysWithoutFollowUp,
        unhandledObjectionHours,
      };
      await api.default.put('/alert-config', thresholds);
      // Also keep localStorage as cache
      localStorage.setItem('mave_alert_thresholds', JSON.stringify(thresholds));
      toast.success('Configuracoes de alertas salvas com sucesso');
    } catch (error) {
      toast.error('Erro ao salvar configuracoes');
    } finally {
      setTimeout(() => setSaving(false), 300);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900">
          Limites de Alertas
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Configure os limites para geracao automatica de alertas
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-6">
        {/* Max Response Time */}
        <div>
          <label className="flex items-center justify-between mb-2">
            <div>
              <span className="text-sm font-medium text-gray-800">
                Tempo maximo de resposta
              </span>
              <p className="text-xs text-gray-500">
                Alerta quando o vendedor demorar mais que o tempo configurado para responder
              </p>
            </div>
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={maxResponseTime}
              onChange={(e) => setMaxResponseTime(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={1440}
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-mave-400 focus:ring-2 focus:ring-mave-100 text-center"
            />
            <span className="text-sm text-gray-500">minutos</span>
          </div>
          <div className="mt-2 w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-mave-500 h-2 rounded-full transition-all"
              style={{ width: `${Math.min((maxResponseTime / 120) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Days Without Follow-up */}
        <div>
          <label className="flex items-center justify-between mb-2">
            <div>
              <span className="text-sm font-medium text-gray-800">
                Dias sem follow-up
              </span>
              <p className="text-xs text-gray-500">
                Alerta quando nao houver follow-up apos o periodo configurado
              </p>
            </div>
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={daysWithoutFollowUp}
              onChange={(e) => setDaysWithoutFollowUp(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={30}
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-mave-400 focus:ring-2 focus:ring-mave-100 text-center"
            />
            <span className="text-sm text-gray-500">dias</span>
          </div>
          <div className="mt-2 w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-amber-500 h-2 rounded-full transition-all"
              style={{ width: `${Math.min((daysWithoutFollowUp / 14) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Unhandled Objections Hours */}
        <div>
          <label className="flex items-center justify-between mb-2">
            <div>
              <span className="text-sm font-medium text-gray-800">
                Horas para objecoes nao tratadas
              </span>
              <p className="text-xs text-gray-500">
                Alerta quando uma objecao do cliente nao for tratada no periodo configurado
              </p>
            </div>
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={unhandledObjectionHours}
              onChange={(e) => setUnhandledObjectionHours(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={168}
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-mave-400 focus:ring-2 focus:ring-mave-100 text-center"
            />
            <span className="text-sm text-gray-500">horas</span>
          </div>
          <div className="mt-2 w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-red-400 h-2 rounded-full transition-all"
              style={{ width: `${Math.min((unhandledObjectionHours / 72) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-2 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-mave-600 text-white text-sm font-medium rounded-lg hover:bg-mave-700 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Salvar Configuracoes
          </button>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
        <div className="flex items-start gap-3">
          <Bell className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800">
              Sobre os Alertas
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Os alertas sao gerados automaticamente pelo sistema com base na analise das conversas.
              Quando um dos limites configurados e ultrapassado, um alerta e criado e exibido no dashboard.
              As configuracoes sao salvas localmente e serao aplicadas nas proximas analises.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========================
// Main Settings Component
// ========================
export default function Settings() {
  const [activeTab, setActiveTab] = useState('sellers');

  function renderTabContent() {
    switch (activeTab) {
      case 'sellers':
        return <SellersTab />;
      case 'integration':
        return <IntegrationTab />;
      case 'alerts':
        return <AlertsTab />;
      case 'exclusion':
        return <ExclusionList />;
      default:
        return null;
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
          <SettingsIcon className="w-5 h-5 text-gray-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Configuracoes
          </h1>
          <p className="text-sm text-gray-500">
            Gerencie vendedores, integracao, alertas e exclusoes
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-4 sm:space-x-6 overflow-x-auto" aria-label="Tabs">
          {TABS.map((tab) => {
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeTab === tab.key
                    ? 'border-mave-600 text-mave-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <TabIcon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div>{renderTabContent()}</div>
    </div>
  );
}
