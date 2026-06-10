@echo off
chcp 65001 >nul
title Sellio 데모 서버
cd /d "%~dp0"

echo ============================================
echo   Sellio 데모(가라) 모드 실행
echo ============================================
echo.

REM node 설치 확인
where node >nul 2>nul
if errorlevel 1 (
  echo [오류] Node.js 가 설치되어 있지 않습니다.
  echo https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  pause
  exit /b
)

REM 최초 1회 의존성 설치
if not exist "node_modules" (
  echo [설치] 처음 실행이라 필요한 패키지를 설치합니다... 잠시만 기다려주세요.
  call npm install
  echo.
)

REM 데모 모드 ON
set DEMO_MODE=true

echo [실행] 서버를 켭니다.  주소: http://localhost:3000
echo        테스트 계정:  아이디 1234  /  비밀번호 1234
echo        (이 창을 닫으면 서버가 꺼집니다)
echo.

REM 3초 뒤 브라우저 자동 열기
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"

node server.js

echo.
echo 서버가 종료되었습니다.
pause
