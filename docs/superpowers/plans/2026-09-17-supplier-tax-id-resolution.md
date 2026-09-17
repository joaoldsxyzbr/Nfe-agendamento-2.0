# Supplier Tax ID Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identificar Souza Cruz, Fernando Klein e Dionisio primariamente pelo CNPJ/CPF do emitente usando configuração local no Bridge, mantendo fallback temporário por `xNome`, sem alterar o XML fiscal e sem enviar novos dados fiscais ao Cloudflare.

**Architecture:** O Bridge local será o único componente que conhece os CNPJs/CPFs cadastrados. O frontend usa `issuer.taxId`, já extraído do XML, consulta somente `127.0.0.1`, recebe um `supplierId` lógico e anexa esse valor como metadado operacional opcional ao `ParsedNfe`; as regras de apresentação resolvem por `supplierId` primeiro e por `xNome` apenas como fallback de migração. Não criar serviço remoto, banco, hash, HMAC, framework, store ou nova camada de estado.

**Tech Stack:** .NET 10 / ASP.NET Core / xUnit; TypeScript 7.0.2 / Vite 8.2.2 / Vitest 5.0.0; `@xmldom/xmldom` 0.9.12.

**Spec:** `docs/superpowers/specs/2026-09-17-supplier-tax-id-resolution-design.md`

## Global Constraints

- Começar a execução a partir da `main` mais recente; a `main` é a fonte de verdade.
- Não colocar CNPJ/CPF real de fornecedor em código, teste, documentação pública, log, bundle do frontend, issue, PR ou Cloudflare.
- A configuração local fica em `%LocalAppData%\NfeAgendamentoBridge\supplier-rules.json` e deve sobreviver às atualizações normais do Bridge.
- O XML original, `cProd`, quantidades fiscais e demais campos fiscais permanecem intactos.
- Normalização: remover apenas formatação/espaços, preservar letras e usar uppercase; CPF aceito com 11 dígitos; CNPJ aceito com 14 caracteres alfanuméricos.
- Configuração ausente, inválida, duplicada, ilegível ou fornecedor desconhecido resulta em `supplierId: null`; isso nunca pode bloquear consulta, download, DANFE, Portal ou gerar retry fiscal.
- Durante a migração, `supplierId` conhecido tem precedência; `supplierId` ausente ou desconhecido usa fallback por `xNome` exato normalizado.
- Não remover o fallback por nome nesta implementação.
- Não adicionar dependências.
- Toda mudança de comportamento deve ser feita com TDD; documentação acompanha a mesma implementação.
- CNPJs/CPFs reais fornecidos pelo operador são usados somente no arquivo local das máquinas e na validação física, nunca em commit ou CI.

---

## File Structure

- Create: `apps/bridge/src/NfeAgendamento.Bridge/Suppliers/SupplierIdentityResolver.cs` — leitura fail-safe do JSON local, normalização e resolução `taxId -> supplierId`.
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/SupplierIdentityResolverTests.cs` — testes unitários do arquivo, normalização e conflitos.
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/SupplierEndpointsIntegrationTests.cs` — contrato HTTP, proteção local e ausência de eco/log do documento.
- Modify: `apps/bridge/src/NfeAgendamento.Bridge/Program.cs` — registrar resolver e `POST /api/v1/supplier/resolve`.
- Modify: `apps/web/src/bridge/contracts.ts` — `SupplierResolution`.
- Modify: `apps/web/src/bridge/client.ts` — `resolveSupplier()` e validação estrita da resposta.
- Modify: `apps/web/tests/bridge-client.test.ts` — contrato do endpoint.
- Modify: `apps/web/src/nfe/xml.ts` — metadado operacional opcional `supplierRuleId`, sem mudar o parser fiscal.
- Modify: `apps/web/src/nfe/supplier-rules.ts` — resolução por id + fallback por nome.
- Modify: `apps/web/src/nfe/product-mapping.ts` — nomes genéricos e uso de `supplierRuleId` primário.
- Modify: `apps/web/src/nfe/supplier-quantity.ts` — uso de `supplierRuleId` primário.
- Modify: `apps/web/src/danfe/render.ts` — passar `supplierRuleId` às regras existentes sem mudar layout.
- Modify: `apps/web/src/batch/controller.ts` — resolver fornecedor depois do parse; falha na identificação não muda sucesso da NF-e.
- Modify: `apps/web/src/main.ts` — resolver fornecedor no fluxo unitário SEFAZ/Portal antes de exibir/guardar `ParsedNfe`.
- Modify tests: `supplier-rules.test.ts`, `product-mapping.test.ts`, `supplier-quantity.test.ts`, `supplier-quantity-render.test.ts`, `batch-controller.test.ts`, `bridge-client.test.ts`.
- Modify docs: `docs/architecture/supplier-rules.md`, `README.md`.

