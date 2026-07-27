' dev-start-bg.vbs
' schtasks-based launcher: completely detached from terminal, zero windows.
' Architecture: wscript -> schtasks /create + /run -> node dev-supervisor.mjs -> spawn API + Worker

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectRoot = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
nodeExe = "node.exe"
supervisorScript = projectRoot & "\scripts\dev-supervisor.mjs"
taskName = "BacktestDevSupervisor"

' 1. Stop old task (non-blocking)
WshShell.Run "cmd /c schtasks /end /tn """ & taskName & """ 2>nul", 0, False
WScript.Sleep 500
WshShell.Run "cmd /c schtasks /delete /tn """ & taskName & """ /f 2>nul", 0, False
WScript.Sleep 500

' 2. Write XML task definition
xmlPath = projectRoot & "\scripts\task-def.xml"
Set xmlFile = fso.CreateTextFile(xmlPath, True)
xmlFile.WriteLine "<?xml version=""1.0"" encoding=""UTF-16""?>"
xmlFile.WriteLine "<Task version=""1.2"" xmlns=""http://schemas.microsoft.com/windows/2004/02/mit/task"">"
xmlFile.WriteLine "  <Settings>"
xmlFile.WriteLine "    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>"
xmlFile.WriteLine "    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>"
xmlFile.WriteLine "    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>"
xmlFile.WriteLine "    <AllowHardTerminate>true</AllowHardTerminate>"
xmlFile.WriteLine "    <StartWhenAvailable>true</StartWhenAvailable>"
xmlFile.WriteLine "    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>"
xmlFile.WriteLine "  </Settings>"
xmlFile.WriteLine "  <Triggers>"
xmlFile.WriteLine "    <CalendarTrigger>"
xmlFile.WriteLine "      <StartBoundary>2099-01-01T00:00:00</StartBoundary>"
xmlFile.WriteLine "      <Enabled>false</Enabled>"
xmlFile.WriteLine "      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>"
xmlFile.WriteLine "    </CalendarTrigger>"
xmlFile.WriteLine "  </Triggers>"
xmlFile.WriteLine "  <Actions Context=""Author"">"
xmlFile.WriteLine "    <Exec>"
xmlFile.WriteLine "      <Command>" & nodeExe & "</Command>"
xmlFile.WriteLine "      <Arguments>""" & supervisorScript & """</Arguments>"
xmlFile.WriteLine "      <WorkingDirectory>" & projectRoot & "</WorkingDirectory>"
xmlFile.WriteLine "    </Exec>"
xmlFile.WriteLine "  </Actions>"
xmlFile.WriteLine "  <Principals>"
xmlFile.WriteLine "    <Principal id=""Author"">"
xmlFile.WriteLine "      <LogonType>InteractiveToken</LogonType>"
xmlFile.WriteLine "    </Principal>"
xmlFile.WriteLine "  </Principals>"
xmlFile.WriteLine "</Task>"
xmlFile.Close

' 3. Register task (BLOCKING - must finish before XML is deleted)
WshShell.Run "cmd /c schtasks /create /tn """ & taskName & """ /xml """ & xmlPath & """ /f", 0, True

' 4. Run task (non-blocking - fire and forget)
WshShell.Run "cmd /c schtasks /run /tn """ & taskName & """", 0, False

' 5. Clean up XML (give 1s for task registration to flush)
WScript.Sleep 1000
On Error Resume Next
fso.DeleteFile xmlPath
On Error GoTo 0
