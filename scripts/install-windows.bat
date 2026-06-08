@echo off
REM ============================================================
REM  Installation Automatique SI-GC — Scenario B (Reseau Local)
REM  Windows Batch Script
REM  Usage: Double-cliquez sur ce fichier (install-windows.bat)
REM ============================================================

setlocal enabledelayedexpansion
cls

echo.
echo ============================================================
echo  SI Genie Consultant — Installation Automatique
echo  Scenario B (Reseau Local Windows)
echo ============================================================
echo.

REM Vérifier Node.js
echo [1/4] Verification de Node.js...
set "NODE_EXE="
for /f "delims=" %%i in ('where node 2^>nul') do set "NODE_EXE=%%i"
if "!NODE_EXE!"=="" (
    echo Debug: where node failed, trying common paths...
    if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE_EXE=C:\Program Files\nodejs\node.exe"
    ) else if exist "C:\Program Files (x86)\nodejs\node.exe" (
        set "NODE_EXE=C:\Program Files (x86)\nodejs\node.exe"
    ) else (
        echo.
        echo ERREUR: Node.js non trouve !
        echo Installez Node.js depuis https://nodejs.org (LTS)
        echo Puis relancez ce script.
        pause
        exit /b 1
    )
)
echo Debug: NODE_EXE=!NODE_EXE!
if not exist "!NODE_EXE!" (
    echo Debug: File not found at !NODE_EXE!
    echo.
    echo ERREUR: Node.js non trouve a !NODE_EXE!
    pause
    exit /b 1
)
"!NODE_EXE!" --version >nul 2>&1
if errorlevel 1 (
    echo Debug: --version failed with errorlevel %errorlevel%
    echo.
    echo ERREUR: Node.js detecte mais ne fonctionne pas !
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('"!NODE_EXE!" --version') do set "NODE_VER=%%i"
echo   [OK] Node.js !NODE_VER! detecte
echo.

REM Installer dépendances frontend
echo [2/4] Installation des dependances frontend...
echo   (peut prendre 3-5 minutes...)
call npm install
if errorlevel 1 (
    echo.
    echo ERREUR: Installation npm frontend echouee
    pause
    exit /b 1
)
echo   [OK] Frontend pret
echo.

REM Installer dépendances backend
echo [3/4] Installation des dependances backend...
cd api-proxy
call npm install
if errorlevel 1 (
    echo.
    echo ERREUR: Installation npm backend echouee
    cd ..
    pause
    exit /b 1
)
cd ..
echo   [OK] Backend pret
echo.

REM Configuration .env
echo [4/4] Configuration du serveur...
if not exist "api-proxy\.env" (
    echo   Creation du fichier .env...
    (
        echo JWT_SECRET=genie-consultant-secure-key-!RANDOM!-!TIME:~0,2!
        echo PORT=3001
        echo NODE_ENV=production
        echo EMAIL_USER=votre-email@exemple.com
        echo EMAIL_PASS=votre-mot-de-passe-email
        echo CLAUDE_API_KEY=sk-ant-api03-VOTRE_CLE_ICI
        echo GEMINI_API_KEY=AIzaSy-VOTRE_CLE_ICI
        echo OPENAI_API_KEY=sk-VOTRE_CLE_ICI
    ) > "api-proxy\.env"
    echo   [OK] .env cree avec cles par defaut
    echo   [WARN] IMPORTANT: Editez api-proxy\.env pour configurer vos vraies cles email et IA
) else (
    echo   [OK] .env deja present
)
echo.

REM Créer script de démarrage
echo   Creation des scripts de démarrage...
(
    echo @echo off
    echo echo Lancement du BACKEND API SI-Genie...
    echo cd api-proxy
    echo npm start
    echo pause
) > "DEMARRER-BACKEND.bat"

(
    echo @echo off
    echo echo Lancement du FRONTEND SI-Genie...
    echo npm run dev
    echo pause
) > "DEMARRER-FRONTEND.bat"

echo   [OK] Scripts de demarrage crees:
echo     - DEMARRER-BACKEND.bat
echo     - DEMARRER-FRONTEND.bat
echo.

echo ============================================================
echo  ✅ INSTALLATION TERMINÉE !
echo ============================================================
echo  [SUCCESS] INSTALLATION TERMINEE !
echo ============================================================
echo.
echo INSTRUCTION DE DEMARRAGE:
echo.
echo 1. Ouvrez DEUX terminaux (fenetres cmd separees):
echo.
echo    Terminal 1:
echo      Double-cliquez: DEMARRER-BACKEND.bat
echo      Attendre le message: "Server running on port 3001"
echo.
echo    Terminal 2:
echo      Double-cliquez: DEMARRER-FRONTEND.bat
echo      Attendre le message: "Local: http://localhost:5173"
echo.
echo 2. Dans Terminal 2, notez l'adresse "Network: http://192.168.X.X:5173"
echo.
echo 3. Sur cet ordinateur, ouvrez: http://localhost:5173
echo    Sur les autres ordinateurs: http://192.168.X.X:5173
echo.
echo 4. Connexion par defaut:
echo    Email: admin@genie-consultant.ga
echo    Mot de passe: Admin@SI#2026!
echo    (Changez le mot de passe immediatement !)
echo.
echo 5. Pour arreter: Ctrl+C dans chaque terminal
echo.
echo ============================================================
echo  Suivant: Consultez DEPLOIEMENT_COMPTES.md
echo ============================================================
echo.
pause
