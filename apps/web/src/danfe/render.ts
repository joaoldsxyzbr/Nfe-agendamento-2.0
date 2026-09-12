import { resolveFernandoKleinProduct } from '../nfe/product-mapping';
import { resolveSupplierInternalQuantity } from '../nfe/supplier-quantity';
import type { ParsedNfe, ParsedNfeParty, ParsedNfeProduct } from '../nfe/xml';

const DANFE_ZOOM_MIN = 0.6;
const DANFE_ZOOM_MAX = 2;
const DANFE_ZOOM_STEP = 0.1;
const FIRST_PAGE_PRODUCT_SPACE_MM = 108;
const CONTINUATION_PRODUCT_SPACE_MM = 224;

const PAYMENT_NAMES: Readonly<Record<string, string>> = {
  '01': 'Dinheiro', '02': 'Cheque', '03': 'Cartão de Crédito', '04': 'Cartão de Débito',
  '05': 'Crédito Loja', '10': 'Vale Alimentação', '11': 'Vale Refeição', '12': 'Vale Presente',
  '13': 'Vale Combustível', '14': 'Duplicata Mercantil', '15': 'Boleto Bancário', '16': 'Depósito Bancário',
  '17': 'PIX', '18': 'Transferência bancária', '19': 'Programa de fidelidade', '90': 'Sem pagamento', '99': 'Outros',
};

const FREIGHT_NAMES: Readonly<Record<string, string>> = {
  '0': '0-Por conta do Remetente',
  '1': '1-Por conta do Destinatário',
  '2': '2-Por conta de Terceiros',
  '3': '3-Transporte Próprio por conta do Remetente',
  '4': '4-Transporte Próprio por conta do Destinatário',
  '9': '9-Sem Transporte',
};

const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212',
  '112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131',
  '311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321',
  '112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121',
  '313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114',
  '122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212',
  '124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113',
  '114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112',
] as const;

export function renderDanfe(nfe: ParsedNfe): HTMLElement {
  const container = document.createElement('div');
  container.className = 'danfe-pages';
  container.innerHTML = renderDanfeHtml(nfe);
  return container;
}

export function renderDanfeHtml(nfe: ParsedNfe): string {
  const pages = paginateProductsByAvailableSpace(nfe.products, nfe.additional.contributor);
  const totalPages = pages.length;

  return pages.map((products, index) => {
    const page = index + 1;
    if (page === 1) {
      return `<article class="danfe-page" data-page="${page}">
        ${buildReceipt(nfe)}
        ${buildHeader(nfe, page, totalPages)}
        ${buildOperation(nfe)}
        ${buildIssuerRegistry(nfe)}
        ${buildRecipient(nfe)}
        ${buildPayments(nfe)}
        ${buildTotals(nfe)}
        ${buildTransport(nfe)}
        ${buildProductsTable(nfe, products)}
        ${buildAdditional(nfe)}
        ${buildFooter(nfe)}
      </article>`;
    }

    return `<article class="danfe-page" data-page="${page}">
      ${buildHeader(nfe, page, totalPages)}
      ${buildProductsTable(nfe, products)}
      ${buildFooter(nfe)}
    </article>`;
  }).join('');
}

export function nextDanfeZoom(current: number, deltaY: number): number {
  const direction = deltaY < 0 ? 1 : -1;
  return clamp(Number((current + direction * DANFE_ZOOM_STEP).toFixed(2)), DANFE_ZOOM_MIN, DANFE_ZOOM_MAX);
}

