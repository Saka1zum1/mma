# Sync ccmdi/mma into this fork with conflict-reduction defaults.
# Usage (from repo root):
#   pwsh scripts/sync-upstream.ps1
#   pwsh scripts/sync-upstream.ps1 -Commit
#
# Policy:
# - Prefer frequent small merges over rare megamerges.
# - Keep fork-only code in app/src/lib/sv/{baidu,tencent,yandex,providers}/ and thin adapters.
# - Never take upstream updater endpoints/pubkey (independent release).
# - After resolving a conflict once, leave the resolution in the merge commit so
#   Git history + optional rerere can reuse it next time.

param(
	[switch]$Commit,
	[string]$UpstreamRemote = "upstream",
	[string]$UpstreamBranch = "master"
)

$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))

if (-not (git rev-parse --is-inside-work-tree 2>$null)) {
	throw "Not a git repository"
}

$dirty = git status --porcelain
if ($dirty) {
	throw "Working tree is dirty. Commit or stash before syncing upstream."
}

git fetch $UpstreamRemote
$behind = [int](git rev-list --count "HEAD..${UpstreamRemote}/${UpstreamBranch}")
$ahead = [int](git rev-list --count "${UpstreamRemote}/${UpstreamBranch}..HEAD")
Write-Host "Fork is $behind behind / $ahead ahead of ${UpstreamRemote}/${UpstreamBranch}"

if ($behind -eq 0) {
	Write-Host "Already up to date."
	exit 0
}

# Overlap preview helps decide whether to proceed now or wait for a quieter window.
$base = git merge-base HEAD "${UpstreamRemote}/${UpstreamBranch}"
$uFiles = git diff --name-only $base "${UpstreamRemote}/${UpstreamBranch}"
$fFiles = git diff --name-only $base HEAD
$overlap = $uFiles | Where-Object { $fFiles -contains $_ }
if ($overlap) {
	Write-Host ""
	Write-Host "Files changed on BOTH sides (likely conflict hotspots):"
	$overlap | ForEach-Object { Write-Host "  $_" }
	Write-Host ""
}

git merge --no-edit "${UpstreamRemote}/${UpstreamBranch}"
if ($LASTEXITCODE -ne 0) {
	Write-Host ""
	Write-Host "Merge stopped with conflicts. Resolve, then:"
	Write-Host "  git add -A"
	Write-Host "  git commit"
	Write-Host ""
	Write-Host "Keep fork release identity in app/src-tauri/tauri.conf.json (updater endpoints/pubkey)."
	Write-Host "Keep altproviders coverage/adapters when touching buildSceneLayers / mapClick / LocationPreview."
	exit $LASTEXITCODE
}

if ($Commit) {
	# merge --no-edit already created the commit when clean
	Write-Host "Merge complete."
} else {
	Write-Host "Merge complete (already committed by git merge --no-edit)."
}

Write-Host "Suggested verify:"
Write-Host "  cd app; npx tsc --noEmit -p tsconfig.app.json"
Write-Host "  cd app; npx eslint src/components/editor/location src/lib/render/buildSceneLayers.ts"
Write-Host "  cd app/src-tauri; cargo test --offline"
