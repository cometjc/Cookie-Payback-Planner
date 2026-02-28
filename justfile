set dotenv-load := true
set shell := ["powershell.exe", "-NoLogo", "-Command"]

build:
    yarn run build

deploy: build
    & { if (-not $env:WORKSHOP_PATH) { throw "WORKSHOP_PATH is not set" }; $modId = (Get-Content -Raw "info.txt" | ConvertFrom-Json).ID; if (-not $modId) { throw "Mod ID not found in info.txt" }; $dest = Join-Path $env:WORKSHOP_PATH $modId; New-Item -ItemType Directory -Force -Path $dest | Out-Null; $files = @("main.js", "info.txt", "thumbnail.png"); foreach ($file in $files) { Copy-Item -Force $file -Destination $dest }; Get-ChildItem -File -Path $dest | Where-Object { $files -notcontains $_.Name } | Remove-Item -Force }

lint:
    yarn run lint:src

test:
    yarn run test

check: lint test
    @echo "Lint and test completed"
