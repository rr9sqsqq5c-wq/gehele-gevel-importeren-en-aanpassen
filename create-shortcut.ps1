$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut("$env:USERPROFILE\Desktop\IFC Brickstrip Planner.lnk")
$s.TargetPath = "cmd.exe"
$s.Arguments = '/c "C:\Users\MurkAnneKooistraKooi\.zenflow\worktrees\multi-element-ifc-import-met-pat-e7f1\start.bat"'
$s.WorkingDirectory = "C:\Users\MurkAnneKooistraKooi\.zenflow\worktrees\multi-element-ifc-import-met-pat-e7f1"
$s.WindowStyle = 7
$s.IconLocation = "C:\Windows\System32\shell32.dll,14"
$s.Description = "IFC Brickstrip Planner"
$s.Save()
Write-Host "Snelkoppeling aangemaakt op het bureaublad."
