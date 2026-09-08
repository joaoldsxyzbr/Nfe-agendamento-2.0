import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const VALID_KEY = '42260812345678000123550010000012341000012342';
const fixture = readFileSync(new URL('./fixtures/nfe-basic.xml', import.meta.url), 'utf8');

describe('parseNfeXml', () => {
  it('rejects malformed XML', async () => {
    await expect(
      import('../src/nfe/xml').then(({ parseNfeXml }) => parseNfeXml('<nfeProc><NFe>', VALID_KEY)),
    ).rejects.toThrow('XML da NF-e inválido.');
  });

  it('rejects XML without infNFe', async () => {
    await expect(
      import('../src/nfe/xml').then(({ parseNfeXml }) => parseNfeXml('<nfeProc><NFe /></nfeProc>', VALID_KEY)),
    ).rejects.toThrow('XML não contém infNFe.');
  });

  it('rejects XML whose access key does not match the requested key', async () => {
    const mismatched = fixture.replace(
      'NFe42260812345678000123550010000012341000012342',
      'NFe42260812345678000123550010000012341000012359',
    );

    await expect(
      import('../src/nfe/xml').then(({ parseNfeXml }) => parseNfeXml(mismatched, VALID_KEY)),
    ).rejects.toThrow('A chave do XML não corresponde à NF-e consultada.');
  });

  it('extracts fiscal fields needed by the DANFE and preserves the original XML', async () => {
    await expect(
      import('../src/nfe/xml').then(({ parseNfeXml }) => parseNfeXml(fixture, VALID_KEY)),
    ).resolves.toMatchObject({
      accessKey: VALID_KEY,
      originalXml: fixture,
      model: '55',
      series: '1',
      number: '1234',
      operationNature: 'VENDA DE MERCADORIA',
      issuedAt: '2026-09-08T10:00:00-03:00',
      exitedAt: '2026-09-08T10:15:00-03:00',
      issuer: {
        taxId: '12345678000123',
        name: 'EMPRESA EMITENTE LTDA',
        tradeName: 'Emitente Teste',
        stateRegistration: '123456789',
        address: {
          street: 'Rua das Flores',
          number: '100',
          complement: 'Sala 2',
          district: 'Centro',
          city: 'Biguaçu',
          state: 'SC',
          postalCode: '88160000',
          country: 'BRASIL',
          phone: '48999999999',
        },
      },
      recipient: {
        taxId: '12345678909',
        name: 'CLIENTE TESTE',
        address: {
          street: 'Avenida Central',
          number: '200',
          district: 'Jardim',
          city: 'Florianópolis',
          state: 'SC',
          postalCode: '88000000',
          country: 'BRASIL',
        },
      },
      totals: {
        products: 21,
        freight: 5,
        discount: 1,
        invoice: 25,
        icmsBase: 21,
        icms: 3.78,
      },
      products: [
        {
          itemNumber: 1,
          code: 'ABC-001',
          ean: 'SEM GTIN',
          description: 'PRODUTO TESTE',
          ncm: '12345678',
          cfop: '5102',
          unit: 'UN',
          quantity: 2,
          unitPrice: 10.5,
          totalPrice: 21,
        },
      ],
      protocol: {
        number: '342260000000001',
        receivedAt: '2026-09-08T10:01:30-03:00',
        statusCode: '100',
        statusMessage: 'Autorizado o uso da NF-e',
      },
    });
  });
});
