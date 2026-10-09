# Persist only the modified DACL. Do not use Set-Acl here: its provider can also
# attempt to persist owner/group/audit sections, requiring unrelated privileges.
function Set-PrivateDirectoryDacl {
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        [Parameter(Mandatory=$true)][System.Security.AccessControl.DirectorySecurity]$Dacl
    )
    $directoryInfo = [System.IO.DirectoryInfo]::new($Path)
    $accessSection = [System.Security.AccessControl.AccessControlSections]::Access
    if ($PSVersionTable.PSEdition -eq 'Core') {
        $current = [System.IO.FileSystemAclExtensions]::GetAccessControl($directoryInfo, $accessSection)
        $current.SetSecurityDescriptorSddlForm($Dacl.GetSecurityDescriptorSddlForm($accessSection), $accessSection)
        [System.IO.FileSystemAclExtensions]::SetAccessControl($directoryInfo, $current)
    } else {
        $current = $directoryInfo.GetAccessControl($accessSection)
        $current.SetSecurityDescriptorSddlForm($Dacl.GetSecurityDescriptorSddlForm($accessSection), $accessSection)
        $directoryInfo.SetAccessControl($current)
    }
}
