<#
.SYNOPSIS
    Benchmark kolargrep vs ripgrep on Windows.
.DESCRIPTION
    Runs a search benchmark comparing kolargrep (client/server) against ripgrep.
    Queries and the default repo URL are loaded from a JSON file.
.PARAMETER QueriesFile
    Path to a JSON file containing "repo_url" and "queries" array.
    Defaults to scripts\benchmark-queries.json next to this script.
.PARAMETER RepoPath
    Path to an existing repository to benchmark against. When set, skips cloning.
.PARAMETER RepoUrl
    URL to clone for benchmarking. Overrides the value from QueriesFile.
.PARAMETER BenchDir
    Working directory for benchmark artifacts (index, results, cloned repo).
.PARAMETER KolargrepBin
    Path to the kolargrep binary. Auto-detected from target\release\kolargrep.exe if not set.
.PARAMETER ResultsPath
    Output path for the results markdown file.
.PARAMETER SkipBuild
    Skip building kolargrep from source (assumes the binary already exists).
.EXAMPLE
    .\scripts\benchmark.ps1
    # Builds kolargrep, clones Linux kernel, runs full benchmark.
.EXAMPLE
    .\scripts\benchmark.ps1 -QueriesFile my-queries.json -RepoPath C:\src\myrepo -SkipBuild
    # Benchmarks with custom queries against an existing repo.
#>
param(
    [string]$QueriesFile = '',
    [string]$RepoPath = '',
    [string]$RepoUrl = '',
    [string]$BenchDir = (Join-Path $env:TEMP 'kolargrep-bench'),
    [string]$KolargrepBin = '',
    [string]$ResultsPath = '',
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

# ── Resolve paths ──
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Split-Path -Parent $ScriptDir

# ── Load queries JSON ──
if (-not $QueriesFile) {
    $QueriesFile = Join-Path $ScriptDir 'benchmark-queries.json'
}
if (-not (Test-Path $QueriesFile)) {
    throw "Queries file not found: $QueriesFile"
}
$benchConfig = Get-Content $QueriesFile -Raw | ConvertFrom-Json
$Queries = @($benchConfig.queries)
if ($Queries.Count -eq 0) {
    throw "No queries found in $QueriesFile"
}

if (-not $RepoUrl) {
    $RepoUrl = $benchConfig.repo_url
}
if (-not $RepoUrl) {
    throw "No repo_url specified (set in queries JSON or pass -RepoUrl)"
}

if (-not $KolargrepBin) {
    $KolargrepBin = Join-Path $RepoRoot 'target\release\kolargrep.exe'
}
if (-not $ResultsPath) {
    $ResultsPath = Join-Path $BenchDir 'benchmark-results.md'
}

$IndexPath = Join-Path $BenchDir 'kolargrep-index'

if ($RepoPath) {
    $BenchRepoDir = $RepoPath
} else {
    # Derive clone directory name from repo URL (e.g. linux, chromium)
    $CloneName = [System.IO.Path]::GetFileNameWithoutExtension($RepoUrl.TrimEnd('/'))
    $BenchRepoDir = Join-Path $BenchDir $CloneName
}

# ── Build ──
if (-not $SkipBuild) {
    Write-Host '==> Building kolargrep (release)...' -ForegroundColor Cyan
    Push-Location $RepoRoot
    try {
        cargo build --release
        if ($LASTEXITCODE -ne 0) { throw 'cargo build failed' }
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path $KolargrepBin)) {
    throw "kolargrep binary not found at $KolargrepBin — run 'make release' first or pass -KolargrepBin"
}

# ── Clone benchmark repo ──
if (-not $RepoPath) {
    if (-not (Test-Path $BenchRepoDir)) {
        Write-Host "==> Cloning $RepoUrl (shallow)..." -ForegroundColor Cyan
        New-Item -ItemType Directory -Path $BenchDir -Force | Out-Null
        git clone --depth 1 $RepoUrl $BenchRepoDir
        if ($LASTEXITCODE -ne 0) { throw 'git clone failed' }
    } else {
        Write-Host "==> Using existing repo at $BenchRepoDir" -ForegroundColor Yellow
    }
}

if (-not (Test-Path $BenchRepoDir)) {
    throw "Benchmark repo not found at $BenchRepoDir"
}

# ── Count files ──
$FileCount = (git -C $BenchRepoDir ls-files | Measure-Object -Line).Lines

# ── Build index ──
Write-Host '==> Building kolargrep index...' -ForegroundColor Cyan
$indexSw = [System.Diagnostics.Stopwatch]::StartNew()
& $KolargrepBin index $BenchRepoDir --index-path $IndexPath
if ($LASTEXITCODE -ne 0) { throw 'kolargrep index failed' }
$indexSw.Stop()
$indexMs = $indexSw.ElapsedMilliseconds
Write-Host "Index built in ${indexMs}ms" -ForegroundColor Green

$QueryCount = $Queries.Count
Write-Host "==> Running $QueryCount queries against $FileCount files" -ForegroundColor Cyan

# ── Start kolargrep serve ──
Write-Host '==> Starting kolargrep serve...' -ForegroundColor Cyan

$LockFile = Join-Path $IndexPath 'serve.json'
if (Test-Path $LockFile) { Remove-Item $LockFile -Force }

$serveOut = Join-Path $BenchDir 'serve-stdout.log'
$serveErr = Join-Path $BenchDir 'serve-stderr.log'
New-Item -ItemType Directory -Path $BenchDir -Force | Out-Null
$serveProc = Start-Process -FilePath $KolargrepBin `
    -ArgumentList "serve `"$BenchRepoDir`" --index-path `"$IndexPath`" --no-watch" `
    -RedirectStandardOutput $serveOut -RedirectStandardError $serveErr `
    -PassThru -WindowStyle Hidden

Write-Host "Waiting for kolargrep serve (pid $($serveProc.Id))..."
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    if (Test-Path $LockFile) {
        $port = (Get-Content $LockFile | ConvertFrom-Json).port
        Write-Host "kolargrep serve ready on port $port" -ForegroundColor Green
        $ready = $true
        break
    }
    Start-Sleep -Seconds 1
}

