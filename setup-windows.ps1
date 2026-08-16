[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"
$script:MinimumNodeMajor = 20
$script:RequiredPnpmMajor = 11
$script:RequiredPnpmVersion = "11.19.0"
$script:Results = @()

function Get-CommandVersion([string]$Command, [string[]]$Arguments = @("--version")) {
  $found = Get-Command $Command -ErrorAction SilentlyContinue
  if (-not $found) { return $null }
  try { return (& $Command @Arguments 2>$null | Select-Object -First 1).ToString().Trim() } catch { return $null }
}

function Get-MajorVersion([string]$Value) {
  if ($Value -match '(\d+)\.') { return [int]$Matches[1] }
  return $null
}

function Test-WebView2 {
  $roots = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )
  return [bool](Get-ItemProperty $roots -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -like "Microsoft Edge WebView2 Runtime*" } |
    Select-Object -First 1)
}

function Get-VsWherePath {
  $candidate = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
  if (Test-Path $candidate) { return $candidate }
  return $null
}

function Test-CppBuildTools {
  $vswhere = Get-VsWherePath
  if (-not $vswhere) { return $false }
  $installation = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
  return [bool]$installation
}

function Test-WindowsSdk {
  $kitsRoot = Get-ItemPropertyValue "HKLM:\SOFTWARE\Microsoft\Windows Kits\Installed Roots" -Name KitsRoot10 -ErrorAction SilentlyContinue
  return [bool]($kitsRoot -and (Test-Path (Join-Path $kitsRoot "Lib")))
}

function Test-ProjectPackages {
  if (-not (Test-Path (Join-Path $PSScriptRoot "node_modules"))) { return $false }
  Push-Location $PSScriptRoot
  try { & pnpm list --depth 0 --offline *> $null; return $LASTEXITCODE -eq 0 } catch { return $false } finally { Pop-Location }
}

function Invoke-Checks {
  $script:Results = @()
  $nodeVersion = Get-CommandVersion "node"
  $pnpmVersion = Get-CommandVersion "pnpm"
  $rustVersion = Get-CommandVersion "rustc"
  $cargoVersion = Get-CommandVersion "cargo"
  $rustHost = if ($rustVersion) { (& rustc -vV 2>$null | Where-Object { $_ -like "host:*" } | Select-Object -First 1) } else { $null }
  $sqliteVersion = Get-CommandVersion "sqlite3"

  $script:Results += [pscustomobject]@{ Name="Windows 10/11"; Ok=($env:OS -eq "Windows_NT" -and [Environment]::OSVersion.Version.Major -ge 10); Detail=[Environment]::OSVersion.VersionString; Install="Manual" }
  $script:Results += [pscustomobject]@{ Name="Node.js 20+"; Ok=($nodeVersion -and (Get-MajorVersion $nodeVersion) -ge $MinimumNodeMajor); Detail=if ($nodeVersion) { $nodeVersion } else { "not found" }; Install="OpenJS.NodeJS.LTS" }
  $script:Results += [pscustomobject]@{ Name="pnpm 11"; Ok=($pnpmVersion -and (Get-MajorVersion $pnpmVersion) -eq $RequiredPnpmMajor); Detail=if ($pnpmVersion) { $pnpmVersion } else { "not found" }; Install="Corepack/pnpm $RequiredPnpmVersion" }
  $script:Results += [pscustomobject]@{ Name="Rust stable MSVC"; Ok=($rustVersion -and $cargoVersion -and $rustHost -match 'msvc'); Detail=if ($rustVersion) { "$rustVersion; $rustHost" } else { "not found" }; Install="Rustlang.Rustup" }
  $buildToolsReady = (Test-CppBuildTools) -and (Test-WindowsSdk)
  $script:Results += [pscustomobject]@{ Name="C++ Build Tools + Windows SDK"; Ok=$buildToolsReady; Detail=if ($buildToolsReady) { "VC x86/x64 tools and Windows SDK detected" } else { "required VC tools and/or Windows SDK not found" }; Install="Visual Studio 2022 Build Tools (Desktop development with C++)" }
  $script:Results += [pscustomobject]@{ Name="WebView2 Runtime"; Ok=(Test-WebView2); Detail=if (Test-WebView2) { "installed" } else { "not found" }; Install="Microsoft.EdgeWebView2Runtime" }
  $script:Results += [pscustomobject]@{ Name="SQLite 3 CLI + FTS5"; Ok=($sqliteVersion -and ((& sqlite3 ':memory:' 'select sqlite_compileoption_used(''ENABLE_FTS5'');' 2>$null) -eq '1')); Detail=if ($sqliteVersion) { $sqliteVersion } else { "not found" }; Install="SQLite.SQLite" }
  $script:Results += [pscustomobject]@{ Name="Project packages"; Ok=($pnpmVersion -and (Test-ProjectPackages)); Detail=if (Test-Path (Join-Path $PSScriptRoot "node_modules")) { "node_modules present" } else { "not installed" }; Install="pnpm install --frozen-lockfile" }
}

