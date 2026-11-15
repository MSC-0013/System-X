param(
    [ValidateSet('Start','Status','Stop')][string]$Action,
    [switch]$UseCachedImages
)
$ErrorActionPreference = 'Stop'
$composeFile = Join-Path $PSScriptRoot 'compose.qa.yml'
$sessionFile = if ($env:QA_SESSION_FILE) { $env:QA_SESSION_FILE } else { Join-Path $env:TEMP 'portfolio-qa-session.json' }
if ($Action -eq 'Start') {
    docker info --format '{{.ServerVersion}}'
    if ($LASTEXITCODE) { throw 'Docker engine is unavailable.' }
    $ports = 3308, 6380, 9092, 9000
    $occupied = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in $ports }
    if ($occupied) { throw "QA ports are occupied: $($occupied.LocalPort -join ', ')" }
    if (Test-Path -LiteralPath $sessionFile) {
        $session = Get-Content -LiteralPath $sessionFile -Raw | ConvertFrom-Json
    } else {
        $session = @{
            project = 'portfolio-qa-' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
            mysqlPassword = [Guid]::NewGuid().ToString('N')
            mysqlRootPassword = [Guid]::NewGuid().ToString('N')
            minioUser = 'minioadmin'
            minioPassword = 'minioadmin'
        }
        $session | ConvertTo-Json | Set-Content -LiteralPath $sessionFile -Encoding utf8NoBOM
    }
} else {
    if (!(Test-Path -LiteralPath $sessionFile)) { throw 'No isolated QA session metadata exists.' }
    $session = Get-Content -LiteralPath $sessionFile -Raw | ConvertFrom-Json
}
if ($session.project -notmatch '^portfolio-qa-\d+$') { throw 'Refusing to operate on a non-QA compose project.' }
$env:QA_MYSQL_PASSWORD = $session.mysqlPassword
$env:QA_MYSQL_ROOT_PASSWORD = $session.mysqlRootPassword
$env:QA_MINIO_USER = $session.minioUser
$env:QA_MINIO_PASSWORD = $session.minioPassword
$options = @()
if ($UseCachedImages) {
    $env:QA_KAFKA_IMAGE = 'apache/kafka:latest'
    $env:QA_MINIO_IMAGE = 'quay.io/minio/minio:latest'
    $options = @('--pull', 'never')
}
switch ($Action) {
    'Start' { docker compose -p $session.project -f $composeFile up -d --wait --wait-timeout 130 @options }
    'Status' { docker ps -a --filter "label=com.docker.compose.project=$($session.project)" --format '{{.Names}} {{.Image}} {{.Status}}' }
    'Stop' { docker compose -p $session.project -f $composeFile stop }
}
exit $LASTEXITCODE

