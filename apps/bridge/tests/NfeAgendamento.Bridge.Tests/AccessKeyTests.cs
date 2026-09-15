using NfeAgendamento.Bridge.Fiscal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class AccessKeyTests
{
    private const string ValidNumericKey = "42260812345678000123550010000012341000012342";
    private const string ValidAlphanumericKey = "41260612ABC34501DE35550010000001231876543214";
    private const string ValidNfceKey = "42260812345678000123650010000012341000012345";

    [Fact]
    public void Valid_numeric_key_is_parsed()
    {
        var parsed = AccessKey.TryParse(ValidNumericKey, out var accessKey);

        Assert.True(parsed);
        Assert.NotNull(accessKey);
        Assert.Equal(ValidNumericKey, accessKey.Value);
        Assert.Equal("42", accessKey.UfAutor);
    }

    [Fact]
    public void Valid_alphanumeric_key_is_parsed_and_normalized()
    {
        var parsed = AccessKey.TryParse(ValidAlphanumericKey.ToLowerInvariant(), out var accessKey);

        Assert.True(parsed);
        Assert.NotNull(accessKey);
        Assert.Equal(ValidAlphanumericKey, accessKey.Value);
        Assert.Equal("41", accessKey.UfAutor);
    }

    [Fact]
    public void Valid_nfce_model_65_key_is_rejected()
    {
        Assert.False(AccessKey.TryParse(ValidNfceKey, out var accessKey));
        Assert.Null(accessKey);
    }

    [Theory]
    [InlineData("")]
    [InlineData("4226081234567800012355001000001234100001234")]
    [InlineData("422608123456780001235500100000123410000123420")]
    [InlineData("4226081234567800012355001000001234100001234X")]
    [InlineData("42260812345678000123550010000012341000012343")]
    [InlineData("41260612ABC34501DE35550010000001231876543215")]
    [InlineData("41A60612ABC34501DE35550010000001231876543214")]
    public void Invalid_keys_are_rejected(string value)
    {
        Assert.False(AccessKey.TryParse(value, out var accessKey));
        Assert.Null(accessKey);
    }
}
