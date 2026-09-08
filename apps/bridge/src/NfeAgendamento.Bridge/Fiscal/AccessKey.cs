namespace NfeAgendamento.Bridge.Fiscal;

public sealed record AccessKey
{
    private AccessKey(string value)
    {
        Value = value;
        UfAutor = value[..2];
    }

    public string Value { get; }

    public string UfAutor { get; }

    public static bool TryParse(string? value, out AccessKey? accessKey)
    {
        accessKey = null;

        if (value is null || value.Length != 44 || value.Any(character => character is < '0' or > '9'))
        {
            return false;
        }

        var sum = 0;
        var weight = 2;
        for (var index = 42; index >= 0; index--)
        {
            sum += (value[index] - '0') * weight;
            weight = weight == 9 ? 2 : weight + 1;
        }

        var checkDigit = 11 - (sum % 11);
        if (checkDigit >= 10)
        {
            checkDigit = 0;
        }

        if (value[43] - '0' != checkDigit)
        {
            return false;
        }

        accessKey = new AccessKey(value);
        return true;
    }

    public override string ToString() => Value;
}
