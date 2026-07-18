$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$executable = Join-Path $repositoryRoot 'artifacts/desktop/win-unpacked/CodexContextBridge.exe'
$profileRoot = Join-Path $env:TEMP "context-bridge-smoke-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Force -Path $profileRoot | Out-Null

$process = Start-Process -FilePath $executable -ArgumentList "--user-data-dir=$profileRoot" -WindowStyle Hidden -PassThru
try {
  Start-Sleep -Seconds 5
  $process.Refresh()
  if ($process.HasExited) {
    throw "Packaged app exited during smoke with code $($process.ExitCode)."
  }
  Write-Output "PACKAGED_SMOKE_PASS pid=$($process.Id)"
} finally {
  if (!$process.HasExited) { Stop-Process -Id $process.Id }
  if (Test-Path -LiteralPath $profileRoot) { Remove-Item -LiteralPath $profileRoot -Recurse -Force }
}
