using Microsoft.AspNetCore.Cors.Infrastructure;
using NfeAgendamento.Bridge;
using NfeAgendamento.Bridge.Security;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls(BridgeConstants.ListenUrl);

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

api.MapGet("/health", () => Results.Ok(new
{
    version = typeof(Program).Assembly.GetName().Version?.ToString() ?? "0.0.0",
    status = "ok",
    webView2Available = false,
    certificateSelected = false,
}));

app.Run();

public partial class Program;
