# Backup do banco Nexa (PostgreSQL no container Docker).
# Uso: powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
# Gera um arquivo .sql com data/hora em backups\ e mantém os últimos 14.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root "backups"
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$file = Join-Path $dir "nexa_$stamp.sql"

Write-Host "Fazendo backup do banco 'nexa'..."
# pg_dump roda DENTRO do container; redireciona a saída pro arquivo no host
docker exec nexa_postgres pg_dump -U nexa -d nexa | Out-File -FilePath $file -Encoding utf8

if ((Test-Path $file) -and ((Get-Item $file).Length -gt 0)) {
  $kb = [math]::Round((Get-Item $file).Length / 1KB, 1)
  Write-Host "OK: $file ($kb KB)" -ForegroundColor Green
} else {
  Write-Host "FALHA: backup vazio ou não gerado" -ForegroundColor Red
  exit 1
}

# retenção: mantém só os 14 backups mais recentes
Get-ChildItem $dir -Filter "nexa_*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force -ErrorAction SilentlyContinue
Write-Host "Backups guardados em: $dir (retém os 14 últimos)"

# Para RESTAURAR um backup:
#   Get-Content backups\nexa_AAAA-MM-DD_HHMMSS.sql | docker exec -i nexa_postgres psql -U nexa -d nexa
