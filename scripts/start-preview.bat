@echo off
REM ============================================================
REM SI Genie Consultant — Démarrage en mode PREVIEW (Production)
REM ============================================================
REM Mode preview = version build production optimisée
REM Plus léger et fluide que le mode développement
REM Parfait pour tester la version "quasi-product" localement
REM ============================================================

setlocal enabledelayedexpansion

echo.
echo ============================================================
echo SI Genie Consultant — Mode PREVIEW (Production Optimise)
echo ============================================================
echo.

REM -- Verifier Node.js --------------------------------------
echo [1/3] Verification de Node.js...
for /f "tokens=*" %%A in ('node --version 2^>nul') do set NODE_VERSION=%%A
if "%NODE_VERSION%"=="" (
    echo [ERROR] Node.js n'est pas installe.
    echo Veuillez installer Node.js depuis https://nodejs.org
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js %NODE_VERSION% detecte

REM -- Verifier npm ------------------------------------------
echo [2/3] Verification de npm...
for /f "tokens=*" %%A in ('npm --version 2^>nul') do set NPM_VERSION=%%A
if "%NPM_VERSION%"=="" (
    echo [ERROR] npm n'est pas installe.
    pause
    exit /b 1
)
echo [OK] npm v%NPM_VERSION% detecte

REM -- Verifier si build existe ----------------------------
echo [3/3] Verification du build production...
if not exist "dist\" (
    echo [WARN] Build production non trouve. Lancement du build...
    call npm run build
    if errorlevel 1 (
        echo [ERROR] Erreur lors du build. Veuillez verifier les erreurs ci-dessus.
        pause
        exit /b 1
    )
    echo [OK] Build production reussi
) else (
    echo [OK] Build production detecte (dist/)
)

REM -- Gestion des ports -------------------------------------
echo.
echo Verification disponibilite des ports...

REM Lister les processus Node.js existants
echo Processus Node en cours :
tasklist /fi "imagename eq node.exe" /fo table /nh

REM Check port 3001
netstat -ano | findstr ":3001 " >nul 2>&1
if not errorlevel 1 (
    echo.
    echo [WARN] Port 3001 en utilisation (backend proxy)
    echo Arret du processus precedent...
    taskkill /f /im node.exe >nul 2>&1
    timeout /t 2 /nobreak
)

REM -- Lancer mode PREVIEW  ----------------------------------
echo.
echo ============================================================
echo [START] Demarrage SI Genie Consultant en mode PREVIEW
echo ============================================================
echo.
echo Services demarres :
echo   - Backend Proxy    : http://localhost:3001
echo   - Interface SI     : http://localhost:4173  (version production optimisee)
echo.
echo [INFO] Mode PREVIEW = Build production optimise (plus leger et fluide que dev mode)
echo [STOP] Appuyez sur Ctrl+C pour arreter les services
echo.

REM Lancer concurrent - Backend + Preview
call npm run run:preview

endlocal
pause
