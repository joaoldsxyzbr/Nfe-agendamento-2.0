using NfeAgendamento.Bridge.Fiscal;
using Unimake.Business.DFe.Utility;
using Unimake.Business.DFe.Xml.NFe;

var cases = new[]
{
    new { Key = "41260612345678000195550010000001231876543214", Expected = true },
    new { Key = "41260612ABC34501DE35550010000001231876543214", Expected = true },
    new { Key = "41260612ABC34501DE35550010000001231876543215", Expected = false },
};

foreach (var testCase in cases)
{
    var ours = AccessKey.TryParse(testCase.Key, out _);
    var unimake = IsValidInUnimake(testCase.Key);

    if (ours != testCase.Expected)
    {
        throw new InvalidOperationException($"Validador local divergiu do esperado para {testCase.Key}.");
    }

    if (unimake != testCase.Expected)
    {
        throw new InvalidOperationException($"Unimake.DFe divergiu do esperado para {testCase.Key}.");
    }

    if (ours != unimake)
    {
        throw new InvalidOperationException($"Paridade de chave falhou para {testCase.Key}.");
    }
}

if (XMLUtility.TipoCNPJ("12ABC34501DE35") != "A")
{
    throw new InvalidOperationException("Unimake.DFe não reconheceu o CNPJ alfanumérico esperado.");
}

var alphaWithoutDv = "41260612ABC34501DE3555001000000123187654321";
if (XMLUtility.CalcularDVChave(alphaWithoutDv) != 4)
{
    throw new InvalidOperationException("Unimake.DFe calculou DV inesperado para a chave alfanumérica de referência.");
}

if (typeof(IBSCBS) is null || typeof(IBSCBSTot) is null)
{
    throw new InvalidOperationException("Tipos RTC IBS/CBS esperados não estão disponíveis no pacote avaliado.");
}

ValidateRtcFixtureRoundTrip();

Console.WriteLine("Unimake.DFe POC: paridade de chave alfanumérica e round-trip RTC validados.");
return;

static bool IsValidInUnimake(string accessKey)
{
    try
    {
        XMLUtility.ChecarChaveDFe(accessKey);
        return true;
    }
    catch
    {
        return false;
    }
}

static void ValidateRtcFixtureRoundTrip()
{
    var fixturePath = Path.Combine(AppContext.BaseDirectory, "Fixtures", "nfe-rtc.xml");
    if (!File.Exists(fixturePath))
    {
        throw new InvalidOperationException("Fixture RTC não foi copiada para o POC Unimake.DFe.");
    }

    var sourceXml = File.ReadAllText(fixturePath);
    var parsed = new NfeProc().LoadFromXML(sourceXml)
        ?? throw new InvalidOperationException("Unimake.DFe não desserializou a fixture RTC.");
    var roundTripXml = parsed.GerarXML().OuterXml;

    var requiredTags = new[]
    {
        "<IBSCBS>",
        "<gIBSCBS>",
        "<IBSCBSTot>",
        "<ISTot>",
        "<vNFTot>",
    };

    foreach (var tag in requiredTags)
    {
        if (!roundTripXml.Contains(tag, StringComparison.Ordinal))
        {
            throw new InvalidOperationException($"Round-trip RTC do Unimake.DFe perdeu a tag {tag}.");
        }
    }

    if (!roundTripXml.Contains("<cClassTrib>000001</cClassTrib>", StringComparison.Ordinal))
    {
        throw new InvalidOperationException("Round-trip RTC do Unimake.DFe perdeu a classificação tributária esperada.");
    }
}
