# Supplier Tax ID Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identificar Souza Cruz, Fernando Klein e Dionisio primariamente pelo CNPJ/CPF do emitente usando configuração local no Bridge, mantendo o fallback temporário por `xNome` e sem alterar o XML fiscal nem enviar novos dados fiscais ao Cloudflare.

**Architecture:** O Bridge local passa a ser o único componente que conhece os CNPJs/CPFs cadastrados. O frontend usa `issuer.taxId`, já extraído do XML, consulta `127.0.0.1`, recebe somente um `supplierId` lógico e anexa esse valor como metadado operacional opcional ao `ParsedNfe`; as regras de apresentação usam `supplierId` primeiro e `xNome` apenas como fallback de migração. Não criar serviço remoto, banco, hash, HMAC, framework, store ou nova camada de estado.

**Tech Stack:** .NET 10 / ASP.NET Core / xUnit; TypeScript 7.0.2 / Vite 8.2.2 / Vitest 5.0.0; parser XML atual com `@xmldom/xmldom` 0.9.12.

**Spec:** `docs/superpowers/specs/2026-09-17-supplier-tax-id-resolution-design.md`

## Global Constraints

- Usar sempre a `main` mais recente como fonte de verdade no início da execução.
- Não colocar CNPJ/CPF real de fornecedor em código, teste, documentação pública, log, bundle do frontend ou Cloudflare.
- O arquivo local é `%LocalAppData%\NfeAgendamentoBridge\supplier-rules.json` e deve sobreviver às atualizações normais do Bridge.
- O XML original, `cProd`, quantidades fiscais e demais campos fiscais permanecem intactos.
- O identificador fiscal é normalizado removendo formatação, preservando letras e usando casing único; CPF aceito com 11 dígitos, CNPJ com 14 caracteres alfanuméricos.
- Configuração ausente, inválida, duplicada, ilegível ou fornecedor desconhecido deve resultar em `supplierId: null`, nunca bloquear consulta, download, DANFE, Portal ou gerar retry fiscal.
- Durante esta migração, `supplierId` conhecido tem precedência; `supplierId` ausente/desconhecido usa fallback por `xNome` exato normalizado.
- Não remover o fallback por nome nesta implementação; isso só pode ocorrer depois da validação real dos três fornecedores em mudança separada.
- Não adicionar dependências.
- Toda alteração de comportamento deve ser feita com TDD e documentação no mesmo PR de implementação.
- Os CNPJs/CPFs reais fornecidos pelo operador são usados somente no arquivo local das máquinas e na validação física; nunca entram em commit ou CI.

---

## File Structure

- Create: `apps/bridge/src/NfeAgendamento.Bridge/Suppliers/SupplierIdentityResolver.cs` — leitura fail-safe do JSON local, normalização e resolução `taxId -> supplierId`.
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/SupplierIdentityResolverTests.cs` — testes unitários do arquivo local, normalização e conflitos.
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/SupplierEndpointsIntegrationTests.cs` — contrato HTTP, segurança local e ausência de eco/log do documento.
- Modify: `apps/bridge/src/NfeAgendamento.Bridge/Program.cs` — registrar resolver e `POST /api/v1/supplier/resolve`.
- Modify: `apps/web/src/bridge/contracts.ts` — tipo `SupplierResolution`.
- Modify: `apps/web/src/bridge/client.ts` — método `resolveSupplier()` e validação estrita da resposta.
- Modify: `apps/web/tests/bridge-client.test.ts` — contrato do novo endpoint.
- Modify: `apps/web/src/nfe/xml.ts` — metadado operacional opcional `supplierRuleId`, sem mudar o parser fiscal.
- Modify: `apps/web/src/nfe/supplier-rules.ts` — resolução por id + fallback por nome.
- Modify: `apps/web/src/nfe/product-mapping.ts` — nomes genéricos e uso de `supplierRuleId` primário.
- Modify: `apps/web/src/nfe/supplier-quantity.ts` — uso de `supplierRuleId` primário.
- Modify: `apps/web/src/danfe/render.ts` — passar `supplierRuleId` às regras existentes sem mudar o layout.
- Modify: `apps/web/src/batch/controller.ts` — resolver fornecedor após parse do XML, sem tornar a identificação obrigatória para sucesso do item.
- Modify: `apps/web/src/main.ts` — resolver fornecedor no fluxo unitário SEFAZ/Portal antes de guardar/exibir o `ParsedNfe`.
- Modify: `apps/web/tests/supplier-rules.test.ts`, `apps/web/tests/product-mapping.test.ts`, `apps/web/tests/supplier-quantity.test.ts`, `apps/web/tests/supplier-quantity-render.test.ts`, `apps/web/tests/batch-controller.test.ts` — regressões e precedência.
- Modify: `docs/architecture/supplier-rules.md` e `README.md` — operação e configuração local.

