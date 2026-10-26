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

; Nom affiché par les installations précédentes (« Modpack Manager » jusqu'à la 1.9.x, sous deux identités) : leur
; entrée des « Applications installées » s'appelle « Modpack Manager x.y.z ». Voir src/shared/previousIdentity.ts.
!define MM_PREVIOUS_PRODUCT_NAME "Modpack Manager"

; Installation pour l'utilisateur seul : la page « pour qui installer » n'est jamais montrée.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; Le raccourci du bureau et le lancement avec Windows (valeur « ${PRODUCT_NAME} » de la clé Run, src/main/startup.ts)
; sont créés par l'application, pas par l'installeur : on les retire à la désinstallation, mais pas lors d'une mise à jour.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${PRODUCT_NAME}"
  ${endIf}
  ; Pas de page de fin : la fenêtre se ferme d'elle-même.
  SetAutoClose true
!macroend

; Lors d'une mise à jour, l'ancien désinstalleur vide le dossier d'installation puis demande à l'Explorateur de
; redessiner ses icônes : le raccourci du bureau, conservé, pointe à ce moment-là vers un exécutable absent et perd
; son icône. electron-builder ne refait cette demande qu'en créant lui-même le raccourci du bureau
; (createDesktopShortcut), ce qu'il ne fait pas ici : on la refait une fois les nouveaux fichiers en place.
; Ensuite, comme l'installeur « en un clic » : la fenêtre se ferme et l'application s'ouvre (avec --updated après une
; mise à jour demandée par l'application, qui l'annonce alors, et --minimized si elle était réduite : lancée avec
; Windows, elle le reste).
!macro customInstall
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  SetAutoClose true
  ${IfNot} ${Silent}
    HideWindow
    ${If} ${isUpdated}
      ${GetParameters} $R8
      ClearErrors
      ${GetOptions} $R8 "--minimized" $R9
      ${If} ${Errors}
        ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "--updated"
      ${Else}
        ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "--updated --minimized"
      ${EndIf}
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
  StrCpy $mm.procPath ""
  Call ${MM_FN}mmCloseApp
  !ifndef BUILD_UNINSTALLER
    ; Ancienne identité de l'application (avant la 2.0.0) : elle est fermée et désinstallée avant que la nouvelle ne
    ; pose ses fichiers et ses raccourcis (voir mmFindPrevious).
    ${If} $mm.previousExe != ""
      StrCpy $mm.procPath $mm.previousExe
      Call mmCloseApp
      StrCpy $mm.procPath ""
      Call mmUninstallPrevious
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
  Call mmPackageDir
  StrCpy $mm.mode install
  StrCpy $mm.installed ""
  StrCpy $mm.choice ""
  ReadRegStr $R0 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ${If} $R0 != ""
  ${AndIf} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    StrCpy $mm.installed $R0
    ; $R1 : 0 = même version, 1 = celle installée est plus récente, 2 = cet installeur est plus récent
    ${VersionCompare} "$R0" "${VERSION}" $R1
    ${If} $R1 == 0
      StrCpy $mm.mode same
    ${ElseIf} $R1 == 1
      StrCpy $mm.mode newer
    ${Else}
      StrCpy $mm.mode update
    ${EndIf}
  ${Else}
    Call mmFindPrevious
    ${If} $mm.previousExe != ""
      StrCpy $mm.mode update
    ${EndIf}
  ${EndIf}
  ${If} ${isUpdated}
    StrCpy $mm.mode update
  ${EndIf}
!macroend

; Pages de l'installeur : « déjà installé » et « application ouverte » (sautées le plus souvent), puis la progression.
; Pas de page de fin.
!macro customWelcomePage
  Page custom mmExistingPage mmExistingLeave
!macroend

!macro customPageAfterChangeDir
  Page custom mmRunningPage mmRunningLeave
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW mmProgressShow
!macroend

!macro customFinishPage
!macroend

; Pages du désinstalleur : confirmation, puis sa propre page de progression, qui ferme la fenêtre une fois terminée.
; Celle de Modern UI vient après la page « pour qui installer » d'electron-builder, qui consommerait son rappel
; d'affichage (MUI_PAGE_CUSTOMFUNCTION_SHOW) : elle n'est jamais atteinte, comme la page de fin, sautée par sécurité.
!macro customUnWelcomePage
  UninstPage custom un.mmConfirmPage un.mmConfirmLeave
  UninstPage instfiles "" un.mmProgressShow un.mmProgressLeave
!macroend

!macro customUninstallPage
  !define MUI_PAGE_CUSTOMFUNCTION_PRE un.mmSkipPage
!macroend

