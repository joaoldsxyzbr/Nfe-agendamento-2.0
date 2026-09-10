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
  municipalRegistration?: string;
  stateRegistrationIndicator?: string;
  email?: string;
  address?: ParsedNfeAddress;
};

export type ParsedNfeProductTax = {
  cst: string;
  icmsBase: number;
  icms: number;
  icmsRate: number;
  ipi: number;
  ipiRate: number;
  pis: number;
  cofins: number;
  taxNote: string;
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
  tributaryUnit: string;
  tributaryQuantity: number;
  totalPrice: number;
  discount: number;
  tax: ParsedNfeProductTax;
};

export type ParsedNfeTotals = {
  products: number;
  freight: number;
  insurance: number;
  discount: number;
  other: number;
  invoice: number;
  icmsBase: number;
  icms: number;
  icmsStBase: number;
  icmsSt: number;
  importTax: number;
  icmsUfRemet: number;
  icmsUfDest: number;
  fcpUfDest: number;
  totalTax: number;
  pis: number;
  ipi: number;
  cofins: number;
};

export type ParsedNfeBilling = {
  invoice: {
    number: string;
    original: number;
    discount: number;
    net: number;
  } | null;
  duplicates: Array<{
    number: string;
    dueDate: string;
    value: number;
  }>;
};

export type ParsedNfePayment = {
  methodCode: string;
  methodName?: string;
  value: number;
};

export type ParsedNfeTransport = {
  freightMode: string;
  carrier: {
    taxId: string;
    name: string;
    stateRegistration: string;
    address: string;
    city: string;
    state: string;
  };
  vehicle: {
    plate: string;
    state: string;
    rntc: string;
  };
  volumes: Array<{
    quantity: number;
    species: string;
    brand: string;
    number: string;
    netWeight: number;
    grossWeight: number;
  }>;
};

