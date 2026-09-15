import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNfeXmlWithRtc, parseRtcNfeXml } from '../src/nfe/rtc';

const rtcKey = '41260612345678000195550010000001231876543214';
const legacyKey = '42260812345678000123550010000012341000012342';
const rtcXml = readFileSync(new URL('./fixtures/nfe-rtc.xml', import.meta.url), 'utf8');
const legacyXml = readFileSync(new URL('./fixtures/nfe-basic.xml', import.meta.url), 'utf8');

describe('RTC / IBS / CBS parser', () => {
  it('models the core IBS/CBS and IS fields without changing the original NF-e payload', () => {
    const parsed = parseNfeXmlWithRtc(rtcXml, rtcKey);

    expect(parsed.originalXml).toBe(rtcXml);
    expect(parsed.rtc.hasRtc).toBe(true);
    expect(parsed.rtc.items).toHaveLength(1);
    expect(parsed.rtc.items[0]).toEqual({
      itemNumber: 1,
      cst: '000',
      taxClassification: '000001',
      base: 100,
      ibsStateRate: 0.1,
      ibsState: 0.1,
      ibsMunicipalRate: 0.05,
      ibsMunicipal: 0.05,
      ibs: 0.15,
      cbsRate: 0.9,
      cbs: 0.9,
      selectiveTax: 0.1,
      extendedGroups: [],
    });
    expect(parsed.rtc.totals).toEqual({
      base: 100,
      ibsState: 0.1,
      ibsMunicipal: 0.05,
      ibs: 0.15,
      cbs: 0.9,
      selectiveTax: 0.1,
      fiscalDocumentTotal: 101.15,
    });
  });

  it('keeps legacy NF-e compatible and reports no RTC groups', () => {
    const rtc = parseRtcNfeXml(legacyXml, legacyKey);

    expect(rtc.hasRtc).toBe(false);
    expect(rtc.items).toEqual([]);
    expect(rtc.totals).toEqual({
      base: 0,
      ibsState: 0,
      ibsMunicipal: 0,
      ibs: 0,
      cbs: 0,
      selectiveTax: 0,
      fiscalDocumentTotal: 0,
    });
  });

  it('rejects a mismatched access key', () => {
    expect(() => parseRtcNfeXml(rtcXml, legacyKey)).toThrow('A chave do XML não corresponde à NF-e consultada.');
  });

  it('signals extended RTC groups instead of silently treating them as core fields', () => {
    const extendedXml = rtcXml.replace(
      '</IBSCBS>',
      '<gIBSCBSMono><vTotIBSMonoItem>1.00</vTotIBSMonoItem><vTotCBSMonoItem>2.00</vTotCBSMonoItem></gIBSCBSMono></IBSCBS>',
    );

    const rtc = parseRtcNfeXml(extendedXml, rtcKey);
    expect(rtc.items[0]?.extendedGroups).toEqual(['gIBSCBSMono']);
  });
});
