function escapeCsv(value) {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '';
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value));
}

function formatDate(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('pt-BR');
  } catch {
    return '';
  }
}

export function generateBatchCsv(items) {
  const headers = [
    'Chave de Acesso',
    'Número',
    'Série',
    'Modelo',
    'Emitente',
    'CNPJ Emitente',
    'Destinatário',
    'CNPJ Destinatário',
    'Data Emissão',
    'Valor Total',
    'Status',
    'Origem',
    'Mensagem',
  ];

  const rows = items.map((item) => {
    const parsed = item.parsed;
    return [
      item.accessKey,
      parsed?.number ?? '',
      parsed?.series ?? '',
      parsed?.model ?? '',
      parsed?.issuer?.name ?? '',
      parsed?.issuer?.taxId ?? '',
      parsed?.recipient?.name ?? '',
      parsed?.recipient?.taxId ?? '',
      formatDate(parsed?.issuedAt),
      formatCurrency(parsed?.totals?.totalValue),
      statusLabel(item.status),
      item.source ?? '',
      item.message ?? '',
    ].map(escapeCsv).join(',');
  });

  const bom = '\uFEFF';
  return `${bom}${headers.map(escapeCsv).join(',')}\r\n${rows.join('\r\n')}`;
}

function statusLabel(status) {
  const labels = {
    success: 'Concluída',
    portal_error: 'Erro no Portal',
    cancelled: 'Cancelada',
    portal_queued: 'Na fila',
    portal_waiting_user: 'Aguardando usuário',
  };
  return labels[status] ?? status ?? '';
}

export function downloadCsv(items, filename = 'nfe-lote.csv') {
  const csv = generateBatchCsv(items);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
