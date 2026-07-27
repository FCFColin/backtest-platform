@echo off
rem dev-stop.bat - kill supervisor + all bg processes

set TASK_NAME=BacktestDevSupervisor
set PID_FILE=%~dp0..\.dev-logs\dev-bg-pids.json

echo [dev-stop] Stopping supervisor task...

schtasks /end /tn "%TASK_NAME%" 2>nul
schtasks /delete /tn "%TASK_NAME%" /f 2>nul

if exist "%PID_FILE%" (
    node -e "const f=require('fs').readFileSync(process.argv[1],'utf8');const p=JSON.parse(f);Object.entries(p).forEach(([name,id])=>{if(id){try{require('child_process').execSync('taskkill /F /PID '+id,{stdio:'ignore'});console.log('[dev-stop] killed '+name+' (PID '+id+')')}catch(e){console.log('[dev-stop] '+name+' (PID '+id+') already gone')}}});" "%PID_FILE%"
    del "%PID_FILE%" 2>nul
)

del "%~dp0..\.dev-logs\dev-supervisor.lock" 2>nul

echo [dev-stop] Done
