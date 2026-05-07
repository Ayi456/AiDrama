param(
  [switch]$SkipBuild,
  [switch]$InstallNodeModules,
  [switch]$IncludeNodeModules,
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path -LiteralPath (Join-Path $scriptRoot '..')
$deployRoot = Join-Path $repoRoot 'deploy\scf'

if (-not $OutputPath) {
  $OutputPath = Join-Path $repoRoot 'deploy\aidrama-scf.zip'
}

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )

  Write-Host "==> $Name"
  & $Action
}

function Assert-Condition {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Read-ZipEntryText {
  param(
    [System.IO.Compression.ZipArchive]$Zip,
    [string]$EntryName
  )

  $entry = $Zip.GetEntry($EntryName)
  Assert-Condition ($null -ne $entry) "Missing zip entry: $EntryName"

  $reader = New-Object System.IO.StreamReader($entry.Open())
  try {
    return $reader.ReadToEnd()
  } finally {
    $reader.Dispose()
  }
}

function ConvertTo-WslPath {
  param([string]$WindowsPath)

  $resolvedPath = (Resolve-Path -LiteralPath $WindowsPath).Path
  $drive = $resolvedPath.Substring(0, 1).ToLowerInvariant()
  $pathPart = $resolvedPath.Substring(2).Replace('\', '/')
  return "/mnt/$drive$pathPart"
}

function Quote-BashString {
  param([string]$Value)

  return "'" + $Value.Replace("'", "'\''") + "'"
}

function Test-WslNpm {
  $wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
  if (-not $wsl) {
    return $false
  }

  & wsl.exe bash -lc 'command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1' *> $null
  return $LASTEXITCODE -eq 0
}

Push-Location $repoRoot
try {
  if (-not $SkipBuild) {
    Invoke-Step 'Build SCF artifact' {
      & node 'scripts\build-scf.mjs'
      if ($LASTEXITCODE -ne 0) {
        throw "node scripts\build-scf.mjs failed with exit code $LASTEXITCODE"
      }
    }
  }

  if ($InstallNodeModules) {
    $IncludeNodeModules = $true
    Invoke-Step 'Install Linux production dependencies' {
      if ($IsWindows -or $env:OS -eq 'Windows_NT') {
        if (-not (Test-WslNpm)) {
          throw 'Installing Linux node_modules from Windows requires WSL with node and npm installed. Install Ubuntu/WSL Node.js, then rerun this script, or run without -InstallNodeModules and keep SCF online dependency installation enabled.'
        }

        $wslDeployRoot = ConvertTo-WslPath $deployRoot
        $quotedDeployRoot = Quote-BashString $wslDeployRoot
        & wsl.exe bash -lc "cd $quotedDeployRoot && npm ci --omit=dev --include=optional"
        if ($LASTEXITCODE -ne 0) {
          throw "WSL npm ci failed with exit code $LASTEXITCODE"
        }
      } else {
        Push-Location $deployRoot
        try {
          & npm ci --omit=dev --include=optional
          if ($LASTEXITCODE -ne 0) {
            throw "npm ci failed with exit code $LASTEXITCODE"
          }
        } finally {
          Pop-Location
        }
      }
    }
  }

  Invoke-Step 'Validate source artifact' {
    Assert-Condition (Test-Path -LiteralPath $deployRoot) "Missing deploy artifact directory: $deployRoot"
    Assert-Condition (Test-Path -LiteralPath (Join-Path $deployRoot 'scf_bootstrap')) 'Missing scf_bootstrap'
    Assert-Condition (Test-Path -LiteralPath (Join-Path $deployRoot 'public\index.html')) 'Missing public/index.html'
    Assert-Condition (Test-Path -LiteralPath (Join-Path $deployRoot 'backend\dist\server.js')) 'Missing backend/dist/server.js'
    Assert-Condition (-not (Test-Path -LiteralPath (Join-Path $deployRoot 'backend\package.json'))) 'Source artifact contains redundant backend/package.json'
    Assert-Condition (-not (Test-Path -LiteralPath (Join-Path $deployRoot 'backend\package-lock.json'))) 'Source artifact contains redundant backend/package-lock.json'
    if ($IncludeNodeModules) {
      Assert-Condition (Test-Path -LiteralPath (Join-Path $deployRoot 'node_modules')) 'Missing node_modules. Run with -InstallNodeModules or install dependencies under deploy/scf first.'
      Assert-Condition (Test-Path -LiteralPath (Join-Path $deployRoot 'node_modules\@hono\node-server')) 'Missing @hono/node-server in node_modules'
      Assert-Condition (Test-Path -LiteralPath (Join-Path $deployRoot 'node_modules\sharp')) 'Missing sharp in node_modules'
      Assert-Condition (Test-Path -LiteralPath (Join-Path $deployRoot 'node_modules\@img\sharp-linux-x64')) 'Missing @img/sharp-linux-x64 in node_modules'
      Assert-Condition (Test-Path -LiteralPath (Join-Path $deployRoot 'node_modules\@img\sharp-libvips-linux-x64')) 'Missing @img/sharp-libvips-linux-x64 in node_modules'
      Assert-Condition (Test-Path -LiteralPath (Join-Path $deployRoot 'node_modules\@ffmpeg-installer\ffmpeg')) 'Missing @ffmpeg-installer/ffmpeg in node_modules'
      Assert-Condition (Test-Path -LiteralPath (Join-Path $deployRoot 'node_modules\@ffmpeg-installer\linux-x64\ffmpeg')) 'Missing @ffmpeg-installer/linux-x64 binary in node_modules'
      Assert-Condition (Test-Path -LiteralPath (Join-Path $deployRoot 'node_modules\@ffprobe-installer\ffprobe')) 'Missing @ffprobe-installer/ffprobe in node_modules'
      Assert-Condition (Test-Path -LiteralPath (Join-Path $deployRoot 'node_modules\@ffprobe-installer\linux-x64\ffprobe')) 'Missing @ffprobe-installer/linux-x64 binary in node_modules'
    }
  }

  Invoke-Step 'Create zip' {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    $zipDir = Split-Path -Parent $OutputPath
    if ($zipDir) {
      New-Item -ItemType Directory -Force -Path $zipDir | Out-Null
    }
    if (Test-Path -LiteralPath $OutputPath) {
      Remove-Item -LiteralPath $OutputPath -Force
    }

    $zip = [System.IO.Compression.ZipFile]::Open($OutputPath, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
      $sourceRoot = (Resolve-Path -LiteralPath $deployRoot).Path
      $files = Get-ChildItem -LiteralPath $sourceRoot -Recurse -File

      foreach ($file in $files) {
        $relativePath = $file.FullName.Substring($sourceRoot.Length).TrimStart('\', '/')
        $entryName = $relativePath.Replace('\', '/')

        if ($entryName -eq '.env' -or $entryName -like '.env.*') {
          continue
        }
        if (-not $IncludeNodeModules -and ($entryName -like 'node_modules/*' -or $entryName -like 'backend/node_modules/*')) {
          continue
        }

        $entry = $zip.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
        if ($entryName -eq 'scf_bootstrap') {
          $entry.ExternalAttributes = -2115174400
        }
        $entry.LastWriteTime = $file.LastWriteTime

        $inputStream = $file.OpenRead()
        try {
          $outputStream = $entry.Open()
          try {
            $inputStream.CopyTo($outputStream)
          } finally {
            $outputStream.Dispose()
          }
        } finally {
          $inputStream.Dispose()
        }
      }
    } finally {
      $zip.Dispose()
    }
  }

  Invoke-Step 'Verify zip' {
    $zip = [System.IO.Compression.ZipFile]::OpenRead($OutputPath)
    try {
      $entries = $zip.Entries | ForEach-Object { $_.FullName }
      $requiredEntries = @(
        'scf_bootstrap',
        'package.json',
        'package-lock.json',
        'serverless.yml',
        'public/index.html',
        'backend/dist/server.js'
      )

      $missing = $requiredEntries | Where-Object { $entries -notcontains $_ }
      Assert-Condition ($missing.Count -eq 0) "Missing required zip entries: $($missing -join ', ')"
      Assert-Condition (-not ($entries | Where-Object { $_ -like '*\*' } | Select-Object -First 1)) 'Zip contains Windows backslash paths'
      Assert-Condition (-not ($entries | Where-Object { $_ -like 'scf/*' } | Select-Object -First 1)) 'Zip contains nested scf/ root directory'
      Assert-Condition (-not ($entries | Where-Object { $_ -eq '.env' -or $_ -like '.env.*' } | Select-Object -First 1)) 'Zip contains .env files'
      Assert-Condition (-not ($entries -contains 'backend/package.json')) 'Zip contains redundant backend/package.json'
      Assert-Condition (-not ($entries -contains 'backend/package-lock.json')) 'Zip contains redundant backend/package-lock.json'
      if ($IncludeNodeModules) {
        Assert-Condition ($entries -contains 'node_modules/@hono/node-server/package.json') 'Zip is missing node_modules/@hono/node-server'
        Assert-Condition ($entries -contains 'node_modules/sharp/package.json') 'Zip is missing node_modules/sharp'
        Assert-Condition ($entries -contains 'node_modules/@img/sharp-linux-x64/package.json') 'Zip is missing node_modules/@img/sharp-linux-x64'
        Assert-Condition ($entries -contains 'node_modules/@img/sharp-libvips-linux-x64/package.json') 'Zip is missing node_modules/@img/sharp-libvips-linux-x64'
        Assert-Condition ($entries -contains 'node_modules/@ffmpeg-installer/ffmpeg/package.json') 'Zip is missing node_modules/@ffmpeg-installer/ffmpeg'
        Assert-Condition ($entries -contains 'node_modules/@ffmpeg-installer/linux-x64/ffmpeg') 'Zip is missing node_modules/@ffmpeg-installer/linux-x64/ffmpeg'
        Assert-Condition ($entries -contains 'node_modules/@ffprobe-installer/ffprobe/package.json') 'Zip is missing node_modules/@ffprobe-installer/ffprobe'
        Assert-Condition ($entries -contains 'node_modules/@ffprobe-installer/linux-x64/ffprobe') 'Zip is missing node_modules/@ffprobe-installer/linux-x64/ffprobe'
      } else {
        Assert-Condition (-not ($entries | Where-Object { $_ -like 'node_modules/*' -or $_ -like 'backend/node_modules/*' } | Select-Object -First 1)) 'Zip contains node_modules'
      }

      $packageJson = Read-ZipEntryText -Zip $zip -EntryName 'package.json' | ConvertFrom-Json
      Assert-Condition ($packageJson.dependencies.'@img/sharp-linux-x64' -eq '0.34.5') 'Missing @img/sharp-linux-x64 dependency'
      Assert-Condition ($packageJson.dependencies.'@img/sharp-libvips-linux-x64' -eq '1.2.4') 'Missing @img/sharp-libvips-linux-x64 dependency'
      Assert-Condition ($packageJson.dependencies.'@ffmpeg-installer/ffmpeg' -eq '^1.1.0') 'Missing @ffmpeg-installer/ffmpeg dependency'
      Assert-Condition ($packageJson.dependencies.'@ffmpeg-installer/linux-x64' -eq '4.1.0') 'Missing @ffmpeg-installer/linux-x64 dependency'
      Assert-Condition ($packageJson.dependencies.'@ffprobe-installer/ffprobe' -eq '^2.1.2') 'Missing @ffprobe-installer/ffprobe dependency'
      Assert-Condition ($packageJson.dependencies.'@ffprobe-installer/linux-x64' -eq '5.2.0') 'Missing @ffprobe-installer/linux-x64 dependency'
    } finally {
      $zip.Dispose()
    }

    $zipFile = Get-Item -LiteralPath $OutputPath
    Write-Host "SCF zip ready: $($zipFile.FullName)"
    Write-Host "Size bytes: $($zipFile.Length)"
  }
} finally {
  Pop-Location
}
