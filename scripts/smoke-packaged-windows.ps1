$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$executable = Join-Path $repositoryRoot 'artifacts/desktop/win-unpacked/CodexContextBridge.exe'
$nativeHostExecutable = Join-Path $repositoryRoot 'artifacts/desktop/win-unpacked/resources/CodexContextBridgeNativeHost.exe'
$profileRoot = Join-Path $env:TEMP "context-bridge-smoke-$([guid]::NewGuid().ToString('N'))"
$appDataRoot = Join-Path $profileRoot 'appdata'
$capabilityPath = Join-Path $appDataRoot 'Codex Context Bridge/native-transport-capability'
$startupErrorPath = Join-Path $profileRoot 'desktop-stderr.log'
New-Item -ItemType Directory -Force -Path $profileRoot | Out-Null
New-Item -ItemType Directory -Force -Path $appDataRoot | Out-Null

function Stop-ProcessTree([int]$ProcessId) {
  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId"
  foreach ($child in $children) {
    Stop-ProcessTree -ProcessId $child.ProcessId
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

$previousAppData = $env:APPDATA
$previousBridgeAppData = $env:CODEX_CONTEXT_BRIDGE_APP_DATA
try {
  $env:APPDATA = $appDataRoot
  $env:CODEX_CONTEXT_BRIDGE_APP_DATA = $appDataRoot
  $process = Start-Process -FilePath $executable -ArgumentList "--user-data-dir=$profileRoot" -WindowStyle Hidden -RedirectStandardError $startupErrorPath -PassThru
} finally {
  $env:APPDATA = $previousAppData
  $env:CODEX_CONTEXT_BRIDGE_APP_DATA = $previousBridgeAppData
}
try {
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 500
    $process.Refresh()
    if ($process.HasExited -or (Test-Path -LiteralPath $capabilityPath)) { break }
  }
  if ($process.HasExited) {
    $startupError = if (Test-Path -LiteralPath $startupErrorPath) { Get-Content -LiteralPath $startupErrorPath -Raw } else { '' }
    throw "Packaged app exited during smoke with code $($process.ExitCode). $startupError"
  }
  if (!(Test-Path -LiteralPath $capabilityPath)) {
    $startupError = if (Test-Path -LiteralPath $startupErrorPath) { Get-Content -LiteralPath $startupErrorPath -Raw } else { '' }
    throw "Packaged app process remained alive without initializing the desktop bridge. $startupError"
  }
  Write-Output "PACKAGED_SMOKE_PASS pid=$($process.Id)"
} finally {
  Stop-ProcessTree -ProcessId $process.Id
  Start-Sleep -Milliseconds 500
  if (Test-Path -LiteralPath $profileRoot) { Remove-Item -LiteralPath $profileRoot -Recurse -Force }
}

& node (Join-Path $repositoryRoot 'scripts/smoke-native-host.mjs') $nativeHostExecutable
if ($LASTEXITCODE -ne 0) { throw 'Packaged native host smoke failed.' }
