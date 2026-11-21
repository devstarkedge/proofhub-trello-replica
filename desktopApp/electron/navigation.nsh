!macro customInstall
  WriteRegStr SHCTX "Software\Classes\flowtask-desktop" "" "URL:FlowTask desktop navigation"
  WriteRegStr SHCTX "Software\Classes\flowtask-desktop" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\flowtask-desktop\shell\open\command" "" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" -- $\"%1$\"'
!macroend

!macro customUnInstall
  ReadRegStr $0 SHCTX "Software\Classes\flowtask-desktop\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" -- $\"%1$\"' 0 +2
  DeleteRegKey SHCTX "Software\Classes\flowtask-desktop"
!macroend
