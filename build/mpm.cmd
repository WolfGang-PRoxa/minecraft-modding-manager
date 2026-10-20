@echo off
rem Commandes de Modpack Manager dans le terminal (mpm sans argument : la liste). L'executable de l'application est
rem lance en mode Node sur sa ligne de commande ; il garde l'ancien nom de l'application (electron-builder.yml).
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0Modpack Manager.exe" "%~dp0resources\app.asar\out\main\cli.js" %*
