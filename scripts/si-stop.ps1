# SI Genie Consultant - arret propre des services reseau
# Arrete les processus qui ecoutent sur 3001 et 4173.

$ErrorActionPreference = "SilentlyContinue"

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

function Stop-PortProcess {
  param([int]$Port)
  $pids = Get-PortPids -Port $Port
  if (-not $pids -or $pids.Count -eq 0) {
    Write-Host "[SI] Aucun processus en ecoute sur $Port."
    return
  }

  foreach ($procId in $pids) {
    try {
      $proc = Get-Process -Id $procId
      Stop-Process -Id $procId -Force
      Write-Host "[SI] Arret PID $procId ($($proc.ProcessName)) sur port $Port."
    } catch {
      Write-Host "[SI] Impossible d'arreter PID $procId sur port $Port."
    }
  }
}

Stop-PortProcess -Port 4173
Stop-PortProcess -Port 3001

Write-Host "[SI] Arret termine."
