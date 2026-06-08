# SI Genie Consultant - demarrage automatique
# Lance backend (3001) + frontend preview (4173) si non demarres.

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$logsDir = Join-Path $root "logs"
if (-not (Test-Path $logsDir)) {
  New-Item -Path $logsDir -ItemType Directory | Out-Null
}

function Get-PortPids {
  param([int]$Port)
  $pids = @()
  try {
    $lines = netstat -ano | Select-String ":$Port"
    foreach ($line in $lines) {
      $txt = $line.ToString().Trim()
      if ($txt -match "LISTENING") {
        $parts = $txt -split "\s+"
        $procId = $parts[-1]
        if ($procId -match "^\d+$") { $pids += [int]$procId }
      }
    }
  } catch {}
  return ($pids | Select-Object -Unique)
}

function Test-PortListening {
  param([int]$Port)
  $pids = Get-PortPids -Port $Port
  return ($pids.Count -gt 0)
}

Write-Host "[SI] Verification des services..." -ForegroundColor Cyan

if (-not (Test-PortListening -Port 3001)) {
  Write-Host "[SI] Demarrage backend (api-proxy:3001)..." -ForegroundColor Yellow
  Start-Process powershell -WindowStyle Minimized -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    "Set-Location '$root\api-proxy'; npm start *> '$logsDir\backend.log'"
  ) | Out-Null
} else {
  Write-Host "[SI] Backend deja actif sur 3001." -ForegroundColor Green
}

Start-Sleep -Seconds 2

if (-not (Test-PortListening -Port 4173)) {
  Write-Host "[SI] Demarrage frontend preview (4173)..." -ForegroundColor Yellow
  Start-Process powershell -WindowStyle Minimized -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    "Set-Location '$root'; npm run preview -- --host --port 4173 *> '$logsDir\frontend.log'"
  ) | Out-Null
} else {
  Write-Host "[SI] Frontend deja actif sur 4173." -ForegroundColor Green
}

Write-Host "[SI] Demarrage termine." -ForegroundColor Cyan