---

### Task 1: Resolver local no Bridge

**Files:**
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Suppliers/SupplierIdentityResolver.cs`
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/SupplierIdentityResolverTests.cs`

**Interfaces:**
- Consumes: caminho de arquivo JSON local e `string? taxId`.
- Produces: `public string? Resolve(string? taxId)` e `public static string? NormalizeTaxId(string? value)`.

- [ ] **Step 1: Escrever os testes falhando do resolver**

Cobrir exatamente estes casos com arquivos temporários, sempre com identificadores sintéticos:

```csharp
[Theory]
[InlineData("123.456.789-01", "12345678901")]
[InlineData("12.345.678/0001-95", "12345678000195")]
[InlineData("12.ABC.678/0001-9Z", "12ABC67800019Z")]
public void NormalizeTaxId_preserves_letters_and_removes_formatting(string input, string expected)
{
    Assert.Equal(expected, SupplierIdentityResolver.NormalizeTaxId(input));
}

[Fact]
public void Resolve_returns_supplier_for_any_configured_tax_id()
{
    // JSON temporário com um fornecedor e dois taxIds sintéticos.
    // Assert.Equal("souza-cruz", resolver.Resolve("12.345.678/0001-95"));
}

[Fact]
public void Resolve_returns_null_for_missing_invalid_or_conflicting_config()
{
    // Exercitar arquivo ausente, JSON inválido e o mesmo taxId ligado a ids diferentes.
    // Todos devem retornar null e não lançar exceção.
}
```

Também testar CPF com letras como inválido, CNPJ com tamanho diferente de 14 como inválido, ids de fornecedor vazios e arrays de `taxIds` vazios.

- [ ] **Step 2: Rodar os testes para confirmar RED**

Run:

```bash
dotnet test apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release --filter SupplierIdentityResolverTests
```

Expected: FAIL porque `SupplierIdentityResolver` ainda não existe.

- [ ] **Step 3: Implementar o resolver mínimo e fail-safe**

Usar um único arquivo para modelo + resolver, sem logger e sem cache adicional:

```csharp
namespace NfeAgendamento.Bridge.Suppliers;

public sealed class SupplierIdentityResolver
{
    private readonly string _path;

    public SupplierIdentityResolver()
        : this(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "NfeAgendamentoBridge",
            "supplier-rules.json"))
    {
    }

    public SupplierIdentityResolver(string path) => _path = path;

    public string? Resolve(string? taxId)
    {
        var normalized = NormalizeTaxId(taxId);
        if (normalized is null || !File.Exists(_path)) return null;

        try
        {
            var config = JsonSerializer.Deserialize<SupplierRulesConfig>(File.ReadAllText(_path));
            if (config is null || config.Version != 1 || config.Suppliers is null) return null;

            var index = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var supplier in config.Suppliers)
            {
                var id = supplier.Id?.Trim();
                if (string.IsNullOrEmpty(id) || supplier.TaxIds is null || supplier.TaxIds.Length == 0) return null;

                foreach (var rawTaxId in supplier.TaxIds)
                {
                    var key = NormalizeTaxId(rawTaxId);
                    if (key is null) return null;
                    if (index.TryGetValue(key, out var existing) && !string.Equals(existing, id, StringComparison.Ordinal)) return null;
                    index[key] = id;
                }
            }

            return index.GetValueOrDefault(normalized);
        }
        catch (JsonException)
        {
            return null;
        }
        catch (IOException)
        {
            return null;
        }
        catch (UnauthorizedAccessException)
        {
            return null;
        }
    }

    public static string? NormalizeTaxId(string? value)
    {
        var normalized = new string((value ?? string.Empty)
            .Trim()
            .ToUpperInvariant()
            .Where(character => character is >= 'A' and <= 'Z' || character is >= '0' and <= '9')
            .ToArray());

        if (normalized.Length == 11 && normalized.All(char.IsDigit)) return normalized;
        if (normalized.Length == 14 && normalized.All(character => character is >= 'A' and <= 'Z' || char.IsDigit(character))) return normalized;
        return null;
    }
}

public sealed record SupplierRulesConfig(int Version, SupplierRuleConfig[]? Suppliers);
public sealed record SupplierRuleConfig(string? Id, string[]? TaxIds);
public sealed record SupplierResolveRequest(string? TaxId);
```

