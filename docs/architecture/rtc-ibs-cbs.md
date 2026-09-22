# RTC / IBS / CBS — suporte estrutural

Data de referência: 15/09/2026.

## Referência fiscal

O suporte foi planejado a partir das versões oficiais em uso no Portal Nacional da NF-e em setembro de 2026, incluindo a **NT 2025.002 v1.51** e os schemas NF-e da linha **010e v1.02** para RTC. A compatibilidade com CNPJ alfanumérico permanece tratada em paralelo pela **NT 2026.004 v1.01** e schemas 010d.

A implementação não presume que todo campo novo da Reforma Tributária deva aparecer no DANFE. Exibição/impressão só será alterada depois de mapear explicitamente a exigência vigente do MOC/NT para cada campo.

## Modelo implementado

`apps/web/src/nfe/rtc.ts` adiciona uma camada fiscal complementar e não destrutiva sobre o parser existente. Ela modela os campos centrais encontrados em XML NF-e:

- `IBSCBS/CST`;
- `IBSCBS/cClassTrib`;
- `gIBSCBS/vBC`;
- `gIBSUF/pIBSUF` e `vIBSUF`;
- `gIBSMun/pIBSMun` e `vIBSMun`;
- `gIBSCBS/vIBS`;
- `gCBS/pCBS` e `vCBS`;
- `IS/vIS`;
- totais de `IBSCBSTot`, `ISTot` e `vNFTot`.

O XML original continua preservado integralmente no objeto principal da NF-e.

## Grupos estendidos

A primeira camada não tenta transformar automaticamente todos os grupos opcionais/monofásicos. Quando aparecem grupos já conhecidos que exigem modelagem específica, o parser os sinaliza em `extendedGroups`, atualmente:

- `gIBSCBSMono`;
- `gTransfCred`;
- `gCredPresIBSZFM`.

Isso evita tratar silenciosamente um documento mais complexo como se contivesse apenas o conjunto básico. O dado completo permanece disponível em `originalXml` até a modelagem específica ser implementada.

## API

- `parseRtcNfeXml(xml, expectedAccessKey)` — lê apenas a camada RTC e valida a correspondência da chave;
- `parseNfeXmlWithRtc(xml, expectedAccessKey)` — combina o parser NF-e existente com a camada RTC em um único objeto, preservando compatibilidade estrutural com `ParsedNfe`.

A interface principal ainda pode continuar usando o parser legado enquanto a camada RTC é validada. O novo wrapper existe para adoção incremental sem alterar o DANFE antes da definição fiscal de impressão.

## Testes

`apps/web/tests/rtc.test.ts` usa `apps/web/tests/fixtures/nfe-rtc.xml`, uma fixture sintética sem dados pessoais reais, e cobre:

- CST/classificação tributária;
- base e valores IBS UF/municipal;
- total IBS;
- CBS;
- Imposto Seletivo;
- totais RTC;
- preservação integral do XML;
- compatibilidade com NF-e sem RTC;
- rejeição de chave divergente;
- sinalização de grupo monofásico estendido.

O job `fiscal-compatibility` também mantém um POC isolado com `Unimake.DFe` para comparar a validação de chave/CNPJ alfanuméricos e confirmar a disponibilidade dos tipos RTC da versão avaliada.

## Próximas etapas

1. adicionar fixtures representativas de grupos monofásicos e demais cenários RTC que realmente apareçam no uso do projeto;
2. comparar serialização/desserialização com schemas oficiais e com o POC do Unimake.DFe;
3. mapear as exigências de impressão antes de acrescentar IBS/CBS ao DANFE;
4. conectar `parseNfeXmlWithRtc` ao fluxo principal somente depois de os testes de regressão cobrirem os XMLs reais necessários.
