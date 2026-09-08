import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const VALID_KEY = '42260812345678000123550010000012341000012342';
const fixture = readFileSync(new URL('./fixtures/nfe-basic.xml', import.meta.url), 'utf8');
const fullDanfeFixture = readFileSync(new URL('./fixtures/nfe-danfe-full.xml', import.meta.url), 'utf8');

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

  it('extracts the extended fiscal model required by the approved DANFE', async () => {
    await expect(
      import('../src/nfe/xml').then(({ parseNfeXml }) => parseNfeXml(fullDanfeFixture, VALID_KEY)),
    ).resolves.toMatchObject({
      invoiceType: '1',
      issuer: { municipalRegistration: '987654' },
      recipient: { stateRegistrationIndicator: '9', email: 'cliente@example.com' },
      totals: {
        icmsStBase: 2,
        icmsSt: 0.36,
        importTax: 0.2,
        icmsUfRemet: 0.1,
        fcpUfDest: 0.15,
        pis: 0.35,
        insurance: 0.5,
        other: 0.25,
        ipi: 0.5,
        cofins: 1.61,
      },
      products: [{
        discount: 1,
        tax: {
          cst: '000',
          icmsBase: 21,
          icms: 3.78,
          icmsRate: 18,
          ipi: 0.5,
          ipiRate: 2.38,
          pis: 0.35,
          cofins: 1.61,
          taxNote: '',
        },
      }],
      billing: {
        invoice: { number: 'FAT123', original: 25, discount: 1, net: 24 },
        duplicates: [{ number: '001', dueDate: '2026-09-30', value: 24 }],
      },
      payments: [{ methodCode: '17', methodName: 'PIX', value: 24 }],
      transport: {
        freightMode: '0',
        carrier: {
          taxId: '99887766000155',
          name: 'TRANSPORTADORA TESTE',
          stateRegistration: '445566',
          address: 'Rodovia SC 401, 1000',
          city: 'Florianópolis',
          state: 'SC',
        },
        vehicle: { plate: 'ABC1D23', state: 'SC', rntc: '12345678' },
        volumes: [{
          quantity: 2,
          species: 'CAIXA',
          brand: 'TESTE',
          number: '1-2',
          netWeight: 9.5,
          grossWeight: 10,
        }],
      },
      additional: {
        contributor: 'Entregar no período da manhã.',
        taxAuthority: 'Informação reservada ao fisco.',
      },
    });
  });
});