export function attachDanfeZoom(container: HTMLElement): () => void {
  let zoom = 1;
  const pages = () => Array.from(container.querySelectorAll<HTMLElement>('.danfe-page'));
  const apply = (value: number) => {
    zoom = clamp(value, DANFE_ZOOM_MIN, DANFE_ZOOM_MAX);
    for (const page of pages()) page.style.setProperty('zoom', String(zoom));
  };

  const wheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    const target = event.target as Element | null;
    const scroll = target?.closest('.danfe-scroll') as HTMLElement | null;
    if (!scroll || !container.contains(scroll)) return;

    event.preventDefault();
    const previous = zoom;
    const next = nextDanfeZoom(previous, event.deltaY);
    if (next === previous) return;

    const rect = scroll.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const contentX = scroll.scrollLeft + pointerX;
    const contentY = scroll.scrollTop + pointerY;
    const ratio = next / previous;

    apply(next);
    scroll.scrollLeft = contentX * ratio - pointerX;
    scroll.scrollTop = contentY * ratio - pointerY;
  };

  const beforePrint = () => {
    for (const page of pages()) {
      page.dataset.screenZoom = page.style.getPropertyValue('zoom') || String(zoom);
      page.style.setProperty('zoom', '1');
    }
  };
  const afterPrint = () => {
    for (const page of pages()) page.style.setProperty('zoom', page.dataset.screenZoom || String(zoom));
  };

  apply(1);
  container.addEventListener('wheel', wheel, { passive: false });
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);

  return () => {
    container.removeEventListener('wheel', wheel);
    window.removeEventListener('beforeprint', beforePrint);
    window.removeEventListener('afterprint', afterPrint);
  };
}

function buildReceipt(nfe: ParsedNfe): string {
  const recipient = nfe.recipient?.name || 'destinatário';
  return `<section class="danfe-block receipt-stub">
    <div class="receipt-copy">Recebemos de <strong>${escapeHtml(nfe.issuer.name)}</strong> os produtos e/ou serviços constantes da NF-e indicada ao lado. Destinatário: ${escapeHtml(recipient)}.</div>
    <div class="receipt-nfe"><span>NF-e</span><strong>Nº ${formatInvoiceNumber(nfe.number)}</strong><span>Série ${formatSeries(nfe.series)}</span></div>
    <div class="receipt-signature"><div>Data de recebimento</div><div>Identificação e assinatura do recebedor</div></div>
  </section>`;
}

function buildHeader(nfe: ParsedNfe, page: number, totalPages: number): string {
  const address = nfe.issuer.address;
  const issueType = nfe.invoiceType === '1' ? '1' : '0';
  const phone = address?.phone ? `<span class="issuer-phone">Fone/Fax: ${escapeHtml(address.phone)}</span>` : '';
  return `<section class="danfe-block danfe-header">
    <div class="issuer-identification">
      <span class="issuer-title">Identificação do emitente</span>
      <strong>${escapeHtml(nfe.issuer.name)}</strong>
      <span>${escapeHtml(joinAddress(address))}</span>
      <span>${escapeHtml(address ? [address.district, formatCep(address.postalCode || ''), address.city, address.state].filter(Boolean).join(' - ') : '')}</span>
      ${phone}
      <span>${escapeHtml(formatDocument(nfe.issuer.taxId))}</span>
    </div>
    <div class="danfe-identity">
      <span class="danfe-word">DANFE</span>
      <span class="danfe-subtitle">Documento Auxiliar da Nota Fiscal Eletrônica</span>
      <div class="entry-exit"><span>0 - ENTRADA<br>1 - SAÍDA</span><b>${issueType}</b></div>
      <div class="invoice-id">Nº <strong>${formatInvoiceNumber(nfe.number)}</strong> Série ${formatSeries(nfe.series)}</div>
      <span>Folha ${page}/${totalPages}</span>
    </div>
    <div class="barcode-area">
      <div class="barcode-wrap">${barcodeSvg(nfe.accessKey)}</div>
      <div class="access-key"><span class="fiscal-label">Chave de acesso</span><strong>${formatKey(nfe.accessKey)}</strong></div>
      <div class="authenticity-box">Consulta de autenticidade no portal nacional da NF-e<br><strong>www.nfe.fazenda.gov.br/portal</strong> ou no site da Sefaz Autorizadora</div>
      <div class="protocol-box"><span class="fiscal-label">Protocolo de autorização de uso</span><strong>${escapeHtml(protocolText(nfe))}</strong></div>
    </div>
  </section>`;
}

