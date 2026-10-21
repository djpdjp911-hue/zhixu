$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Path 'outputs\demo' -Force | Out-Null
Add-Type -AssemblyName System.Speech
$narrator = New-Object System.Speech.Synthesis.SpeechSynthesizer
$narrator.SelectVoice('Microsoft Huihui Desktop')
$narrator.Rate = 0
$narrator.Volume = 100
$scenes = Get-Content -LiteralPath 'docs\开发版视频旁白.json' -Raw -Encoding utf8 | ConvertFrom-Json
foreach ($scene in $scenes) {
    $targetPath = [IO.Path]::GetFullPath((Join-Path 'outputs\demo' ($scene.id + '.wav')))
    $narrator.SetOutputToWaveFile($targetPath)
    $narrator.Speak($scene.text)
    $narrator.SetOutputToNull()
}
$narrator.Dispose()
Write-Output 'Chinese narration generated for 12 scenes.'
