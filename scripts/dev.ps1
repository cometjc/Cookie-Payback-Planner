param(
    [ValidateSet('check', 'build', 'attach', 'start', 'stop', 'collect', 'diagnose', 'compare', 'paired', 'update-paired', 'crossover', 'rebirth', 'functional')]
    [string]$Task = 'check',
    [string]$Profile
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$runtimeNode = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$nodeExe = if (Test-Path -LiteralPath $runtimeNode) { $runtimeNode } else { (Get-Command node -ErrorAction Stop).Source }

function Invoke-Node([string[]]$Arguments) {
    & $nodeExe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Node command failed (exit $LASTEXITCODE): $Arguments" }
}

Push-Location $repoRoot
try {
    $commonGit = & git rev-parse --path-format=absolute --git-common-dir
    if ($LASTEXITCODE -ne 0) { throw 'Cannot locate repository dependencies' }
    $dependencyRoot = if (Test-Path 'node_modules/typescript/bin/tsc') { Join-Path $repoRoot 'node_modules' }
        else { Join-Path (Split-Path $commonGit -Parent) 'node_modules' }
    switch ($Task) {
        'check' {
            Invoke-Node @("$dependencyRoot/typescript/bin/tsc", '--noEmit')
            Invoke-Node @("$dependencyRoot/oxlint/bin/oxlint", 'src')
            Invoke-Node @("$dependencyRoot/vitest/vitest.mjs", 'run')
            $toolTests = @(Get-ChildItem scripts -Recurse -Filter '*.test.mjs' | ForEach-Object FullName)
            Invoke-Node (@('--test') + $toolTests)
        }
        'build' {
            Invoke-Node @("$dependencyRoot/esbuild/bin/esbuild", 'src/index.ts', '--bundle', '--format=iife', '--platform=browser', '--target=es2020', '--outfile=dist/main.js')
        }
        { $_ -in @('update-paired', 'crossover', 'rebirth', 'functional') } {
            if (!$Profile) { throw "-$Task requires -Profile <profile.json>" }
            Invoke-Node @("scripts/perf/$Task.mjs", $Profile)
        }
        default {
            if (!$Profile) { throw "-$Task requires -Profile <profile.json>" }
            $entry = if ($Task -in @('compare', 'paired')) { $Task } else { 'run' }
            Invoke-Node @("scripts/perf/$entry.mjs", $Task, $Profile)
        }
    }
} finally { Pop-Location }