; ==================================================================================================================
; Apparence
; ==================================================================================================================
; Les fenêtres reprennent le style de l'application : fond sombre, logo, couleurs d'accent. Les pages de Modern
; UI gardent leur mécanique (enchaînement, progression), mais leur décor (bandeau, boutons, mention de version) est
; caché et chaque page est redessinée ici. Les boutons sont des textes cliquables : Windows ne colore pas ses boutons.

ManifestDPIAware true

!ifdef BUILD_UNINSTALLER
  !define MM_FN "un."
  !define MUI_CUSTOMFUNCTION_UNGUIINIT un.mmGuiInit
!else
  !define MM_FN ""
  !define MUI_CUSTOMFUNCTION_GUIINIT mmGuiInit
!endif

; Couleurs de l'application : RRGGBB pour SetCtlColors, 0x00BBGGRR pour les messages de Windows.
!define MM_BG "0A0D12"
!define MM_INK950 "07090D"
!define MM_INK700 "212938"
!define MM_INK600 "2C3547"
!define MM_INK400 "6F7B8F"
!define MM_INK300 "9AA4B5"
!define MM_INK200 "C7CDD8"
!define MM_INK100 "E9EDF3"
!define MM_GRASS400 "7ED957"
!define MM_GRASS300 "A6F08A"
!define MM_SKY300 "7DD3FC"
!define MM_AMBER "F5B642"
!define MM_RED300 "FCA5A5"
!define MM_DANGER "2C1519"
!define MM_DANGER_HOVER "4A1D23"
!define MM_GHOST_HOVER "1A1F28"
!define MM_COLORREF_BG 0x00120D0A
!define MM_COLORREF_TRACK 0x002B201A
!define MM_COLORREF_GRASS 0x0057D97E
!define MM_COLORREF_SKY 0x00F8BD38
!define MM_COLORREF_AMBER 0x0042B6F5
!define MM_COLORREF_NEUTRAL 0x00D8CDC7

; Largeur de la zone cliente, en pixels à 100 % (tout est ensuite mis à l'échelle de l'affichage).
!define MM_WIDTH 472

Var mm.dpi
Var mm.height
Var mm.parent
Var mm.fontEyebrow
Var mm.fontTitle
Var mm.fontText
Var mm.fontButton
Var mm.logo
Var mm.eyebrow
Var mm.accent
Var mm.title
Var mm.subtitle
Var mm.status
Var mm.statusLabel
Var mm.primary
Var mm.secondary
Var mm.cancel
Var mm.hovered
Var mm.choice
; Exécutable dont les processus sont cherchés par mmAppProcesses (vide : celui de $INSTDIR).
Var mm.procPath
!ifndef BUILD_UNINSTALLER
  ; install | same | newer | update, puis reinstall ou downgrade selon le choix fait sur la page « déjà installé »
  Var mm.mode
  Var mm.installed
  ; Ancienne identité de l'application trouvée par mmFindPrevious : clé de désinstallation, exécutable, désinstalleur
  ; et dossier.
  Var mm.previousKey
  Var mm.previousExe
  Var mm.previousUninstaller
  Var mm.previousDir
!endif

; Pixels à l'échelle de l'affichage.
!macro MM_PX _OUT _VALUE
  IntOp ${_OUT} ${_VALUE} * $mm.dpi
  IntOp ${_OUT} ${_OUT} / 96
!macroend

!macro MM_HIDE _ID
  GetDlgItem $0 $HWNDPARENT ${_ID}
  ShowWindow $0 ${SW_HIDE}
!macroend

; Texte posé sur la page $mm.parent : position et taille en pixels à 100 %, police, couleur (RRGGBB).
!macro MM_LABEL _OUT _X _Y _W _H _FONT _COLOR _TEXT
  !insertmacro MM_PX $R6 ${_X}
  !insertmacro MM_PX $R7 ${_Y}
  !insertmacro MM_PX $R8 ${_W}
  !insertmacro MM_PX $R9 ${_H}
  IntOp $R5 ${WS_CHILD} | ${WS_VISIBLE}
  IntOp $R5 $R5 | ${SS_NOPREFIX}
  System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "", i R5, i R6, i R7, i R8, i R9, p $mm.parent, p 0, p 0, p 0) p .s'
  Pop ${_OUT}
  SendMessage ${_OUT} ${WM_SETFONT} ${_FONT} 0
  SetCtlColors ${_OUT} ${_COLOR} ${MM_BG}
  SendMessage ${_OUT} ${WM_SETTEXT} 0 "STR:${_TEXT}"
!macroend

; Clic traité, la page passe à la suite comme avec le bouton « Suivant » (caché) : c'est sa fonction de sortie qui
; agit, car un « Quit » lancé depuis un clic nsDialogs reste sans effet.
!macro MM_NEXT
  System::Call 'user32::PostMessageW(p $HWNDPARENT, i ${WM_COMMAND}, p 1, p 0)'
