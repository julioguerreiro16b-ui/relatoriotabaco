$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  $runtimeDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) '.tools\node-v22.23.3-win-x64'
  if (-not (Test-Path -LiteralPath (Join-Path $runtimeDirectory 'node.exe'))) {
    throw 'Instale o Node.js 22 e execute novamente.'
  }
  $env:Path = $runtimeDirectory + ';' + $env:Path
}
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
  npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel instalar as dependencias.' }
}
Write-Host 'H&F Controle: abra http://127.0.0.1:3000'
npm.cmd run dev
