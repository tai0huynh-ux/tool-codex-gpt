$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$installer = Join-Path $repositoryRoot 'artifacts/desktop/Codex-Context-Bridge-0.1.0-x64-setup.exe'
$hostName = 'com.codex_context_bridge.host'
$registryPaths = @(
  "Software\Google\Chrome\NativeMessagingHosts\$hostName",
  "Software\Microsoft\Edge\NativeMessagingHosts\$hostName",
  "Software\Chromium\NativeMessagingHosts\$hostName"
)
$registryViews = @(
  [Microsoft.Win32.RegistryView]::Registry64,
  [Microsoft.Win32.RegistryView]::Registry32
)
$installRoot = Join-Path $env:TEMP "ccb-install-smoke-$([guid]::NewGuid().ToString('N'))"

function Get-RegistryValue([Microsoft.Win32.RegistryView]$View, [string]$Path) {
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, $View)
  try {
    $key = $base.OpenSubKey($Path)
    if (!$key) { return $null }
    try { return $key.GetValue('') } finally { $key.Dispose() }
  } finally {
    $base.Dispose()
  }
}

function Assert-NoExistingInstallation {
  foreach ($view in $registryViews) {
    foreach ($registryPath in $registryPaths) {
      if (Get-RegistryValue $view $registryPath) {
        throw "Existing Native Messaging registration found in $view at $registryPath."
      }
    }
  }

  $uninstallPath = 'Software\Microsoft\Windows\CurrentVersion\Uninstall'
  foreach ($view in $registryViews) {
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, $view)
    try {
      $uninstall = $base.OpenSubKey($uninstallPath)
      if (!$uninstall) { continue }
      try {
        foreach ($name in $uninstall.GetSubKeyNames()) {
          $entry = $uninstall.OpenSubKey($name)
          if (!$entry) { continue }
          try {
            if ($entry.GetValue('DisplayName') -eq 'Codex Context Bridge') {
              throw 'An existing Codex Context Bridge installation is present; installed smoke aborted.'
            }
          } finally { $entry.Dispose() }
        }
      } finally { $uninstall.Dispose() }
    } finally { $base.Dispose() }
  }
}

if (!(Test-Path -LiteralPath $installer)) { throw 'Windows installer artifact is missing.' }
Assert-NoExistingInstallation

$installed = $false
try {
  $install = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$installRoot") -WindowStyle Hidden -Wait -PassThru
  if ($install.ExitCode -ne 0) { throw "Silent installer failed with exit code $($install.ExitCode)." }
  $installed = $true

  $manifestPath = Join-Path $installRoot "native-messaging/$hostName.json"
  $hostExecutable = Join-Path $installRoot 'resources/CodexContextBridgeNativeHost.exe'
  if (!(Test-Path -LiteralPath $manifestPath)) { throw 'Installed native-host manifest is missing.' }
  if (!(Test-Path -LiteralPath $hostExecutable)) { throw 'Installed native-host executable is missing.' }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ($manifest.name -ne $hostName) { throw 'Installed native-host manifest name is invalid.' }
  $manifestHostExecutable = [System.IO.Path]::GetFullPath([string]$manifest.path)
  $expectedHostExecutable = [System.IO.Path]::GetFullPath($hostExecutable)
  if ($manifestHostExecutable -ne $expectedHostExecutable) {
    throw 'Installed native-host path is invalid.'
  }
  if ($manifest.allowed_origins.Count -ne 1 -or $manifest.allowed_origins[0] -ne 'chrome-extension://ccchffnkidpolmnnlonbnakjjmphfdjp/') {
    throw 'Installed native-host origin is not exact.'
  }

  foreach ($view in $registryViews) {
    foreach ($registryPath in $registryPaths) {
      if ((Get-RegistryValue $view $registryPath) -ne $manifestPath) {
        throw "Native Messaging registration mismatch in $view at $registryPath."
      }
    }
  }

  & node (Join-Path $repositoryRoot 'scripts/smoke-native-host.mjs') $hostExecutable
  if ($LASTEXITCODE -ne 0) { throw 'First installed native-host smoke failed.' }
  & node (Join-Path $repositoryRoot 'scripts/smoke-native-host.mjs') $hostExecutable
  if ($LASTEXITCODE -ne 0) { throw 'Restarted installed native-host smoke failed.' }
} finally {
  if ($installed) {
    $uninstaller = Get-ChildItem -LiteralPath $installRoot -Filter 'Uninstall*.exe' -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($uninstaller) {
      $uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
      if ($uninstall.ExitCode -ne 0) { throw "Silent uninstall failed with exit code $($uninstall.ExitCode)." }
    }
  }
}

foreach ($view in $registryViews) {
  foreach ($registryPath in $registryPaths) {
    if (Get-RegistryValue $view $registryPath) {
      throw "Native Messaging registration remained after uninstall in $view at $registryPath."
    }
  }
}
if (Test-Path -LiteralPath $installRoot) {
  if ((Get-ChildItem -LiteralPath $installRoot -Force | Measure-Object).Count -ne 0) {
    throw 'Installed payload remained after uninstall.'
  }
  [System.IO.Directory]::Delete($installRoot)
}
if (Test-Path -LiteralPath $installRoot) { throw 'Temporary smoke directory cleanup failed.' }
Write-Output 'INSTALLED_NATIVE_HOST_SMOKE_PASS'
