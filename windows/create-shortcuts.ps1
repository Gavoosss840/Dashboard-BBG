# Cree deux raccourcis sur le Bureau Windows : un pour demarrer, un pour arreter.
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Desktop = [Environment]::GetFolderPath('Desktop')
$WshShell = New-Object -ComObject WScript.Shell

$Start = $WshShell.CreateShortcut("$Desktop\Boulet Capital - Demarrer.lnk")
$Start.TargetPath = "$RootDir\start.bat"
$Start.WorkingDirectory = $RootDir
$Start.IconLocation = "shell32.dll,137"
$Start.Description = "Demarre la plateforme Boulet Capital (Docker)"
$Start.Save()

$Stop = $WshShell.CreateShortcut("$Desktop\Boulet Capital - Arreter.lnk")
$Stop.TargetPath = "$RootDir\stop.bat"
$Stop.WorkingDirectory = $RootDir
$Stop.IconLocation = "shell32.dll,27"
$Stop.Description = "Arrete la plateforme Boulet Capital (Docker)"
$Stop.Save()

Write-Host ""
Write-Host "Deux raccourcis ont ete crees sur le Bureau :"
Write-Host "  - Boulet Capital - Demarrer"
Write-Host "  - Boulet Capital - Arreter"
Write-Host ""
