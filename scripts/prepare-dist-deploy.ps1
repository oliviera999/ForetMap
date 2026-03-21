param(
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

function Test-RequiredCommand($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Commande introuvable: $name. Installe Node.js/npm puis réessaie."
  }
}

Set-Location (Join-Path $PSScriptRoot "..")

Test-RequiredCommand "npm"

if (-not $SkipInstall) {
  Write-Host "==> Installation des dépendances (npm ci --include=dev)"
  npm ci --include=dev
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "npm ci a échoué (lockfile potentiellement désynchronisé). Bascule sur npm install --include=dev..."
    npm install --include=dev
    if ($LASTEXITCODE -ne 0) {
      throw "Échec installation dépendances (npm ci puis npm install)."
    }
  }
} else {
  Write-Host "==> Installation sautée (--SkipInstall)"
}

Write-Host "==> Build frontend (npm run build)"
npm run build
if ($LASTEXITCODE -ne 0) {
  throw "Échec du build frontend (npm run build)."
}

$distPath = Join-Path (Get-Location) "dist"
if (-not (Test-Path (Join-Path $distPath "index.html"))) {
  throw "Build incomplet: dist/index.html introuvable."
}

$deployDir = Join-Path (Get-Location) "deploy"
if (-not (Test-Path $deployDir)) {
  New-Item -ItemType Directory -Path $deployDir | Out-Null
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$zipPath = Join-Path $deployDir ("foretmap-dist-" + $stamp + ".zip")
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Write-Host "==> Archive dist -> $zipPath"
Compress-Archive -Path (Join-Path $distPath "*") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host ""
Write-Host "Terminé."
Write-Host "- Build prêt: $distPath"
Write-Host "- Archive prête: $zipPath"
Write-Host "Upload le dossier dist/ ou l'archive ZIP sur le serveur, puis redémarre l'app Node.js."
