#define MyAppName "NFe Agendamento Bridge"
#define MyAppVersion "0.0.3"
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
OutputBaseFilename=NFeAgendamentoBridge-Setup-v0.0.3
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
Name: "{group}\NFe Agendamento Bridge"; Filename: "{app}\NfeAgendamento.Bridge.exe"; WorkingDir: "{app}"; IconFilename: "{app}\NfeAgendamento.Bridge.exe"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "NFe Agendamento Bridge"; ValueData: """{app}\NfeAgendamento.Bridge.exe"""; Flags: uninsdeletevalue

[Run]
Filename: "{app}\NfeAgendamento.Bridge.exe"; Description: "Iniciar NFe Agendamento Bridge"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent
