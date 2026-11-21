!macro customUnInstall
  ${ifNot} ${isUpdated}
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\collaboration-host\scripts\Remove-ClientStartup.ps1" -InstallDirectory "$INSTDIR"'
  IfSilent unified_uninstall_notice_done
  MessageBox MB_OK "创作流软件将被移除。已部署的协作主机服务、公司数据和备份会保留。若需卸载协作服务，请在卸载软件前进入协作管理器明确操作。"
  unified_uninstall_notice_done:
  ${endIf}
!macroend
