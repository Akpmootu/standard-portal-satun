param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference = 'Stop'
function Stop-PrivateSetup([string]$Code) { Write-Output $Code; exit 1 }
if ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name -match 'CodexSandbox') {
    Stop-PrivateSetup 'PRIVATE_STORAGE_SANDBOX_ACCOUNT'
}
. (Join-Path $PSScriptRoot 'directory-acl.ps1')
$expectedPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path '.secrets'))
try { $resolvedPath = (Resolve-Path -LiteralPath $Directory).Path }
catch { Stop-PrivateSetup 'PRIVATE_STORAGE_PATH_INVALID' }
if ($resolvedPath -ne $expectedPath -or -not (Test-Path -LiteralPath $resolvedPath -PathType Container)) {
    Stop-PrivateSetup 'PRIVATE_STORAGE_PATH_INVALID'
}
if ((Get-Item -LiteralPath $resolvedPath).Attributes -band [IO.FileAttributes]::ReparsePoint) {
    Stop-PrivateSetup 'PRIVATE_STORAGE_PATH_INVALID'
}
$acl = [System.Security.AccessControl.DirectorySecurity]::new()
$acl.SetAccessRuleProtection($true, $false)
$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$allowedSids = @($currentSid, [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'), [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))
foreach ($sid in $allowedSids) {
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
}
try { Set-PrivateDirectoryDacl -Path $resolvedPath -Dacl $acl }
catch {
    if ($_.Exception -is [System.UnauthorizedAccessException] -or
        $_.Exception.InnerException -is [System.UnauthorizedAccessException]) {
        Stop-PrivateSetup 'PRIVATE_STORAGE_ACL_ACCESS_DENIED'
    }
    Stop-PrivateSetup 'PRIVATE_STORAGE_ACL_WRITE_FAILED'
}
try {
    $verifiedAcl = Get-Acl -LiteralPath $resolvedPath
    $verifiedRules = @($verifiedAcl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
} catch { Stop-PrivateSetup 'PRIVATE_STORAGE_ACL_READ_FAILED' }
$allowedSidValues = @($allowedSids | ForEach-Object { $_.Value })
if (-not $verifiedAcl.AreAccessRulesProtected -or $verifiedRules.Count -ne 3) {
    Stop-PrivateSetup 'PRIVATE_STORAGE_ACL_VERIFY_FAILED'
}
foreach ($rule in $verifiedRules) {
    if ($rule.IdentityReference.Value -notin $allowedSidValues -or
        $rule.AccessControlType -ne 'Allow' -or $rule.FileSystemRights -ne 'FullControl' -or
        $rule.InheritanceFlags -ne 'ContainerInherit,ObjectInherit' -or $rule.PropagationFlags -ne 'None') {
        Stop-PrivateSetup 'PRIVATE_STORAGE_ACL_VERIFY_FAILED'
    }
}
