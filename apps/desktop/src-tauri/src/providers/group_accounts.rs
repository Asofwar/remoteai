use crate::{
    aggregate_api::{read_member_profile, ACCOUNT_MEMBER_PREFIX},
    models::ProviderProfile,
    storage::{account_group_path, load_account_group, read_state, Paths},
};

/// Group membership is resolved on each request so disabled or moved accounts cannot be reused.
pub(super) fn profiles(paths: &Paths, group: &str) -> Result<Vec<ProviderProfile>, String> {
    let state = read_state(paths);
    let entries = match std::fs::read_dir(&paths.accounts) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err("Unable to load official accounts".to_string()),
    };
    let mut profiles = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|_| "Unable to load official accounts".to_string())?;
        let Some(id) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if state.disabled_account_ids.contains(&id)
            || load_account_group(&account_group_path(paths, &id)) != group
        {
            continue;
        }
        // Unavailable credentials must not prevent healthy members from serving the group.
        if let Ok(mut profile) = read_member_profile(paths, &format!("{ACCOUNT_MEMBER_PREFIX}{id}"))
        {
            profile.group = group.to_string();
            profiles.push(profile);
        }
    }
    profiles.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(profiles)
}
