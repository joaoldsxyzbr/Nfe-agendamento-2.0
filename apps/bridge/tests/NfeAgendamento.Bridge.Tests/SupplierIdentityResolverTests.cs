using NfeAgendamento.Bridge.Suppliers;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class SupplierIdentityResolverTests
{
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
        var missing = new SupplierIdentityResolver(Path.Combine(
            Path.GetTempPath(),
            Guid.NewGuid().ToString("N"),
            "supplier-rules.json"));
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
            var directory = System.IO.Path.Combine(
                System.IO.Path.GetTempPath(),
                $"nfe-supplier-{Guid.NewGuid():N}");
            Directory.CreateDirectory(directory);
            var path = System.IO.Path.Combine(directory, "supplier-rules.json");
            File.WriteAllText(path, json);
            return new SupplierFileFixture(directory, path);
        }

        public void Dispose()
        {
            try
            {
                Directory.Delete(_directory, recursive: true);
            }
            catch (IOException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }
        }
    }
}
