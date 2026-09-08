#!/usr/bin/env bash
set -euo pipefail

constants="apps/bridge/src/NfeAgendamento.Bridge/BridgeConstants.cs"
project="apps/bridge/src/NfeAgendamento.Bridge/NfeAgendamento.Bridge.csproj"
program="apps/bridge/src/NfeAgendamento.Bridge/Program.cs"

[[ -f "$constants" ]] || { echo "BridgeConstants.cs ausente"; exit 1; }
[[ -f "$project" ]] || { echo "NfeAgendamento.Bridge.csproj ausente"; exit 1; }
[[ -f "$program" ]] || { echo "Program.cs ausente"; exit 1; }

grep -Fq 'http://127.0.0.1:17345' "$constants" || { echo "Bridge não está fixado no loopback esperado"; exit 1; }
grep -Fq '/api/v1' "$constants" || { echo "API do Bridge não está versionada"; exit 1; }

echo "Bridge bootstrap contract OK"
