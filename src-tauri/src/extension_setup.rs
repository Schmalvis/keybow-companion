use std::path::Path;
use tauri::{AppHandle, Manager};

const NATIVE_HOST_NAME: &str = "com.keybow.companion";

/// Returns true if extension was newly set up, false if already installed.
pub fn ensure_extension_installed(app: &AppHandle) -> Result<bool, String> {
    let resource_dir = app.path().resource_dir()
        .map_err(|e| format!("resource_dir: {}", e))?;
    let data_dir = app.path().app_local_data_dir()
        .map_err(|e| format!("app_local_data_dir: {}", e))?;

    let manifest_dest = data_dir.join("native-messaging.json");
    let host_dest = data_dir.join("native-host.exe");

    // Already installed — skip
    if manifest_dest.exists() && host_dest.exists() {
        return Ok(false);
    }

    // Copy extension files
    let ext_src = resource_dir.join("extension");
    let ext_dst = data_dir.join("extension");
    copy_dir_all(&ext_src, &ext_dst)
        .map_err(|e| format!("copy extension: {}", e))?;

    // Copy native-host.exe
    std::fs::copy(resource_dir.join("native-host.exe"), &host_dest)
        .map_err(|e| format!("copy native-host.exe: {}", e))?;

    // Copy native-messaging.json with path substituted
    let template = std::fs::read_to_string(resource_dir.join("native-messaging.json"))
        .map_err(|e| format!("read native-messaging.json: {}", e))?;
    // Double backslashes for JSON serialization (C:\foo → C:\\foo)
    let host_path = host_dest.to_string_lossy().replace('\\', "\\\\");
    let manifest = template.replace("NATIVE_HOST_PATH", &host_path);
    std::fs::write(&manifest_dest, manifest)
        .map_err(|e| format!("write native-messaging.json: {}", e))?;

    // Write Chrome registry key
    write_registry_key(&manifest_dest.to_string_lossy())?;

    Ok(true)
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let dest_path = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &dest_path)?;
        } else {
            std::fs::copy(entry.path(), dest_path)?;
        }
    }
    Ok(())
}

fn write_registry_key(manifest_path: &str) -> Result<(), String> {
    let key = format!(
        r"HKCU\Software\Google\Chrome\NativeMessagingHosts\{}",
        NATIVE_HOST_NAME
    );
    let status = std::process::Command::new("reg")
        .args(["add", &key, "/f", "/ve", "/t", "REG_SZ", "/d", manifest_path])
        .status()
        .map_err(|e| format!("reg.exe launch failed: {}", e))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("reg.exe exited with status {}", status))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn copy_dir_all_copies_files_recursively() {
        let src = TempDir::new().unwrap();
        let dst = TempDir::new().unwrap();
        fs::write(src.path().join("a.txt"), b"hello").unwrap();
        fs::create_dir(src.path().join("sub")).unwrap();
        fs::write(src.path().join("sub/b.txt"), b"world").unwrap();

        copy_dir_all(src.path(), dst.path()).unwrap();

        assert_eq!(fs::read(dst.path().join("a.txt")).unwrap(), b"hello");
        assert_eq!(fs::read(dst.path().join("sub/b.txt")).unwrap(), b"world");
    }
}
