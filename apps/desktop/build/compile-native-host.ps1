$ErrorActionPreference = 'Stop'

$desktopRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $PSScriptRoot 'native-host-launcher.cs'
$outputDirectory = Join-Path $desktopRoot 'dist/native-host-launcher'
$output = Join-Path $outputDirectory 'CodexContextBridgeNativeHost.exe'
$compilerCandidates = @(
  'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe',
  'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (!$compiler) { throw 'A Windows .NET Framework C# compiler is required for the native host launcher.' }

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
& $compiler /nologo /target:exe /optimize+ /out:$output $source
if ($LASTEXITCODE -ne 0) { throw 'Native host launcher compilation failed.' }
