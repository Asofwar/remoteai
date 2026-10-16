use super::{tests::Fixture, *};
use serde_json::json;

fn add_account(paths: &Paths, email: &str) -> String {
    let auth = json!({"tokens": {"access_token": "fixture-token", "email": email}});
    let (_, _, _, id) = crate::auth::account_fields(&auth).unwrap();
    write_json_atomic(&crate::storage::managed_auth_path(paths, &id), &auth).unwrap();
    format!("{ACCOUNT_MEMBER_PREFIX}{id}")
}

#[test]
fn official_and_mixed_members_roundtrip_with_model_aliases_and_no_credentials() {
    let fixture = Fixture::new();
    let first = add_account(&fixture.paths, "first@example.test");
    let second = add_account(&fixture.paths, "second@example.test");
    for members in [vec![first.clone(), second], vec!["a".into(), first.clone()]] {
        let input = serde_json::from_value(json!({
            "name":"Mixed", "model":"logical-model", "enabled":true,
            "memberProviderIds":members,
            "memberModels": {"a":"test-model", (first.clone()):"official-model"}
        }))
        .unwrap();
        let config = normalize_input("mixed".into(), input, &fixture.paths).unwrap();
        write_configs(&fixture.paths, std::slice::from_ref(&config)).unwrap();
        assert_eq!(
            read_configs(&fixture.paths).unwrap().as_slice(),
            std::slice::from_ref(&config)
        );
        let profiles = member_profiles(&fixture.paths, &config).unwrap();
        let account = profiles.iter().find(|profile| profile.id == first).unwrap();
        assert!(account.api_key.is_empty());
        assert_eq!(account.name, "first@example.test");
        assert_eq!(member_model(&config, &first), "official-model");
        assert_eq!(
            logical_profile(&config, &profiles).unwrap().model,
            "logical-model"
        );
    }
}

#[test]
fn official_members_reject_missing_mismatched_and_unsafe_accounts() {
    let fixture = Fixture::new();
    let member = add_account(&fixture.paths, "first@example.test");
    assert!(read_member_profile(&fixture.paths, &member).is_ok());
    for id in [
        "account:",
        "account:../outside",
        "account:account:nested",
        "account:missing",
    ] {
        assert!(read_member_profile(&fixture.paths, id).is_err(), "{id}");
    }
    let path =
        crate::storage::managed_auth_path(&fixture.paths, member_account_id(&member).unwrap());
    write_json_atomic(
        &path,
        &json!({"tokens": {
            "access_token":"fixture-token", "email":"different@example.test"
        }}),
    )
    .unwrap();
    assert!(read_member_profile(&fixture.paths, &member).is_err());
}

#[test]
fn removing_an_official_member_prunes_aliases_and_disables_an_incomplete_aggregate() {
    let fixture = Fixture::new();
    let member = add_account(&fixture.paths, "first@example.test");
    let config = serde_json::from_value(json!({
        "id":"mixed", "name":"Mixed", "model":"test-model", "enabled":true,
        "memberProviderIds":["a",member], "memberModels":{(member.clone()):"official-model"}
    }))
    .unwrap();
    write_configs(&fixture.paths, &[config]).unwrap();
    remove_provider_membership(&fixture.paths, &member).unwrap();
    let saved = read_config(&fixture.paths, "mixed").unwrap();
    assert_eq!(saved.member_provider_ids, ["a"]);
    assert!(!saved.enabled);
    assert!(saved.member_models.is_empty());
}
