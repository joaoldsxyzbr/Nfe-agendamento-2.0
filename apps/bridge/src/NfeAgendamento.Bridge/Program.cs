using Microsoft.AspNetCore.Cors.Infrastructure;
using NfeAgendamento.Bridge;
using NfeAgendamento.Bridge.Certificates;
using NfeAgendamento.Bridge.Fiscal;
using NfeAgendamento.Bridge.Portal;
using NfeAgendamento.Bridge.Runtime;
using NfeAgendamento.Bridge.Security;

const string SingleInstanceName = "NfeAgendamento.Bridge";
if (!BridgeSingleInstance.TryAcquire(SingleInstanceName, out var singleInstance))
    return;

using var bridgeInstance = singleInstance!;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls(BridgeConstants.ListenUrl);

builder.Services.AddSingleton<CertificateService>();
builder.Services.AddSingleton<INfeDistributionTransport, SefazDistributionTransport>();
builder.Services.AddScoped<NfeLookupService>(services =>
{
    var transport = services.GetRequiredService<INfeDistributionTransport>();
    var certificates = services.GetRequiredService<CertificateService>();
    return new NfeLookupService(transport, certificates.GetSelectedCertificate);
});
builder.Services.AddSingleton<IPortalWindowLauncher, ProcessPortalWindowLauncher>();
builder.Services.AddSingleton<PortalFallbackService>(services =>
{
    var launcher = services.GetRequiredService<IPortalWindowLauncher>();
    var certificates = services.GetRequiredService<CertificateService>();
    return new PortalFallbackService(launcher, () => certificates.GetSelected()?.Thumbprint);
});
builder.Services.AddSingleton<LocalRequestGuard>(services =>
{
    var configuration = services.GetRequiredService<IConfiguration>();
    var allowedOrigins = configuration
        .GetSection("Bridge:AllowedOrigins")
        .Get<string[]>() ?? [];

    return new LocalRequestGuard(allowedOrigins);
});

builder.Services.AddCors();
builder.Services
    .AddOptions<CorsOptions>()
    .Configure<IConfiguration>((options, configuration) =>
    {
        var allowedOrigins = configuration
            .GetSection("Bridge:AllowedOrigins")
            .Get<string[]>() ?? [];

        options.AddPolicy("BridgeWeb", policy =>
        {
            if (allowedOrigins.Length > 0)
            {
                policy.WithOrigins(allowedOrigins);
            }

            policy
                .WithMethods("GET", "POST", "OPTIONS")
                .WithHeaders("Accept", "Content-Type", "X-Nfe-Bridge")
                .SetPreflightMaxAge(TimeSpan.FromMinutes(10));
        });
    });

var app = builder.Build();

app.UseCors("BridgeWeb");
app.Use(async (context, next) =>
{
    if (!context.Request.Path.StartsWithSegments(BridgeConstants.ApiPrefix))
    {
        await next();
        return;
    }

    var guard = context.RequestServices.GetRequiredService<LocalRequestGuard>();
    if (!guard.IsAllowedHost(context.Request.Host.Value))
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return;
    }

    if (!HttpMethods.IsOptions(context.Request.Method) &&
        !guard.IsAllowedOrigin(context.Request.Headers.Origin.ToString()))
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return;
    }

    await next();
});

var api = app.MapGroup(BridgeConstants.ApiPrefix);

api.MapGet("/health", (
    CertificateService certificates,
    IPortalWindowLauncher portalLauncher) => Results.Ok(new
{
    version = typeof(Program).Assembly.GetName().Version?.ToString() ?? "0.0.0",
    status = "ok",
    webView2Available = portalLauncher.IsAvailable,
    certificateSelected = certificates.GetSelected() is not null,
}));

api.MapGet("/certificates", (CertificateService certificates) => Results.Ok(new
{
    certificates = certificates.ListUsable(),
    selectedThumbprint = certificates.GetSelected()?.Thumbprint,
}));

api.MapPost("/certificate/select", async (
    CertificateSelectRequest request,
    CertificateService certificates,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Thumbprint))
    {
        return Results.BadRequest(new { error = "thumbprint_required" });
    }

    try
    {
        await certificates.SelectAsync(request.Thumbprint, cancellationToken);
        return Results.NoContent();
    }
    catch (InvalidOperationException exception)
    {
        return Results.BadRequest(new
        {
            error = "certificate_unavailable",
            message = exception.Message,
        });
    }
});

api.MapPost("/nfe/lookup", async (
    NfeLookupRequest request,
    NfeLookupService lookup,
    CancellationToken cancellationToken) =>
{
    if (!AccessKey.TryParse(request.AccessKey, out _))
    {
        return Results.BadRequest(new
        {
            error = "invalid_access_key",
            message = "Informe uma chave NF-e válida com 44 dígitos e dígito verificador correto.",
        });
    }

    var result = await lookup.LookupAsync(request.AccessKey, cancellationToken);
    return Results.Ok(result);
});

api.MapPost("/portal/start", async (
    PortalStartRequest request,
    PortalFallbackService portal,
    CancellationToken cancellationToken) =>
{
    if (!AccessKey.TryParse(request.AccessKey, out _))
    {
        return Results.BadRequest(new
        {
            error = "invalid_access_key",
            message = "Informe uma chave NF-e válida com 44 dígitos e dígito verificador correto.",
        });
    }

    try
    {
        var operationId = await portal.StartAsync(request.AccessKey, cancellationToken);
        return Results.Accepted(
            $"{BridgeConstants.ApiPrefix}/portal/status/{operationId}",
            new { operationId });
    }
    catch (InvalidOperationException exception)
    {
        return Results.Conflict(new
        {
            error = "portal_unavailable",
            message = exception.Message,
        });
    }
});

api.MapGet("/portal/status/{operationId}", (
    string operationId,
    PortalFallbackService portal) =>
{
    var status = portal.GetStatus(operationId);
    return status is null ? Results.NotFound() : Results.Ok(status);
});

app.Run();

public sealed record CertificateSelectRequest(string Thumbprint);
public sealed record NfeLookupRequest(string AccessKey);
public sealed record PortalStartRequest(string AccessKey);

public partial class Program;
