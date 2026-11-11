Option Explicit
' This launcher is executed by Task Scheduler through wscript.exe.
' It waits for the persistent PowerShell worker, without creating a visible
' terminal or console window in the interactive user session.
Dim shell, fso, runnerPath, installDir, command, result
If WScript.Arguments.Count <> 2 Then WScript.Quit 2
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
runnerPath = WScript.Arguments(0)
installDir = WScript.Arguments(1)
If Not fso.FileExists(runnerPath) Then WScript.Quit 3
If Not fso.FolderExists(installDir) Then WScript.Quit 4
command = Chr(34) & shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe" & Chr(34) & _
    " -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File " & Chr(34) & runnerPath & Chr(34) & _
    " -InstallDir " & Chr(34) & installDir & Chr(34)
result = shell.Run(command, 0, True)
WScript.Quit result