!macroend

; Bouton d'une page nsDialogs : un texte cliquable, centré, coloré par mmPaintButtons.
!macro MM_BUTTON _OUT _X _Y _W _H _TEXT _CALLBACK
  !insertmacro MM_PX $R6 ${_X}
  !insertmacro MM_PX $R7 ${_Y}
  !insertmacro MM_PX $R8 ${_W}
  !insertmacro MM_PX $R9 ${_H}
  nsDialogs::CreateControl STATIC ${WS_CHILD}|${WS_VISIBLE}|${SS_CENTER}|${SS_CENTERIMAGE}|${SS_NOTIFY}|${SS_NOPREFIX} 0 $R6 $R7 $R8 $R9 "${_TEXT}"
  Pop ${_OUT}
  SendMessage ${_OUT} ${WM_SETFONT} $mm.fontButton 0
  ${NSD_OnClick} ${_OUT} ${_CALLBACK}
!macroend

; Logo dessiné pour l'échelle de l'affichage (build/installer/logo-<n>.bmp, scripts/generate-installer-images.ts).
!macro MM_LOGO_FILE _N
  ${Case} ${_N}
    File "/oname=$PLUGINSDIR\mm-logo.bmp" "${BUILD_RESOURCES_DIR}\installer\logo-${_N}.bmp"
!macroend