Add the required `using System.Text.Json;` and `using System.Linq;` if implicit usings do not cover them.

- [ ] **Step 4: Rodar testes do resolver para confirmar GREEN**

Run:

```bash
dotnet test apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release --filter SupplierIdentityResolverTests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/NfeAgendamento.Bridge/Suppliers/SupplierIdentityResolver.cs apps/bridge/tests/NfeAgendamento.Bridge.Tests/SupplierIdentityResolverTests.cs
git commit -m "feat: add local supplier identity resolver"
```

---

### Task 2: Endpoint loopback de resolução

**Files:**
- Modify: `apps/bridge/src/NfeAgendamento.Bridge/Program.cs`
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/SupplierEndpointsIntegrationTests.cs`

**Interfaces:**
- Consumes: `SupplierResolveRequest { taxId }`.
- Produces: `POST /api/v1/supplier/resolve` -> JSON com exatamente `{ "supplierId": string | null }`.

- [ ] **Step 1: Escrever integração HTTP falhando**

Usar `WebApplicationFactory<Program>` como os testes atuais e substituir o resolver por uma instância com arquivo temporário:

```csharp
[Fact]
public async Task Supplier_resolve_returns_only_logical_id()
{
    using var client = CreateClient();
    using var request = Request(HttpMethod.Post, "/api/v1/supplier/resolve");
    request.Content = JsonContent.Create(new { taxId = "12.345.678/0001-95" });

    using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);
    Assert.Equal(HttpStatusCode.OK, response.StatusCode);

    using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    Assert.Equal("souza-cruz", payload.RootElement.GetProperty("supplierId").GetString());
    Assert.Single(payload.RootElement.EnumerateObject());
    Assert.DoesNotContain("12345678000195", payload.RootElement.GetRawText(), StringComparison.Ordinal);
}

[Fact]
public async Task Supplier_resolve_is_fail_soft_for_unknown_or_invalid_tax_id()
{
    // Enviar taxId desconhecido e valor inválido; ambos retornam 200 + supplierId null.
}
```

Adicionar um caso sem `Origin` válido e esperar `403`, comprovando que a rota nova passa pelo mesmo `LocalRequestGuard` das demais APIs.

Para a garantia de log, instalar no factory um provider de teste que acumule mensagens, fazer a chamada com um taxId sintético e verificar que o valor não aparece em nenhuma mensagem capturada.

- [ ] **Step 2: Rodar integração para confirmar RED**

```bash
dotnet test apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release --filter SupplierEndpointsIntegrationTests
```

Expected: FAIL com 404/serviço ausente.

- [ ] **Step 3: Registrar o serviço e mapear a rota**

Em `Program.cs`:

```csharp
using NfeAgendamento.Bridge.Suppliers;

builder.Services.AddSingleton<SupplierIdentityResolver>();

api.MapPost("/supplier/resolve", (
    SupplierResolveRequest request,
    SupplierIdentityResolver suppliers) => Results.Ok(new
{
    supplierId = suppliers.Resolve(request.TaxId),
}));
```

Não adicionar qualquer `LogInformation`, `LogDebug`, métrica ou exceção contendo `request.TaxId`.

- [ ] **Step 4: Rodar integração + suíte Bridge**

```bash
dotnet test apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release --filter SupplierEndpointsIntegrationTests
dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/NfeAgendamento.Bridge/Program.cs apps/bridge/tests/NfeAgendamento.Bridge.Tests/SupplierEndpointsIntegrationTests.cs
git commit -m "feat: expose local supplier resolution endpoint"
```

---

### Task 3: Contrato e cliente web do Bridge

**Files:**
- Modify: `apps/web/src/bridge/contracts.ts`
- Modify: `apps/web/src/bridge/client.ts`
- Modify: `apps/web/tests/bridge-client.test.ts`

**Interfaces:**
- Produces: `SupplierResolution = { supplierId: string | null }`.
- Produces: `BridgeClient.resolveSupplier(taxId: string, signal?: AbortSignal): Promise<SupplierResolution>`.

- [ ] **Step 1: Escrever testes falhando do cliente**

Adicionar casos que validem path, body e contrato estrito:

```ts
it('resolves supplier through the local bridge', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ supplierId: 'souza-cruz' }));
  const result = await client.resolveSupplier('12.345.678/0001-95');

  expect(result).toEqual({ supplierId: 'souza-cruz' });
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/supplier/resolve'),
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ taxId: '12.345.678/0001-95' }),
    }),
  );
});

