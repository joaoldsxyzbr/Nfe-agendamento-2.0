import { parseNfeXml } from './xml.js';
const NFE_NAMESPACE = 'http://www.portalfiscal.inf.br/nfe';
const EXTENDED_RTC_GROUPS = Object.freeze([
    'gIBSCBSMono',
    'gTransfCred',
    'gCredPresIBSZFM',
]);
export function parseNfeXmlWithRtc(xml, expectedAccessKey) {
    const nfe = parseNfeXml(xml, expectedAccessKey);
    return Object.freeze({
        ...nfe,
        rtc: parseRtcNfeXml(xml, expectedAccessKey),
    });
}
export function parseRtcNfeXml(xml, expectedAccessKey) {
    const document = parseDocument(xml);
    const infNFe = first(document, 'infNFe');
    if (!infNFe) {
        throw new Error('XML não contém infNFe.');
    }
    const id = infNFe.getAttribute('Id') ?? '';
    const accessKey = id.startsWith('NFe') ? id.slice(3) : id;
    if (accessKey !== expectedAccessKey) {
        throw new Error('A chave do XML não corresponde à NF-e consultada.');
    }
    const items = all(infNFe, 'det')
        .map(parseRtcItem)
        .filter((item) => item !== null);
    const total = first(infNFe, 'total');
    const ibsCbsTotal = first(total, 'IBSCBSTot');
    const ibsTotal = first(ibsCbsTotal, 'gIBS');
    const ibsStateTotal = first(ibsTotal, 'gIBSUF');
    const ibsMunicipalTotal = first(ibsTotal, 'gIBSMun');
    const cbsTotal = first(ibsCbsTotal, 'gCBS');
    const selectiveTaxTotal = first(total, 'ISTot');
    const totals = Object.freeze({
        base: number(ibsCbsTotal, 'vBCIBSCBS'),
        ibsState: number(ibsStateTotal, 'vIBSUF'),
        ibsMunicipal: number(ibsMunicipalTotal, 'vIBSMun'),
        ibs: number(ibsTotal, 'vIBS'),
        cbs: number(cbsTotal, 'vCBS'),
        selectiveTax: number(selectiveTaxTotal, 'vIS'),
        fiscalDocumentTotal: number(total, 'vNFTot'),
    });
    const hasRtc = items.length > 0 || ibsCbsTotal !== null || selectiveTaxTotal !== null || first(total, 'vNFTot') !== null;
    return Object.freeze({
        hasRtc,
        items: Object.freeze(items),
        totals,
    });
}
function parseRtcItem(det) {
    const ibsCbs = first(det, 'IBSCBS');
    const selectiveTax = first(det, 'IS');
    if (!ibsCbs && !selectiveTax)
        return null;
    const group = first(ibsCbs, 'gIBSCBS');
    const ibsState = first(group, 'gIBSUF');
    const ibsMunicipal = first(group, 'gIBSMun');
    const cbs = first(group, 'gCBS');
    const extendedGroups = EXTENDED_RTC_GROUPS.filter((groupName) => first(ibsCbs, groupName) !== null);
    return Object.freeze({
        itemNumber: Number(det.getAttribute('nItem') ?? '0'),
        cst: text(ibsCbs, 'CST'),
        taxClassification: text(ibsCbs, 'cClassTrib'),
        base: number(group, 'vBC'),
        ibsStateRate: number(ibsState, 'pIBSUF'),
        ibsState: number(ibsState, 'vIBSUF'),
        ibsMunicipalRate: number(ibsMunicipal, 'pIBSMun'),
        ibsMunicipal: number(ibsMunicipal, 'vIBSMun'),
        ibs: number(group, 'vIBS'),
        cbsRate: number(cbs, 'pCBS'),
        cbs: number(cbs, 'vCBS'),
        selectiveTax: number(selectiveTax, 'vIS'),
        extendedGroups: Object.freeze(extendedGroups),
    });
}
function parseDocument(xml) {
    const parseErrors = [];
    let document = null;
    try {
        document = new DOMParser({
            onError: (level, message) => {
                if (level !== 'warning')
                    parseErrors.push(message);
            },
        }).parseFromString(xml, 'application/xml');
    }
    catch {
        throw new Error('XML da NF-e inválido.');
    }
    if (!document || parseErrors.length > 0 || document.getElementsByTagName('parsererror').length > 0) {
        throw new Error('XML da NF-e inválido.');
    }
    return document;
}
function first(root, localName) {
    if (!root)
        return null;
    const node = root.getElementsByTagNameNS(NFE_NAMESPACE, localName).item(0);
    return node;
}
function all(root, localName) {
    if (!root)
        return [];
    const nodes = root.getElementsByTagNameNS(NFE_NAMESPACE, localName);
    const result = [];
    for (let index = 0; index < nodes.length; index += 1) {
        const item = nodes.item(index);
        if (item)
            result.push(item);
    }
    return result;
}
function text(root, localName) {
    return first(root, localName)?.textContent?.trim() ?? '';
}
function number(root, localName) {
    const value = text(root, localName);
    if (!value)
        return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
