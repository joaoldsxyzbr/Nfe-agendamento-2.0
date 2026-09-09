#ifndef MyAppVersion
  #error MyAppVersion must be defined, for example /DMyAppVersion=0.0.6
#endif

#define MyAppName "NFe Agendamento Bridge"
#define MyAppExeName "NfeAgendamento.App.exe"

[Setup]
AppId={{F59CE264-8C45-4E88-ABF2-2296D49A847C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=NFe Agendamento
DefaultDirName={localappdata}\Programs\NFe Agendamento Bridge
DefaultGroupName=NFe Agendamento
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\..\..\artifacts\installer
OutputBaseFilename=NFeAgendamentoBridge-Setup-v{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#MyAppExeName}
SetupIconFile=..\assets\nfe-agendamento-bridge.ico

[Files]
Source: "..\..\..\artifacts\NfeAgendamentoBridge\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\NFe Agendamento"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\NFe Agendamento"; Filename: "{app}\{#MyAppExeName}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Iniciar NFe Agendamento"; Flags: nowait postinstall skipifsilent
