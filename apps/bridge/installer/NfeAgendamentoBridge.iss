#ifndef MyAppVersion
  #error MyAppVersion must be defined on the ISCC command line
#endif

#define MyAppName "NFe Agendamento Bridge"
#define MyAppExeName "NfeAgendamento.App.exe"

[Setup]
AppId={{8C8FBD7D-26DB-46C0-A8AB-7F118F42A1B8}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={localappdata}\NFe Agendamento Bridge
DefaultGroupName=NFe Agendamento Bridge
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
OutputDir=..\..\..\artifacts\installer
OutputBaseFilename=NFeAgendamentoBridge-Setup-v{#MyAppVersion}
SetupIconFile=..\assets\nfe-agendamento-bridge.ico
UninstallDisplayIcon={app}\NfeAgendamento.App.exe
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern

[Files]
Source: "..\..\..\artifacts\NfeAgendamentoBridge\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\NFe Agendamento"; Filename: "{app}\NfeAgendamento.App.exe"; WorkingDir: "{app}"; IconFilename: "{app}\NfeAgendamento.App.exe"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "NFe Agendamento Bridge"; ValueData: """{app}\NfeAgendamento.App.exe"""; Flags: uninsdeletevalue

[Run]
Filename: "{app}\NfeAgendamento.App.exe"; Description: "Iniciar NFe Agendamento"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent
