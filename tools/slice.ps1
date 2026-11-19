# 시트 이미지를 그리드로 잘라 투명 PNG로 저장
# 사용: .\slice.ps1 -In raw\icons_ui.png -Cols 4 -Rows 4 -Names a,b,c... -OutDir ..\public\assets\icons -Bg magenta|white|black -Size 160
param(
  [string]$In, [int]$Cols, [int]$Rows, [string[]]$Names, [string]$OutDir,
  [ValidateSet('magenta','white','black')][string]$Bg = 'magenta', [int]$Size = 160, [switch]$Square
)
Add-Type -AssemblyName System.Drawing
if (-not ('SpriteTool' -as [type])) {
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class SpriteTool {
  // 배경 판정 강도 0(전경)~1(배경)
  static double BgAmount(byte r, byte g, byte b, string mode) {
    if (mode == "magenta") {
      double d = Math.Sqrt((255-r)*(255-r) + g*g*1.0 + (255-b)*(255-b));
      if (d < 50) return 1; if (d > 95) return 0; return 1 - (d-50)/45.0;
    }
    if (mode == "white") {
      int m = Math.Min(r, Math.Min(g, b));
      int sat = Math.Max(r, Math.Max(g, b)) - m;
      if (m > 238 && sat < 18) return 1; return 0;
    }
    int mx = Math.Max(r, Math.Max(g, b));
    if (mx < 18) return 1; return 0;
  }
  public static Bitmap Key(Bitmap src, string mode, out bool[,] fg) {
    int w = src.Width, h = src.Height;
    Bitmap dst = new Bitmap(w, h, PixelFormat.Format32bppArgb);
    BitmapData sd = src.LockBits(new Rectangle(0,0,w,h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    BitmapData dd = dst.LockBits(new Rectangle(0,0,w,h), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
    byte[] buf = new byte[sd.Stride*h]; Marshal.Copy(sd.Scan0, buf, 0, buf.Length);
    fg = new bool[w,h];
    for (int y=0;y<h;y++) for (int x=0;x<w;x++) {
      int i = y*sd.Stride + x*4; byte b=buf[i], g=buf[i+1], r=buf[i+2];
      double a = 1;
      if (mode == "black") {
        int mx = Math.Max(r, Math.Max(g, b));
        a = Math.Min(1.0, mx/255.0*1.25);
        if (a > 0.02) { r = (byte)Math.Min(255, r/a); g=(byte)Math.Min(255, g/a); b=(byte)Math.Min(255, b/a); }
        fg[x,y] = mx > 40;
      } else {
        double bg = BgAmount(r,g,b,mode);
        a = 1 - bg;
        if (mode == "magenta" && bg > 0 && bg < 1) { // 가장자리 색 번짐 제거
          int lim = g + 30; if (r > lim) r = (byte)Math.Max(g, r - (int)((r-lim)*bg)); if (b > lim) b = (byte)Math.Max(g, b - (int)((b-lim)*bg));
        }
        fg[x,y] = a > 0.5;
      }
      buf[i]=b; buf[i+1]=g; buf[i+2]=r; buf[i+3]=(byte)Math.Round(a*255);
    }
    Marshal.Copy(buf, 0, dd.Scan0, buf.Length);
    src.UnlockBits(sd); dst.UnlockBits(dd);
    return dst;
  }
  // 예상 경계 근처에서 전경이 가장 적은 줄을 찾아 자름
  public static int[] Cuts(bool[,] fg, int n, bool vertical) {
    int w = fg.GetLength(0), h = fg.GetLength(1);
    int len = vertical ? w : h, other = vertical ? h : w;
    int[] prof = new int[len];
    for (int i=0;i<len;i++){ int c=0; for(int j=0;j<other;j++){ if (vertical ? fg[i,j] : fg[j,i]) c++; } prof[i]=c; }
    int[] cuts = new int[n+1]; cuts[0]=0; cuts[n]=len;
    for (int k=1;k<n;k++) {
      int center = len*k/n, rad = len/n*35/100, best=center, bv=int.MaxValue;
      for (int i=Math.Max(1,center-rad); i<Math.Min(len-1,center+rad); i++) {
        int v = prof[i]*1000 + Math.Abs(i-center);
        if (v < bv) { bv=v; best=i; }
      }
      cuts[k]=best;
    }
    return cuts;
  }
  public static Rectangle Bounds(bool[,] fg, int x0, int y0, int x1, int y1) {
    int minx=int.MaxValue, miny=int.MaxValue, maxx=-1, maxy=-1;
    for (int y=y0;y<y1;y++) for (int x=x0;x<x1;x++) if (fg[x,y]) { if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; }
    if (maxx < 0) return new Rectangle(x0,y0,x1-x0,y1-y0);
    return new Rectangle(minx, miny, maxx-minx+1, maxy-miny+1);
  }
}
"@
}
$src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $In))
$bmp = New-Object System.Drawing.Bitmap $src
$src.Dispose()
$fg = $null
$keyed = [SpriteTool]::Key($bmp, $Bg, [ref]$fg)
$xc = [SpriteTool]::Cuts($fg, $Cols, $true)
$yc = [SpriteTool]::Cuts($fg, $Rows, $false)
New-Item -ItemType Directory -Force $OutDir | Out-Null
$idx = 0
for ($r = 0; $r -lt $Rows; $r++) { for ($c = 0; $c -lt $Cols; $c++) {
  $name = $Names[$idx]; $idx++
  if (-not $name -or $name -eq '-') { continue }
  $rect = [SpriteTool]::Bounds($fg, $xc[$c], $yc[$r], $xc[$c+1], $yc[$r+1])
  $pad = [int]([Math]::Max($rect.Width, $rect.Height) * 0.06)
  if ($Bg -eq 'white') { $pad = -[int]([Math]::Min($rect.Width, $rect.Height) * 0.015) } # 장면은 테두리 살짝 안쪽으로
  $rect = [System.Drawing.Rectangle]::FromLTRB([Math]::Max(0,$rect.Left-$pad), [Math]::Max(0,$rect.Top-$pad), [Math]::Min($keyed.Width,$rect.Right+$pad), [Math]::Min($keyed.Height,$rect.Bottom+$pad))
  $side = [Math]::Max($rect.Width, $rect.Height)
  if ($Square -or $Bg -ne 'white') { $cw = $side; $ch = $side } else { $cw = $rect.Width; $ch = $rect.Height }
  $scale = $Size / [Math]::Max($cw, $ch)
  $ow = [int][Math]::Round($cw * $scale); $oh = [int][Math]::Round($ch * $scale)
  $out = New-Object System.Drawing.Bitmap $ow, $oh, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $gr = [System.Drawing.Graphics]::FromImage($out)
  $gr.InterpolationMode = 'HighQualityBicubic'; $gr.PixelOffsetMode = 'HighQuality'
  $dw = $rect.Width * $scale; $dh = $rect.Height * $scale
  $dest = New-Object System.Drawing.RectangleF -ArgumentList ([single](($ow - $dw) / 2)), ([single](($oh - $dh) / 2)), ([single]$dw), ([single]$dh)
  $srcBmp = if ($Bg -eq 'white') { $bmp } else { $keyed }
  $gr.DrawImage($srcBmp, $dest, (New-Object System.Drawing.RectangleF $rect.X, $rect.Y, $rect.Width, $rect.Height), [System.Drawing.GraphicsUnit]::Pixel)
  $gr.Dispose()
  $path = Join-Path $OutDir "$name.png"
  if ($Bg -eq 'white') {
    $path = Join-Path $OutDir "$name.jpg"
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 85L
    $out.Save($path, $codec, $ep)
  } else { $out.Save($path, [System.Drawing.Imaging.ImageFormat]::Png) }
  $out.Dispose()
  Write-Host "saved $name ($ow x $oh)"
} }
$keyed.Dispose(); $bmp.Dispose()