---

### Task 1: Resolver local no Bridge

**Files:**
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Suppliers/SupplierIdentityResolver.cs`
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/SupplierIdentityResolverTests.cs`

**Interfaces:**
- Produces: `public string? Resolve(string? taxId)`.
- Produces: `public static string? NormalizeTaxId(string? value)`.
- Reads schema v1: `{ "version": 1, "suppliers": [{ "id": "...", "taxIds": ["..."] }] }`.

- [ ] **Step 1: Escrever testes RED do resolver**

Criar testes completos usando somente ids sintéticos:

```csharp
[Theory]
[InlineData("123.456.789-01", "12345678901")]
[InlineData("12.345.678/0001-95", "12345678000195")]
[InlineData("12.ABC.678/0001-9Z", "12ABC67800019Z")]
public void NormalizeTaxId_removes_formatting_and_preserves_letters(string input, string expected)
{
    Assert.Equal(expected, SupplierIdentityResolver.NormalizeTaxId(input));
}

[Theory]
[InlineData("ABC45678901")]
[InlineData("1234567890")]
[InlineData("123456789012345")]
[InlineData("")]
public void NormalizeTaxId_rejects_invalid_shapes(string input)
{
    Assert.Null(SupplierIdentityResolver.NormalizeTaxId(input));
}

[Fact]
public void Resolve_matches_any_tax_id_registered_for_one_supplier()
{
    using var fixture = SupplierFileFixture.Create("""
    {"version":1,"suppliers":[{"id":"souza-cruz","taxIds":["12.345.678/0001-95","98.765.432/0001-AB"]}]}
    """);
    var resolver = new SupplierIdentityResolver(fixture.Path);

    Assert.Equal("souza-cruz", resolver.Resolve("12345678000195"));
    Assert.Equal("souza-cruz", resolver.Resolve("98.765.432/0001-ab"));
    Assert.Null(resolver.Resolve("11.111.111/1111-11"));
}

[Fact]
public void Resolve_returns_null_when_file_is_missing_or_invalid()
{
    var missing = new SupplierIdentityResolver(Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"), "supplier-rules.json"));
    Assert.Null(missing.Resolve("12345678000195"));

    using var invalid = SupplierFileFixture.Create("{invalid-json");
    Assert.Null(new SupplierIdentityResolver(invalid.Path).Resolve("12345678000195"));
}

[Fact]
public void Resolve_rejects_conflicting_tax_id_configuration_fail_soft()
{
    using var fixture = SupplierFileFixture.Create("""
    {"version":1,"suppliers":[
      {"id":"souza-cruz","taxIds":["12.345.678/0001-95"]},
      {"id":"dionisio","taxIds":["12345678000195"]}
    ]}
    """);

    Assert.Null(new SupplierIdentityResolver(fixture.Path).Resolve("12345678000195"));
}

[Fact]
public void Resolve_rejects_incomplete_supplier_entries_fail_soft()
{
    using var emptyId = SupplierFileFixture.Create("""
    {"version":1,"suppliers":[{"id":"","taxIds":["12345678000195"]}]}
    """);
    using var noTaxIds = SupplierFileFixture.Create("""
    {"version":1,"suppliers":[{"id":"souza-cruz","taxIds":[]}]}
    """);

    Assert.Null(new SupplierIdentityResolver(emptyId.Path).Resolve("12345678000195"));
    Assert.Null(new SupplierIdentityResolver(noTaxIds.Path).Resolve("12345678000195"));
}
```

