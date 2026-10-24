@echo off
rem Commandes de Modding Manager dans le terminal (mpm sans argument : la liste). L'executable de l'application est
rem lance en mode Node sur sa ligne de commande (son nom : executableName dans electron-builder.yml).
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0Modding Manager.exe" "%~dp0resources\app.asar\out\main\cli.js" %*