it('accepts supplierId null and rejects extra response fields', async () => {
  // Primeiro `{ supplierId: null }` passa; depois `{ supplierId: null, taxId: '...' }` deve lançar.
});
```

- [ ] **Step 2: Confirmar RED**

```bash
npm run test:web -- --run apps/web/tests/bridge-client.test.ts
```

Expected: FAIL porque o método e o tipo ainda não existem.

- [ ] **Step 3: Implementar tipo, método e validator**

Em `contracts.ts`:

```ts
export type SupplierResolution = {
  supplierId: string | null;
};
```

Em `client.ts`, usar `localMs` e a mesma infraestrutura de request:

```ts
async resolveSupplier(taxId: string, signal?: AbortSignal): Promise<SupplierResolution> {
  const normalized = taxId.trim();
  if (!normalized) return { supplierId: null };

  const response = await this.request('/supplier/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taxId: normalized }),
  }, this.timeouts.localMs, signal);

  const payload: unknown = await response.json();
  if (!isSupplierResolution(payload)) throw new Error('Resposta inválida da identificação de fornecedor');
  return payload;
}

function isSupplierResolution(value: unknown): value is SupplierResolution {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return hasExactKeys(result, ['supplierId']) &&
    (result.supplierId === null || typeof result.supplierId === 'string');
}
```

- [ ] **Step 4: Rodar teste + lint**

```bash
npm run test:web -- --run apps/web/tests/bridge-client.test.ts
npm run lint:web
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/bridge/contracts.ts apps/web/src/bridge/client.ts apps/web/tests/bridge-client.test.ts
git commit -m "feat: add supplier resolution bridge client"
```

---

### Task 4: Generalizar as regras de apresentação sem criar nova camada

**Files:**
- Modify: `apps/web/src/nfe/xml.ts`
- Modify: `apps/web/src/nfe/supplier-rules.ts`
- Modify: `apps/web/src/nfe/product-mapping.ts`
- Modify: `apps/web/src/nfe/supplier-quantity.ts`
- Modify: `apps/web/src/danfe/render.ts`
- Modify: `apps/web/tests/supplier-rules.test.ts`
- Modify: `apps/web/tests/product-mapping.test.ts`
- Modify: `apps/web/tests/supplier-quantity.test.ts`
- Modify: `apps/web/tests/supplier-quantity-render.test.ts`

**Interfaces:**
- `ParsedNfe.supplierRuleId?: string | null` é metadado operacional; `parseNfeXml()` não o popula.
- Produces: `resolveSupplierRuleById(value: unknown): SupplierRule | null`.
- Produces: `resolveSupplierRuleForPresentation({ supplierRuleId, emitterName }): SupplierRule | null`.
- Rename principal: `resolveFernandoKleinProduct` -> `resolveSupplierProduct` e demais nomes compartilhados equivalentes.

- [ ] **Step 1: Caracterizar precedência e fallback com testes falhando**

Em `supplier-rules.test.ts`:

```ts
it('prefers supplier id and keeps xNome only as fallback', async () => {
  const { resolveSupplierRuleForPresentation } = await import('../src/nfe/supplier-rules');

  expect(resolveSupplierRuleForPresentation({
    supplierRuleId: 'souza-cruz',
    emitterName: 'FERNANDO KLEIN',
  })?.id).toBe('souza-cruz');

  expect(resolveSupplierRuleForPresentation({
    supplierRuleId: null,
    emitterName: 'FERNANDO KLEIN',
  })?.id).toBe('fernando-klein');

  expect(resolveSupplierRuleForPresentation({
    supplierRuleId: 'unknown-id',
    emitterName: 'DIONISIO',
  })?.id).toBe('dionisio');
});
```

Atualizar testes de mapeamento/quantidade para provar que `supplierRuleId` sozinho ativa Souza Cruz, Fernando Klein e Dionisio mesmo quando o `xNome` não corresponde, e que os resultados atuais continuam idênticos.

- [ ] **Step 2: Confirmar RED**

```bash
npm run test:web -- --run apps/web/tests/supplier-rules.test.ts apps/web/tests/product-mapping.test.ts apps/web/tests/supplier-quantity.test.ts apps/web/tests/supplier-quantity-render.test.ts
```

Expected: FAIL pelas novas interfaces ainda ausentes.

- [ ] **Step 3: Implementar resolução id-first com fallback**

Em `supplier-rules.ts`:

```ts
export function resolveSupplierRuleById(value: unknown): SupplierRule | null {
  const id = String(value ?? '').trim();
  if (!id) return null;
  return SUPPLIER_RULES.find((rule) => rule.id === id) ?? null;
}

