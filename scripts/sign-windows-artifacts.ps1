[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0, ValueFromRemainingArguments = $true)]
    [ValidateNotNullOrEmpty()]
    [string[]]$Paths
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$pfxBase64 = $env:CODE_SIGNING_PFX_BASE64
$pfxPassword = $env:CODE_SIGNING_PFX_PASSWORD

if ([string]::IsNullOrWhiteSpace($pfxBase64) -and [string]::IsNullOrWhiteSpace($pfxPassword)) {
    Write-Host 'Authenticode não configurado; artifacts permanecerão sem assinatura.'
    exit 0
}

if ([string]::IsNullOrWhiteSpace($pfxBase64) -or [string]::IsNullOrWhiteSpace($pfxPassword)) {
    throw 'Configuração Authenticode incompleta: defina CODE_SIGNING_PFX_BASE64 e CODE_SIGNING_PFX_PASSWORD juntos.'
}

$signToolRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$signTool = Get-ChildItem -Path $signToolRoot -Filter 'signtool.exe' -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
    Sort-Object -Property FullName -Descending |
    Select-Object -First 1

if ($null -eq $signTool) {
    throw 'SignTool x64 não encontrado no Windows runner.'
}

$pfxPath = Join-Path $env:RUNNER_TEMP "nfe-code-signing-$([Guid]::NewGuid().ToString('N')).pfx"
$importedCertificates = @()

try {
    try {
        $pfxBytes = [Convert]::FromBase64String($pfxBase64)
    }
    catch {
        throw 'CODE_SIGNING_PFX_BASE64 não contém um PFX válido em Base64.'
    }

    [IO.File]::WriteAllBytes($pfxPath, $pfxBytes)
    $securePassword = ConvertTo-SecureString $pfxPassword -AsPlainText -Force
    $importedCertificates = @(Import-PfxCertificate `
        -FilePath $pfxPath `
        -CertStoreLocation 'Cert:\CurrentUser\My' `
        -Password $securePassword `
        -Exportable:$false)

    $codeSigningOid = '1.3.6.1.5.5.7.3.3'
    $signingCertificate = $importedCertificates |
        Where-Object {
            $_.HasPrivateKey -and
            ($_.EnhancedKeyUsageList.ObjectId.Value -contains $codeSigningOid)
        } |
        Select-Object -First 1

    if ($null -eq $signingCertificate) {
        throw 'O PFX não contém certificado com chave privada e EKU de Code Signing.'
    }

    foreach ($path in $Paths) {
        if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Artifact para assinatura não encontrado: $path"
        }

        & $signTool.FullName sign `
            /fd SHA256 `
            /tr 'http://timestamp.digicert.com' `
            /td SHA256 `
            /sha1 $signingCertificate.Thumbprint `
            /s My `
            $path
        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao assinar $path (SignTool exit code $LASTEXITCODE)."
        }

        & $signTool.FullName verify /pa $path
        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao verificar assinatura Authenticode de $path."
        }
    }
}
finally {
    foreach ($certificate in $importedCertificates) {
        $certificatePath = "Cert:\CurrentUser\My\$($certificate.Thumbprint)"
        if (Test-Path -LiteralPath $certificatePath) {
            Remove-Item -LiteralPath $certificatePath -Force -ErrorAction SilentlyContinue
        }
    }

    if (Test-Path -LiteralPath $pfxPath) {
        Remove-Item -LiteralPath $pfxPath -Force -ErrorAction SilentlyContinue
    }
}
