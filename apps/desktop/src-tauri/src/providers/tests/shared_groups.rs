fn grouped_official_account(paths: &Paths, email: &str, group: &str) -> String {
    let auth = json!({"tokens":{"access_token":"test-token", "email":email}});
    let (_, _, _, id) = crate::auth::account_fields(&auth).unwrap();
    write_json_atomic(&managed_auth_path(paths, &id), &auth).unwrap();
    crate::storage::save_account_group(&crate::storage::account_group_path(paths, &id), group).unwrap();
    id
}

#[test]
fn shared_group_includes_only_enabled_valid_accounts_from_the_same_group() {
    let paths = test_paths();
    let mut api = provider();
    api.group = "Work".into();
    write_provider(&paths, &api).unwrap();
    let included = grouped_official_account(&paths, "included@example.test", "Work");
    let disabled = grouped_official_account(&paths, "disabled@example.test", "Work");
    grouped_official_account(&paths, "outside@example.test", "Home");
    let invalid = grouped_official_account(&paths, "invalid@example.test", "Work");
    write_json_atomic(&managed_auth_path(&paths, &invalid), &json!({})).unwrap();
    write_state(&paths, &ManagerStateFile {
        disabled_account_ids: vec![disabled], ..Default::default()
    }).unwrap();

    let members = provider_group_profiles(&paths, " Work ").unwrap();
    assert_eq!(members.len(), 2);
    assert_eq!(members[0].id, api.id);
    assert_eq!(members[1].id, format!("account:{included}"));
    assert!(members[1].api_key.is_empty());
    let model = members[1].models.first().unwrap();
    let visible = provider_group_model_name(&members[1], model);
    let selected = provider_for_group_model(&members, Some(&visible)).unwrap();
    assert_eq!(selected.id, members[1].id);
    assert_eq!(&selected.model, model);
    assert!(provider_for_group_model(&members, Some("outside-model")).is_err());
    let catalog = model_catalog_for_provider_group(&members);
    assert!(catalog["models"].as_array().unwrap().iter().any(|entry| entry["slug"] == visible));
    fs::remove_dir_all(paths.codex_home.parent().unwrap()).unwrap();
}

#[test]
fn shared_group_supports_official_only_and_existing_provider_only_groups() {
    let paths = test_paths();
    let mut api = provider();
    api.group = "API".into();
    write_provider(&paths, &api).unwrap();
    assert_eq!(provider_group_profiles(&paths, "API").unwrap().len(), 1);
    let id = grouped_official_account(&paths, "official@example.test", "Official");
    assert_eq!(provider_group_profiles(&paths, "Official").unwrap()[0].id, format!("account:{id}"));
    assert!(provider_group_profiles(&paths, "Missing").is_err());
    assert!(provider_group_profiles(&paths, "").is_err());
    fs::remove_dir_all(paths.codex_home.parent().unwrap()).unwrap();
}
