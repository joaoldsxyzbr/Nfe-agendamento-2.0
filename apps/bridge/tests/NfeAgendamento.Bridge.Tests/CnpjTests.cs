using NfeAgendamento.Bridge.Fiscal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class CnpjTests
{
    [Theory]
    [InlineData("12345678000195", "12345678000195")]
    [InlineData("12ABC34501DE35", "12ABC34501DE35")]
    [InlineData("12abc34501de35", "12ABC34501DE35")]
    [InlineData("PC3D315K000193", "PC3D315K000193")]
    public void Valid_numeric_and_alphanumeric_cnpj_are_normalized(string value, string expected)
    {
        Assert.True(Cnpj.TryNormalize(value, out var normalized));
        Assert.Equal(expected, normalized);
    }

    [Theory]
    [InlineData("")]
    [InlineData("12345678000194")]
    [InlineData("12ABC34501DE34")]
    [InlineData("12ABC34501DE3X")]
    [InlineData("Ç2ABC34501DE35")]
    public void Invalid_cnpj_are_rejected(string value)
    {
        Assert.False(Cnpj.TryNormalize(value, out var normalized));
        Assert.Equal(string.Empty, normalized);
    }
}
