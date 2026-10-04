# Windows OCR helper (Windows 10/11, Windows.Media.Ocr). Prints the same JSON as ocr-mac:
#   {"width":W,"height":H,"lines":[{"text":"...","box":[x,y,w,h],"words":[{"text":"...","box":[x,y,w,h]}]}]}
# Usage: powershell -File ocr-win.ps1 <image.png> [scale]
param([string]$Path, [int]$Scale = 1)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait() | Out-Null
  $task.Result
}

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $Path).Path)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$W = $decoder.PixelWidth; $H = $decoder.PixelHeight
$transform = New-Object Windows.Graphics.Imaging.BitmapTransform
$transform.ScaledWidth = $W * $Scale; $transform.ScaledHeight = $H * $Scale
$transform.InterpolationMode = [Windows.Graphics.Imaging.BitmapInterpolationMode]::Fant
$bitmap = Await ($decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,
  [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied, $transform,
  [Windows.Graphics.Imaging.ExifOrientationMode]::IgnoreExifOrientation,
  [Windows.Graphics.Imaging.ColorManagementMode]::DoNotColorManage)) ([Windows.Graphics.Imaging.SoftwareBitmap])

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

function Box($r) { @([int]($r.X / $Scale), [int]($r.Y / $Scale), [int]($r.Width / $Scale), [int]($r.Height / $Scale)) }
$lines = @()
foreach ($line in $result.Lines) {
  $words = @(); $x1 = 1e9; $y1 = 1e9; $x2 = 0; $y2 = 0
  foreach ($w in $line.Words) {
    $r = $w.BoundingRect
    $x1 = [Math]::Min($x1, $r.X); $y1 = [Math]::Min($y1, $r.Y)
    $x2 = [Math]::Max($x2, $r.X + $r.Width); $y2 = [Math]::Max($y2, $r.Y + $r.Height)
    $words += @{ text = $w.Text; box = (Box $r) }
  }
  $lines += @{ text = $line.Text; box = @([int]($x1 / $Scale), [int]($y1 / $Scale), [int](($x2 - $x1) / $Scale), [int](($y2 - $y1) / $Scale)); words = $words }
}
@{ width = $W; height = $H; lines = $lines } | ConvertTo-Json -Depth 6 -Compress
