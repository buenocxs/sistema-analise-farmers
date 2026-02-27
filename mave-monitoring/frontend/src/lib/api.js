/**
 * API layer — chamadas HTTP reais ao backend FastAPI.
 *
 * Cada função retorna { data: ... } para manter compatibilidade
 * com o código existente dos componentes.
 */

const BASE = import.meta.env.VITE_API_BASE_URL || '/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function authHeaders() {
  const token = localStorage.getItem('mave_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function qs(params) {
  const entries = Object.entries(params || {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== ''
  );
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries).toString();
}

async function request(method, path, body, raw = false) {
  const opts = { method, headers: authHeaders() };
  if (body !== undefined && body !== null) {
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(`${BASE}${path}`, opts);

  // Para exports (CSV) retornar o blob direto
  if (raw) {
    if (!resp.ok) throw await buildError(resp);
    return await resp.blob();
  }

  if (!resp.ok) throw await buildError(resp);
  const data = await resp.json();
  return { data };
}

async function buildError(resp) {
  let detail = 'Erro desconhecido';
  try {
    const body = await resp.json();
    detail = body.detail || JSON.stringify(body);
  } catch { /* ignore */ }
  const err = new Error(detail);
  err.response = { status: resp.status, data: { detail } };
  return err;
}

const get = (path, params) => request('GET', `${path}${qs(params)}`);
const post = (path, body) => request('POST', path, body);
const put = (path, body) => request('PUT', path, body);
const del = (path) => request('DELETE', path);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const login = async (email, password) =>
  post('/auth/login', { email, password });

export const getMe = async () => get('/auth/me');

// ---------------------------------------------------------------------------
// Sellers
// ---------------------------------------------------------------------------
export const getSellers = async (params = {}) => get('/sellers', params);

export const getSeller = async (id) => get(`/sellers/${id}`);

export const createSeller = async (data) => post('/sellers', data);

export const updateSeller = async (id, data) => put(`/sellers/${id}`, data);

export const deleteSeller = async (id) => del(`/sellers/${id}`);

export const getSellerConversations = async (id, params = {}) =>
  get(`/sellers/${id}/conversations`, params);

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------
export const getConversations = async (params = {}) =>
  get('/conversations', params);

export const getConversation = async (id) => get(`/conversations/${id}`);

export const getConversationMessages = async (id) =>
  get(`/conversations/${id}/messages`);

export const syncConversations = async (sellerId, params = {}) =>
  post(`/sellers/${sellerId}/sync-conversations${qs(params)}`);

export const recalculateMetrics = async (sellerId, days = 30) =>
  post(`/sellers/${sellerId}/recalculate-metrics${qs({ days })}`);

export const analyzeAllConversations = async (sellerId, force = false) =>
  post(`/sellers/${sellerId}/analyze-conversations${qs({ force })}`);

export const importConversations = async (_file) => {
  // TODO: implement file upload when needed
  return { data: { imported: 0, skipped: 0 } };
};

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------
export const getDashboardStats = async (params) =>
  get('/dashboard/stats', params);

export const getMetrics = async (params = {}) => get('/metrics', params);

export const getTeamComparison = async (params) =>
  get('/team-comparison', params);

export const getResponseTimeDistribution = async (params) =>
  get('/response-time-distribution', params);

export const getSentimentDistribution = async (params) =>
  get('/sentiment-distribution', params);

export const getHeatmap = async (params) => get('/heatmap', params);

export const getTrends = async (params = {}) => get('/trends', params);

export const getRanking = async (params = {}) => get('/ranking', params);

export const exportMetrics = async (params) => {
  const blob = await request('GET', `/metrics/export${qs(params)}`, null, true);
  return blob;
};

// ---------------------------------------------------------------------------
// System Status
// ---------------------------------------------------------------------------
export const getSystemStatus = async () => get('/system/status');

// ---------------------------------------------------------------------------
// Background Tasks
// ---------------------------------------------------------------------------
export const getTaskStatus = async (taskId) => get(`/tasks/${taskId}`);

// ---------------------------------------------------------------------------
// Agent Chat
// ---------------------------------------------------------------------------
export const agentChat = async (question) =>
  post('/agent/chat', { question });

// ---------------------------------------------------------------------------
// Exclusion List
// ---------------------------------------------------------------------------
export const getExclusionList = async (params = {}) =>
  get('/exclusion-list', params);

export const addExcludedNumbers = async (numbers_text, reason) =>
  post('/exclusion-list/add', { numbers_text, reason });

export const removeExcludedNumber = async (id) =>
  del(`/exclusion-list/${id}`);

export const bulkDeleteExcluded = async (ids) =>
  post('/exclusion-list/bulk-delete', { ids });

export const exportExclusionList = async () => {
  const blob = await request('GET', '/exclusion-list/export', null, true);
  return blob;
};

export const clearExclusionList = async (token) =>
  post('/exclusion-list/clear', { token });

export const getExclusionStats = async () => get('/exclusion-list/stats');

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------
export const getAlerts = async (params = {}) => get('/alerts', params);

export const resolveAlert = async (id) => put(`/alerts/${id}/resolve`);

// ---------------------------------------------------------------------------
// Default export — objeto com .get() / .put() para Settings AlertsTab
// (Settings.jsx usa  api.default.get('/alert-config')  etc.)
// ---------------------------------------------------------------------------
const apiInstance = {
  get: async (url, _config) => get(url),
  put: async (url, data) => put(url, data),
  post: async (url, data) => post(url, data),
  delete: async (url) => del(url),
};

export default apiInstance;
