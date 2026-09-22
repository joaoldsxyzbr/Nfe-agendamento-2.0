import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const KEY = '42260912345678000195550010000000011123456786';
const CNPJ = '12345678000195';

describe('direct SEFAZ lookup protocol', () => {
  it('builds the NFeDistribuicaoDFe consChNFe request used by the old Bridge', async () => {
    const { buildDistributionSoap } = await import('../src/direct-lookup');
    const soap = buildDistributionSoap(KEY, CNPJ);
    expect(soap).toContain('<tpAmb>1</tpAmb>');
    expect(soap).toContain(`<CNPJ>${CNPJ}</CNPJ>`);
    expect(soap).toContain(`<consChNFe><chNFe>${KEY}</chNFe></consChNFe>`);
    expect(soap).toContain('NFeDistribuicaoDFe');
  });

  it('keeps cStat 217 as a fiscal status without fabricating XML', async () => {
    const { parseDistributionResponse } = await import('../src/direct-lookup');
    await expect(parseDistributionResponse(
      '<retDistDFeInt><cStat>217</cStat><xMotivo>NF-e não consta</xMotivo></retDistDFeInt>',
      KEY,
    )).resolves.toEqual({ cStat: '217', message: 'NF-e não consta', xml: null });
  });

  it('decompresses procNFe docZip and accepts only the requested key', async () => {
    const { parseDistributionResponse } = await import('../src/direct-lookup');
    const xml = `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${KEY}"/></NFe></nfeProc>`;
    const zip = gzipSync(Buffer.from(xml, 'utf8')).toString('base64');
    const response = `<retDistDFeInt><cStat>138</cStat><xMotivo>Documento localizado</xMotivo><loteDistDFeInt><docZip schema="procNFe_v4.00.xsd">${zip}</docZip></loteDistDFeInt></retDistDFeInt>`;

    await expect(parseDistributionResponse(response, KEY)).resolves.toEqual({
      cStat: '138',
      message: 'Documento localizado',
      xml,
    });
  });
});
