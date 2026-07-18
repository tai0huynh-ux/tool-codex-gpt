$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$artifactRoot = Join-Path $repositoryRoot 'artifacts'
$extensionRoot = Join-Path $artifactRoot 'extension'
$extensionZip = Join-Path $extensionRoot 'codex-context-bridge-extension-0.1.0.zip'

New-Item -ItemType Directory -Force -Path $extensionRoot | Out-Null

Push-Location $repositoryRoot
try {
  & pnpm.cmd --filter '@codex-context-bridge/desktop' run dist:win
  if ($LASTEXITCODE -ne 0) { throw 'Desktop packaging failed.' }
  $unpackedRoot = Join-Path $artifactRoot 'desktop/win-unpacked'
  $nativeHostExecutable = Join-Path $unpackedRoot 'resources/CodexContextBridgeNativeHost.exe'
  $nativeHostManifestDirectory = Join-Path $unpackedRoot 'native-messaging'
  $nativeHostManifest = Join-Path $nativeHostManifestDirectory 'com.codex_context_bridge.host.json'
  New-Item -ItemType Directory -Force -Path $nativeHostManifestDirectory | Out-Null
  [ordered]@{
    name = 'com.codex_context_bridge.host'
    description = 'Codex Context Bridge native relay'
    path = $nativeHostExecutable
    type = 'stdio'
    allowed_origins = @('chrome-extension://ccchffnkidpolmnnlonbnakjjmphfdjp/')
  } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $nativeHostManifest -Encoding utf8
  & pnpm.cmd --filter '@codex-context-bridge/chatgpt-extension' run build
  if ($LASTEXITCODE -ne 0) { throw 'Extension build failed.' }

  Compress-Archive -Path (Join-Path $repositoryRoot 'apps/chatgpt-extension/dist/*') -DestinationPath $extensionZip -Force

  $installer = Join-Path $artifactRoot 'desktop/Codex-Context-Bridge-0.1.0-x64-setup.exe'
  $blockmap = "$installer.blockmap"
  $signature = Get-AuthenticodeSignature -LiteralPath $installer
  $resolvedArtifactRoot = (Resolve-Path -LiteralPath $artifactRoot).Path.TrimEnd('\')
  $files = @($installer, $blockmap, $extensionZip) | ForEach-Object {
    $item = Get-Item -LiteralPath $_
    $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_
    [ordered]@{
      path = $item.FullName.Substring($resolvedArtifactRoot.Length + 1).Replace('\', '/')
      bytes = $item.Length
      sha256 = $hash.Hash.ToLowerInvariant()
    }
  }
  $manifest = [ordered]@{
    product = 'Codex Context Bridge'
    version = '0.1.0'
    platform = 'win32-x64'
    signed = $signature.Status -eq 'Valid'
    signatureStatus = $signature.Status.ToString()
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    nativeMessaging = [ordered]@{
      hostName = 'com.codex_context_bridge.host'
      extensionOrigin = 'chrome-extension://ccchffnkidpolmnnlonbnakjjmphfdjp/'
      registeredBrowsers = @('Chrome', 'Edge', 'Chromium')
      permissionActive = $true
    }
    files = $files
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $artifactRoot 'release-manifest.json') -Encoding utf8
} finally {
  Pop-Location
}