export function resolveSupplierRuleForPresentation(input: Readonly<{
  supplierRuleId?: unknown;
  emitterName?: unknown;
}>): SupplierRule | null {
  return resolveSupplierRuleById(input.supplierRuleId) ?? resolveSupplierRule(input.emitterName);
}
```

Em `xml.ts`, adicionar apenas o campo opcional ao tipo `ParsedNfe`; não mudar a saída do parser:

```ts
supplierRuleId?: string | null;
```

Em `product-mapping.ts`, renomear os símbolos compartilhados para nomes neutros e fazer a escolha de catálogo via `resolveSupplierRuleForPresentation()`:

```ts
export type SupplierProductInput = Readonly<{
  supplierRuleId?: string | null;
  emitterName?: string | null;
  xProd?: string | null;
  cProd?: string | null;
}>;

export function resolveSupplierProduct(input: SupplierProductInput): ProductPresentation {
  const sourceCode = String(input.cProd ?? '');
  const supplier = resolveSupplierRuleForPresentation(input);
  const catalog = supplier?.productCatalog;
  if (!catalog?.length) return Object.freeze({ sourceCode, internalCode: '' });
  // Reutilizar o mesmo índice/normalização existente; nenhuma mudança de catálogo.
}
```

Renomear também `normalizeFernandoKleinProductName` -> `normalizeSupplierProductName`, `validateFernandoKleinCatalog` -> `validateSupplierCatalog`, `isFernandoKleinEmitter` -> `hasSupplierProductCatalog`, `summarizeFernandoKleinProducts` -> `summarizeSupplierProducts`; remover aliases antigos apenas depois de atualizar todos os consumidores no mesmo commit.

Em `supplier-quantity.ts`, adicionar `supplierRuleId` ao input e trocar a consulta por `resolveSupplierRuleForPresentation(input)`.

Em `danfe/render.ts`, passar `nfe.supplierRuleId` e `nfe.issuer.name` para mapeamento e quantidade. Não alterar HTML, colunas, paginação, zoom, print ou conteúdo fiscal.

- [ ] **Step 4: Rodar testes focados + DANFE**

```bash
npm run test:web -- --run apps/web/tests/supplier-rules.test.ts apps/web/tests/product-mapping.test.ts apps/web/tests/supplier-quantity.test.ts apps/web/tests/supplier-quantity-render.test.ts apps/web/tests/danfe-render.test.ts
npm run lint:web
```

Expected: PASS sem mudança visual deliberada.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/nfe/xml.ts apps/web/src/nfe/supplier-rules.ts apps/web/src/nfe/product-mapping.ts apps/web/src/nfe/supplier-quantity.ts apps/web/src/danfe/render.ts apps/web/tests/supplier-rules.test.ts apps/web/tests/product-mapping.test.ts apps/web/tests/supplier-quantity.test.ts apps/web/tests/supplier-quantity-render.test.ts
git commit -m "refactor: generalize supplier presentation rules"
```

---

### Task 5: Integrar resolução em consulta unitária e lote