function buildOperation(nfe: ParsedNfe): string {
  return `<section class="danfe-block operation-grid">
    ${fiscalCell('Natureza da operação', nfe.operationNature, 'operation-nature')}
    ${fiscalCell('Data da emissão', datePart(nfe.issuedAt))}
    ${fiscalCell('Data saída / entrada', datePart(nfe.exitedAt))}
    ${fiscalCell('Hora saída / entrada', timePart(nfe.exitedAt))}
  </section>`;
}

function buildIssuerRegistry(nfe: ParsedNfe): string {
  return `<section class="danfe-block issuer-registry">
    ${fiscalCell('Inscrição estadual', nfe.issuer.stateRegistration || '')}
    ${fiscalCell('Inscrição estadual do subst. tributário', '')}
    ${fiscalCell('CNPJ / CPF', formatDocument(nfe.issuer.taxId))}
    ${fiscalCell('Inscrição municipal', nfe.issuer.municipalRegistration || '')}
  </section>`;
}

function buildRecipient(nfe: ParsedNfe): string {
  const dest = nfe.recipient;
  const address = dest?.address;
  return `<div class="danfe-section-title">Destinatário / Remetente</div>
    <section class="danfe-block recipient-grid">
      ${fiscalCell('Nome / Razão social', dest?.name || '')}
      ${fiscalCell('CNPJ / CPF', formatDocument(dest?.taxId || ''))}
      ${fiscalCell('Data da emissão', datePart(nfe.issuedAt))}
      ${fiscalCell('Endereço', joinAddress(address))}
      ${fiscalCell('Bairro / Distrito', address?.district || '')}
      ${fiscalCell('CEP', formatCep(address?.postalCode || ''))}
      ${fiscalCell('Data saída / entrada', datePart(nfe.exitedAt))}
      ${fiscalCell('Município', address?.city || '')}
      ${fiscalCell('Fone / Fax', address?.phone || '')}
      ${fiscalCell('UF', address?.state || '')}
      ${fiscalCell('Inscrição estadual', dest?.stateRegistration || '')}
      ${fiscalCell('Hora saída / entrada', timePart(nfe.exitedAt))}
      ${fiscalCell('Indicador IE', dest?.stateRegistrationIndicator || '')}
      ${fiscalCell('E-mail', dest?.email || '')}
    </section>`;
}

function buildPayments(nfe: ParsedNfe): string {
  const blocks: string[] = [];
  const invoice = nfe.billing.invoice;
  if (invoice || nfe.billing.duplicates.length) {
    const items: string[] = [];
    if (invoice) {
      items.push(`<div class="payment-item"><span class="fiscal-label">Fatura</span><strong class="fiscal-value">Nº ${escapeHtml(invoice.number)} · Original ${money(invoice.original)} · Líquido ${money(invoice.net)}</strong></div>`);
    }
    for (const duplicate of nfe.billing.duplicates) {
      items.push(`<div class="payment-item"><span class="fiscal-label">Duplicata ${escapeHtml(duplicate.number)}</span><strong class="fiscal-value">Venc. ${escapeHtml(formatDateOnly(duplicate.dueDate))} · ${money(duplicate.value)}</strong></div>`);
    }
    blocks.push(`<div class="danfe-section-title">FATURA / DUPLICATA</div><section class="danfe-block payment-wrap">${items.join('')}</section>`);
  }

  if (nfe.payments.length) {
    const items = nfe.payments.map((payment) => {
      const name = payment.methodName || PAYMENT_NAMES[payment.methodCode] || payment.methodCode || 'Não informado';
      return `<div class="payment-item"><span class="fiscal-label">Forma de pagamento</span><strong class="fiscal-value">${escapeHtml(name)} · ${money(payment.value)}</strong></div>`;
    }).join('');
    blocks.push(`<div class="danfe-section-title">PAGAMENTO</div><section class="danfe-block payment-wrap">${items}</section>`);
  }
  return blocks.join('');
}

