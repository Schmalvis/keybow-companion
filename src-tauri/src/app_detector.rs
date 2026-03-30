use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use windows::Win32::Foundation::{ERROR_NO_MORE_ITEMS, ERROR_SUCCESS};
use windows::Win32::System::Registry::{
    RegCloseKey, RegEnumKeyExW, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER,
    HKEY_LOCAL_MACHINE, KEY_READ, REG_SZ,
};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DetectedApp {
    pub name: String,
    pub process: String,
    pub path: String,
}

const UNINSTALL_PATHS: &[&str] = &[
    "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
];

/// Detect installed applications by scanning Windows registry Uninstall keys.
pub fn detect_installed_apps() -> Vec<DetectedApp> {
    let mut apps = Vec::new();

    for &root in &[HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        for &subkey_path in UNINSTALL_PATHS {
            if let Some(mut found) = read_uninstall_key(root, subkey_path) {
                apps.append(&mut found);
            }
        }
    }

    // Deduplicate by path (case-insensitive)
    apps.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
    apps.dedup_by(|a, b| a.path.to_lowercase() == b.path.to_lowercase());

    // Sort by name
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    apps
}

fn read_uninstall_key(root: HKEY, subkey_path: &str) -> Option<Vec<DetectedApp>> {
    let subkey_wide: Vec<u16> = subkey_path.encode_utf16().chain(std::iter::once(0)).collect();
    let mut hkey = HKEY::default();

    let result = unsafe {
        RegOpenKeyExW(
            root,
            windows::core::PCWSTR(subkey_wide.as_ptr()),
            None,
            KEY_READ,
            &mut hkey,
        )
    };

    if result != ERROR_SUCCESS {
        return None;
    }

    let mut apps = Vec::new();
    let mut index: u32 = 0;

    loop {
        let mut name_buf = [0u16; 256];
        let mut name_len = name_buf.len() as u32;

        let result = unsafe {
            RegEnumKeyExW(
                hkey,
                index,
                Some(windows::core::PWSTR(name_buf.as_mut_ptr())),
                &mut name_len,
                None,
                None,
                None,
                None,
            )
        };

        if result == ERROR_NO_MORE_ITEMS {
            break;
        }
        if result != ERROR_SUCCESS {
            index += 1;
            continue;
        }

        let subkey_name = OsString::from_wide(&name_buf[..name_len as usize])
            .to_string_lossy()
            .to_string();

        let full_path = format!("{}\\{}", subkey_path, subkey_name);

        if let Some(app) = read_app_entry(root, &full_path) {
            apps.push(app);
        }

        index += 1;
    }

    unsafe { let _ = RegCloseKey(hkey); };

    Some(apps)
}

fn read_app_entry(root: HKEY, subkey_path: &str) -> Option<DetectedApp> {
    let subkey_wide: Vec<u16> = subkey_path.encode_utf16().chain(std::iter::once(0)).collect();
    let mut hkey = HKEY::default();

    let result = unsafe {
        RegOpenKeyExW(
            root,
            windows::core::PCWSTR(subkey_wide.as_ptr()),
            None,
            KEY_READ,
            &mut hkey,
        )
    };

    if result != ERROR_SUCCESS {
        return None;
    }

    let display_name = read_reg_string(hkey, "DisplayName");
    let install_location = read_reg_string(hkey, "InstallLocation");
    let display_icon = read_reg_string(hkey, "DisplayIcon");

    unsafe { let _ = RegCloseKey(hkey); };

    let name = display_name?;
    if name.is_empty() {
        return None;
    }

    // Try to find the executable path
    let exe_path = find_exe_path(&install_location, &display_icon)?;

    // Extract process name from path
    let process = std::path::Path::new(&exe_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    if process.is_empty() {
        return None;
    }

    Some(DetectedApp {
        name,
        process,
        path: exe_path,
    })
}

fn find_exe_path(install_location: &Option<String>, display_icon: &Option<String>) -> Option<String> {
    // Try DisplayIcon first — often has the exe path directly
    if let Some(icon) = display_icon {
        let path = icon.split(',').next().unwrap_or(icon).trim().trim_matches('"');
        if path.to_lowercase().ends_with(".exe") && std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    // Try install location
    if let Some(loc) = install_location {
        let loc = loc.trim().trim_matches('"');
        if !loc.is_empty() {
            let path = std::path::Path::new(loc);
            if path.is_file() && loc.to_lowercase().ends_with(".exe") {
                return Some(loc.to_string());
            }
            // Look for an exe in the install directory
            if path.is_dir() {
                if let Ok(entries) = std::fs::read_dir(path) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.extension().and_then(|e| e.to_str()) == Some("exe") {
                            return Some(p.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    None
}

fn read_reg_string(hkey: HKEY, value_name: &str) -> Option<String> {
    let value_wide: Vec<u16> = value_name.encode_utf16().chain(std::iter::once(0)).collect();
    let mut reg_type = REG_SZ;
    let mut data_size: u32 = 0;

    // First call to get the size
    let result = unsafe {
        RegQueryValueExW(
            hkey,
            windows::core::PCWSTR(value_wide.as_ptr()),
            None,
            Some(&mut reg_type),
            None,
            Some(&mut data_size),
        )
    };

    if result != ERROR_SUCCESS || data_size == 0 {
        return None;
    }

    let mut data = vec![0u8; data_size as usize];

    let result = unsafe {
        RegQueryValueExW(
            hkey,
            windows::core::PCWSTR(value_wide.as_ptr()),
            None,
            Some(&mut reg_type),
            Some(data.as_mut_ptr()),
            Some(&mut data_size),
        )
    };

    if result != ERROR_SUCCESS {
        return None;
    }

    // Convert from UTF-16LE bytes, stripping trailing null
    let wide: Vec<u16> = data
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();

    let s = OsString::from_wide(&wide)
        .to_string_lossy()
        .trim_end_matches('\0')
        .to_string();

    if s.is_empty() { None } else { Some(s) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_installed_apps_does_not_panic() {
        let apps = detect_installed_apps();
        // Should find at least a few apps on any Windows system
        // But we don't require it for CI
        log::info!("Detected {} apps", apps.len());
    }

    #[test]
    fn detected_app_has_required_fields() {
        let apps = detect_installed_apps();
        for app in &apps {
            assert!(!app.name.is_empty(), "App name should not be empty");
            assert!(!app.process.is_empty(), "App process should not be empty");
            assert!(!app.path.is_empty(), "App path should not be empty");
        }
    }
}
