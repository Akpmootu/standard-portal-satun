$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../scripts/directory-acl.ps1')
# A newly created, empty fixture only; this test never accesses .secrets.
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ('portal-acl-check-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $fixture
try {
    $before = Get-Acl -LiteralPath $fixture
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $allowed = @($sid, [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'), [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))
    $desired = [System.Security.AccessControl.DirectorySecurity]::new()
    $desired.SetAccessRuleProtection($true, $false)
    foreach ($identity in $allowed) {
        $desired.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
    }
    Set-PrivateDirectoryDacl -Path $fixture -Dacl $desired
    $after = Get-Acl -LiteralPath $fixture
    $rules = @($after.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
    if ($after.Owner -ne $before.Owner -or $after.Group -ne $before.Group) { throw 'OWNER_OR_GROUP_CHANGED' }
    if (-not $after.AreAccessRulesProtected -or $rules.Count -ne 3) { throw 'UNEXPECTED_DACL' }
    foreach ($rule in $rules) {
        if ($rule.IdentityReference.Value -notin @($allowed.Value) -or
            $rule.FileSystemRights -ne 'FullControl' -or $rule.AccessControlType -ne 'Allow' -or
            $rule.InheritanceFlags -ne 'ContainerInherit,ObjectInherit' -or $rule.PropagationFlags -ne 'None') { throw 'UNEXPECTED_RULE' }
    }
    # Repeat writes must remain safe and preserve ownership.
    Set-PrivateDirectoryDacl -Path $fixture -Dacl $desired
    if ((Get-Acl -LiteralPath $fixture).Owner -ne $before.Owner) { throw 'OWNER_CHANGED_ON_REPEAT' }
    'DACL_CHECK_OK: three restricted rules; owner/group preserved; repeated update passed.'
} finally {
    # Delete only our exact empty fixture, never recurse or touch credentials.
    Remove-Item -LiteralPath $fixture -ErrorAction Stop
}
