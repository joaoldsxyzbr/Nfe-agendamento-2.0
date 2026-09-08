import { DOMParser } from '@xmldom/xmldom';

const NFE_NAMESPACE = 'http://www.portalfiscal.inf.br/nfe';

export type ParsedNfeAddress = {
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
  postalCode?: string;
  country?: string;
  phone?: string;
};

export type ParsedNfeParty = {
  taxId: string;
  name: string;
  tradeName?: string;
  stateRegistration?: string;
  address?: ParsedNfeAddress;
};

export type ParsedNfeProduct = {
  itemNumber: number;
  code: string;
  ean?: string;
  description: string;
  ncm: string;
  cfop: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type ParsedNfe = {
  accessKey: string;
  originalXml: string;
  model: string;
  series: string;
  number: string;
  operationNature: string;
  issuedAt: string | null;
  exitedAt: string | null;
  issuer: ParsedNfeParty;
  recipient: ParsedNfeParty | null;
  totals: {
    products: number;
    freight: number;
    discount: number;
    invoice: number;
    icmsBase: number;
    icms: number;
  };
  products: ParsedNfeProduct[];
  protocol: {
    number: string;
    receivedAt: string;
    statusCode: string;
    statusMessage: string;
  } | null;
};

export function parseNfeXml(xml: string, expectedAccessKey: string): ParsedNfe {
  const parseErrors: string[] = [];
  let document: Document | null = null;

  try {
    document = new DOMParser({
      onError: (level, message) => {
        if (level !== 'warning') parseErrors.push(message);
      },
    }).parseFromString(xml, 'application/xml') as unknown as Document | null;
  } catch {
    throw new Error('XML da NF-e inválido.');
  }

  if (!document || parseErrors.length > 0) {
    throw new Error('XML da NF-e inválido.');
  }

  const infNFe = first(document, 'infNFe');
  if (!infNFe) {
    throw new Error('XML não contém infNFe.');
  }

  const id = infNFe.getAttribute('Id') ?? '';
  const accessKey = id.startsWith('NFe') ? id.slice(3) : id;
  if (accessKey !== expectedAccessKey) {
    throw new Error('A chave do XML não corresponde à NF-e consultada.');
  }

  const ide = first(infNFe, 'ide');
  const issuerElement = first(infNFe, 'emit');
  if (!issuerElement) {
    throw new Error('XML não contém emitente da NF-e.');
  }

  const recipientElement = first(infNFe, 'dest');
  const totalsElement = first(infNFe, 'ICMSTot');
  const protocolElement = first(document, 'infProt');

  return {
    accessKey,
    originalXml: xml,
    model: text(ide, 'mod'),
    series: text(ide, 'serie'),
    number: text(ide, 'nNF'),
    operationNature: text(ide, 'natOp'),
    issuedAt: nullableText(ide, 'dhEmi'),
    exitedAt: nullableText(ide, 'dhSaiEnt'),
    issuer: parseParty(issuerElement, 'enderEmit'),
    recipient: recipientElement ? parseParty(recipientElement, 'enderDest') : null,
    totals: {
      products: number(totalsElement, 'vProd'),
      freight: number(totalsElement, 'vFrete'),
      discount: number(totalsElement, 'vDesc'),
      invoice: number(totalsElement, 'vNF'),
      icmsBase: number(totalsElement, 'vBC'),
      icms: number(totalsElement, 'vICMS'),
    },
    products: all(infNFe, 'det').map(parseProduct),
    protocol: protocolElement
      ? {
          number: text(protocolElement, 'nProt'),
          receivedAt: text(protocolElement, 'dhRecbto'),
          statusCode: text(protocolElement, 'cStat'),
          statusMessage: text(protocolElement, 'xMotivo'),
        }
      : null,
  };
}

function parseParty(element: Element, addressTag: string): ParsedNfeParty {
  const addressElement = first(element, addressTag);
  const tradeName = nullableText(element, 'xFant');
  const stateRegistration = nullableText(element, 'IE');

  return {
    taxId: text(element, 'CNPJ') || text(element, 'CPF'),
    name: text(element, 'xNome'),
    ...(tradeName ? { tradeName } : {}),
    ...(stateRegistration ? { stateRegistration } : {}),
    ...(addressElement ? { address: parseAddress(addressElement) } : {}),
  };
}

function parseAddress(element: Element): ParsedNfeAddress {
  const complement = nullableText(element, 'xCpl');
  const postalCode = nullableText(element, 'CEP');
  const country = nullableText(element, 'xPais');
  const phone = nullableText(element, 'fone');

  return {
    street: text(element, 'xLgr'),
    number: text(element, 'nro'),
    ...(complement ? { complement } : {}),
    district: text(element, 'xBairro'),
    city: text(element, 'xMun'),
    state: text(element, 'UF'),
    ...(postalCode ? { postalCode } : {}),
    ...(country ? { country } : {}),
    ...(phone ? { phone } : {}),
  };
}

function parseProduct(det: Element): ParsedNfeProduct {
  const product = first(det, 'prod');
  const itemNumber = Number(det.getAttribute('nItem') ?? '0');

  return {
    itemNumber,
    code: text(product, 'cProd'),
    ...(nullableText(product, 'cEAN') ? { ean: text(product, 'cEAN') } : {}),
    description: text(product, 'xProd'),
    ncm: text(product, 'NCM'),
    cfop: text(product, 'CFOP'),
    unit: text(product, 'uCom'),
    quantity: number(product, 'qCom'),
    unitPrice: number(product, 'vUnCom'),
    totalPrice: number(product, 'vProd'),
  };
}

function first(root: Document | Element | null, localName: string): Element | null {
  if (!root) return null;
  const node = root.getElementsByTagNameNS(NFE_NAMESPACE, localName).item(0);
  return node as unknown as Element | null;
}

function all(root: Document | Element | null, localName: string): Element[] {
  if (!root) return [];
  const nodes = root.getElementsByTagNameNS(NFE_NAMESPACE, localName);
  const result: Element[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const item = nodes.item(index);
    if (item) result.push(item as unknown as Element);
  }
  return result;
}

function text(root: Document | Element | null, localName: string): string {
  return first(root, localName)?.textContent?.trim() ?? '';
}

function nullableText(root: Document | Element | null, localName: string): string | null {
  const value = text(root, localName);
  return value || null;
}

function number(root: Document | Element | null, localName: string): number {
  const value = text(root, localName);
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