No arquivo de teste, implementar o fixture de modo explícito:

```csharp
private sealed class SupplierFileFixture : IDisposable
{
    private readonly string _directory;
    public string Path { get; }

    private SupplierFileFixture(string directory, string path)
    {
        _directory = directory;
        Path = path;
    }

    public static SupplierFileFixture Create(string json)
    {
        var directory = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"nfe-supplier-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);
        var path = System.IO.Path.Combine(directory, "supplier-rules.json");
        File.WriteAllText(path, json);
        return new SupplierFileFixture(directory, path);
    }

    public void Dispose() => Directory.Delete(_directory, recursive: true);
}
```

- [ ] **Step 2: Rodar e confirmar RED**

```bash
dotnet test apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release --filter SupplierIdentityResolverTests
```

Expected: FAIL porque `SupplierIdentityResolver` ainda não existe.

- [ ] **Step 3: Implementar resolver mínimo e fail-safe**

Usar `JsonSerializerOptions.PropertyNameCaseInsensitive = true` para o JSON documentado em camelCase funcionar com os records C#:

```csharp
using System.Text.Json;

namespace NfeAgendamento.Bridge.Suppliers;

public sealed class SupplierIdentityResolver
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

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
            var config = JsonSerializer.Deserialize<SupplierRulesConfig>(File.ReadAllText(_path), JsonOptions);
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
        catch (JsonException) { return null; }
        catch (IOException) { return null; }
        catch (UnauthorizedAccessException) { return null; }
    }

    public static string? NormalizeTaxId(string? value)
    {
        var normalized = new string((value ?? string.Empty)
            .Trim()
            .ToUpperInvariant()
            .Where(character => (character >= 'A' && character <= 'Z') || (character >= '0' && character <= '9'))
            .ToArray());

        if (normalized.Length == 11 && normalized.All(char.IsDigit)) return normalized;
        if (normalized.Length == 14 && normalized.All(character => (character >= 'A' && character <= 'Z') || char.IsDigit(character))) return normalized;
        return null;
    }
}

public sealed record SupplierRulesConfig(int Version, SupplierRuleConfig[]? Suppliers);
public sealed record SupplierRuleConfig(string? Id, string[]? TaxIds);
public sealed record SupplierResolveRequest(string? TaxId);
```

- [ ] **Step 4: Rodar o teste focado para confirmar GREEN**

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
- Consumes: `SupplierResolveRequest { TaxId }`.
- Produces: `POST /api/v1/supplier/resolve` -> exatamente `{ "supplierId": string | null }`.

- [ ] **Step 1: Escrever testes RED do endpoint**

No fixture de integração, configurar `AllowedOrigin`, criar `SupplierIdentityResolver` com arquivo temporário e substituí-lo via DI. Implementar estes testes:

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

[Theory]
[InlineData("11.111.111/1111-11")]
[InlineData("invalido")]
public async Task Supplier_resolve_returns_null_for_unknown_or_invalid_tax_id(string taxId)
{
    using var client = CreateClient();
    using var request = Request(HttpMethod.Post, "/api/v1/supplier/resolve");
    request.Content = JsonContent.Create(new { taxId });

    using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);
    var payload = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    Assert.Equal(JsonValueKind.Null, payload.GetProperty("supplierId").ValueKind);
}

[Fact]
public async Task Supplier_resolve_rejects_untrusted_origin()
{
    using var client = CreateClient();
    using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/supplier/resolve");
    request.Headers.Host = "127.0.0.1:17345";
    request.Headers.Add("Origin", "https://invalid.example");
    request.Content = JsonContent.Create(new { taxId = "12.345.678/0001-95" });

    using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);
    Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
}
```

Adicionar um `ILoggerProvider` de teste no `WebApplicationFactory`, enviar `12.345.678/0001-95` e verificar:

```csharp
Assert.DoesNotContain(capturedMessages, message =>
    message.Contains("12345678000195", StringComparison.Ordinal) ||
    message.Contains("12.345.678/0001-95", StringComparison.Ordinal));
