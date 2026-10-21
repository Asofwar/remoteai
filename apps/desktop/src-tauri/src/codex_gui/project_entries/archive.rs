use super::{paths, tree, Error, Result};
use std::{
    fs::File,
    io::{self, Read},
    path::Path,
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

/// Build in a private temporary file; returning or failing releases it without touching the project.
pub(crate) fn create(root: &Path, source: &str, max_bytes: u64) -> Result<(File, String)> {
    let path = paths::resolve(root, source)?;
    if !path.is_dir() {
        return Err(Error::Path);
    }
    let entries = tree::scan(&path)?;
    let total = entries
        .iter()
        .filter(|entry| !entry.directory)
        .try_fold(0u64, |total, entry| total.checked_add(entry.size))
        .ok_or(Error::TooLarge)?;
    if total > max_bytes {
        return Err(Error::TooLarge);
    }
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or(Error::Name)?;
    let parent = path.parent().ok_or(Error::Path)?;
    let mut archive = ZipWriter::new(tempfile::tempfile().map_err(|_| Error::Operation)?);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for entry in entries {
        paths::resolve(root, &super::execution_path(&entry.path))?;
        let relative = archive_name(parent, &entry.path)?;
        if entry.directory {
            archive
                .add_directory(format!("{relative}/"), options)
                .map_err(|_| Error::Operation)?;
        } else {
            write_file(&mut archive, &entry, &relative, options)?;
        }
    }
    let file = archive.finish().map_err(|_| Error::Operation)?;
    if file.metadata().map_err(|_| Error::Operation)?.len() > max_bytes {
        return Err(Error::TooLarge);
    }
    Ok((file, format!("{name}.zip")))
}

fn archive_name(parent: &Path, path: &Path) -> Result<String> {
    path.strip_prefix(parent)
        .map_err(|_| Error::Path)?
        .components()
        .map(|part| {
            let name = part.as_os_str().to_str().ok_or(Error::Name)?;
            // A literal Unix backslash could become traversal when extracted on Windows.
            if name.contains('\\') {
                return Err(Error::Name);
            }
            Ok(name)
        })
        .collect::<Result<Vec<_>>>()
        .map(|parts| parts.join("/"))
}

fn write_file(
    archive: &mut ZipWriter<File>,
    entry: &tree::Entry,
    relative: &str,
    options: SimpleFileOptions,
) -> Result<()> {
    if std::fs::symlink_metadata(&entry.path)
        .map_err(|_| Error::Operation)?
        .file_type()
        .is_symlink()
    {
        return Err(Error::Link);
    }
    let source = File::open(&entry.path).map_err(|_| Error::Operation)?;
    archive
        .start_file(relative, options.large_file(entry.size > u32::MAX as u64))
        .map_err(|_| Error::Operation)?;
    let copied = io::copy(&mut source.take(entry.size.saturating_add(1)), archive)
        .map_err(|_| Error::Operation)?;
    if copied != entry.size {
        return Err(Error::Operation);
    }
    Ok(())
}