**Files:**
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/src/batch/controller.ts`
- Modify: `apps/web/tests/batch-controller.test.ts`
- Modify: `apps/web/tests/shell.test.ts` somente se alguma asserção textual antiga precisar acompanhar a integração.

**Interfaces:**
- Extend `BridgeBatchClient` with `resolveSupplier(taxId: string, signal?: AbortSignal): Promise<{ supplierId: string | null }>`.
- `ParsedNfe` bem-sucedido recebe `supplierRuleId`, mas falha nessa identificação nunca muda status de sucesso da NF-e.

- [ ] **Step 1: Escrever testes falhando do lote**

Adicionar ao fixture do `BatchController` um `resolveSupplier` mock e cobrir:

```ts
it('attaches supplier id after parsing a successful xml', async () => {
  bridge.resolveSupplier.mockResolvedValue({ supplierId: 'souza-cruz' });
  await controller.start();

  expect(bridge.resolveSupplier).toHaveBeenCalledWith('12345678000195', expect.any(AbortSignal));
  expect(lastRenderedItems[0]?.parsed?.supplierRuleId).toBe('souza-cruz');
});

it('keeps the item successful when supplier resolution fails', async () => {
  bridge.resolveSupplier.mockRejectedValue(new Error('bridge local failure'));
  await controller.start();

  expect(lastRenderedItems[0]?.status).toBe('success');
  expect(lastRenderedItems[0]?.parsed?.supplierRuleId).toBeNull();
});
```

Manter os testes existentes de serialização do lote, Portal, cancelamento, ZIP e print.

- [ ] **Step 2: Confirmar RED**

```bash
npm run test:web -- --run apps/web/tests/batch-controller.test.ts
```

Expected: FAIL porque `BridgeBatchClient` ainda não resolve fornecedor.

- [ ] **Step 3: Tornar `completeItem` assíncrono e fail-soft**

No controller:

```ts
async function completeItem(item: MutableBatchItem, xml: string, source: BatchSource, signal?: AbortSignal): Promise<void> {
  try {
    const parsed = deps.parseXml(xml, item.accessKey);
    let supplierRuleId: string | null = null;
    try {
      supplierRuleId = (await deps.bridge.resolveSupplier(parsed.issuer.taxId, signal)).supplierId;
    } catch {
      supplierRuleId = null;
    }

    item.parsed = { ...parsed, supplierRuleId };
    item.source = source;
    item.status = 'success';
    item.message = `XML validado via ${source}.`;
  } catch (error) {
    item.status = source === 'Portal' ? 'portal_error' : 'transport_error';
    item.message = error instanceof Error ? error.message : 'O XML retornado não pôde ser validado.';
  }
}
```

Trocar os dois pontos de sucesso para `await completeItem(..., signal)`.

- [ ] **Step 4: Integrar o fluxo unitário em `main.ts`**

Logo depois de `parseNfeXml(...)` e antes de persistir/exibir o `ParsedNfe`, resolver o fornecedor com o mesmo padrão fail-soft:

```ts
async function withSupplierRule(parsed: ParsedNfe, signal?: AbortSignal): Promise<ParsedNfe> {
  try {
    const resolution = await bridge.resolveSupplier(parsed.issuer.taxId, signal);
    return { ...parsed, supplierRuleId: resolution.supplierId };
  } catch {
    return { ...parsed, supplierRuleId: null };
  }
}
```

Usar esse helper tanto no XML vindo da SEFAZ quanto no XML concluído pelo Portal. Não disparar nova consulta fiscal e não alterar decisões de fallback SEFAZ/Portal.

- [ ] **Step 5: Rodar testes focados + suíte web**

```bash
npm run test:web -- --run apps/web/tests/batch-controller.test.ts apps/web/tests/supplier-rules.test.ts apps/web/tests/product-mapping.test.ts apps/web/tests/supplier-quantity-render.test.ts
npm run test:web
npm run lint:web
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/main.ts apps/web/src/batch/controller.ts apps/web/tests/batch-controller.test.ts apps/web/tests/shell.test.ts
git commit -m "feat: resolve supplier identity for danfe presentation"
```

---

### Task 6: Documentação, configuração local e verificação final

**Files:**
- Modify: `docs/architecture/supplier-rules.md`
- Modify: `README.md`
- Review: `.gitignore` somente para confirmar que nenhum caminho de `%LocalAppData%` é versionável; nenhuma entrada nova é necessária porque o arquivo fica fora do repositório.

**Interfaces:**
- Operação local usa exatamente:

```json
{
  "version": 1,
  "suppliers": [
    { "id": "souza-cruz", "taxIds": ["00000000000000"] },
    { "id": "fernando-klein", "taxIds": ["11111111111111"] },
    { "id": "dionisio", "taxIds": ["22222222222222"] }
  ]
}
```

Os valores acima são exemplos não operacionais; a documentação deve dizer explicitamente que os valores reais são colocados manualmente no arquivo local e nunca commitados.

- [ ] **Step 1: Atualizar documentação de arquitetura**

Documentar: path local, schema v1, múltiplos `taxIds` por fornecedor, normalização, fallback por `xNome`, comportamento fail-soft, política de logs, CNPJ alfanumérico, cópia do mesmo JSON entre PCs e remoção futura do fallback somente após validação real.

- [ ] **Step 2: Atualizar README operacional**

Adicionar uma seção curta “Regras locais de fornecedor” com o path e link para `docs/architecture/supplier-rules.md`. Não incluir nenhum CNPJ/CPF real.

- [ ] **Step 3: Rodar todos os gates locais disponíveis**

```bash
npm run format:check:web
npm run lint:web
npm run test:web
npm run build:web
dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
dotnet build apps/bridge/src/NfeAgendamento.Bridge/NfeAgendamento.Bridge.csproj -c Release --no-restore
```

Expected: todos PASS.

- [ ] **Step 4: Fazer validação de privacidade no diff**

Antes do commit final:

```bash
git grep -n -E '[0-9A-Z]{11}|[0-9A-Z]{14}' -- apps/bridge/src apps/web/src docs README.md
```

Revisar manualmente cada match e confirmar que nenhum identificador real fornecido pelo operador entrou no repositório. Strings sintéticas de teste/documentação devem estar claramente marcadas como exemplos.

Também revisar que nenhuma nova chamada do frontend envia `issuer.taxId` para Worker/Cloudflare; a única chamada nova deve apontar para `BRIDGE_BASE_URL` em loopback.

- [ ] **Step 5: Commit da documentação**

```bash
git add docs/architecture/supplier-rules.md README.md
git commit -m "docs: document local supplier identity rules"
```

- [ ] **Step 6: Abrir PR de implementação e aguardar CI completo**

O PR deve listar como gates esperados os jobs atuais: `web`, `danfe-print`, `bridge`, `fiscal-compatibility` e `windows-package`, além de CodeQL quando disparado. Não fazer merge enquanto qualquer job estiver vermelho.

- [ ] **Step 7: Validação física com os dados reais, fora do GitHub**

Depois que o operador fornecer os CNPJs/CPFs reais, criar `%LocalAppData%\NfeAgendamentoBridge\supplier-rules.json` em uma máquina de teste sem registrar os valores em chat de PR, commit, issue ou log. Validar com uma NF real de cada fornecedor:

- Souza Cruz continua mostrando a quantidade operacional convertida corretamente;
- Fernando Klein continua mostrando os códigos internos corretos;
- Dionisio continua mostrando os códigos internos corretos;
- o XML baixado permanece byte-for-byte o XML fiscal recebido;
- uma NF de fornecedor não cadastrado continua sem transformação indevida;
- se o JSON for temporariamente renomeado, o fallback por `xNome` mantém o comportamento atual.

Registrar no GitHub apenas o resultado da validação, por exemplo “Souza Cruz: aprovado”, sem publicar identificadores fiscais.

---

## Self-Review Checklist

- Spec coverage: configuração local, CNPJ/CPF primário, CNPJ alfanumérico, fallback por nome, privacidade, fail-soft, regras visuais existentes, nomenclatura genérica, testes, docs e validação física estão cobertos.
- Placeholder scan: o plano não depende de valores reais dentro do repositório; fixtures usam somente identificadores sintéticos e a validação real é explicitamente out-of-band.
- Type consistency: `SupplierResolution.supplierId`, `ParsedNfe.supplierRuleId`, `resolveSupplierRuleById`, `resolveSupplierRuleForPresentation` e `BridgeClient.resolveSupplier` têm o mesmo nome e significado em todas as tasks.
- Scope check: não inclui remoção do fallback por `xNome`, mudança de layout do DANFE, mudança fiscal, Cloudflare, D1, hash/HMAC ou nova arquitetura de controllers.
