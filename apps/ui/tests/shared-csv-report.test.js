import { describe, expect, it, vi } from 'vitest';
import { generateBatchCsv } from '../src/shared/csv-report.js';

describe('csv-report', () => {
  describe('generateBatchCsv', () => {
    it('gera CSV com BOM e cabeçalhos', () => {
      const items = [];
      const csv = generateBatchCsv(items);
      expect(csv.charCodeAt(0)).toBe(0xFEFF);
      expect(csv).toContain('Chave de Acesso');
      expect(csv).toContain('Número');
      expect(csv).toContain('Status');
    });

    it('inclui dados de item concluído', () => {
      const items = [
        {
          accessKey: '35260812345678000195550010000000011000000018',
          status: 'success',
          source: 'Portal',
          message: 'XML validado via Portal.',
          parsed: {
            accessKey: '35260812345678000195550010000000011000000018',
            number: '123',
            series: '1',
            model: '55',
            issuer: { taxId: '12345678000195', name: 'Empresa Teste' },
            recipient: { taxId: '98765432000100', name: 'Cliente Teste' },
            issuedAt: '2026-08-01T10:00:00-03:00',
            totals: { totalValue: 1234.56 },
          },
        },
      ];
      const csv = generateBatchCsv(items);
      expect(csv).toContain('35260812345678000195550010000000011000000018');
      expect(csv).toContain('123');
      expect(csv).toContain('Empresa Teste');
      expect(csv).toContain('12345678000195');
      expect(csv).toContain('Concluída');
    });

    it('trata item com erro', () => {
      const items = [
        {
          accessKey: '35260812345678000195550010000000011000000018',
          status: 'portal_error',
          source: null,
          message: 'Falha no Portal',
          parsed: null,
        },
      ];
      const csv = generateBatchCsv(items);
      expect(csv).toContain('Erro no Portal');
      expect(csv).toContain('Falha no Portal');
    });

    it('escapa valores com vírgula e aspas', () => {
      const items = [
        {
          accessKey: '35260812345678000195550010000000011000000018',
          status: 'success',
          source: 'Portal',
          message: 'OK',
          parsed: {
            accessKey: '35260812345678000195550010000000011000000018',
            number: '1',
            series: '1',
            model: '55',
            issuer: { taxId: '12345678000195', name: 'Empresa, com vírgula' },
            recipient: null,
            issuedAt: null,
            totals: { totalValue: 100 },
          },
        },
      ];
      const csv = generateBatchCsv(items);
      expect(csv).toContain('"Empresa, com vírgula"');
    });

    it('formata valor monetário em BRL', () => {
      const items = [
        {
          accessKey: '35260812345678000195550010000000011000000018',
          status: 'success',
          source: 'Portal',
          message: 'OK',
          parsed: {
            accessKey: '35260812345678000195550010000000011000000018',
            number: '1',
            series: '1',
            model: '55',
            issuer: { taxId: '12345678000195', name: 'Teste' },
            recipient: null,
            issuedAt: null,
            totals: { totalValue: 1234.56 },
          },
        },
      ];
      const csv = generateBatchCsv(items);
      expect(csv).toContain('R$');
      expect(csv).toContain('1.234,56');
    });

    it('trata item cancelado', () => {
      const items = [
        {
          accessKey: '35260812345678000195550010000000011000000018',
          status: 'cancelled',
          source: null,
          message: 'Cancelada pelo usuário',
          parsed: null,
        },
      ];
      const csv = generateBatchCsv(items);
      expect(csv).toContain('Cancelada');
    });

    it('trata item aguardando', () => {
      const items = [
        {
          accessKey: '35260812345678000195550010000000011000000018',
          status: 'portal_queued',
          source: null,
          message: 'Na fila',
          parsed: null,
        },
      ];
      const csv = generateBatchCsv(items);
      expect(csv).toContain('Na fila');
    });
  });
});
