!include "WordFunc.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"
!include "nsDialogs.nsh"

; ==================================================================================================================
; Comportement
; ==================================================================================================================
; L'installeur est « assisté » (electron-builder.yml, oneClick: false) pour pouvoir dessiner ses fenêtres, mais il se
; comporte comme un installeur « en un clic » : aucune question (sauf si l'application est déjà installée ou ouverte),
; pour l'utilisateur seul, sans page de fin, et l'application s'ouvre quand c'est terminé.

; Installation pour l'utilisateur seul : la page « pour qui installer » n'est jamais montrée.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; Le raccourci du bureau est créé par l'application (au premier lancement ou dans ses paramètres),
; pas par l'installeur : on le retire à la désinstallation, mais pas lors d'une mise à jour.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  ${endIf}
  ; Pas de page de fin : la fenêtre se ferme d'elle-même.
  SetAutoClose true
!macroend

; Lors d'une mise à jour, l'ancien désinstalleur vide le dossier d'installation puis demande à l'Explorateur de
; redessiner ses icônes : le raccourci du bureau, conservé, pointe à ce moment-là vers un exécutable absent et perd
; son icône. electron-builder ne refait cette demande qu'en créant lui-même le raccourci du bureau
; (createDesktopShortcut), ce qu'il ne fait pas ici : on la refait une fois les nouveaux fichiers en place.
; Ensuite, comme l'installeur « en un clic » : la fenêtre se ferme et l'application s'ouvre (avec --updated après une
; mise à jour demandée par l'application, qui l'annonce alors).
!macro customInstall
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  SetAutoClose true
  ${IfNot} ${Silent}
    HideWindow
    ${If} ${isUpdated}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "--updated"
    ${Else}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
    ${EndIf}
  ${EndIf}
!macroend

; Application ouverte au moment d'installer ou de désinstaller : elle est fermée sans la boîte « … est en cours
; d'utilisation » d'electron-builder. L'installeur l'a annoncé sur sa page « application ouverte », le désinstalleur
; sur sa confirmation ; une mise à jour lancée par l'application la trouve en train de se fermer d'elle-même. Fermeture
; normale d'abord (comme la croix de la fenêtre), forcée au bout de 3 s ; une application qui résiste encore (lancée en
; administrateur) est à fermer à la main.
!macro customCheckAppRunning
  StrCpy $mpd.procPath ""
  Call ${MPD_FN}mpdCloseApp
  !ifndef BUILD_UNINSTALLER
    ; Ancienne identité de l'application (avant la 1.9.0) : elle est fermée et désinstallée avant que la nouvelle ne
    ; pose ses fichiers et ses raccourcis (voir mpdFindPrevious).
    ${If} $mpd.previousExe != ""
      StrCpy $mpd.procPath $mpd.previousExe
      Call mpdCloseApp
      StrCpy $mpd.procPath ""
      Call mpdUninstallPrevious
    ${EndIf}
  !endif
!macroend

