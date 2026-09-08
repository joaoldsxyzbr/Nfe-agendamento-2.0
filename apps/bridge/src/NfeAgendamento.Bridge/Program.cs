using NfeAgendamento.Bridge;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls(BridgeConstants.ListenUrl);

var app = builder.Build();
var api = app.MapGroup(BridgeConstants.ApiPrefix);

api.MapGet("/health", () => Results.Ok(new
{
    version = typeof(Program).Assembly.GetName().Version?.ToString() ?? "0.0.0",
    status = "ok",
    webView2Available = false,
    certificateSelected = false,
}));

app.Run();

public partial class Program;
