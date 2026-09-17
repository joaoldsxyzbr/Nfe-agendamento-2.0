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
            var config = JsonSerializer.Deserialize<SupplierRulesConfig>(
                File.ReadAllText(_path),
                JsonOptions);
            if (config is null || config.Version != 1 || config.Suppliers is null) return null;

            var index = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var supplier in config.Suppliers)
            {
                var id = supplier.Id?.Trim();
                if (string.IsNullOrEmpty(id) || supplier.TaxIds is null || supplier.TaxIds.Length == 0)
                {
                    return null;
                }

                foreach (var rawTaxId in supplier.TaxIds)
                {
                    var key = NormalizeTaxId(rawTaxId);
                    if (key is null) return null;
                    if (index.TryGetValue(key, out var existing) &&
                        !string.Equals(existing, id, StringComparison.Ordinal))
                    {
                        return null;
                    }

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
            .Where(character =>
                (character >= 'A' && character <= 'Z') ||
                (character >= '0' && character <= '9'))
            .ToArray());

        if (normalized.Length == 11 && normalized.All(char.IsDigit)) return normalized;
        if (normalized.Length == 14 &&
            normalized[..12].All(character =>
                (character >= 'A' && character <= 'Z') || char.IsDigit(character)) &&
            normalized[12..].All(char.IsDigit))
        {
            return normalized;
        }

        return null;
    }
}

public sealed record SupplierRulesConfig(int Version, SupplierRuleConfig[]? Suppliers);
public sealed record SupplierRuleConfig(string? Id, string[]? TaxIds);
public sealed record SupplierResolveRequest(string? TaxId);