; Au lancement de l'installeur, on regarde si l'application est déjà installée (et intacte) :
;  - même version          : la page « déjà installé » propose de l'ouvrir plutôt que de tout réinstaller ;
;  - version plus récente  : la même page prévient avant un retour en arrière ;
;  - version plus ancienne : mise à jour, sans question.
; Aucune question en mode silencieux (/S, les pages ne s'affichent pas) ni lors d'une mise à jour lancée par
; l'application (--updated), dont la fenêtre est celle d'une mise à jour.
!macro customInit
  Call mpdPackageDir
  StrCpy $mpd.mode install
  StrCpy $mpd.installed ""
  StrCpy $mpd.choice ""
  ReadRegStr $R0 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ${If} $R0 != ""
  ${AndIf} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    StrCpy $mpd.installed $R0
    ; $R1 : 0 = même version, 1 = celle installée est plus récente, 2 = cet installeur est plus récent
    ${VersionCompare} "$R0" "${VERSION}" $R1
    ${If} $R1 == 0
      StrCpy $mpd.mode same
    ${ElseIf} $R1 == 1
      StrCpy $mpd.mode newer
    ${Else}
      StrCpy $mpd.mode update
    ${EndIf}
  ${Else}
    Call mpdFindPrevious
    ${If} $mpd.previousExe != ""
      StrCpy $mpd.mode update
    ${EndIf}
  ${EndIf}
  ${If} ${isUpdated}
    StrCpy $mpd.mode update
  ${EndIf}
!macroend

; Pages de l'installeur : « déjà installé » et « application ouverte » (sautées le plus souvent), puis la progression.
; Pas de page de fin.
!macro customWelcomePage
  Page custom mpdExistingPage mpdExistingLeave
!macroend

!macro customPageAfterChangeDir
  Page custom mpdRunningPage mpdRunningLeave
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW mpdProgressShow
!macroend

!macro customFinishPage
!macroend

; Pages du désinstalleur : confirmation, puis sa propre page de progression, qui ferme la fenêtre une fois terminée.
; Celle de Modern UI vient après la page « pour qui installer » d'electron-builder, qui consommerait son rappel
; d'affichage (MUI_PAGE_CUSTOMFUNCTION_SHOW) : elle n'est jamais atteinte, comme la page de fin, sautée par sécurité.
!macro customUnWelcomePage
  UninstPage custom un.mpdConfirmPage un.mpdConfirmLeave
  UninstPage instfiles "" un.mpdProgressShow un.mpdProgressLeave
!macroend

!macro customUninstallPage
  !define MUI_PAGE_CUSTOMFUNCTION_PRE un.mpdSkipPage
!macroend

; ==================================================================================================================
; Apparence
; ==================================================================================================================
; Les fenêtres reprennent le style de l'application : fond sombre, logo, couleurs d'accent. Les pages de Modern
; UI gardent leur mécanique (enchaînement, progression), mais leur décor (bandeau, boutons, mention de version) est
; caché et chaque page est redessinée ici. Les boutons sont des textes cliquables : Windows ne colore pas ses boutons.

ManifestDPIAware true

!ifdef BUILD_UNINSTALLER
  !define MPD_FN "un."
  !define MUI_CUSTOMFUNCTION_UNGUIINIT un.mpdGuiInit
!else
  !define MPD_FN ""
  !define MUI_CUSTOMFUNCTION_GUIINIT mpdGuiInit
!endif

; Couleurs de l'application : RRGGBB pour SetCtlColors, 0x00BBGGRR pour les messages de Windows.
!define MPD_BG "0A0D12"
!define MPD_INK950 "07090D"
!define MPD_INK700 "212938"
!define MPD_INK600 "2C3547"
!define MPD_INK400 "6F7B8F"
!define MPD_INK300 "9AA4B5"
!define MPD_INK200 "C7CDD8"
!define MPD_INK100 "E9EDF3"
!define MPD_GRASS400 "7ED957"
!define MPD_GRASS300 "A6F08A"
!define MPD_SKY300 "7DD3FC"
!define MPD_AMBER "F5B642"
!define MPD_RED300 "FCA5A5"
!define MPD_DANGER "2C1519"
!define MPD_DANGER_HOVER "4A1D23"
!define MPD_GHOST_HOVER "1A1F28"
!define MPD_COLORREF_BG 0x00120D0A
!define MPD_COLORREF_TRACK 0x002B201A
!define MPD_COLORREF_GRASS 0x0057D97E
!define MPD_COLORREF_SKY 0x00F8BD38
!define MPD_COLORREF_AMBER 0x0042B6F5
!define MPD_COLORREF_NEUTRAL 0x00D8CDC7

; Largeur de la zone cliente, en pixels à 100 % (tout est ensuite mis à l'échelle de l'affichage).
!define MPD_WIDTH 472

Var mpd.dpi
Var mpd.height
Var mpd.parent
Var mpd.fontEyebrow
Var mpd.fontTitle
Var mpd.fontText
Var mpd.fontButton
Var mpd.logo
Var mpd.eyebrow
Var mpd.accent
Var mpd.title
Var mpd.subtitle
Var mpd.status
Var mpd.statusLabel
Var mpd.primary
Var mpd.secondary
Var mpd.cancel
Var mpd.hovered
Var mpd.choice
; Exécutable dont les processus sont cherchés par mpdAppProcesses (vide : celui de $INSTDIR).
Var mpd.procPath
!ifndef BUILD_UNINSTALLER
  ; install | same | newer | update, puis reinstall ou downgrade selon le choix fait sur la page « déjà installé »
  Var mpd.mode
  Var mpd.installed
  ; Ancienne identité de l'application trouvée par mpdFindPrevious : clé de désinstallation, exécutable, désinstalleur
  ; et dossier.
  Var mpd.previousKey
  Var mpd.previousExe
  Var mpd.previousUninstaller
  Var mpd.previousDir
!endif

; Pixels à l'échelle de l'affichage.
!macro MPD_PX _OUT _VALUE
  IntOp ${_OUT} ${_VALUE} * $mpd.dpi
  IntOp ${_OUT} ${_OUT} / 96
!macroend

!macro MPD_HIDE _ID
  GetDlgItem $0 $HWNDPARENT ${_ID}
  ShowWindow $0 ${SW_HIDE}
!macroend

; Texte posé sur la page $mpd.parent : position et taille en pixels à 100 %, police, couleur (RRGGBB).
!macro MPD_LABEL _OUT _X _Y _W _H _FONT _COLOR _TEXT
  !insertmacro MPD_PX $R6 ${_X}
  !insertmacro MPD_PX $R7 ${_Y}
  !insertmacro MPD_PX $R8 ${_W}
  !insertmacro MPD_PX $R9 ${_H}
  IntOp $R5 ${WS_CHILD} | ${WS_VISIBLE}
  IntOp $R5 $R5 | ${SS_NOPREFIX}
  System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "", i R5, i R6, i R7, i R8, i R9, p $mpd.parent, p 0, p 0, p 0) p .s'
  Pop ${_OUT}
  SendMessage ${_OUT} ${WM_SETFONT} ${_FONT} 0
  SetCtlColors ${_OUT} ${_COLOR} ${MPD_BG}
  SendMessage ${_OUT} ${WM_SETTEXT} 0 "STR:${_TEXT}"
!macroend

; Clic traité, la page passe à la suite comme avec le bouton « Suivant » (caché) : c'est sa fonction de sortie qui
; agit, car un « Quit » lancé depuis un clic nsDialogs reste sans effet.
!macro MPD_NEXT
  System::Call 'user32::PostMessageW(p $HWNDPARENT, i ${WM_COMMAND}, p 1, p 0)'
!macroend

; Bouton d'une page nsDialogs : un texte cliquable, centré, coloré par mpdPaintButtons.
!macro MPD_BUTTON _OUT _X _Y _W _H _TEXT _CALLBACK
  !insertmacro MPD_PX $R6 ${_X}
  !insertmacro MPD_PX $R7 ${_Y}
  !insertmacro MPD_PX $R8 ${_W}
  !insertmacro MPD_PX $R9 ${_H}
  nsDialogs::CreateControl STATIC ${WS_CHILD}|${WS_VISIBLE}|${SS_CENTER}|${SS_CENTERIMAGE}|${SS_NOTIFY}|${SS_NOPREFIX} 0 $R6 $R7 $R8 $R9 "${_TEXT}"
  Pop ${_OUT}
  SendMessage ${_OUT} ${WM_SETFONT} $mpd.fontButton 0
  ${NSD_OnClick} ${_OUT} ${_CALLBACK}
