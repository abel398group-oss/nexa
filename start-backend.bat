@echo off
cd /d "C:\Users\Hipervias - Abel\Documents\GitHub\nexa\apps\backend"

echo [Nexa] Encerrando so o backend anterior do Nexa (porta 3001)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo [Nexa] Aguardando conexoes do banco liberarem (3s)...
timeout /T 3 /NOBREAK >nul

echo [Nexa] Iniciando backend...
pnpm dev
