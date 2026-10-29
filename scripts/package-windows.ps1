param(
  [string]$OutputDirectory = 'release\DiaDoServidor'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputPath = if ([System.IO.Path]::IsPathRooted($OutputDirectory)) {
  [System.IO.Path]::GetFullPath($OutputDirectory)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputDirectory))
}
$nodeCommand = Get-Command node.exe -ErrorAction Stop
$nodeVersionText = (& $nodeCommand.Source --version).TrimStart('v')
$nodeVersion = [version]$nodeVersionText
$supportedNode = ($nodeVersion.Major -eq 22 -and $nodeVersion -ge [version]'22.18.0') -or
  ($nodeVersion.Major -eq 24 -and $nodeVersion -ge [version]'24.12.0') -or
  ($nodeVersion.Major -gt 24)

if (-not [System.Environment]::Is64BitOperatingSystem) {
  throw 'O pacote atual é destinado ao Windows de 64 bits.'
}

if (-not $supportedNode) {
  throw "Use Node.js 22.18 ou superior da linha 22, ou 24.12 ou superior. Encontrado: v$nodeVersionText."
}

if (Test-Path $outputPath) {
  throw "A pasta de saída já existe; mova-a ou escolha outro caminho para evitar sobrescrever arquivos: $outputPath"
}

$dotnet = Get-Command dotnet.exe -ErrorAction Stop
$null = & $dotnet.Source --version
if ($LASTEXITCODE -ne 0) {
  throw 'Não foi possível executar o .NET SDK.'
}

function Invoke-CheckedCommand {
  param(
    [string]$Command,
    [string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "O comando falhou: $Command $($Arguments -join ' ')"
  }
}

Push-Location $repositoryRoot
try {
  Push-Location (Join-Path $repositoryRoot 'frontend')
  try {
    Invoke-CheckedCommand 'npm.cmd' @('run', 'build')
  }
  finally {
    Pop-Location
  }

  Push-Location (Join-Path $repositoryRoot 'server')
  try {
    Invoke-CheckedCommand 'npx.cmd' @('prisma', 'generate')
    Invoke-CheckedCommand 'npm.cmd' @('run', 'build')
  }
  finally {
    Pop-Location
  }

  New-Item -ItemType Directory -Path $outputPath | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $outputPath 'runtime') | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $outputPath 'server') | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $outputPath 'frontend') | Out-Null

  $nodeArchiveName = "node-v$nodeVersionText-win-x64.zip"
  $nodeDownload = "https://nodejs.org/dist/v$nodeVersionText"
  $temporaryRuntime = Join-Path ([System.IO.Path]::GetTempPath()) "dia-do-servidor-node-$([guid]::NewGuid())"
  New-Item -ItemType Directory -Path $temporaryRuntime | Out-Null
  try {
    $archivePath = Join-Path $temporaryRuntime $nodeArchiveName
    Invoke-WebRequest "$nodeDownload/$nodeArchiveName" -OutFile $archivePath
    $checksums = (Invoke-WebRequest "$nodeDownload/SHASUMS256.txt").Content
    $checksumLine = $checksums -split "`n" |
      Where-Object { $_ -match "\s\*?$([regex]::Escape($nodeArchiveName))\s*$" } |
      Select-Object -First 1
    if (-not $checksumLine) {
      throw "Não foi possível verificar o checksum do runtime $nodeArchiveName."
    }

    $expectedHash = ($checksumLine -split '\s+')[0]
    $actualHash = (Get-FileHash $archivePath -Algorithm SHA256).Hash
    if ($actualHash -ne $expectedHash) {
      throw "O checksum do runtime $nodeArchiveName não confere."
    }

    Expand-Archive -LiteralPath $archivePath -DestinationPath $temporaryRuntime
    $runtimeDirectory = Join-Path $temporaryRuntime "node-v$nodeVersionText-win-x64"
    Copy-Item (Join-Path $runtimeDirectory 'node.exe') (Join-Path $outputPath 'runtime\node.exe')
    Copy-Item (Join-Path $runtimeDirectory 'LICENSE') (Join-Path $outputPath 'runtime\LICENSE')
  }
  finally {
    Remove-Item -LiteralPath $temporaryRuntime -Recurse -Force
  }

  foreach ($directory in @('generated', 'node_modules', 'prisma', 'src')) {
    $targetDirectory = Join-Path $outputPath "server\$directory"
    New-Item -ItemType Directory -Path $targetDirectory | Out-Null
    Copy-Item `
      (Join-Path $repositoryRoot "server\$directory\*") `
      $targetDirectory `
      -Recurse `
      -Force
  }
  Copy-Item (Join-Path $repositoryRoot 'server\package.json') (Join-Path $outputPath 'server\package.json')
  Copy-Item (Join-Path $repositoryRoot 'server\prisma7.config.ts') (Join-Path $outputPath 'server\prisma7.config.ts')
  $frontendOutput = Join-Path $outputPath 'frontend\dist'
  New-Item -ItemType Directory -Path $frontendOutput | Out-Null
  Copy-Item (Join-Path $repositoryRoot 'frontend\dist\*') $frontendOutput -Recurse -Force

  Invoke-CheckedCommand $dotnet.Source @(
    'publish',
    (Join-Path $repositoryRoot 'launcher\DiaDoServidor.Launcher.csproj'),
    '--configuration', 'Release',
    '--runtime', 'win-x64',
    '--self-contained', 'true',
    '-p:PublishSingleFile=true',
    '-p:IncludeNativeLibrariesForSelfExtract=true',
    '--output', $outputPath
  )

  Write-Output ''
  Write-Output "Pacote criado em: $outputPath"
  Write-Output 'Mantenha juntos DiaDoServidor.exe, runtime e as pastas server e frontend.'
}
finally {
  Pop-Location
}
