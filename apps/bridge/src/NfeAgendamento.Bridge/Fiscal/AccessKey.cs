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
        if (string.IsNullOrWhiteSpace(value)) return false;

        var normalized = value.Trim().ToUpperInvariant();
        if (normalized.Length != 44) return false;

        for (var index = 0; index < normalized.Length; index++)
        {
            var character = normalized[index];
            var alphaNumericCnpjPosition = index is >= 6 and < 18;

            if (alphaNumericCnpjPosition)
            {
                if (!char.IsAsciiDigit(character) && character is not (>= 'A' and <= 'Z')) return false;
            }
            else if (!char.IsAsciiDigit(character))
            {
                return false;
            }
        }

        var sum = 0;
        var weight = 2;
        for (var index = 42; index >= 0; index--)
        {
            // NT Conjunta DFe 2025.001: caracteres alfanuméricos usam valor ASCII - 48.
            sum += (normalized[index] - '0') * weight;
            weight = weight == 9 ? 2 : weight + 1;
        }

        var checkDigit = 11 - (sum % 11);
        if (checkDigit >= 10)
        {
            checkDigit = 0;
        }

        if (normalized[43] - '0' != checkDigit)
        {
            return false;
        }

        accessKey = new AccessKey(normalized);
        return true;
    }

    public override string ToString() => Value;
}