export type ParsedNfe = {
  accessKey: string;
  originalXml: string;
  model: string;
  series: string;
  number: string;
  operationNature: string;
  invoiceType: string;
  issuedAt: string | null;
  exitedAt: string | null;
  issuer: ParsedNfeParty;
  recipient: ParsedNfeParty | null;
  totals: ParsedNfeTotals;
  products: ParsedNfeProduct[];
  billing: ParsedNfeBilling;
  payments: ParsedNfePayment[];
  transport: ParsedNfeTransport | null;
  additional: {
    contributor: string;
    taxAuthority: string;
  };
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
  const billingElement = first(infNFe, 'cobr');
  const paymentElement = first(infNFe, 'pag');
  const additionalElement = first(infNFe, 'infAdic');

  return {
    accessKey,
    originalXml: xml,
    model: text(ide, 'mod'),
    series: text(ide, 'serie'),
    number: text(ide, 'nNF'),
    operationNature: text(ide, 'natOp'),
    invoiceType: text(ide, 'tpNF'),
    issuedAt: nullableText(ide, 'dhEmi'),
    exitedAt: nullableText(ide, 'dhSaiEnt'),
    issuer: parseParty(issuerElement, 'enderEmit'),
    recipient: recipientElement ? parseParty(recipientElement, 'enderDest') : null,
    totals: parseTotals(totalsElement),
    products: all(infNFe, 'det').map(parseProduct),
    billing: parseBilling(billingElement),
    payments: all(paymentElement, 'detPag').map((payment) => {
      const methodName = nullableText(payment, 'xPag');
      return {
        methodCode: text(payment, 'tPag'),
        ...(methodName ? { methodName } : {}),
        value: number(payment, 'vPag'),
      };
    }),
    transport: parseTransport(first(infNFe, 'transp')),
    additional: {
      contributor: text(additionalElement, 'infCpl'),
      taxAuthority: text(additionalElement, 'infAdFisco'),
    },
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
  const municipalRegistration = nullableText(element, 'IM');
  const stateRegistrationIndicator = nullableText(element, 'indIEDest');
  const email = nullableText(element, 'email');

  return {
    taxId: text(element, 'CNPJ') || text(element, 'CPF'),
    name: text(element, 'xNome'),
    ...(tradeName ? { tradeName } : {}),
    ...(stateRegistration ? { stateRegistration } : {}),
    ...(municipalRegistration ? { municipalRegistration } : {}),
    ...(stateRegistrationIndicator ? { stateRegistrationIndicator } : {}),
    ...(email ? { email } : {}),
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

function parseTotals(total: Element | null): ParsedNfeTotals {
  return {
    products: number(total, 'vProd'),
    freight: number(total, 'vFrete'),
    insurance: number(total, 'vSeg'),
    discount: number(total, 'vDesc'),
    other: number(total, 'vOutro'),
    invoice: number(total, 'vNF'),
    icmsBase: number(total, 'vBC'),
    icms: number(total, 'vICMS'),
    icmsStBase: number(total, 'vBCST'),
    icmsSt: number(total, 'vST'),
    importTax: number(total, 'vII'),
    icmsUfRemet: number(total, 'vICMSUFRemet'),
    icmsUfDest: number(total, 'vICMSUFDest'),
    fcpUfDest: number(total, 'vFCPUFDest'),
    totalTax: number(total, 'vTotTrib'),
    pis: number(total, 'vPIS'),
    ipi: number(total, 'vIPI'),
    cofins: number(total, 'vCOFINS'),
  };
}

function parseProduct(det: Element): ParsedNfeProduct {
  const product = first(det, 'prod');
  const itemNumber = Number(det.getAttribute('nItem') ?? '0');
  const ean = nullableText(product, 'cEAN');

  return {
    itemNumber,
    code: text(product, 'cProd'),
    ...(ean ? { ean } : {}),
    description: text(product, 'xProd'),
    ncm: text(product, 'NCM'),
    cfop: text(product, 'CFOP'),
    unit: text(product, 'uCom'),
    quantity: number(product, 'qCom'),
    unitPrice: number(product, 'vUnCom'),
    tributaryUnit: text(product, 'uTrib'),
    tributaryQuantity: number(product, 'qTrib'),
    totalPrice: number(product, 'vProd'),
    discount: number(product, 'vDesc'),
    tax: parseProductTax(det),
  };
}

function parseProductTax(det: Element): ParsedNfeProductTax {
  const icmsContainer = first(det, 'ICMS');
  const icms = firstChildElement(icmsContainer);
  const ipiContainer = first(det, 'IPI');
  const ipi = firstChildElement(ipiContainer);
  const pisContainer = first(det, 'PIS');
  const pis = firstChildElement(pisContainer);
  const cofinsContainer = first(det, 'COFINS');
  const cofins = firstChildElement(cofinsContainer);
  const origin = text(icms, 'orig');
  const taxCode = text(icms, 'CST') || text(icms, 'CSOSN');
  const stRate = nullableText(icms, 'pICMSST');
  const stBase = nullableText(icms, 'vBCST');
  const stValue = nullableText(icms, 'vICMSST');
  const taxNote = [
    stRate ? `pIcmsSt=${stRate}` : '',
    stBase ? `BcIcmsSt=${stBase}` : '',
    stValue ? `vIcmsSt=${stValue}` : '',
  ].filter(Boolean).join(' ');

  return {
    cst: `${origin}${taxCode}`,
    icmsBase: number(icms, 'vBC'),
    icms: number(icms, 'vICMS'),
    icmsRate: number(icms, 'pICMS'),
    ipi: number(ipi, 'vIPI'),
    ipiRate: number(ipi, 'pIPI'),
    pis: number(pis, 'vPIS'),
    cofins: number(cofins, 'vCOFINS'),
    taxNote,
  };
}

function parseBilling(cobr: Element | null): ParsedNfeBilling {
  const invoice = first(cobr, 'fat');

  return {
    invoice: invoice
      ? {
          number: text(invoice, 'nFat'),
          original: number(invoice, 'vOrig'),
          discount: number(invoice, 'vDesc'),
          net: number(invoice, 'vLiq'),
        }
      : null,
    duplicates: all(cobr, 'dup').map((duplicate) => ({
      number: text(duplicate, 'nDup'),
      dueDate: text(duplicate, 'dVenc'),
      value: number(duplicate, 'vDup'),
    })),
  };
}

function parseTransport(transp: Element | null): ParsedNfeTransport | null {
  if (!transp) return null;

  const carrierElement = first(transp, 'transporta');
  const vehicleElement = first(transp, 'veicTransp');
  const volumes = all(transp, 'vol').map((volume) => ({
    quantity: number(volume, 'qVol'),
    species: text(volume, 'esp'),
    brand: text(volume, 'marca'),
    number: text(volume, 'nVol'),
    netWeight: number(volume, 'pesoL'),
    grossWeight: number(volume, 'pesoB'),
  }));

  const result: ParsedNfeTransport = {
    freightMode: text(transp, 'modFrete'),
    carrier: {
      taxId: text(carrierElement, 'CNPJ') || text(carrierElement, 'CPF'),
      name: text(carrierElement, 'xNome'),
      stateRegistration: text(carrierElement, 'IE'),
      address: text(carrierElement, 'xEnder'),
      city: text(carrierElement, 'xMun'),
      state: text(carrierElement, 'UF'),
    },
    vehicle: {
      plate: text(vehicleElement, 'placa'),
      state: text(vehicleElement, 'UF'),
      rntc: text(vehicleElement, 'RNTC'),
    },
    volumes,
  };

  const useful = [
    result.freightMode,
    result.carrier.taxId,
    result.carrier.name,
    result.carrier.stateRegistration,
    result.carrier.address,
    result.carrier.city,
    result.carrier.state,
    result.vehicle.plate,
    result.vehicle.state,
    result.vehicle.rntc,
    ...volumes.flatMap((volume) => [
      volume.quantity ? String(volume.quantity) : '',
      volume.species,
      volume.brand,
      volume.number,
      volume.netWeight ? String(volume.netWeight) : '',
      volume.grossWeight ? String(volume.grossWeight) : '',
    ]),
  ];

  return useful.some((value) => value.trim() !== '') ? result : null;
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

function firstChildElement(root: Element | null): Element | null {
  if (!root) return null;
  for (let index = 0; index < root.childNodes.length; index += 1) {
    const node = root.childNodes.item(index);
    if (node?.nodeType === 1) return node as unknown as Element;
  }
  return null;
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
