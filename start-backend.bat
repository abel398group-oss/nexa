@echo off
cd /d "C:\Users\Hipervias - Abel\Documents\GitHub\nexa\apps\backend"

echo [Nexa] Encerrando processos Node.js anteriores...
taskkill /F /IM node.exe >nul 2>&1

echo [Nexa] Aguardando conexoes do banco liberarem (3s)...
timeout /T 3 /NOBREAK >nul

echo [Nexa] Iniciando backend...
pnpm dev