; Les fonctions sont insérées après les en-têtes d'electron-builder et de Modern UI, dont elles utilisent les noms.
!macro customHeader
  ; Décor de Modern UI caché : bandeau, lignes, boutons, mention de version. Les pages occupent toute la fenêtre.
  Function ${MM_FN}mmHideChrome
    !insertmacro MM_HIDE 1
    !insertmacro MM_HIDE 2
    !insertmacro MM_HIDE 3
    !insertmacro MM_HIDE 1028
    !insertmacro MM_HIDE 1034
    !insertmacro MM_HIDE 1035
    !insertmacro MM_HIDE 1036
    !insertmacro MM_HIDE 1037
    !insertmacro MM_HIDE 1038
    !insertmacro MM_HIDE 1039
    !insertmacro MM_HIDE 1045
    !insertmacro MM_HIDE 1046
    !insertmacro MM_HIDE 1256
  FunctionEnd

  Function ${MM_FN}mmGuiInit
    System::Call 'user32::GetDC(p 0) p .r0'
    System::Call 'gdi32::GetDeviceCaps(p r0, i 88) i .r1'
    System::Call 'user32::ReleaseDC(p 0, p r0)'
    StrCpy $mm.dpi $1
    ${If} $mm.dpi < 96
      StrCpy $mm.dpi 96
    ${EndIf}
    CreateFont $mm.fontEyebrow "Segoe UI Semibold" 8 600
    CreateFont $mm.fontTitle "Segoe UI Semibold" 16 600
    CreateFont $mm.fontText "Segoe UI" 9 400
    CreateFont $mm.fontButton "Segoe UI Semibold" 9 600
    ; Barre de titre sombre (attribut 20 depuis Windows 10 2004, 19 avant), de la couleur de la fenêtre sous Windows 11.
    System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4)'
    System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 19, *i 1, i 4)'
    System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 35, *i ${MM_COLORREF_BG}, i 4)'
    SetCtlColors $HWNDPARENT "" ${MM_BG}
    Call ${MM_FN}mmHideChrome
    ; Image n = ppp / 24 (logo de 16 × n pixels) : 4 à 100 %, 5 à 125 %, 6 à 150 %…
    InitPluginsDir
    IntOp $0 $mm.dpi + 12
    IntOp $0 $0 / 24
    ${If} $0 < 4
      StrCpy $0 4
    ${ElseIf} $0 > 12
      StrCpy $0 12
    ${EndIf}
    ${Select} $0
      !insertmacro MM_LOGO_FILE 4
      !insertmacro MM_LOGO_FILE 5
      !insertmacro MM_LOGO_FILE 6
      !insertmacro MM_LOGO_FILE 7
      !insertmacro MM_LOGO_FILE 8
      !insertmacro MM_LOGO_FILE 9
      !insertmacro MM_LOGO_FILE 10
      !insertmacro MM_LOGO_FILE 11
    ${CaseElse}
      File "/oname=$PLUGINSDIR\mm-logo.bmp" "${BUILD_RESOURCES_DIR}\installer\logo-12.bmp"
    ${EndSelect}
    System::Call 'user32::LoadImageW(p 0, w "$PLUGINSDIR\mm-logo.bmp", i 0, i 0, i 0, i 0x10) p .r0'
    StrCpy $mm.logo $0
    StrCpy $mm.hovered 0
  FunctionEnd

  ; Fenêtre dont la zone cliente fait MM_WIDTH × $mm.height (pixels à 100 %), centrée sur sa position actuelle.
  Function ${MM_FN}mmResize
    !insertmacro MM_PX $1 ${MM_WIDTH}
    !insertmacro MM_PX $2 $mm.height
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

  ; En-tête d'une page ($mm.parent) : logo, surtitre (couleur $mm.accent), titre et sous-titre.
  Function ${MM_FN}mmHeader
    !insertmacro MM_PX $R6 16
    !insertmacro MM_PX $R7 16
    IntOp $R5 ${WS_CHILD} | ${WS_VISIBLE}
    IntOp $R5 $R5 | ${SS_BITMAP}
    System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "", i R5, i R6, i R7, i 0, i 0, p $mm.parent, p 0, p 0, p 0) p .r0'
    SendMessage $0 ${STM_SETIMAGE} 0 $mm.logo
    !insertmacro MM_LABEL $0 124 34 316 16 $mm.fontEyebrow ${MM_GRASS300} "$mm.eyebrow"
    ${If} $mm.accent == sky
      SetCtlColors $0 ${MM_SKY300} ${MM_BG}
    ${ElseIf} $mm.accent == amber
      SetCtlColors $0 ${MM_AMBER} ${MM_BG}
    ${ElseIf} $mm.accent == red
      SetCtlColors $0 ${MM_RED300} ${MM_BG}
    ${EndIf}
    !insertmacro MM_LABEL $0 124 50 316 30 $mm.fontTitle ${MM_INK100} "$mm.title"
    !insertmacro MM_LABEL $0 124 82 316 20 $mm.fontText ${MM_INK300} "$mm.subtitle"
  FunctionEnd

  ; Couleurs des boutons, selon celui que survole la souris ($mm.hovered).
  Function ${MM_FN}mmPaintButtons
    ${If} $mm.hovered == $mm.primary
      !ifdef BUILD_UNINSTALLER
        SetCtlColors $mm.primary ${MM_RED300} ${MM_DANGER_HOVER}
      !else
        SetCtlColors $mm.primary ${MM_INK950} ${MM_GRASS300}
      !endif
    ${Else}
      !ifdef BUILD_UNINSTALLER
        SetCtlColors $mm.primary ${MM_RED300} ${MM_DANGER}
      !else
        SetCtlColors $mm.primary ${MM_INK950} ${MM_GRASS400}
      !endif
    ${EndIf}
    System::Call 'user32::InvalidateRect(p $mm.primary, p 0, i 1)'
    ${If} $mm.secondary != 0
      ${If} $mm.hovered == $mm.secondary
        SetCtlColors $mm.secondary ${MM_INK100} ${MM_INK600}
      ${Else}
        SetCtlColors $mm.secondary ${MM_INK100} ${MM_INK700}
      ${EndIf}
      System::Call 'user32::InvalidateRect(p $mm.secondary, p 0, i 1)'
    ${EndIf}
    ${If} $mm.hovered == $mm.cancel
      SetCtlColors $mm.cancel ${MM_INK100} ${MM_GHOST_HOVER}
    ${Else}
      SetCtlColors $mm.cancel ${MM_INK200} ${MM_BG}
    ${EndIf}
    System::Call 'user32::InvalidateRect(p $mm.cancel, p 0, i 1)'
  FunctionEnd

  ; Survol des boutons, relevé toutes les 50 ms : un texte cliquable n'a pas d'effet de survol.
  Function ${MM_FN}mmHover
    System::Call '*(i 0, i 0) p .r0'
    System::Call 'user32::GetCursorPos(p r0)'
    System::Call '*$0(i .r1, i .r2)'
    System::Free $0
    System::Call 'user32::WindowFromPoint(i r1, i r2) p .r3'
    ${If} $3 != $mm.primary
    ${AndIf} $3 != $mm.secondary
    ${AndIf} $3 != $mm.cancel
      StrCpy $3 0
    ${EndIf}
    ${If} $3 != $mm.hovered
      StrCpy $mm.hovered $3
      Call ${MM_FN}mmPaintButtons
    ${EndIf}
  FunctionEnd

  ; Processus de l'application installée, c'est-à-dire lancés depuis $INSTDIR\<exécutable> (ou depuis $mm.procPath) :
  ; ni ceux d'un autre compte (qui bloqueraient l'installeur sans raison), ni ceux d'une autre copie. Entrée : $0 = 1
  ; pour les arrêter de force. Sortie : $0 = 1 si au moins un tournait. Structure PROCESSENTRY32W de l'installeur
  ; 32 bits : 556 octets.
  !if ${NSIS_PTR_SIZE} != 4
    !error "mmAppProcesses suppose un installeur 32 bits (PROCESSENTRY32W)."
  !endif
  Function ${MM_FN}mmAppProcesses
    Push $1
    Push $2
    Push $3
    Push $4
    Push $5
    Push $6
    Push $7
    Push $8
    Push $9
    StrCpy $9 $mm.procPath
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

  ; Ferme l'application (l'exécutable de $mm.procPath, sinon celui de $INSTDIR) : normalement d'abord, comme la croix
  ; de la fenêtre, de force au bout de 3 s. Lors d'une mise à jour lancée par l'application, elle a d'abord 3 s pour se
  ; fermer d'elle-même.
  Function ${MM_FN}mmCloseApp
    StrCpy $0 0
    Call ${MM_FN}mmAppProcesses
    ${If} $0 == 1
    ${AndIf} ${isUpdated}
      StrCpy $R1 0
      ${DoWhile} $R1 < 12
        Sleep 250
        StrCpy $0 0
        Call ${MM_FN}mmAppProcesses
        ${If} $0 == 0
          ${Break}
        ${EndIf}
        IntOp $R1 $R1 + 1
      ${Loop}
    ${EndIf}
    ${If} $0 == 1
      ${If} $mm.statusLabel != ""
        SendMessage $mm.statusLabel ${WM_SETTEXT} 0 "STR:Fermeture de l’application…"
      ${EndIf}
      StrCpy $R3 $mm.procPath
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
        Call ${MM_FN}mmAppProcesses
        ${If} $0 == 0
          ${Break}
        ${EndIf}
        ${If} $R1 >= 24
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY mmCloseRetry
          Quit
          mmCloseRetry:
          StrCpy $R1 12
        ${EndIf}
      ${Loop}
      ${If} $mm.statusLabel != ""
        SendMessage $mm.statusLabel ${WM_SETTEXT} 0 "STR:$mm.status"
      ${EndIf}
    ${EndIf}
  FunctionEnd

  ; Page de progression : en-tête, barre plate de la couleur d'accent, ligne d'état. Les contrôles de la page de NSIS
  ; (barre 1004, texte 1006, journal 1016, bouton « Afficher les détails » 1027) sont retrouvés dans son dialogue.
  Function ${MM_FN}mmProgressShow
    StrCpy $mm.height 196
    Call ${MM_FN}mmResize
    Call ${MM_FN}mmHideChrome
    FindWindow $mm.parent "#32770" "" $HWNDPARENT
    !insertmacro MM_PX $1 ${MM_WIDTH}
    !insertmacro MM_PX $2 196
    System::Call 'user32::SetWindowPos(p $mm.parent, p 0, i 0, i 0, i r1, i r2, i 0x14)'
    SetCtlColors $mm.parent "" ${MM_BG}
    GetDlgItem $0 $mm.parent 1006
    ShowWindow $0 ${SW_HIDE}
    GetDlgItem $0 $mm.parent 1016
    ShowWindow $0 ${SW_HIDE}
    GetDlgItem $0 $mm.parent 1027
    ShowWindow $0 ${SW_HIDE}

    Call ${MM_FN}mmDescribe
    Call ${MM_FN}mmHeader

    ; Barre plate : sans le thème de Windows, qui imposerait sa couleur, ni bordure.
    GetDlgItem $0 $mm.parent 1004
    System::Call 'uxtheme::SetWindowTheme(p r0, w " ", w " ")'
    System::Call 'user32::GetWindowLongW(p r0, i -16) i .r1'
    IntOp $1 $1 & 0xFF7FFFFF
    System::Call 'user32::SetWindowLongW(p r0, i -16, i r1)'
    System::Call 'user32::GetWindowLongW(p r0, i -20) i .r1'
    IntOp $1 $1 & 0xFFFDFDFF
    System::Call 'user32::SetWindowLongW(p r0, i -20, i r1)'
    !insertmacro MM_PX $1 32
    !insertmacro MM_PX $2 136
    !insertmacro MM_PX $3 408
    !insertmacro MM_PX $4 6
    System::Call 'user32::SetWindowPos(p r0, p 0, i r1, i r2, i r3, i r4, i 0x34)'
    SendMessage $0 ${PBM_SETBKCOLOR} 0 ${MM_COLORREF_TRACK}
    ${If} $mm.accent == sky
      SendMessage $0 ${PBM_SETBARCOLOR} 0 ${MM_COLORREF_SKY}
    ${ElseIf} $mm.accent == amber
      SendMessage $0 ${PBM_SETBARCOLOR} 0 ${MM_COLORREF_AMBER}
    ${ElseIf} $mm.accent == red
      SendMessage $0 ${PBM_SETBARCOLOR} 0 ${MM_COLORREF_NEUTRAL}
    ${Else}
      SendMessage $0 ${PBM_SETBARCOLOR} 0 ${MM_COLORREF_GRASS}
    ${EndIf}
    !insertmacro MM_LABEL $mm.statusLabel 32 152 408 20 $mm.fontText ${MM_INK400} "$mm.status"
  FunctionEnd

  !ifndef BUILD_UNINSTALLER
    ; Une nouvelle installation va dans Programs\<nom du paquet>, comme avec l'installeur « en un clic » : en mode
    ; assisté, electron-builder prendrait le nom du produit. Refait par la page « application ouverte », car la page
    ; « pour qui installer » (jamais montrée) recalcule le dossier entre-temps. Une installation existante ou /D=… n'y
    ; change rien.
    Function mmPackageDir
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

    ; Ancienne identité de l'application (avant la 2.0.0 : autre appId, donc autre clé de désinstallation, autre dossier
    ; et autre exécutable) : une entrée de « Applications installées » du même éditeur, à l'ancien nom du produit
    ; (« Modpack Manager 1.9.3 », ou « Modpack Manager 1.8.3 » sous l'identité d'avant la 1.9.0), dont l'exécutable et
    ; le désinstalleur existent encore. Elle compte comme une mise à jour, de sa version à celle-ci. À retirer avec
    ; src/shared/previousIdentity.ts.
    Function mmFindPrevious
      Push $1
      Push $2
      Push $3
      Push $4
      StrCpy $mm.previousExe ""
      StrLen $4 "${MM_PREVIOUS_PRODUCT_NAME} "
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
        ${If} $3 != "${MM_PREVIOUS_PRODUCT_NAME} "
          ${Continue}
        ${EndIf}
        ; DisplayIcon : « <exécutable>,0 ».
        ReadRegStr $3 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$2" "DisplayIcon"
        StrCpy $mm.previousExe $3 -2
        ; UninstallString : « "<désinstalleur>" /currentuser ».
        ReadRegStr $3 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$2" "UninstallString"
        ${WordFind} $3 '"' "+1" $mm.previousUninstaller
        ReadRegStr $mm.installed HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$2" "DisplayVersion"
        ${GetParent} $mm.previousUninstaller $mm.previousDir
        StrCpy $mm.previousKey $2
        ${If} ${FileExists} "$mm.previousExe"
        ${AndIf} ${FileExists} "$mm.previousUninstaller"
        ${AndIf} $mm.previousDir != ""
          ${Break}
        ${EndIf}
        StrCpy $mm.previousExe ""
        StrCpy $mm.installed ""
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
    Function mmUninstallPrevious
      ${If} $mm.statusLabel != ""
        SendMessage $mm.statusLabel ${WM_SETTEXT} 0 "STR:Retrait de l’ancienne version…"
      ${EndIf}
      ExecWait '"$mm.previousUninstaller" /currentuser /S --updated'
      StrCpy $R1 0
      ${Do}
        ReadRegStr $R2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$mm.previousKey" "DisplayName"
        ${If} $R2 == ""
        ${OrIf} $R1 >= 240
          ${Break}
        ${EndIf}
        Sleep 250
        IntOp $R1 $R1 + 1
      ${Loop}
      RMDir /r "$mm.previousDir"
      ${If} $mm.statusLabel != ""
        SendMessage $mm.statusLabel ${WM_SETTEXT} 0 "STR:$mm.status"
      ${EndIf}
    FunctionEnd

    ; Ce que fait l'installeur, selon $mm.mode : surtitre, couleur d'accent, titre, sous-titre, ligne d'état et titre
    ; de la fenêtre. Une mise à jour a sa propre fenêtre, en bleu, avec l'ancienne et la nouvelle version.
    Function mmDescribe
      StrCpy $mm.title "${PRODUCT_NAME}"
      StrCpy $mm.subtitle "Version ${VERSION}"
      StrCpy $mm.eyebrow "INSTALLATION"
      StrCpy $mm.accent grass
      StrCpy $mm.status "L’application s’ouvrira toute seule à la fin."
      StrCpy $0 "Installation de ${PRODUCT_NAME}"
      ${If} $mm.mode == update
        StrCpy $mm.eyebrow "MISE À JOUR"
        StrCpy $mm.accent sky
        ${If} $mm.installed != ""
        ${AndIf} $mm.installed != "${VERSION}"
          StrCpy $mm.subtitle "Version $mm.installed → ${VERSION}"
        ${EndIf}
        ${If} ${isUpdated}
          StrCpy $mm.status "L’application se relancera toute seule à la fin."
        ${EndIf}
        StrCpy $0 "Mise à jour de ${PRODUCT_NAME}"
      ${ElseIf} $mm.mode == reinstall
        StrCpy $mm.eyebrow "RÉINSTALLATION"
      ${ElseIf} $mm.mode == downgrade
        StrCpy $mm.eyebrow "RETOUR À UNE VERSION PRÉCÉDENTE"
        StrCpy $mm.accent amber
        StrCpy $mm.subtitle "Version $mm.installed → ${VERSION}"
      ${EndIf}
      SendMessage $HWNDPARENT ${WM_SETTEXT} 0 "STR:$0"
    FunctionEnd

    ; Application ouverte : elle va être fermée pour continuer (customCheckAppRunning), ce que la page annonce. Sautée
    ; quand elle ne tourne pas, et lors d'une mise à jour lancée par l'application, qui se ferme d'elle-même.
    Function mmRunningPage
      Call mmPackageDir
      ${If} ${isUpdated}
        Abort
      ${EndIf}
      StrCpy $0 0
      Call mmAppProcesses
      ${If} $0 == 0
      ${AndIf} $mm.previousExe != ""
        StrCpy $mm.procPath $mm.previousExe
        Call mmAppProcesses
        StrCpy $mm.procPath ""
      ${EndIf}
      ${If} $0 == 0
        Abort
      ${EndIf}
      StrCpy $mm.height 254
      Call mmResize
      nsDialogs::Create 1018
      Pop $mm.parent
      ${If} $mm.parent == error
        Abort
      ${EndIf}
      SetCtlColors $mm.parent "" ${MM_BG}
      Call mmHideChrome
      Call mmDescribe
      StrCpy $mm.eyebrow "APPLICATION OUVERTE"
      StrCpy $mm.accent amber
      Call mmHeader
      !insertmacro MM_LABEL $0 32 124 408 54 $mm.fontText ${MM_INK300} "L’application est ouverte${U+00A0}: elle va être fermée pour continuer, puis rouverte à la fin. Si un modpack est en cours d’installation ou de publication, attends qu’il se termine."
      StrCpy $mm.secondary 0
      StrCpy $mm.choice ""
      !insertmacro MM_BUTTON $mm.cancel 164 192 100 34 "Annuler" mmCancelClick
      !insertmacro MM_BUTTON $mm.primary 272 192 168 34 "Fermer et continuer" mmInstallClick
      StrCpy $mm.hovered 0
      Call mmPaintButtons
      ${NSD_CreateTimer} mmHover 50
      nsDialogs::Show
    FunctionEnd

    ; « Fermer et continuer », ou la touche Entrée : on continue.
    Function mmRunningLeave
      ${NSD_KillTimer} mmHover
      ${If} $mm.choice == cancel
        SetErrorLevel 1
        Quit
      ${EndIf}
    FunctionEnd

    ; Application déjà installée, dans la même version ou une plus récente : ouvrir, ou installer quand même.
    Function mmExistingPage
      ${If} $mm.mode != same
      ${AndIf} $mm.mode != newer
        Abort
      ${EndIf}
      StrCpy $mm.height 254
      Call mmResize
      nsDialogs::Create 1018
      Pop $mm.parent
      ${If} $mm.parent == error
        Abort
      ${EndIf}
      SetCtlColors $mm.parent "" ${MM_BG}
      Call mmHideChrome
      SendMessage $HWNDPARENT ${WM_SETTEXT} 0 "STR:Installation de ${PRODUCT_NAME}"
      StrCpy $mm.title "${PRODUCT_NAME}"
      ${If} $mm.mode == same
        StrCpy $mm.eyebrow "DÉJÀ INSTALLÉ"
        StrCpy $mm.accent grass
        StrCpy $mm.subtitle "Version ${VERSION}"
        Call mmHeader
        !insertmacro MM_LABEL $0 32 124 408 54 $mm.fontText ${MM_INK300} "Cette version est déjà sur ce PC. Tu peux l’ouvrir directement, ou la réinstaller${U+00A0}: tes réglages et tes modpacks sont conservés."
        !insertmacro MM_BUTTON $mm.cancel 44 192 96 34 "Annuler" mmCancelClick
        !insertmacro MM_BUTTON $mm.secondary 148 192 116 34 "Réinstaller" mmInstallClick
        !insertmacro MM_BUTTON $mm.primary 272 192 168 34 "Ouvrir l’application" mmOpenClick
      ${Else}
        StrCpy $mm.eyebrow "VERSION PLUS RÉCENTE INSTALLÉE"
        StrCpy $mm.accent amber
        StrCpy $mm.subtitle "Version $mm.installed"
        Call mmHeader
        !insertmacro MM_LABEL $0 32 124 408 54 $mm.fontText ${MM_INK300} "Cet installeur contient la ${VERSION}, plus ancienne. Tu peux ouvrir la version installée, ou revenir à la ${VERSION}${U+00A0}: tes réglages et tes modpacks sont conservés."
        !insertmacro MM_BUTTON $mm.cancel 36 192 96 34 "Annuler" mmCancelClick
        !insertmacro MM_BUTTON $mm.secondary 140 192 146 34 "Installer la ${VERSION}" mmInstallClick
        !insertmacro MM_BUTTON $mm.primary 294 192 146 34 "Ouvrir la $mm.installed" mmOpenClick
      ${EndIf}
      StrCpy $mm.hovered 0
      Call mmPaintButtons
      ${NSD_CreateTimer} mmHover 50
      nsDialogs::Show
    FunctionEnd

    Function mmOpenClick
      StrCpy $mm.choice open
      !insertmacro MM_NEXT
    FunctionEnd

    Function mmInstallClick
      StrCpy $mm.choice install
      !insertmacro MM_NEXT
    FunctionEnd

    Function mmCancelClick
      StrCpy $mm.choice cancel
      !insertmacro MM_NEXT
    FunctionEnd

    Function mmExistingLeave
      ${NSD_KillTimer} mmHover
      ${If} $mm.choice == cancel
        SetErrorLevel 1
        Quit
      ${ElseIf} $mm.choice != install
        ; « Ouvrir », ou la touche Entrée (l'action principale). Si la version installée tourne déjà, son verrou
        ; d'instance ramène simplement sa fenêtre.
        ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "open" ""
        SetErrorLevel 0
        Quit
      ${EndIf}
      ${If} $mm.mode == same
        StrCpy $mm.mode reinstall
      ${Else}
        StrCpy $mm.mode downgrade
      ${EndIf}
    FunctionEnd
  !else
    Function un.mmDescribe
      StrCpy $mm.title "${PRODUCT_NAME}"
      StrCpy $mm.subtitle "Version ${VERSION}"
      StrCpy $mm.eyebrow "DÉSINSTALLATION"
      StrCpy $mm.accent red
      StrCpy $mm.status "Tes modpacks et tes réglages sont conservés."
      SendMessage $HWNDPARENT ${WM_SETTEXT} 0 "STR:Désinstallation de ${PRODUCT_NAME}"
    FunctionEnd

    ; Confirmation de la désinstallation (remplace la boîte « Êtes-vous sûr… » de l'installeur « en un clic »). Elle
    ; annonce aussi la fermeture de l'application si elle est ouverte (customCheckAppRunning).
    Function un.mmConfirmPage
      StrCpy $mm.height 254
      Call un.mmResize
      nsDialogs::Create 1018
      Pop $mm.parent
      ${If} $mm.parent == error
        Abort
      ${EndIf}
      SetCtlColors $mm.parent "" ${MM_BG}
      Call un.mmHideChrome
      Call un.mmDescribe
      Call un.mmHeader
      StrCpy $0 0
      Call un.mmAppProcesses
      ${If} $0 == 1
        StrCpy $1 "L’application est ouverte${U+00A0}: elle va être fermée, puis retirée de ce PC. Tes modpacks restent dans CurseForge, et tes réglages sont conservés."
      ${Else}
        StrCpy $1 "L’application va être retirée de ce PC. Tes modpacks restent dans CurseForge, et tes réglages sont conservés."
      ${EndIf}
      !insertmacro MM_LABEL $0 32 124 408 54 $mm.fontText ${MM_INK300} "$1"
      StrCpy $mm.secondary 0
      StrCpy $mm.choice ""
      !insertmacro MM_BUTTON $mm.cancel 192 192 100 34 "Annuler" un.mmCancelClick
      !insertmacro MM_BUTTON $mm.primary 300 192 140 34 "Désinstaller" un.mmUninstallClick
      StrCpy $mm.hovered 0
      Call un.mmPaintButtons
      ${NSD_CreateTimer} un.mmHover 50
      nsDialogs::Show
    FunctionEnd

    Function un.mmUninstallClick
      StrCpy $mm.choice uninstall
      !insertmacro MM_NEXT
    FunctionEnd

    Function un.mmCancelClick
      StrCpy $mm.choice cancel
      !insertmacro MM_NEXT
    FunctionEnd

    ; La touche Entrée ne désinstalle pas : il faut cliquer sur « Désinstaller ».
    Function un.mmConfirmLeave
      ${If} $mm.choice == cancel
        SetErrorLevel 1
        Quit
      ${ElseIf} $mm.choice != uninstall
        Abort
      ${EndIf}
      ${NSD_KillTimer} un.mmHover
    FunctionEnd

    ; Désinstallation terminée : la fenêtre se ferme.
    Function un.mmProgressLeave
      SetErrorLevel 0
      Quit
    FunctionEnd

    Function un.mmSkipPage
      Abort
    FunctionEnd
  !endif
!macroend