function Show-Results([string]$Heading) {
  Write-Host "`n$Heading" -ForegroundColor Cyan
  foreach ($item in $Results) {
    $label = if ($item.Ok) { "INSTALLED" } else { "MISSING" }
    $colour = if ($item.Ok) { "Green" } else { "Yellow" }
    Write-Host ("[{0,-9}] {1} - {2}" -f $label, $item.Name, $item.Detail) -ForegroundColor $colour
  }
}

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

function Install-WingetPackage([string]$Id, [string[]]$Extra = @()) {
  Write-Host "`nInstalling $Id ..." -ForegroundColor Cyan
  & winget install --id $Id --exact --accept-source-agreements --accept-package-agreements @Extra
  if ($LASTEXITCODE -ne 0) { Write-Warning "$Id installation returned exit code $LASTEXITCODE." }
}

Invoke-Checks
Show-Results "Fallout Lore Archive dependency check"
$missing = @($Results | Where-Object { -not $_.Ok })
if ($missing.Count -eq 0) {
  Write-Host "`nSUCCESS: All local development dependencies are ready." -ForegroundColor Green
  exit 0
}

Write-Host "`nThe following actions would be taken:" -ForegroundColor Yellow
foreach ($item in $missing) { Write-Host "  - $($item.Name): $($item.Install)" }
Write-Host "`nNothing has been installed yet."
$answer = Read-Host "Install the missing dependencies now? [y/N]"
if ($answer -notmatch '^(?i:y|yes)$') {
  Write-Host "`nNo changes were made. Re-run this script when ready." -ForegroundColor Yellow
  exit 1
}

$winget = Get-Command winget -ErrorAction SilentlyContinue
if (-not $winget) {
  Write-Warning "winget is unavailable, so automatic installation cannot continue safely."
  Write-Host "Install App Installer: https://learn.microsoft.com/windows/package-manager/winget/"
  Write-Host "Tauri prerequisites: https://v2.tauri.app/start/prerequisites/"
} else {
  if ($missing.Name -contains "Node.js 20+") { Install-WingetPackage "OpenJS.NodeJS.LTS" }
  Refresh-Path

  if ($missing.Name -contains "pnpm 11") {
    if (Get-Command corepack -ErrorAction SilentlyContinue) {
      & corepack enable
      & corepack prepare "pnpm@$RequiredPnpmVersion" --activate
    } else { Install-WingetPackage "pnpm.pnpm" }
  }
  if ($missing.Name -contains "Rust stable MSVC") {
    Install-WingetPackage "Rustlang.Rustup"
    Refresh-Path
    if (Get-Command rustup -ErrorAction SilentlyContinue) { & rustup default stable-msvc }
  }
  if ($missing.Name -contains "C++ Build Tools + Windows SDK") {
    Install-WingetPackage "Microsoft.VisualStudio.2022.BuildTools" @("--override", "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended")
  }
  if ($missing.Name -contains "WebView2 Runtime") { Install-WingetPackage "Microsoft.EdgeWebView2Runtime" }
  if ($missing.Name -contains "SQLite 3 CLI + FTS5") { Install-WingetPackage "SQLite.SQLite" }
  Refresh-Path
  if ($missing.Name -contains "Project packages" -and (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Push-Location $PSScriptRoot
    try { & pnpm install --frozen-lockfile } finally { Pop-Location }
  }
}

Invoke-Checks
Show-Results "Final dependency check"
$remaining = @($Results | Where-Object { -not $_.Ok })
if ($remaining.Count -eq 0) {
  Write-Host "`nSUCCESS: All local development dependencies are ready." -ForegroundColor Green
  exit 0
}

Write-Host "`nSETUP INCOMPLETE: $($remaining.Count) requirement(s) still need attention." -ForegroundColor Red
foreach ($item in $remaining) {
  switch ($item.Name) {
    "Windows 10/11" { Write-Host "Windows requirement: https://www.microsoft.com/software-download/windows11" }
    "Node.js 20+" { Write-Host "Node.js guidance: https://nodejs.org/en/download" }
    "pnpm 11" { Write-Host "pnpm guidance: https://pnpm.io/installation" }
    "Rust stable MSVC" { Write-Host "Rust guidance: https://www.rust-lang.org/tools/install" }
    "C++ Build Tools + Windows SDK" { Write-Host "Build Tools guidance: https://v2.tauri.app/start/prerequisites/#microsoft-c-build-tools" }
    "WebView2 Runtime" { Write-Host "WebView2 guidance: https://developer.microsoft.com/microsoft-edge/webview2/" }
    "SQLite 3 CLI + FTS5" { Write-Host "SQLite guidance: https://sqlite.org/download.html" }
    "Project packages" { Write-Host "Project packages: run 'pnpm install --frozen-lockfile' after pnpm is available." }
  }
}
Write-Host "Restart PowerShell after system-level installations, then run this script again."
exit 1