!macroend

; Logo dessiné pour l'échelle de l'affichage (build/installer/logo-<n>.bmp, scripts/generate-installer-images.ts).
!macro MPD_LOGO_FILE _N
  ${Case} ${_N}
    File "/oname=$PLUGINSDIR\mpd-logo.bmp" "${BUILD_RESOURCES_DIR}\installer\logo-${_N}.bmp"
!macroend

; Les fonctions sont insérées après les en-têtes d'electron-builder et de Modern UI, dont elles utilisent les noms.
!macro customHeader
  ; Décor de Modern UI caché : bandeau, lignes, boutons, mention de version. Les pages occupent toute la fenêtre.
  Function ${MPD_FN}mpdHideChrome
    !insertmacro MPD_HIDE 1
    !insertmacro MPD_HIDE 2
    !insertmacro MPD_HIDE 3
    !insertmacro MPD_HIDE 1028
    !insertmacro MPD_HIDE 1034
    !insertmacro MPD_HIDE 1035
    !insertmacro MPD_HIDE 1036
    !insertmacro MPD_HIDE 1037
    !insertmacro MPD_HIDE 1038
    !insertmacro MPD_HIDE 1039
    !insertmacro MPD_HIDE 1045
    !insertmacro MPD_HIDE 1046
    !insertmacro MPD_HIDE 1256
  FunctionEnd

  Function ${MPD_FN}mpdGuiInit
    System::Call 'user32::GetDC(p 0) p .r0'
    System::Call 'gdi32::GetDeviceCaps(p r0, i 88) i .r1'
    System::Call 'user32::ReleaseDC(p 0, p r0)'
    StrCpy $mpd.dpi $1
    ${If} $mpd.dpi < 96
      StrCpy $mpd.dpi 96
    ${EndIf}
    CreateFont $mpd.fontEyebrow "Segoe UI Semibold" 8 600
    CreateFont $mpd.fontTitle "Segoe UI Semibold" 16 600
    CreateFont $mpd.fontText "Segoe UI" 9 400
    CreateFont $mpd.fontButton "Segoe UI Semibold" 9 600
    ; Barre de titre sombre (attribut 20 depuis Windows 10 2004, 19 avant), de la couleur de la fenêtre sous Windows 11.
    System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4)'
    System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 19, *i 1, i 4)'
    System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 35, *i ${MPD_COLORREF_BG}, i 4)'
    SetCtlColors $HWNDPARENT "" ${MPD_BG}
    Call ${MPD_FN}mpdHideChrome
    ; Image n = ppp / 24 (logo de 16 × n pixels) : 4 à 100 %, 5 à 125 %, 6 à 150 %…
    InitPluginsDir
    IntOp $0 $mpd.dpi + 12
    IntOp $0 $0 / 24
    ${If} $0 < 4
      StrCpy $0 4
    ${ElseIf} $0 > 12
      StrCpy $0 12
    ${EndIf}
    ${Select} $0
      !insertmacro MPD_LOGO_FILE 4
      !insertmacro MPD_LOGO_FILE 5
      !insertmacro MPD_LOGO_FILE 6
      !insertmacro MPD_LOGO_FILE 7
      !insertmacro MPD_LOGO_FILE 8
      !insertmacro MPD_LOGO_FILE 9
      !insertmacro MPD_LOGO_FILE 10
      !insertmacro MPD_LOGO_FILE 11
    ${CaseElse}
      File "/oname=$PLUGINSDIR\mpd-logo.bmp" "${BUILD_RESOURCES_DIR}\installer\logo-12.bmp"
    ${EndSelect}
    System::Call 'user32::LoadImageW(p 0, w "$PLUGINSDIR\mpd-logo.bmp", i 0, i 0, i 0, i 0x10) p .r0'
    StrCpy $mpd.logo $0
    StrCpy $mpd.hovered 0
  FunctionEnd

  ; Fenêtre dont la zone cliente fait MPD_WIDTH × $mpd.height (pixels à 100 %), centrée sur sa position actuelle.
  Function ${MPD_FN}mpdResize
    !insertmacro MPD_PX $1 ${MPD_WIDTH}
    !insertmacro MPD_PX $2 $mpd.height
    System::Call 'user32::GetWindowLongW(p $HWNDPARENT, i -16) i .r3'
    System::Call 'user32::GetWindowLongW(p $HWNDPARENT, i -20) i .r4'
    System::Call '*(i 0, i 0, i r1, i r2) p .r5'
    System::Call 'user32::AdjustWindowRectEx(p r5, i r3, i 0, i r4)'
    System::Call '*$5(i .r6, i .r7, i .r8, i .r9)'
    IntOp $8 $8 - $6
    IntOp $9 $9 - $7
    System::Call 'user32::GetWindowRect(p $HWNDPARENT, p r5)'
    System::Call '*$5(i .r3, i .r4, i .r6, i .r7)'
    System::Free $5
    IntOp $3 $3 + $6
    IntOp $3 $3 - $8
    IntOp $3 $3 / 2
    IntOp $4 $4 + $7
    IntOp $4 $4 - $9
    IntOp $4 $4 / 2
    System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i r3, i r4, i r8, i r9, i 0x14)'
    ; Les pages nsDialogs prennent la place de ce cadre : toute la zone cliente.
    GetDlgItem $0 $HWNDPARENT 1018
    System::Call 'user32::SetWindowPos(p r0, p 0, i 0, i 0, i r1, i r2, i 0x14)'
  FunctionEnd

  ; En-tête d'une page ($mpd.parent) : logo, surtitre (couleur $mpd.accent), titre et sous-titre.
  Function ${MPD_FN}mpdHeader
    !insertmacro MPD_PX $R6 16
    !insertmacro MPD_PX $R7 16
    IntOp $R5 ${WS_CHILD} | ${WS_VISIBLE}
    IntOp $R5 $R5 | ${SS_BITMAP}
    System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "", i R5, i R6, i R7, i 0, i 0, p $mpd.parent, p 0, p 0, p 0) p .r0'
    SendMessage $0 ${STM_SETIMAGE} 0 $mpd.logo
    !insertmacro MPD_LABEL $0 124 34 316 16 $mpd.fontEyebrow ${MPD_GRASS300} "$mpd.eyebrow"
    ${If} $mpd.accent == sky
      SetCtlColors $0 ${MPD_SKY300} ${MPD_BG}
    ${ElseIf} $mpd.accent == amber
      SetCtlColors $0 ${MPD_AMBER} ${MPD_BG}
    ${ElseIf} $mpd.accent == red
      SetCtlColors $0 ${MPD_RED300} ${MPD_BG}
    ${EndIf}
    !insertmacro MPD_LABEL $0 124 50 316 30 $mpd.fontTitle ${MPD_INK100} "$mpd.title"
    !insertmacro MPD_LABEL $0 124 82 316 20 $mpd.fontText ${MPD_INK300} "$mpd.subtitle"
  FunctionEnd

  ; Couleurs des boutons, selon celui que survole la souris ($mpd.hovered).
  Function ${MPD_FN}mpdPaintButtons
    ${If} $mpd.hovered == $mpd.primary
      !ifdef BUILD_UNINSTALLER
        SetCtlColors $mpd.primary ${MPD_RED300} ${MPD_DANGER_HOVER}
      !else
        SetCtlColors $mpd.primary ${MPD_INK950} ${MPD_GRASS300}
      !endif
    ${Else}
      !ifdef BUILD_UNINSTALLER
        SetCtlColors $mpd.primary ${MPD_RED300} ${MPD_DANGER}
      !else
        SetCtlColors $mpd.primary ${MPD_INK950} ${MPD_GRASS400}
      !endif
    ${EndIf}
    System::Call 'user32::InvalidateRect(p $mpd.primary, p 0, i 1)'
    ${If} $mpd.secondary != 0
      ${If} $mpd.hovered == $mpd.secondary
        SetCtlColors $mpd.secondary ${MPD_INK100} ${MPD_INK600}
      ${Else}
        SetCtlColors $mpd.secondary ${MPD_INK100} ${MPD_INK700}
      ${EndIf}
      System::Call 'user32::InvalidateRect(p $mpd.secondary, p 0, i 1)'
    ${EndIf}
    ${If} $mpd.hovered == $mpd.cancel
      SetCtlColors $mpd.cancel ${MPD_INK100} ${MPD_GHOST_HOVER}
    ${Else}
      SetCtlColors $mpd.cancel ${MPD_INK200} ${MPD_BG}
    ${EndIf}
    System::Call 'user32::InvalidateRect(p $mpd.cancel, p 0, i 1)'
  FunctionEnd

  ; Survol des boutons, relevé toutes les 50 ms : un texte cliquable n'a pas d'effet de survol.
  Function ${MPD_FN}mpdHover
    System::Call '*(i 0, i 0) p .r0'
    System::Call 'user32::GetCursorPos(p r0)'
    System::Call '*$0(i .r1, i .r2)'
    System::Free $0
    System::Call 'user32::WindowFromPoint(i r1, i r2) p .r3'
    ${If} $3 != $mpd.primary
    ${AndIf} $3 != $mpd.secondary
    ${AndIf} $3 != $mpd.cancel
      StrCpy $3 0
    ${EndIf}
    ${If} $3 != $mpd.hovered
      StrCpy $mpd.hovered $3
      Call ${MPD_FN}mpdPaintButtons
    ${EndIf}
  FunctionEnd

  ; Processus de l'application installée, c'est-à-dire lancés depuis $INSTDIR\<exécutable> (ou depuis $mpd.procPath) :
  ; ni ceux d'un autre compte (qui bloqueraient l'installeur sans raison), ni ceux d'une autre copie. Entrée : $0 = 1
  ; pour les arrêter de force. Sortie : $0 = 1 si au moins un tournait. Structure PROCESSENTRY32W de l'installeur
  ; 32 bits : 556 octets.
  !if ${NSIS_PTR_SIZE} != 4
    !error "mpdAppProcesses suppose un installeur 32 bits (PROCESSENTRY32W)."
  !endif
  Function ${MPD_FN}mpdAppProcesses
    Push $1
    Push $2
    Push $3
    Push $4
    Push $5
    Push $6
    Push $7
    Push $8
    Push $9
    StrCpy $9 $mpd.procPath
    ${If} $9 == ""
      StrCpy $9 "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${EndIf}
    ${GetFileName} $9 $8
    StrCpy $7 $0
    StrCpy $0 0
    System::Call 'kernel32::CreateToolhelp32Snapshot(i 2, i 0) p .r1'
    System::Call '*(i 556, i, i, p, i, i, i, i, i, &w260) p .r2'
    System::Call 'kernel32::Process32FirstW(p r1, p r2) i .r3'
    ${DoWhile} $3 <> 0
      System::Call '*$2(i, i, i .r4, p, i, i, i, i, i, &w260 .r5)'
      ${If} $5 == $8
        ; PROCESS_QUERY_LIMITED_INFORMATION : autorisé même sur une application lancée en administrateur.
        System::Call 'kernel32::OpenProcess(i 0x1000, i 0, i r4) p .r6'
        ${If} $6 <> 0
          System::Call 'kernel32::QueryFullProcessImageNameW(p r6, i 0, w .r5, *i ${NSIS_MAX_STRLEN}) i'
          System::Call 'kernel32::CloseHandle(p r6)'
          ${If} $5 == $9
            StrCpy $0 1
            ${If} $7 == 1
              System::Call 'kernel32::OpenProcess(i 0x0001, i 0, i r4) p .r6'
              ${If} $6 <> 0
                System::Call 'kernel32::TerminateProcess(p r6, i 1)'
                System::Call 'kernel32::CloseHandle(p r6)'
              ${EndIf}
            ${EndIf}
          ${EndIf}
        ${EndIf}
      ${EndIf}
      System::Call 'kernel32::Process32NextW(p r1, p r2) i .r3'
    ${Loop}
    System::Free $2
    System::Call 'kernel32::CloseHandle(p r1)'
    Pop $9
    Pop $8
    Pop $7
    Pop $6
    Pop $5
    Pop $4
    Pop $3
    Pop $2
    Pop $1
  FunctionEnd

  ; Ferme l'application (l'exécutable de $mpd.procPath, sinon celui de $INSTDIR) : normalement d'abord, comme la croix
  ; de la fenêtre, de force au bout de 3 s. Lors d'une mise à jour lancée par l'application, elle a d'abord 3 s pour se
  ; fermer d'elle-même.
  Function ${MPD_FN}mpdCloseApp
    StrCpy $0 0
    Call ${MPD_FN}mpdAppProcesses
    ${If} $0 == 1
    ${AndIf} ${isUpdated}
      StrCpy $R1 0
      ${DoWhile} $R1 < 12
        Sleep 250
        StrCpy $0 0
        Call ${MPD_FN}mpdAppProcesses
        ${If} $0 == 0
          ${Break}
        ${EndIf}
        IntOp $R1 $R1 + 1
      ${Loop}
    ${EndIf}
    ${If} $0 == 1
      ${If} $mpd.statusLabel != ""
        SendMessage $mpd.statusLabel ${WM_SETTEXT} 0 "STR:Fermeture de l’application…"
      ${EndIf}
      StrCpy $R3 $mpd.procPath
      ${If} $R3 == ""
        StrCpy $R3 "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      ${EndIf}
      ${GetFileName} $R3 $R3
      ReadEnvStr $R2 USERNAME
      nsExec::Exec `"$SYSDIR\taskkill.exe" /IM "$R3" /FI "USERNAME eq $R2"`
      Pop $R2
      StrCpy $R1 0
      ${Do}
        Sleep 250
        IntOp $R1 $R1 + 1
        ; $0 = 1 : arrêt forcé.
        ${If} $R1 >= 12
          StrCpy $0 1
        ${Else}
          StrCpy $0 0
        ${EndIf}
        Call ${MPD_FN}mpdAppProcesses
        ${If} $0 == 0
          ${Break}
        ${EndIf}
        ${If} $R1 >= 24
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY mpdCloseRetry
          Quit
          mpdCloseRetry:
          StrCpy $R1 12
        ${EndIf}
      ${Loop}
      ${If} $mpd.statusLabel != ""
        SendMessage $mpd.statusLabel ${WM_SETTEXT} 0 "STR:$mpd.status"
      ${EndIf}
    ${EndIf}
  FunctionEnd

  ; Page de progression : en-tête, barre plate de la couleur d'accent, ligne d'état. Les contrôles de la page de NSIS
  ; (barre 1004, texte 1006, journal 1016, bouton « Afficher les détails » 1027) sont retrouvés dans son dialogue.
  Function ${MPD_FN}mpdProgressShow
    StrCpy $mpd.height 196
    Call ${MPD_FN}mpdResize
    Call ${MPD_FN}mpdHideChrome
    FindWindow $mpd.parent "#32770" "" $HWNDPARENT
    !insertmacro MPD_PX $1 ${MPD_WIDTH}
    !insertmacro MPD_PX $2 196
    System::Call 'user32::SetWindowPos(p $mpd.parent, p 0, i 0, i 0, i r1, i r2, i 0x14)'
    SetCtlColors $mpd.parent "" ${MPD_BG}
    GetDlgItem $0 $mpd.parent 1006
    ShowWindow $0 ${SW_HIDE}
    GetDlgItem $0 $mpd.parent 1016
    ShowWindow $0 ${SW_HIDE}
    GetDlgItem $0 $mpd.parent 1027
    ShowWindow $0 ${SW_HIDE}

    Call ${MPD_FN}mpdDescribe
    Call ${MPD_FN}mpdHeader

    ; Barre plate : sans le thème de Windows, qui imposerait sa couleur, ni bordure.
    GetDlgItem $0 $mpd.parent 1004
    System::Call 'uxtheme::SetWindowTheme(p r0, w " ", w " ")'
    System::Call 'user32::GetWindowLongW(p r0, i -16) i .r1'
    IntOp $1 $1 & 0xFF7FFFFF
    System::Call 'user32::SetWindowLongW(p r0, i -16, i r1)'
    System::Call 'user32::GetWindowLongW(p r0, i -20) i .r1'
    IntOp $1 $1 & 0xFFFDFDFF
    System::Call 'user32::SetWindowLongW(p r0, i -20, i r1)'
    !insertmacro MPD_PX $1 32
    !insertmacro MPD_PX $2 136
    !insertmacro MPD_PX $3 408
    !insertmacro MPD_PX $4 6
    System::Call 'user32::SetWindowPos(p r0, p 0, i r1, i r2, i r3, i r4, i 0x34)'
    SendMessage $0 ${PBM_SETBKCOLOR} 0 ${MPD_COLORREF_TRACK}
    ${If} $mpd.accent == sky
      SendMessage $0 ${PBM_SETBARCOLOR} 0 ${MPD_COLORREF_SKY}
    ${ElseIf} $mpd.accent == amber
      SendMessage $0 ${PBM_SETBARCOLOR} 0 ${MPD_COLORREF_AMBER}
    ${ElseIf} $mpd.accent == red
      SendMessage $0 ${PBM_SETBARCOLOR} 0 ${MPD_COLORREF_NEUTRAL}
    ${Else}
      SendMessage $0 ${PBM_SETBARCOLOR} 0 ${MPD_COLORREF_GRASS}
    ${EndIf}
    !insertmacro MPD_LABEL $mpd.statusLabel 32 152 408 20 $mpd.fontText ${MPD_INK400} "$mpd.status"
  FunctionEnd

  !ifndef BUILD_UNINSTALLER
    ; Une nouvelle installation va dans Programs\<nom du paquet>, comme avec l'installeur « en un clic » : en mode
    ; assisté, electron-builder prendrait le nom du produit. Refait par la page « application ouverte », car la page
    ; « pour qui installer » (jamais montrée) recalcule le dossier entre-temps. Une installation existante ou /D=… n'y
    ; change rien.
    Function mpdPackageDir
      ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
      ${If} $0 == ""
      ${AndIf} $installMode == CurrentUser
        !insertmacro GetDParameter $0
        ${If} $0 == ""
          ${GetParent} $INSTDIR $0
          StrCpy $INSTDIR "$0\${APP_PACKAGE_NAME}"
        ${EndIf}
      ${EndIf}
    FunctionEnd

    ; Ancienne identité de l'application (avant la 1.9.0 : autre appId, donc autre clé de désinstallation, autre dossier
    ; et autre exécutable) : une entrée de « Applications installées » du même éditeur, au nom du même produit (« Modpack
    ; Manager 1.8.3 »), dont l'exécutable et le désinstalleur existent encore. Elle compte comme une mise à jour, de sa
    ; version à celle-ci. À retirer avec src/shared/previousIdentity.ts.
    Function mpdFindPrevious
      Push $1
      Push $2
      Push $3
      Push $4
      StrCpy $mpd.previousExe ""
      StrLen $4 "${PRODUCT_NAME} "
      StrCpy $1 0
      ${Do}
        EnumRegKey $2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall" $1
        ${If} $2 == ""
          ${Break}
        ${EndIf}
        IntOp $1 $1 + 1
        ${If} $2 == "${UNINSTALL_APP_KEY}"
          ${Continue}
        ${EndIf}
        ReadRegStr $3 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$2" "Publisher"
        ${If} $3 != "${COMPANY_NAME}"
          ${Continue}
        ${EndIf}
        ReadRegStr $3 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$2" "DisplayName"
        StrCpy $3 $3 $4
        ${If} $3 != "${PRODUCT_NAME} "
          ${Continue}
        ${EndIf}
        ; DisplayIcon : « <exécutable>,0 ».
        ReadRegStr $3 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$2" "DisplayIcon"
        StrCpy $mpd.previousExe $3 -2
        ; UninstallString : « "<désinstalleur>" /currentuser ».
        ReadRegStr $3 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$2" "UninstallString"
        ${WordFind} $3 '"' "+1" $mpd.previousUninstaller
        ReadRegStr $mpd.installed HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$2" "DisplayVersion"
        ${GetParent} $mpd.previousUninstaller $mpd.previousDir
        StrCpy $mpd.previousKey $2
        ${If} ${FileExists} "$mpd.previousExe"
        ${AndIf} ${FileExists} "$mpd.previousUninstaller"
        ${AndIf} $mpd.previousDir != ""
          ${Break}
        ${EndIf}
        StrCpy $mpd.previousExe ""
        StrCpy $mpd.installed ""
      ${Loop}
      Pop $4
      Pop $3
      Pop $2
      Pop $1
    FunctionEnd

    ; Désinstalle l'ancienne identité comme lors d'une mise à jour (--updated) : elle garde les données et le raccourci
    ; du bureau, que l'application reprend à son premier lancement. Le désinstalleur se recopie dans %TEMP% et s'y
    ; relance (lancé depuis son dossier, il ne pourrait pas le déplacer, et s'arrêterait sans retirer son entrée) :
    ; ExecWait rend donc la main tout de suite, et l'on attend que son entrée disparaisse des « Applications
    ; installées » (60 s au plus). Ce qui resterait de son dossier part ensuite.
    Function mpdUninstallPrevious
      ${If} $mpd.statusLabel != ""
        SendMessage $mpd.statusLabel ${WM_SETTEXT} 0 "STR:Retrait de l’ancienne version…"
      ${EndIf}
      ExecWait '"$mpd.previousUninstaller" /currentuser /S --updated'
      StrCpy $R1 0
      ${Do}
        ReadRegStr $R2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$mpd.previousKey" "DisplayName"
        ${If} $R2 == ""
        ${OrIf} $R1 >= 240
          ${Break}
        ${EndIf}
        Sleep 250
        IntOp $R1 $R1 + 1
      ${Loop}
      RMDir /r "$mpd.previousDir"
      ${If} $mpd.statusLabel != ""
        SendMessage $mpd.statusLabel ${WM_SETTEXT} 0 "STR:$mpd.status"
      ${EndIf}
    FunctionEnd

    ; Ce que fait l'installeur, selon $mpd.mode : surtitre, couleur d'accent, titre, sous-titre, ligne d'état et titre
    ; de la fenêtre. Une mise à jour a sa propre fenêtre, en bleu, avec l'ancienne et la nouvelle version.
    Function mpdDescribe
      StrCpy $mpd.title "${PRODUCT_NAME}"
      StrCpy $mpd.subtitle "Version ${VERSION}"
      StrCpy $mpd.eyebrow "INSTALLATION"
      StrCpy $mpd.accent grass
      StrCpy $mpd.status "L’application s’ouvrira toute seule à la fin."
      StrCpy $0 "Installation de ${PRODUCT_NAME}"
      ${If} $mpd.mode == update
        StrCpy $mpd.eyebrow "MISE À JOUR"
        StrCpy $mpd.accent sky
        ${If} $mpd.installed != ""
        ${AndIf} $mpd.installed != "${VERSION}"
          StrCpy $mpd.subtitle "Version $mpd.installed → ${VERSION}"
        ${EndIf}
        ${If} ${isUpdated}
          StrCpy $mpd.status "L’application se relancera toute seule à la fin."
        ${EndIf}
        StrCpy $0 "Mise à jour de ${PRODUCT_NAME}"
      ${ElseIf} $mpd.mode == reinstall
        StrCpy $mpd.eyebrow "RÉINSTALLATION"
      ${ElseIf} $mpd.mode == downgrade
        StrCpy $mpd.eyebrow "RETOUR À UNE VERSION PRÉCÉDENTE"
        StrCpy $mpd.accent amber
        StrCpy $mpd.subtitle "Version $mpd.installed → ${VERSION}"
      ${EndIf}
      SendMessage $HWNDPARENT ${WM_SETTEXT} 0 "STR:$0"
    FunctionEnd

    ; Application ouverte : elle va être fermée pour continuer (customCheckAppRunning), ce que la page annonce. Sautée
    ; quand elle ne tourne pas, et lors d'une mise à jour lancée par l'application, qui se ferme d'elle-même.
    Function mpdRunningPage
      Call mpdPackageDir
      ${If} ${isUpdated}
        Abort
      ${EndIf}
      StrCpy $0 0
      Call mpdAppProcesses
      ${If} $0 == 0
      ${AndIf} $mpd.previousExe != ""
        StrCpy $mpd.procPath $mpd.previousExe
        Call mpdAppProcesses
        StrCpy $mpd.procPath ""
      ${EndIf}
      ${If} $0 == 0
        Abort
      ${EndIf}
      StrCpy $mpd.height 254
      Call mpdResize
      nsDialogs::Create 1018
      Pop $mpd.parent
      ${If} $mpd.parent == error
        Abort
      ${EndIf}
      SetCtlColors $mpd.parent "" ${MPD_BG}
      Call mpdHideChrome
      Call mpdDescribe
      StrCpy $mpd.eyebrow "APPLICATION OUVERTE"
      StrCpy $mpd.accent amber
      Call mpdHeader
      !insertmacro MPD_LABEL $0 32 124 408 54 $mpd.fontText ${MPD_INK300} "L’application est ouverte${U+00A0}: elle va être fermée pour continuer, puis rouverte à la fin. Si un modpack est en cours d’installation ou de publication, attends qu’il se termine."
      StrCpy $mpd.secondary 0
      StrCpy $mpd.choice ""
      !insertmacro MPD_BUTTON $mpd.cancel 164 192 100 34 "Annuler" mpdCancelClick
      !insertmacro MPD_BUTTON $mpd.primary 272 192 168 34 "Fermer et continuer" mpdInstallClick
      StrCpy $mpd.hovered 0
      Call mpdPaintButtons
      ${NSD_CreateTimer} mpdHover 50
      nsDialogs::Show
    FunctionEnd

    ; « Fermer et continuer », ou la touche Entrée : on continue.
    Function mpdRunningLeave
      ${NSD_KillTimer} mpdHover
      ${If} $mpd.choice == cancel
        SetErrorLevel 1
        Quit
      ${EndIf}
    FunctionEnd

    ; Application déjà installée, dans la même version ou une plus récente : ouvrir, ou installer quand même.
    Function mpdExistingPage
      ${If} $mpd.mode != same
      ${AndIf} $mpd.mode != newer
        Abort
      ${EndIf}
      StrCpy $mpd.height 254
      Call mpdResize
      nsDialogs::Create 1018
      Pop $mpd.parent
      ${If} $mpd.parent == error
        Abort
      ${EndIf}
      SetCtlColors $mpd.parent "" ${MPD_BG}
      Call mpdHideChrome
      SendMessage $HWNDPARENT ${WM_SETTEXT} 0 "STR:Installation de ${PRODUCT_NAME}"
      StrCpy $mpd.title "${PRODUCT_NAME}"
      ${If} $mpd.mode == same
        StrCpy $mpd.eyebrow "DÉJÀ INSTALLÉ"
        StrCpy $mpd.accent grass
        StrCpy $mpd.subtitle "Version ${VERSION}"
        Call mpdHeader
        !insertmacro MPD_LABEL $0 32 124 408 54 $mpd.fontText ${MPD_INK300} "Cette version est déjà sur ce PC. Tu peux l’ouvrir directement, ou la réinstaller${U+00A0}: tes réglages et tes modpacks sont conservés."
        !insertmacro MPD_BUTTON $mpd.cancel 44 192 96 34 "Annuler" mpdCancelClick
        !insertmacro MPD_BUTTON $mpd.secondary 148 192 116 34 "Réinstaller" mpdInstallClick
        !insertmacro MPD_BUTTON $mpd.primary 272 192 168 34 "Ouvrir l’application" mpdOpenClick
      ${Else}
        StrCpy $mpd.eyebrow "VERSION PLUS RÉCENTE INSTALLÉE"
        StrCpy $mpd.accent amber
        StrCpy $mpd.subtitle "Version $mpd.installed"
        Call mpdHeader
        !insertmacro MPD_LABEL $0 32 124 408 54 $mpd.fontText ${MPD_INK300} "Cet installeur contient la ${VERSION}, plus ancienne. Tu peux ouvrir la version installée, ou revenir à la ${VERSION}${U+00A0}: tes réglages et tes modpacks sont conservés."
        !insertmacro MPD_BUTTON $mpd.cancel 36 192 96 34 "Annuler" mpdCancelClick
        !insertmacro MPD_BUTTON $mpd.secondary 140 192 146 34 "Installer la ${VERSION}" mpdInstallClick
        !insertmacro MPD_BUTTON $mpd.primary 294 192 146 34 "Ouvrir la $mpd.installed" mpdOpenClick
      ${EndIf}
      StrCpy $mpd.hovered 0
      Call mpdPaintButtons
      ${NSD_CreateTimer} mpdHover 50
      nsDialogs::Show
    FunctionEnd

    Function mpdOpenClick
      StrCpy $mpd.choice open
      !insertmacro MPD_NEXT
    FunctionEnd

    Function mpdInstallClick
      StrCpy $mpd.choice install
      !insertmacro MPD_NEXT
    FunctionEnd

    Function mpdCancelClick
      StrCpy $mpd.choice cancel
      !insertmacro MPD_NEXT
    FunctionEnd

    Function mpdExistingLeave
      ${NSD_KillTimer} mpdHover
      ${If} $mpd.choice == cancel
        SetErrorLevel 1
        Quit
      ${ElseIf} $mpd.choice != install
        ; « Ouvrir », ou la touche Entrée (l'action principale). Si la version installée tourne déjà, son verrou
        ; d'instance ramène simplement sa fenêtre.
        ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "open" ""
        SetErrorLevel 0
        Quit
      ${EndIf}
      ${If} $mpd.mode == same
        StrCpy $mpd.mode reinstall
      ${Else}
        StrCpy $mpd.mode downgrade
      ${EndIf}
    FunctionEnd
  !else
    Function un.mpdDescribe
      StrCpy $mpd.title "${PRODUCT_NAME}"
      StrCpy $mpd.subtitle "Version ${VERSION}"
      StrCpy $mpd.eyebrow "DÉSINSTALLATION"
      StrCpy $mpd.accent red
      StrCpy $mpd.status "Tes modpacks et tes réglages sont conservés."
      SendMessage $HWNDPARENT ${WM_SETTEXT} 0 "STR:Désinstallation de ${PRODUCT_NAME}"
    FunctionEnd

    ; Confirmation de la désinstallation (remplace la boîte « Êtes-vous sûr… » de l'installeur « en un clic »). Elle
    ; annonce aussi la fermeture de l'application si elle est ouverte (customCheckAppRunning).
    Function un.mpdConfirmPage
      StrCpy $mpd.height 254
      Call un.mpdResize
      nsDialogs::Create 1018
      Pop $mpd.parent
      ${If} $mpd.parent == error
        Abort
      ${EndIf}
      SetCtlColors $mpd.parent "" ${MPD_BG}
      Call un.mpdHideChrome
      Call un.mpdDescribe
      Call un.mpdHeader
      StrCpy $0 0
      Call un.mpdAppProcesses
      ${If} $0 == 1
        StrCpy $1 "L’application est ouverte${U+00A0}: elle va être fermée, puis retirée de ce PC. Tes modpacks restent dans CurseForge, et tes réglages sont conservés."
      ${Else}
        StrCpy $1 "L’application va être retirée de ce PC. Tes modpacks restent dans CurseForge, et tes réglages sont conservés."
      ${EndIf}
      !insertmacro MPD_LABEL $0 32 124 408 54 $mpd.fontText ${MPD_INK300} "$1"
      StrCpy $mpd.secondary 0
      StrCpy $mpd.choice ""
      !insertmacro MPD_BUTTON $mpd.cancel 192 192 100 34 "Annuler" un.mpdCancelClick
      !insertmacro MPD_BUTTON $mpd.primary 300 192 140 34 "Désinstaller" un.mpdUninstallClick
      StrCpy $mpd.hovered 0
      Call un.mpdPaintButtons
      ${NSD_CreateTimer} un.mpdHover 50
      nsDialogs::Show
    FunctionEnd

    Function un.mpdUninstallClick
      StrCpy $mpd.choice uninstall
      !insertmacro MPD_NEXT
    FunctionEnd

    Function un.mpdCancelClick
      StrCpy $mpd.choice cancel
      !insertmacro MPD_NEXT
    FunctionEnd

    ; La touche Entrée ne désinstalle pas : il faut cliquer sur « Désinstaller ».
    Function un.mpdConfirmLeave
      ${If} $mpd.choice == cancel
        SetErrorLevel 1
        Quit
      ${ElseIf} $mpd.choice != uninstall
        Abort
      ${EndIf}
      ${NSD_KillTimer} un.mpdHover
    FunctionEnd

    ; Désinstallation terminée : la fenêtre se ferme.
    Function un.mpdProgressLeave
      SetErrorLevel 0
      Quit
    FunctionEnd

    Function un.mpdSkipPage
      Abort
    FunctionEnd
  !endif
!macroend
