$ws = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$sc = $ws.CreateShortcut("$desktop\bp3.lnk")
$sc.TargetPath = 'C:\Users\MurkAnneKooistraKooi\.zenflow\worktrees\multi-element-ifc-import-met-pat-e7f1\start-5174.bat'
$sc.WorkingDirectory = 'C:\Users\MurkAnneKooistraKooi\.zenflow\worktrees\multi-element-ifc-import-met-pat-e7f1'
$sc.Description = 'IFC Brickstrip Planner bp3'
$sc.Save()
Write-Host "Snelkoppeling bp3 aangemaakt op: $desktop\bp3.lnk"