```

- [ ] **Step 2: Rodar e confirmar RED**

```bash
dotnet test apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release --filter SupplierEndpointsIntegrationTests
```

Expected: FAIL com rota/serviço ausente.

- [ ] **Step 3: Registrar o resolver e mapear a rota**

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

Não adicionar logging, métricas ou exceções contendo `request.TaxId`.

- [ ] **Step 4: Rodar integração e suíte Bridge**

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

- [ ] **Step 1: Escrever testes RED do cliente**

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

it('accepts supplierId null', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ supplierId: null }));
  await expect(client.resolveSupplier('11.111.111/1111-11')).resolves.toEqual({ supplierId: null });
});

it('rejects supplier responses with extra fields', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ supplierId: null, taxId: '12345678000195' }));
  await expect(client.resolveSupplier('12.345.678/0001-95')).rejects.toThrow('Resposta inválida da identificação de fornecedor');
});
```

- [ ] **Step 2: Confirmar RED**

```bash
npm run test:web -- --run apps/web/tests/bridge-client.test.ts
```

Expected: FAIL porque método/tipo ainda não existem.

- [ ] **Step 3: Implementar contrato, método e validator**

Em `contracts.ts`:

```ts
export type SupplierResolution = {
  supplierId: string | null;
};
```

Em `client.ts`, importar `SupplierResolution` e adicionar:

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

- [ ] **Step 4: Rodar teste focado + lint**

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

### Task 4: Generalizar regras de apresentação sem nova camada

**Files:**
- Modify: `apps/web/src/nfe/xml.ts`
- Modify: `apps/web/src/nfe/supplier-rules.ts`
- Modify: `apps/web/src/nfe/product-mapping.ts`
- Modify: `apps/web/src/nfe/supplier-quantity.ts`
- Modify: `apps/web/src/danfe/render.ts`
- Modify: tests de supplier/product/quantity/render.

**Interfaces:**
- `ParsedNfe.supplierRuleId?: string | null` é metadado operacional; `parseNfeXml()` não o popula.
- Produces: `resolveSupplierRuleById(value: unknown): SupplierRule | null`.
- Produces: `resolveSupplierRuleForPresentation({ supplierRuleId, emitterName }): SupplierRule | null`.
- Rename compartilhado: `resolveFernandoKleinProduct` -> `resolveSupplierProduct`.

- [ ] **Step 1: Escrever testes RED de precedência e regressão**

```ts
it('prefers supplier id and falls back to xNome', async () => {
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

Nos testes de produto, criar um caso com `supplierRuleId: 'dionisio'` e `emitterName: 'NOME QUE NAO CASA'` e verificar que um alias conhecido continua retornando o mesmo `internalCode` do catálogo. Nos testes de quantidade, usar `supplierRuleId: 'souza-cruz'`, nome não correspondente e `quantity: 2`, esperando `100`. Manter todos os casos atuais por `xNome` para provar compatibilidade.

- [ ] **Step 2: Confirmar RED**

```bash
npm run test:web -- --run apps/web/tests/supplier-rules.test.ts apps/web/tests/product-mapping.test.ts apps/web/tests/supplier-quantity.test.ts apps/web/tests/supplier-quantity-render.test.ts
```

Expected: FAIL pelas novas interfaces ainda ausentes.

- [ ] **Step 3: Implementar resolução id-first e nomes neutros**

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

Em `xml.ts`, adicionar ao tipo `ParsedNfe`:

```ts
supplierRuleId?: string | null;
```

Não adicionar esse campo na saída de `parseNfeXml()`.

Em `product-mapping.ts`, renomear os símbolos compartilhados:

- `FernandoKleinCatalogItem` -> `SupplierCatalogProduct`;
- `FernandoKleinProductInput` -> `SupplierProductInput`;
- `FernandoKleinSummary` -> `SupplierProductSummary`;
- `normalizeFernandoKleinProductName` -> `normalizeSupplierProductName`;
- `validateFernandoKleinCatalog` -> `validateSupplierCatalog`;
- `isFernandoKleinEmitter` -> `hasSupplierProductCatalog`;
- `resolveFernandoKleinProduct` -> `resolveSupplierProduct`;
- `summarizeFernandoKleinProducts` -> `summarizeSupplierProducts`.

A função principal fica completa assim:

```ts
export function resolveSupplierProduct(input: SupplierProductInput): ProductPresentation {
  const sourceCode = String(input.cProd ?? '');
  const supplier = resolveSupplierRuleForPresentation(input);
  const catalog = supplier?.productCatalog;
  if (!catalog?.length) {
    return Object.freeze({ sourceCode, internalCode: '' });
  }

  const productName = normalizeSupplierProductName(input.xProd);
  return Object.freeze({
    sourceCode,
    internalCode: aliasIndexFor(catalog)[productName] ?? '',
  });
}
```

Em `supplier-quantity.ts`, ampliar input e usar a mesma resolução:

```ts
export type SupplierQuantityInput = Readonly<{
  supplierRuleId?: string | null;
  emitterName?: string | null;
  quantity?: number | null;
}>;

