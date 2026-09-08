#define MyAppName "NFe Agendamento Bridge"
#define MyAppVersion "0.0.2"
#define MyAppExeName "NfeAgendamento.Bridge.exe"

[Setup]
AppId={{8C8FBD7D-26DB-46C0-A8AB-7F118F42A1B8}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={localappdata}\NFe Agendamento Bridge
DefaultGroupName=NFe Agendamento Bridge
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
OutputDir=..\..\..\artifacts\installer
OutputBaseFilename=NFeAgendamentoBridge-Setup-v0.0.2
SetupIconFile=..\assets\nfe-agendamento-bridge.ico
UninstallDisplayIcon={app}\NfeAgendamento.Bridge.exe
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern

[Files]
Source: "..\..\..\artifacts\NfeAgendamentoBridge\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\NFe Agendamento Bridge"; Filename: "{app}\NfeAgendamento.Bridge.exe"; Parameters: "{code:GetBridgeArguments}"; WorkingDir: "{app}"; IconFilename: "{app}\NfeAgendamento.Bridge.exe"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "NFe Agendamento Bridge"; ValueData: """{app}\NfeAgendamento.Bridge.exe"" {code:GetBridgeArguments}"; Flags: uninsdeletevalue

[Run]
Filename: "{app}\NfeAgendamento.Bridge.exe"; Parameters: "{code:GetBridgeArguments}"; Description: "Iniciar NFe Agendamento Bridge"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent

[Code]
var
  SiteOriginPage: TInputQueryWizardPage;

function NormalizeSiteOrigin(Value: String): String;
begin
  Result := Trim(Value);
  while (Length(Result) > 0) and (Result[Length(Result)] = '/') do
    Delete(Result, Length(Result), 1);
end;

function IsValidHttpsOrigin(Value: String): Boolean;
var
  Rest: String;
begin
  Value := NormalizeSiteOrigin(Value);
  if Pos('https://', Lowercase(Value)) <> 1 then
  begin
    Result := False;
    Exit;
  end;

  Rest := Copy(Value, 9, Length(Value));
  Result :=
    (Length(Rest) > 0) and
    (Pos('/', Rest) = 0) and
    (Pos('?', Rest) = 0) and
    (Pos('#', Rest) = 0) and
    (Pos('@', Rest) = 0) and
    (Pos('"', Rest) = 0) and
    (Pos('\\', Rest) = 0) and
    (Pos(' ', Rest) = 0);
end;

procedure InitializeWizard;
var
  SiteOriginParam: String;
begin
  SiteOriginPage := CreateInputQueryPage(
    wpSelectDir,
    'Site do NFe Agendamento',
    'Autorizar o site no Bridge',
    'Cole somente a origem HTTPS exibida no navegador, sem caminho. Exemplo: https://seu-site.exemplo'
  );
  SiteOriginPage.Add('Origem HTTPS:', False);

  SiteOriginParam := Trim(ExpandConstant('{param:SITEORIGIN|}'));
  if Length(SiteOriginParam) > 0 then
    SiteOriginPage.Values[0] := SiteOriginParam
  else
    SiteOriginPage.Values[0] := 'https://';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = SiteOriginPage.ID then
  begin
    SiteOriginPage.Values[0] := NormalizeSiteOrigin(SiteOriginPage.Values[0]);
    if not IsValidHttpsOrigin(SiteOriginPage.Values[0]) then
    begin
      MsgBox(
        'Informe uma origem HTTPS válida, por exemplo https://nfe.exemplo.com, sem caminho, consulta ou fragmento.',
        mbError,
        MB_OK
      );
      Result := False;
    end;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  SiteOriginPage.Values[0] := NormalizeSiteOrigin(SiteOriginPage.Values[0]);
  if not IsValidHttpsOrigin(SiteOriginPage.Values[0]) then
    Result := 'A origem HTTPS do site é obrigatória para iniciar o Bridge com segurança.'
  else
    Result := '';
end;

function GetBridgeArguments(Param: String): String;
begin
  Result := '--Bridge:AllowedOrigins:0="' + NormalizeSiteOrigin(SiteOriginPage.Values[0]) + '"';
end;
