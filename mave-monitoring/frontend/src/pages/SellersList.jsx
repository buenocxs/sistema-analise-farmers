import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Eye,
  Edit2,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Phone,
  MessageSquare,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { getSellers, createSeller, updateSeller, deleteSeller } from '../lib/api';

function SellerModal({ seller, onClose, onSave }) {
  const [name, setName] = useState(seller?.name || '');
  const [phone, setPhone] = useState(seller?.phone || '');
  const [team, setTeam] = useState(seller?.team || '');
  const [instanceName, setInstanceName] = useState(seller?.instance_name || '');
  const [zapiInstanceId, setZapiInstanceId] = useState(seller?.zapi_instance_id || '');
  const [zapiInstanceToken, setZapiInstanceToken] = useState(seller?.zapi_instance_token || '');
  const [isActive, setIsActive] = useState(seller?.is_active !== false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !team) {
      toast.error('Nome, telefone e equipe sao obrigatorios');
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), phone: phone.trim(), team, instance_name: instanceName.trim() || null, zapi_instance_id: zapiInstanceId.trim() || null, zapi_instance_token: zapiInstanceToken.trim() || null, active: isActive });
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao salvar vendedor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {seller ? 'Editar Vendedor' : 'Novo Vendedor'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label-text">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="Nome do vendedor"
              autoFocus
            />
          </div>
          <div>
            <label className="label-text">Telefone</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input-field"
              placeholder="+55 11 99999-9999"
            />
          </div>
          <div>
            <label className="label-text">Equipe</label>
            <select
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              className="input-field"
            >
              <option value="">Selecione a equipe</option>
              <option value="closer">Closers</option>
              <option value="farmer">Farmers</option>
              <option value="pre_sale">Pré-venda</option>
            </select>
          </div>
          <div>
            <label className="label-text">Instancia WhatsApp (label)</label>
            <input
              type="text"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              className="input-field"
              placeholder="Nome da instancia (ex: mave-joao)"
            />
          </div>
          <div>
            <label className="label-text">Z-API Instance ID</label>
            <input
              type="text"
              value={zapiInstanceId}
              onChange={(e) => setZapiInstanceId(e.target.value)}
              className="input-field font-mono text-sm"
              placeholder="ID da instancia Z-API"
            />
          </div>
          <div>
            <label className="label-text">Z-API Instance Token</label>
            <input
              type="text"
              value={zapiInstanceToken}
              onChange={(e) => setZapiInstanceToken(e.target.value)}
              className="input-field font-mono text-sm"
              placeholder="Token da instancia Z-API"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 text-mave-600 rounded border-gray-300 focus:ring-mave-500"
            />
            <label htmlFor="is_active" className="text-sm text-gray-700">
              Vendedor ativo
            </label>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SellersList() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editSeller, setEditSeller] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const navigate = useNavigate();

  const pageSize = 20;

  const loadSellers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        page_size: pageSize,
      };
      if (search.trim()) {
        params.search = search.trim();
      }
      const response = await getSellers(params);
      const data = response.data;
      setSellers(data.items || data.sellers || data || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || Math.ceil((data.total || 0) / pageSize) || 1);
    } catch (error) {
      toast.error('Erro ao carregar vendedores');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadSellers();
  }, [loadSellers]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const handleCreate = async (data) => {
    await createSeller(data);
    toast.success('Vendedor criado com sucesso');
    loadSellers();
  };

  const handleUpdate = async (data) => {
    await updateSeller(editSeller.id, data);
    toast.success('Vendedor atualizado com sucesso');
    setEditSeller(null);
    loadSellers();
  };

  const handleDelete = async (seller) => {
    if (!window.confirm(`Tem certeza que deseja excluir ${seller.name}?`)) return;
    try {
      await deleteSeller(seller.id);
      toast.success('Vendedor excluido');
      loadSellers();
    } catch (error) {
      toast.error('Erro ao excluir vendedor');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Vendedores</h1>
          <p className="page-subtitle">
            {total} vendedor{total !== 1 ? 'es' : ''} cadastrado{total !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4 mr-1.5" />
          Novo Vendedor
        </button>
      </div>

      {/* Search */}
      <div className="card-compact">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou equipe..."
            className="input-field pl-10"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-mave-600 animate-spin" />
          </div>
        ) : sellers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Users className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">Nenhum vendedor encontrado</p>
            <p className="text-xs mt-1">Tente ajustar os filtros de busca</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-header">Nome</th>
                    <th className="table-header">Telefone</th>
                    <th className="table-header">Equipe</th>
                    <th className="table-header">Instancia</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Conversas</th>
                    <th className="table-header text-right">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sellers.map((seller) => (
                    <tr
                      key={seller.id}
                      className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/sellers/${seller.id}`)}
                    >
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-mave-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-mave-700">
                              {seller.name?.charAt(0)?.toUpperCase() || '?'}
                            </span>
                          </div>
                          <span className="font-medium text-gray-900">{seller.name}</span>
                        </div>
                      </td>
                      <td className="table-cell">
                        <span className="flex items-center gap-1.5 text-gray-600">
                          <Phone className="w-3.5 h-3.5" />
                          {seller.phone}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span className="badge-blue">{seller.team || '-'}</span>
                      </td>
                      <td className="table-cell">
                        <span className="text-xs font-mono text-gray-600">
                          {seller.instance_name || <span className="text-gray-400 italic">padrao</span>}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span className={seller.is_active !== false ? 'badge-green' : 'badge-gray'}>
                          {seller.is_active !== false ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span className="flex items-center gap-1.5 text-gray-600">
                          <MessageSquare className="w-3.5 h-3.5" />
                          {seller.conversation_count ?? '-'}
                        </span>
                      </td>
                      <td className="table-cell text-right">
                        <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setOpenMenu(openMenu === seller.id ? null : seller.id)}
                            className="p-1.5 rounded-md hover:bg-gray-100"
                          >
                            <MoreVertical className="w-4 h-4 text-gray-400" />
                          </button>
                          {openMenu === seller.id && (
                            <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
                              <button
                                onClick={() => {
                                  setOpenMenu(null);
                                  navigate(`/sellers/${seller.id}`);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Eye className="w-3.5 h-3.5" /> Ver perfil
                              </button>
                              <button
                                onClick={() => {
                                  setOpenMenu(null);
                                  setEditSeller(seller);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Edit2 className="w-3.5 h-3.5" /> Editar
                              </button>
                              <button
                                onClick={() => {
                                  setOpenMenu(null);
                                  handleDelete(seller);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Excluir
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Pagina {page} de {totalPages} ({total} resultados)
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="btn-ghost p-1.5 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="btn-ghost p-1.5 disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <SellerModal onClose={() => setShowModal(false)} onSave={handleCreate} />
      )}
      {editSeller && (
        <SellerModal
          seller={editSeller}
          onClose={() => setEditSeller(null)}
          onSave={handleUpdate}
        />
      )}
    </div>
  );
}

export default SellersList;