const quantityRule = resolveSupplierRuleForPresentation(input)?.internalQuantity;
```

Em `danfe/render.ts`, trocar os consumidores para `resolveSupplierProduct`/`resolveSupplierInternalQuantity` passando `supplierRuleId: nfe.supplierRuleId` e `emitterName: nfe.issuer.name`. Não alterar HTML, colunas, paginação, zoom, print ou campos fiscais.

- [ ] **Step 4: Rodar testes focados + DANFE + lint**

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

### Task 5: Integrar resolução na consulta unitária e no lote

**Files:**
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/src/batch/controller.ts`
- Modify: `apps/web/tests/batch-controller.test.ts`
- Modify: `apps/web/tests/shell.test.ts` somente se uma asserção textual existente exigir atualização.

**Interfaces:**
- Extend `BridgeBatchClient` com `resolveSupplier(taxId: string, signal?: AbortSignal): Promise<{ supplierId: string | null }>`.
- `ParsedNfe` bem-sucedido recebe `supplierRuleId`; falha da identificação nunca transforma sucesso em erro.

- [ ] **Step 1: Escrever testes RED do lote**

No fixture de `BatchController`, incluir `resolveSupplier: vi.fn()` e implementar:

```ts
it('attaches supplier id after parsing a successful xml', async () => {
  bridge.resolveSupplier.mockResolvedValue({ supplierId: 'souza-cruz' });
  await controller.start();

  expect(bridge.resolveSupplier).toHaveBeenCalledWith('12345678000195', expect.any(AbortSignal));
  expect(lastRenderedItems[0]?.status).toBe('success');
  expect(lastRenderedItems[0]?.parsed?.supplierRuleId).toBe('souza-cruz');
});

it('keeps the invoice successful when supplier resolution fails', async () => {
  bridge.resolveSupplier.mockRejectedValue(new Error('local bridge failure'));
  await controller.start();

  expect(lastRenderedItems[0]?.status).toBe('success');
  expect(lastRenderedItems[0]?.parsed?.supplierRuleId).toBeNull();
});
```

O `parseXml` do fixture precisa retornar `issuer.taxId: '12345678000195'`. Manter os testes existentes de processamento serial, Portal, cancelamento, ZIP e print.

- [ ] **Step 2: Confirmar RED**

```bash
npm run test:web -- --run apps/web/tests/batch-controller.test.ts
```

Expected: FAIL porque `BridgeBatchClient` ainda não resolve fornecedor.

- [ ] **Step 3: Tornar `completeItem` assíncrono e fail-soft**