function buildTotals(nfe: ParsedNfe): string {
  const t = nfe.totals;
  const fields: Array<[string, number]> = [
    ['Base de cálc. do ICMS', t.icmsBase], ['Valor do ICMS', t.icms], ['BASE DE CÁLC. ICMS S.T.', t.icmsStBase], ['VALOR DO ICMS SUBST.', t.icmsSt],
    ['V. Imp. importação', t.importTax], ['V. ICMS UF remet.', t.icmsUfRemet], ['V. FCP UF dest.', t.fcpUfDest], ['VALOR DO PIS', t.pis], ['V. total produtos', t.products],
    ['Valor do frete', t.freight], ['Valor do seguro', t.insurance], ['Desconto', t.discount], ['Outras despesas', t.other], ['Valor total IPI', t.ipi],
  ];
  if (nfe.originalXml.includes('<vICMSUFDest>')) fields.push(['V. ICMS UF dest.', t.icmsUfDest]);
  if (nfe.originalXml.includes('<vTotTrib>')) fields.push(['V. tot. trib.', t.totalTax]);
  fields.push(['VALOR DA COFINS', t.cofins], ['V. total da nota', t.invoice]);
  return `<div class="danfe-section-title">Cálculo do imposto</div><section class="danfe-block total-grid">${fields.map(([label, value], index) => fiscalCell(label, moneyFiscal(value), index === fields.length - 1 ? 'invoice-total' : '')).join('')}</section>`;
}

function buildTransport(nfe: ParsedNfe): string {
  const transport = nfe.transport;
  if (!transport) return '';
  const carrier = transport.carrier;
  const vehicle = transport.vehicle;
  const volume = transport.volumes[0];
  return `<div class="danfe-section-title">Transportador / Volumes transportados</div>
    <section class="danfe-block transport-grid">
      ${fiscalCell('Nome / Razão social', carrier.name)}
      ${fiscalCell('Frete por conta', FREIGHT_NAMES[transport.freightMode] || transport.freightMode)}
      ${fiscalCell('Código ANTT', vehicle.rntc)}
      ${fiscalCell('Placa do veículo', vehicle.plate)}
      ${fiscalCell('UF', vehicle.state)}
      ${fiscalCell('CNPJ / CPF', formatDocument(carrier.taxId))}
      ${fiscalCell('Endereço', carrier.address)}
      ${fiscalCell('Município', carrier.city)}
      ${fiscalCell('UF', carrier.state)}
      ${fiscalCell('Inscrição estadual', carrier.stateRegistration)}
      ${fiscalCell('Quantidade', volume?.quantity ? String(volume.quantity) : '')}
      ${fiscalCell('Espécie', volume?.species || '')}
      ${fiscalCell('Marca', volume?.brand || '')}
      ${fiscalCell('Numeração', volume?.number || '')}
      ${fiscalCell('Peso bruto', volume?.grossWeight ? decimal(volume.grossWeight, 3, 3) : '')}
      ${fiscalCell('Peso líquido', volume?.netWeight ? decimal(volume.netWeight, 3, 3) : '')}
    </section>`;
}

