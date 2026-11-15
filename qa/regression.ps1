param([ValidateRange(1,10)][int]$Repeat = 10)
$ErrorActionPreference = 'Stop'
$failed = @()
Push-Location (Join-Path $PSScriptRoot '..')
try {
    foreach ($lane in @('suite', 'crt', 'crt-all', 'commerce', 'commerce-shared', 'process', 'browser', 'comparison', 'milestone', 'worm')) {
        node qa/run.mjs "--lane=$lane" "--repeat=$Repeat" --strict
        if ($LASTEXITCODE -ne 0) { $failed += $lane }
    }
    node qa/report.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Could not consolidate QA results.' }
} finally {
    Pop-Location
}
if ($failed.Count) {
    Write-Host ("Failed or blocked lanes: " + ($failed -join ', '))
    exit 1
}