```ts
async function completeItem(
  item: MutableBatchItem,
  xml: string,
  source: BatchSource,
  signal?: AbortSignal,
): Promise<void> {
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

Trocar os dois caminhos de sucesso para `await completeItem(item, xml, source, signal)`.

- [ ] **Step 4: Integrar o fluxo unitário em `main.ts`**

Adicionar helper local, sem novo controller:

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

Usar `await withSupplierRule(parseNfeXml(...), signal)` nos caminhos de XML vindos tanto da SEFAZ quanto do Portal, antes de guardar/exibir o `ParsedNfe`. Não alterar decisões de fallback, chamadas à SEFAZ, Portal ou retry.

- [ ] **Step 5: Rodar testes focados, suíte web e lint**

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

### Task 6: Documentação, privacidade e verificação final

**Files:**
- Modify: `docs/architecture/supplier-rules.md`
- Modify: `README.md`

**Interfaces:**
- Exemplo documentado deve ser sintético e não operacional:

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

- [ ] **Step 1: Atualizar `docs/architecture/supplier-rules.md`**

Documentar explicitamente: path local, schema v1, múltiplos `taxIds` por fornecedor, normalização, suporte a CNPJ alfanumérico, precedência por id, fallback temporário por `xNome`, comportamento fail-soft, política de logs, cópia manual do mesmo JSON entre PCs e proibição de publicar os ids reais.

- [ ] **Step 2: Atualizar README operacional**

Adicionar uma seção curta “Regras locais de fornecedor” com `%LocalAppData%\NfeAgendamentoBridge\supplier-rules.json` e link para `docs/architecture/supplier-rules.md`.

- [ ] **Step 3: Rodar todos os gates locais**

```bash
npm run format:check:web
npm run lint:web
npm run test:web
npm run build:web
dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
dotnet build apps/bridge/src/NfeAgendamento.Bridge/NfeAgendamento.Bridge.csproj -c Release --no-restore
```

Expected: todos PASS.

- [ ] **Step 4: Auditar privacidade do diff**

Executar:

```bash
git diff --check
git diff --stat
git diff -- apps/bridge/src apps/web/src docs README.md
```

Na revisão manual, confirmar simultaneamente:

1. nenhum CNPJ/CPF real fornecido pelo operador aparece no diff;
2. nenhuma nova chamada envia `issuer.taxId` para Worker/Cloudflare;
3. a única nova transmissão do documento é para `BRIDGE_BASE_URL` em loopback;
4. resposta HTTP contém apenas `supplierId`;
5. nenhuma linha nova de logging contém taxId.

- [ ] **Step 5: Commit da documentação**

```bash
git add docs/architecture/supplier-rules.md README.md
git commit -m "docs: document local supplier identity rules"
```

- [ ] **Step 6: Abrir PR de implementação e aguardar CI completo**

O PR deve exigir os jobs atuais `web`, `danfe-print`, `bridge`, `fiscal-compatibility` e `windows-package`, além de CodeQL quando disparado. Não fazer merge com job vermelho.

- [ ] **Step 7: Fazer validação física fora do GitHub quando os ids reais estiverem disponíveis**

Criar `%LocalAppData%\NfeAgendamentoBridge\supplier-rules.json` na máquina de teste com os ids reais sem copiá-los para commit, PR, issue ou log. Validar uma NF real de cada fornecedor e registrar no GitHub somente o resultado, nunca o documento:

- Souza Cruz continua mostrando quantidade operacional convertida corretamente;
- Fernando Klein continua mostrando os códigos internos corretos;
- Dionisio continua mostrando os códigos internos corretos;
- o XML baixado permanece o XML fiscal recebido, sem modificação;
- fornecedor não cadastrado não recebe transformação indevida;
- ao renomear temporariamente o JSON, o fallback por `xNome` mantém o comportamento atual.

---

## Self-Review Checklist

- **Spec coverage:** configuração local, CNPJ/CPF primário, CNPJ alfanumérico, fallback por nome, privacidade, fail-soft, regras visuais existentes, nomenclatura genérica, testes, docs e validação física estão mapeados para tasks.
- **Placeholder scan:** nenhum `TBD`, `TODO`, “implementar depois” ou corpo de teste vazio; valores reais não são necessários para CI e ficam deliberadamente fora do repositório.
- **Type consistency:** `SupplierResolution.supplierId`, `ParsedNfe.supplierRuleId`, `resolveSupplierRuleById`, `resolveSupplierRuleForPresentation` e `BridgeClient.resolveSupplier` mantêm o mesmo nome e significado em todas as tasks.
- **Scope check:** não inclui remoção do fallback por `xNome`, mudança de layout do DANFE, mudança fiscal, Cloudflare, D1, hash/HMAC ou nova arquitetura de controllers.
