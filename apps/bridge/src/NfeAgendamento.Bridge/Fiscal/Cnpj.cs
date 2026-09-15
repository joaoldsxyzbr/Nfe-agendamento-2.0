namespace NfeAgendamento.Bridge.Fiscal;

public static class Cnpj
{
    public static bool TryNormalize(string? value, out string normalized)
    {
        normalized = string.Empty;
        if (string.IsNullOrWhiteSpace(value)) return false;

        var candidate = value.Trim().ToUpperInvariant();
        if (candidate.Length != 14) return false;

        for (var index = 0; index < 12; index++)
        {
            if (!IsAsciiAlphaNumeric(candidate[index])) return false;
        }

        if (!char.IsAsciiDigit(candidate[12]) || !char.IsAsciiDigit(candidate[13])) return false;

        var firstDigit = CalculateDigit(candidate.AsSpan(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
        if (candidate[12] - '0' != firstDigit) return false;

        Span<char> firstThirteen = stackalloc char[13];
        candidate.AsSpan(0, 12).CopyTo(firstThirteen);
        firstThirteen[12] = (char)('0' + firstDigit);
        var secondDigit = CalculateDigit(firstThirteen, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
        if (candidate[13] - '0' != secondDigit) return false;

        normalized = candidate;
        return true;
    }

    private static int CalculateDigit(ReadOnlySpan<char> value, ReadOnlySpan<int> weights)
    {
        var sum = 0;
        for (var index = 0; index < value.Length; index++)
        {
            sum += (value[index] - '0') * weights[index];
        }

        var remainder = sum % 11;
        return remainder < 2 ? 0 : 11 - remainder;
    }

    private static bool IsAsciiAlphaNumeric(char character) =>
        char.IsAsciiDigit(character) || (character is >= 'A' and <= 'Z');
}
