@echo off
REM Pushes the source branch and the prebuilt Pages branch to GitHub.
REM Double-click this file from inside the project folder.

cd /d "%~dp0"

echo.
echo === Pushing source branch (main) ===
git push -u origin main
if errorlevel 1 goto :failed

echo.
echo === Pushing Pages branch (gh-pages) ===
REM The gh-pages branch holds generated build output only. Every rebuild
REM produces a brand new root commit, so it must replace the previous tip.
REM Nothing here is authored content, hence the force push.
git push --force origin gh-pages
if errorlevel 1 goto :failed

echo.
echo ==========================================
echo  DONE. Branches are on GitHub.
echo.
echo  App:  https://yako-ken.github.io/Attendance-QR-Offline/
echo  Repo: https://github.com/Yako-Ken/Attendance-QR-Offline
echo.
echo  Still needed, once, in the browser:
echo    Settings - Pages - Source: Deploy from a branch - branch: gh-pages
echo ==========================================
pause
exit /b 0

:failed
echo.
echo ==========================================
echo  PUSH FAILED.
echo.
echo  If the window closed instantly, open this
echo  file from a terminal to see the error:
echo    Right-click this file - Open with - Command Prompt
echo ==========================================
pause
exit /b 1