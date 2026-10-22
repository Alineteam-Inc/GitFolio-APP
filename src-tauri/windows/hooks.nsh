; Installer hooks (tauri.conf.json bundle.windows.nsis.installerHooks).
;
; git hooks run `gitfolio`, which the app keeps next to itself (bundle.externalBin): its folder goes on
; the user's PATH, and off it again on uninstall, but not on an update. PowerShell edits PATH as a whole
; (NSIS strings would cut a long one) and keeps its %VARIABLES% unexpanded; the folder goes to it in an
; environment variable, as a path may hold a quote.
;
; The uninstaller leaves gitfolio's own clean-up alone: a newer installer runs it before installing (the
; default choice there), and `gitfolio uninstall` would then unregister every repository. The app's
; Uninstall (About) does that clean-up.

!macro GITFOLIO_PATH ADD
  System::Call 'Kernel32::SetEnvironmentVariable(t "GITFOLIO_DIR", t "$INSTDIR")'
  nsExec::Exec `powershell -NoProfile -NonInteractive -Command "$$p = (Get-Item 'HKCU:\Environment').GetValue('Path', '', 'DoNotExpandEnvironmentNames'); $$l = @($$p -split ';' | Where-Object { $$_ -and $$_ -ne $$env:GITFOLIO_DIR }); if (${ADD}) { $$l += $$env:GITFOLIO_DIR }; New-ItemProperty 'HKCU:\Environment' Path -Value ($$l -join ';') -PropertyType ExpandString -Force | Out-Null"`
  Pop $0
  SendMessage 0xFFFF 0x1A 0 "STR:Environment" /TIMEOUT=5000 ; HWND_BROADCAST, WM_SETTINGCHANGE: new terminals see it
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro GITFOLIO_PATH "$$true"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    !insertmacro GITFOLIO_PATH "$$false"
  ${EndIf}
!macroend
