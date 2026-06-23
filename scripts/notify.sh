@echo off
REM Send a notification to Telegram from a shell script
REM Usage: notify.sh "message text"

setlocal enabledelayedexpansion
set MSG=%*
if "%MSG%"=="" set MSG="No message specified"

REM Load .env - simple parsing
for /f "tokens=1,* delims==" %%a in ('findstr /b /v "#" .env') do (
  if "%%a"=="TELEGRAM_BOT_TOKEN" set TOKEN=%%b
  if "%%a"=="ALLOWED_CHAT_ID" set CHAT_ID=%%b
)

if "%TOKEN%"=="" (
  echo Error: TELEGRAM_BOT_TOKEN not found in .env
  exit /b 1
)

curl -s -X POST "https://api.telegram.org/bot%TOKEN%/sendMessage" ^
  -H "Content-Type: application/json" ^
  -d "{\"chat_id\":\"%CHAT_ID%\",\"text\":\"%MSG%\",\"parse_mode\":\"HTML\"}"
