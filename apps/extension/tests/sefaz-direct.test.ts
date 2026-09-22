import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const KEY = '42260912345678000195550010000000011123456786';
const CNPJ = '12345678000195';

describe('direct SEFAZ distribution client', () => {
  it('builds the same consChNFe SOAP shape used by the old Bridge', async () => {
    const { buildDistributionSoap } = await import('../src/sefaz-direct');
    const soap = buildDistributionSoap(KEY, CNPJ);
    expect(soap).toContain('<tpAmb>1</tpAmb>');
    expect(soap).toContain(`<CNPJ>${CNPJ}</CNPJ>`);
    expect(soap).toContain(`<consChNFe><chNFe>${KEY}</chNFe></consChNFe>`);
  });

  it('maps 217 and 656 so the site can preserve the old fallback rules', async () => {
    const { parseDistributionResponse } = await import('../src/sefaz-direct');
    await expect(parseDistributionResponse(
      '<retDistDFeInt><cStat>217</cStat><xMotivo>NF-e não consta</xMotivo></retDistDFeInt>',
      KEY,
    )).resolves.toMatchObject({ category: 'fiscal_status', cStat: '217', xml: null });
    await expect(parseDistributionResponse(
      '<retDistDFeInt><cStat>656</cStat><xMotivo>Consumo indevido</xMotivo></retDistDFeInt>',
      KEY,
    )).resolves.toMatchObject({ category: 'consumption_limit', cStat: '656', xml: null });
  });

  it('decompresses procNFe docZip and validates the requested key', async () => {
    const { parseDistributionResponse } = await import('../src/sefaz-direct');
    const xml = `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${KEY}"/></NFe></nfeProc>`;
    const docZip = gzipSync(Buffer.from(xml, 'utf8')).toString('base64');
    const response = `<retDistDFeInt><cStat>138</cStat><xMotivo>Documento localizado</xMotivo><docZip schema="procNFe_v4.00.xsd">${docZip}</docZip></retDistDFeInt>`;
    await expect(parseDistributionResponse(response, KEY)).resolves.toMatchObject({
      category: 'success',
      cStat: '138',
      xml,
    });
  });
});
