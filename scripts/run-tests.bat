@echo off
echo ===============================================
echo  Tests E2E SI Génie Consultant
echo ===============================================
echo.

echo Démarrage du serveur SI Génie Consultant en arrière-plan...
start "Serveur SI - Vite Dev" cmd /k "npm run dev"
echo.
echo Attente du démarrage du serveur (20 secondes)...
timeout /t 20 /nobreak > nul

echo.
echo ===============================================
echo Lancement des tests E2E sur Edge (priorité)
echo ===============================================
echo.

npm run test:e2e:edge

echo.
echo Tests sur Edge terminés.
echo.
echo Fermeture du serveur en arrière-plan...
taskkill /f /im node.exe /t 2>nul
echo.
echo ===============================================
echo Terminé. Accédez aux rapports dans:
echo   - playwright-report/index.html
echo   - test-results/ (vidéos et captures)
echo ===============================================
pause