# SI Genie Consultant - installation des taches planifiees
# Cree:
# - SI-Genie-Start-0730 (demarrage quotidien 07:30)
# - SI-Genie-Stop-2000  (arret quotidien 20:00)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$startScript = Join-Path $root "scripts\si-start.ps1"
$stopScript  = Join-Path $root "scripts\si-stop.ps1"

if (-not (Test-Path $startScript)) { throw "Script introuvable: $startScript" }
if (-not (Test-Path $stopScript))  { throw "Script introuvable: $stopScript" }

$startCmd = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
$stopCmd  = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$stopScript`""

Write-Host "[SI] Creation/MAJ tache SI-Genie-Start-0730..."
schtasks /Create /TN "SI-Genie-Start-0730" /TR $startCmd /SC DAILY /ST 07:30 /RL HIGHEST /F | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Creation de SI-Genie-Start-0730 echouee. Relancer PowerShell en administrateur."
}

Write-Host "[SI] Creation/MAJ tache SI-Genie-Stop-2000..."
schtasks /Create /TN "SI-Genie-Stop-2000" /TR $stopCmd /SC DAILY /ST 20:00 /RL HIGHEST /F | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Creation de SI-Genie-Stop-2000 echouee. Relancer PowerShell en administrateur."
}

Write-Host "[SI] Taches planifiees installees."
Write-Host "     - SI-Genie-Start-0730"
Write-Host "     - SI-Genie-Stop-2000"
Write-Host ""
Write-Host "Commandes utiles:"
Write-Host "  schtasks /Run /TN `"SI-Genie-Start-0730`""
Write-Host "  schtasks /Run /TN `"SI-Genie-Stop-2000`""
Write-Host "  schtasks /Query /TN `"SI-Genie-Start-0730`" /V /FO LIST"
Write-Host "  schtasks /Query /TN `"SI-Genie-Stop-2000`" /V /FO LIST"