function buildProductsTable(nfe: ParsedNfe, products: readonly ParsedNfeProduct[]): string {
  const rows = products.map((product) => {
    const mapping = resolveFernandoKleinProduct({ emitterTaxId: nfe.issuer.taxId, xProd: product.description, cProd: product.code });
    const code = `<span class="source-product-code">${escapeHtml(mapping.sourceCode)}</span>${mapping.internalCode ? `<small class="internal-product-code">Int.: ${escapeHtml(mapping.internalCode)}</small>` : ''}`;
    const packageLabel = productPackageLabel(product);
    const description = `${escapeHtml(product.description)}${packageLabel ? `<small class="package-detail">${escapeHtml(packageLabel)}</small>` : ''}${product.tax.taxNote ? `<small class="tax-detail">${escapeHtml(product.tax.taxNote)}</small>` : ''}`;
    const internalQuantity = resolveSupplierInternalQuantity({ emitterTaxId: nfe.issuer.taxId, quantity: product.quantity });
    const quantity = `<span class="source-product-quantity">${decimal(product.quantity, 4, 4)}</span>${internalQuantity !== null ? `<small class="internal-product-code internal-quantity">Int.: ${internalQuantity} UN</small>` : ''}`;
    return `<tr>
      <td class="center item-col">${product.itemNumber}</td><td class="code-col">${code}</td><td class="description">${description}</td>
      <td class="center">${escapeHtml(product.ncm)}</td><td class="center">${escapeHtml(product.tax.cst)}</td><td class="center">${escapeHtml(product.cfop)}</td><td class="center">${escapeHtml(product.unit)}</td>
      <td class="numeric">${quantity}</td><td class="numeric">${decimal(product.unitPrice, 4, 4)}</td><td class="numeric">${moneyFiscal(product.totalPrice)}</td><td class="numeric">${moneyFiscal(product.discount)}</td>
      <td class="numeric">${moneyFiscal(product.tax.icmsBase)}</td><td class="numeric">${moneyFiscal(product.tax.icms)}</td><td class="numeric">${moneyFiscal(product.tax.ipi)}</td><td class="numeric">${decimal(product.tax.icmsRate)}</td><td class="numeric">${decimal(product.tax.ipiRate)}</td>
    </tr>`;
  }).join('');

  return `<div class="danfe-section-title">Dados dos produtos / serviços</div>
    <table class="products-table danfe-products-fill">
      <colgroup><col class="item"><col class="code"><col class="description"><col class="ncm"><col class="cst"><col class="cfop"><col class="unit"><col class="qty"><col class="unit-value"><col class="total-value"><col class="discount"><col class="bc"><col class="icms"><col class="ipi"><col class="rate"><col class="rate"></colgroup>
      <thead><tr><th>Item</th><th>Código produto</th><th>Descrição do produto / serviço</th><th>NCM/SH</th><th>O/CST</th><th>CFOP</th><th>UN</th><th>Quant.</th><th>Valor unit.</th><th>Valor total</th><th>Valor desc.</th><th>B.Cálc ICMS</th><th>Valor ICMS</th><th>Valor IPI</th><th>Alíq. ICMS</th><th>Alíq. IPI</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="16">Nenhum produto informado no XML.</td></tr>'}</tbody>
    </table>`;
}

function buildAdditional(nfe: ParsedNfe): string {
  const contributor = nfe.additional.contributor;
  const taxAuthority = nfe.additional.taxAuthority;
  return `<div class="danfe-section-title">Dados adicionais</div>
    <section class="danfe-block additional-grid">
      <div><span class="fiscal-label">Informações complementares</span><p>${contributor ? `Inf. Contribuinte: ${escapeHtml(contributor)}` : ''}${taxAuthority ? `<br>Inf. fisco: ${escapeHtml(taxAuthority)}` : ''}</p></div>
      <div><span class="fiscal-label">RESERVADO AO FISCO</span></div>
    </section>`;
}

function buildFooter(nfe: ParsedNfe): string {
  return `<footer class="danfe-footer">NF-e ${escapeHtml(formatInvoiceNumber(nfe.number))} · Chave ${escapeHtml(formatKey(nfe.accessKey))}</footer>`;
}

function paginateProductsByAvailableSpace(products: readonly ParsedNfeProduct[], additionalText: string): ParsedNfeProduct[][] {
  if (!products.length) return [[]];
  const pages: ParsedNfeProduct[][] = [];
  let current: ParsedNfeProduct[] = [];
  let available = Math.max(58, FIRST_PAGE_PRODUCT_SPACE_MM - estimateAdditionalPenaltyMm(additionalText));
  let used = 0;

  for (const product of products) {
    const height = estimateProductHeight(product);
    if (current.length && used + height > available) {
      pages.push(current);
      current = [];
      available = CONTINUATION_PRODUCT_SPACE_MM;
      used = 0;
    }
    current.push(product);
    used += height;
  }
  if (current.length) pages.push(current);
  return pages;
}

function estimateProductHeight(product: ParsedNfeProduct): number {
  const descriptionLines = Math.max(1, Math.ceil(product.description.length / 52));
  const packageLines = productPackageLabel(product) ? 1 : 0;
  const taxLines = product.tax.taxNote ? Math.max(1, Math.ceil(product.tax.taxNote.length / 58)) : 0;
  return 3.4 + (descriptionLines - 1) * 1.8 + packageLines * 1.7 + taxLines * 1.7;
}

