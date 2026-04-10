# Variante Windows (robocopy). Par défaut, les scripts npm utilisent
# `scripts/prepare-runtime-deploy.js` (Linux / macOS / Windows sans PowerShell obligatoire).
# Équivalent npm : `npm run deploy:prepare:runtime:ps` ou `:fast:ps`.

param(
  [switch]$SkipInstall,
  [switch]$SkipBuild,
  [switch]$SkipPrune
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][string]$Command
  )
  Write-Host "==> $Label"
  Write-Host "    $Command"
  Invoke-Expression $Command
}

function Test-CommandAvailable {
  param([Parameter(Mandatory = $true)][string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$deployRoot = Join-Path $projectRoot "deploy"
$runtimeRoot = Join-Path $deployRoot "runtime"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bundleName = "foretmap-runtime-$stamp"
$stageDir = Join-Path $runtimeRoot $bundleName
$zipPath = Join-Path $deployRoot "$bundleName.zip"
$manifestPath = Join-Path $stageDir "DEPLOY_MANIFEST.txt"
$requiredForRuntime = @("app.js", "server.js", "database.js", "package.json", "package-lock.json", "node_modules", "dist")

if (-not (Test-CommandAvailable "powershell")) {
  throw "Commande introuvable: powershell"
}
if (-not $SkipInstall -or -not $SkipBuild -or -not $SkipPrune) {
  if (-not (Test-CommandAvailable "npm")) {
    throw "Commande introuvable: npm"
  }
}
if (-not (Test-CommandAvailable "robocopy")) {
  throw "Commande introuvable: robocopy"
}

Push-Location $projectRoot
try {
  if (-not $SkipInstall) {
    Invoke-Step -Label "Installation dépendances complètes (build local)" -Command "npm ci --include=dev"
  } else {
    Write-Host "==> Installation ignorée (--SkipInstall)"
  }

  if (-not $SkipBuild) {
    Invoke-Step -Label "Build frontend" -Command "npm run build"
  } else {
    Write-Host "==> Build ignoré (--SkipBuild)"
  }

  if (-not $SkipPrune) {
    Invoke-Step -Label "Prune vers dépendances production" -Command "npm prune --omit=dev"
  } else {
    Write-Host "==> Prune ignoré (--SkipPrune)"
  }

  $distIndexVite = Join-Path $projectRoot "dist/index.vite.html"
  $distIndexLegacy = Join-Path $projectRoot "dist/index.html"
  if (-not (Test-Path $distIndexVite) -and -not (Test-Path $distIndexLegacy)) {
    throw "Build incomplet: dist/index.vite.html (ou dist/index.html) introuvable."
  }
  if (-not (Test-Path (Join-Path $projectRoot "node_modules"))) {
    throw "node_modules introuvable. Relance sans --SkipInstall."
  }

  New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
  if (Test-Path $stageDir) {
    Remove-Item -Recurse -Force $stageDir
  }
  New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

  Write-Host "==> Copie des fichiers projet (hors secrets)"
  $excludeDirs = @(
    ".git", ".cursor", "deploy", "node_modules", "uploads", "logs",
    "playwright-report", "test-results", "blob-report"
  )
  $excludeFiles = @(".env", "startup.log", "startup-diag.log", "npm-debug.log")
  $robocopyArgsMain = @(
    $projectRoot, $stageDir, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NP",
    "/XD"
  ) + $excludeDirs + @(
    "/XF"
  ) + $excludeFiles
  & robocopy @robocopyArgsMain | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "Robocopy a échoué (code $LASTEXITCODE)"
  }

  Write-Host "==> Copie node_modules (runtime)"
  $stageNodeModules = Join-Path $stageDir "node_modules"
  New-Item -ItemType Directory -Path $stageNodeModules -Force | Out-Null
  $robocopyArgsNodeModules = @(
    (Join-Path $projectRoot "node_modules"), $stageNodeModules, "/E",
    "/NFL", "/NDL", "/NJH", "/NJS", "/NP"
  )
  & robocopy @robocopyArgsNodeModules | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "Copie node_modules échouée (code $LASTEXITCODE)"
  }

  foreach ($required in $requiredForRuntime) {
    if (-not (Test-Path (Join-Path $stageDir $required))) {
      throw "Bundle incomplet: '$required' introuvable dans le staging."
    }
  }

  $gitSha = "unknown"
  try {
    $gitSha = (git rev-parse --short HEAD).Trim()
  } catch {
    $gitSha = "unknown"
  }

  $manifest = @(
    "ForetMap runtime bundle",
    "generated_at=$(Get-Date -Format o)",
    "git_sha=$gitSha",
    "stage_dir=$stageDir",
    "notes=Ce bundle contient dist + node_modules(prod)."
  )
  Set-Content -Path $manifestPath -Value $manifest -Encoding UTF8

  if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
  }
  Write-Host "==> Création archive ZIP"
  Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $zipPath -Force

  Write-Host ""
  Write-Host "Bundle runtime prêt."
  Write-Host "- Dossier (source de vérité, uploadable tel quel): $stageDir"
  Write-Host "- ZIP (optionnel): $zipPath"
  Write-Host ""
  Write-Host "Déploiement serveur:"
  Write-Host "1) Uploader le dossier ci-dessus (rsync / SFTP) ou extraire le ZIP."
  Write-Host "2) Redémarrer l'application Node.js."
  Write-Host "3) Vérifier avec: npm run deploy:check:prod"
}
finally {
  Pop-Location
}
