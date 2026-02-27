// Mock exclusion list - 5 excluded numbers, mutable in-memory CRUD

let nextId = 6;

let excludedNumbers = [
  {
    id: 1,
    phone_normalized: '5511999888001',
    original_format: '+55 11 99988-8001',
    reason: 'Numero interno - TI',
    added_at: '2024-06-10T14:30:00Z',
    active: true,
  },
  {
    id: 2,
    phone_normalized: '5511999888002',
    original_format: '+55 11 99988-8002',
    reason: 'Numero interno - Financeiro',
    added_at: '2024-06-10T14:31:00Z',
    active: true,
  },
  {
    id: 3,
    phone_normalized: '5511999888003',
    original_format: '+55 11 99988-8003',
    reason: 'Fornecedor - Nao monitorar',
    added_at: '2024-06-12T09:15:00Z',
    active: true,
  },
  {
    id: 4,
    phone_normalized: '5511999888004',
    original_format: '(11) 99988-8004',
    reason: 'Numero pessoal do diretor',
    added_at: '2024-06-15T11:00:00Z',
    active: true,
  },
  {
    id: 5,
    phone_normalized: '5511999888005',
    original_format: '11999888005',
    reason: 'Bot de atendimento automatico',
    added_at: '2024-06-20T16:45:00Z',
    active: true,
  },
];

export function getExclusionList({ limit = 500 } = {}) {
  return excludedNumbers.filter((n) => n.active).slice(0, limit);
}

export function addExcludedNumbers(numbers_text, reason) {
  const lines = numbers_text
    .split(/[\n,;]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const added = [];
  for (const raw of lines) {
    const normalized = raw.replace(/\D/g, '');
    if (!normalized) continue;
    // Avoid duplicates
    if (excludedNumbers.some((n) => n.phone_normalized === normalized && n.active)) continue;
    const entry = {
      id: nextId++,
      phone_normalized: normalized,
      original_format: raw,
      reason: reason || 'Adicionado manualmente',
      added_at: new Date().toISOString(),
      active: true,
    };
    excludedNumbers.push(entry);
    added.push(entry);
  }
  return { added: added.length, items: added };
}

export function removeExcludedNumber(id) {
  const item = excludedNumbers.find((n) => n.id === Number(id));
  if (item) {
    item.active = false;
    return true;
  }
  return false;
}

export function bulkDeleteExcluded(ids) {
  let removed = 0;
  for (const id of ids) {
    const item = excludedNumbers.find((n) => n.id === Number(id));
    if (item && item.active) {
      item.active = false;
      removed++;
    }
  }
  return { removed };
}

export function clearExclusionList() {
  const count = excludedNumbers.filter((n) => n.active).length;
  excludedNumbers.forEach((n) => (n.active = false));
  return { cleared: count };
}

export function getExclusionStats() {
  const active = excludedNumbers.filter((n) => n.active);
  const last24h = active.filter(
    (n) => new Date(n.added_at) > new Date(Date.now() - 86400000)
  );
  return {
    total: active.length,
    excluded_last_24h: last24h.length,
  };
}

export function exportExclusionCsv() {
  const active = excludedNumbers.filter((n) => n.active);
  const header = 'telefone_normalizado,formato_original,motivo,adicionado_em\n';
  const rows = active
    .map(
      (n) =>
        `${n.phone_normalized},${n.original_format},${n.reason},${n.added_at}`
    )
    .join('\n');
  return header + rows;
}

export { excludedNumbers };