function productPackageLabel(product: ParsedNfeProduct): string {
  const commercialUnit = product.unit.trim().toUpperCase();
  const tributaryUnit = product.tributaryUnit.trim().toUpperCase();
  if (!commercialUnit || !tributaryUnit || commercialUnit === tributaryUnit) return '';
  if (product.quantity <= 0 || product.tributaryQuantity <= 0) return '';

  const unitsPerPackage = product.tributaryQuantity / product.quantity;
  const rounded = Math.round(unitsPerPackage);
  if (rounded <= 1 || Math.abs(unitsPerPackage - rounded) > 1e-6) return '';

  return `${commercialUnit} C/ ${rounded} ${tributaryUnit}`;
}

function estimateAdditionalPenaltyMm(text: string): number {
  const value = text.trim();
  if (!value) return 0;
  return Math.max(0, Math.ceil(value.length / 145) - 4) * 1.35;
}

function fiscalCell(label: string, content: string, extraClass = ''): string {
  return `<div class="${extraClass}"><span class="fiscal-label">${escapeHtml(label)}</span><strong class="fiscal-value">${escapeHtml(content)}</strong></div>`;
}

function barcodeSvg(text: string): string {
  const clean = digits(text);
  if (!clean || clean.length % 2 !== 0) return '';
  const values: number[] = [];
  for (let index = 0; index < clean.length; index += 2) values.push(Number(clean.slice(index, index + 2)));
  let checksum = 105;
  values.forEach((item, index) => { checksum += item * (index + 1); });
  const encoded = [105, ...values, checksum % 103, 106];
  const modules = encoded.map((code) => CODE128_PATTERNS[code] || '').join('');
  let x = 10;
  let black = true;
  const bars: string[] = [];
  for (const widthChar of modules) {
    const width = Number(widthChar) * 1.2;
    if (black) bars.push(`<rect x="${x.toFixed(1)}" y="0" width="${width.toFixed(1)}" height="44"/>`);
    x += width;
    black = !black;
  }
  x += 10;
  return `<svg viewBox="0 0 ${x.toFixed(1)} 44" role="img" aria-label="Código de barras da chave de acesso" preserveAspectRatio="none">${bars.join('')}</svg>`;
}

function protocolText(nfe: ParsedNfe): string {
  if (!nfe.protocol) return '';
  return [nfe.protocol.number, dateTimeDisplay(nfe.protocol.receivedAt)].filter(Boolean).join(' - ');
}

function joinAddress(address: ParsedNfeParty['address']): string {
  if (!address) return '';
  return [address.street, address.number, address.complement].filter(Boolean).join(', ');
}

function formatDocument(text: string): string {
  const clean = digits(text);
  if (clean.length === 14) return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (clean.length === 11) return clean.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return text;
}

function formatCep(text: string): string {
  const clean = digits(text);
  return clean.length === 8 ? clean.replace(/^(\d{5})(\d{3})$/, '$1-$2') : text;
}

function formatInvoiceNumber(text: string): string {
  const clean = digits(text);
  if (!clean) return text;
  return clean.padStart(9, '0').slice(-9).replace(/^(\d{3})(\d{3})(\d{3})$/, '$1.$2.$3');
}

function formatSeries(text: string): string {
  const clean = digits(text);
  return clean ? clean.padStart(3, '0') : text;
}

function formatKey(text: string): string {
  return digits(text).replace(/(.{4})/g, '$1 ').trim();
}

function datePart(value: string | null): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDateOnly(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('pt-BR');
}

function timePart(value: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function dateTimeDisplay(value: string): string {
  if (!value) return '';
  const date = datePart(value);
  const time = timePart(value);
  return [date, time].filter(Boolean).join(' ');
}

function formatDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function money(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function moneyFiscal(value: number): string {
  return decimal(value, 2, 2);
}

function decimal(value: number, minimumFractionDigits = 2, maximumFractionDigits = 2): string {
  return Number.isFinite(value) ? value.toLocaleString('pt-BR', { minimumFractionDigits, maximumFractionDigits }) : '';
}

function digits(text: string): string {
  return String(text || '').replace(/\D/g, '');
}

function escapeHtml(text: unknown): string {
  return String(text ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