if (-not $ready) {
    Write-Host 'ERROR: kolargrep serve failed to start within 60s' -ForegroundColor Red
    if (-not $serveProc.HasExited) { $serveProc.Kill() }
    throw 'kolargrep serve failed to start'
}

# ── Benchmark: kolargrep (client → serve) ──
$savedEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    Write-Host "`n==> Benchmarking kolargrep (client -> serve)..." -ForegroundColor Cyan
    $kolargrepSw = [System.Diagnostics.Stopwatch]::StartNew()
    foreach ($q in $Queries) {
        & $KolargrepBin $q $BenchRepoDir --index-path $IndexPath *>$null
    }
    $kolargrepSw.Stop()
    $kolargrepMs = $kolargrepSw.ElapsedMilliseconds
    Write-Host "kolargrep: ${kolargrepMs}ms total" -ForegroundColor Green
} finally {
    $ErrorActionPreference = $savedEAP
    # ── Stop serve ──
    Write-Host '==> Stopping kolargrep serve...'
    try {
        if (-not $serveProc.HasExited) { $serveProc.Kill() }
        $serveProc.WaitForExit(5000) | Out-Null
    } catch { }
}

# ── Benchmark: ripgrep ──
$rgCmd = Get-Command rg -ErrorAction SilentlyContinue
$rgMs = -1
$rgTimeouts = 0
$rgTimeoutMs = 120000
$rgTimeoutSec = $rgTimeoutMs / 1000
if ($rgCmd) {
    Write-Host "`n==> Benchmarking ripgrep (${rgTimeoutSec}s timeout per query)..." -ForegroundColor Cyan
    $rgOutTmp = Join-Path $BenchDir 'rg-stdout.tmp'
    $rgErrTmp = Join-Path $BenchDir 'rg-stderr.tmp'
    New-Item -ItemType Directory -Path $BenchDir -Force | Out-Null
    $rgSw = [System.Diagnostics.Stopwatch]::StartNew()
    $qIdx = 0
    foreach ($q in $Queries) {
        $qIdx++
        Write-Host "  [$qIdx/$QueryCount] $q"
        $safeQ = $q -replace '"', '\"'
        $safePath = $BenchRepoDir -replace '"', '\"'
        $rgProc = Start-Process -FilePath $rgCmd.Source `
            -ArgumentList "-n -- `"$safeQ`" `"$safePath`"" `
            -PassThru -WindowStyle Hidden `
            -RedirectStandardOutput $rgOutTmp `
            -RedirectStandardError $rgErrTmp
        $finished = $rgProc.WaitForExit($rgTimeoutMs)
        if (-not $finished) {
            try { $rgProc.Kill() } catch {}
            try { $rgProc.WaitForExit(2000) | Out-Null } catch {}
            $rgTimeouts++
            Write-Host "    timed out (${rgTimeoutSec}s)" -ForegroundColor Yellow
        }
    }
    $rgSw.Stop()
    Remove-Item -Path $rgOutTmp -ErrorAction SilentlyContinue
    Remove-Item -Path $rgErrTmp -ErrorAction SilentlyContinue
    $rgMs = $rgSw.ElapsedMilliseconds
    Write-Host "ripgrep: ${rgMs}ms total" -ForegroundColor Green
    if ($rgTimeouts -gt 0) {
        Write-Host "ripgrep: $rgTimeouts/$QueryCount queries timed out (${rgTimeoutSec}s limit)" -ForegroundColor Yellow
    }
} else {
    Write-Host 'ripgrep (rg) not found in PATH, skipping' -ForegroundColor Yellow
}

# ── Write results ──
$kolargrepAvg = [math]::Round($kolargrepMs / $QueryCount, 1)
$dateStr  = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
$repoName = Split-Path $BenchRepoDir -Leaf
$arch     = $env:PROCESSOR_ARCHITECTURE

# Calculate index size
$indexSizeBytes = 0
foreach ($f in @('index.bin', 'lookup.bin', 'files.bin', 'meta.json')) {
    $fp = Join-Path $IndexPath $f
    if (Test-Path $fp) {
        $indexSizeBytes += (Get-Item $fp).Length
    }
}
if ($indexSizeBytes -ge 1048576) {
    $indexSize = '{0:F1} MB' -f ($indexSizeBytes / 1048576)
} elseif ($indexSizeBytes -ge 1024) {
    $indexSize = '{0:F1} KB' -f ($indexSizeBytes / 1024)
} else {
    $indexSize = "$indexSizeBytes B"
}

$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine("# Benchmark: ${QueryCount}-query search on repo: $repoName")
[void]$sb.AppendLine()
[void]$sb.AppendLine("- **Repo**: $BenchRepoDir")
[void]$sb.AppendLine("- **Files**: $FileCount")
[void]$sb.AppendLine("- **Queries**: $QueryCount")
[void]$sb.AppendLine("- **Date**: $dateStr")
[void]$sb.AppendLine("- **Platform**: Windows $arch")
[void]$sb.AppendLine("- **Index build time**: ${indexMs}ms")
[void]$sb.AppendLine("- **Index size**: $indexSize")
[void]$sb.AppendLine('- **Scope**: search only (index built before timing)')
[void]$sb.AppendLine('- **kolargrep mode**: client/server — `kolargrep serve` runs in background, `kolargrep` client connects via TCP')
[void]$sb.AppendLine()
[void]$sb.AppendLine("| Tool | Total (ms) | Avg per query (ms) | Timeouts (${rgTimeoutSec}s) |")
[void]$sb.AppendLine('| --- | ---: | ---: | ---: |')
if ($rgMs -ge 0) {
    $rgAvg = [math]::Round($rgMs / $QueryCount, 1)
    [void]$sb.AppendLine(('| ripgrep | {0} | {1} | {2} |' -f $rgMs, $rgAvg, $rgTimeouts))
}
[void]$sb.AppendLine(('| kolargrep (client -> serve) | {0} | {1} | - |' -f $kolargrepMs, $kolargrepAvg))

$results = $sb.ToString()

$resultsDir = Split-Path $ResultsPath -Parent
if ($resultsDir) {
    New-Item -ItemType Directory -Path $resultsDir -Force | Out-Null
}
Set-Content -Path $ResultsPath -Value $results -NoNewline

Write-Host ''
Write-Host $results -ForegroundColor Green
Write-Host "Results saved to $ResultsPath" -ForegroundColor Cyan
