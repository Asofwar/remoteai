use super::*;

fn configured_rates() -> CostRates {
    let mut catalog = (*PRESET_CATALOG).clone();
    let preset = catalog
        .models
        .iter_mut()
        .find(|preset| preset.model == "gpt-6-sol")
        .unwrap();
    preset.long_context_threshold_tokens = Some(100_000);
    preset.aliases.push("threshold-alias".into());
    CostRates {
        preset_catalog: Some(catalog),
        reference_model: "gpt-6-sol".into(),
        ..CostRates::default()
    }
}

#[test]
fn model_thresholds_apply_to_full_requests_aliases_and_reference_models() {
    let rates = configured_rates();
    assert!(rates.validate().is_ok());
    for model in [
        "gpt-6-sol",
        "GPT-6-SOL-dated",
        "threshold-alias",
        "private-model",
    ] {
        let mut entry = usage_entry(model);
        entry.input_tokens = Some(100_000);
        entry.cached_tokens = Some(50_000);
        entry.output_tokens = Some(10_000);
        entry.service_tier = Some("fast".into());
        assert!((rates.estimate_cost(&entry, None) - 0.42).abs() < 1e-10);
        entry.input_tokens = Some(100_001);
        assert!((rates.estimate_cost(&entry, None) - 0.740008).abs() < 1e-10);
    }
    assert_eq!(
        rates.long_context_threshold_for_model("gpt-6-luna"),
        272_000
    );
}

#[test]
fn local_thresholds_override_presets_and_legacy_settings_until_reset() {
    let mut rates = configured_rates();
    rates.long_context.threshold_tokens = 600_000;
    assert_eq!(
        rates.long_context_threshold_for_model("threshold-alias"),
        600_000
    );
    rates
        .model_long_context_thresholds
        .insert("gpt-6-sol".into(), Some(400_000));
    assert_eq!(
        rates.long_context_threshold_for_model("gpt-6-sol-dated"),
        400_000
    );
    rates
        .model_long_context_thresholds
        .insert("gpt-6-sol".into(), None);
    assert_eq!(
        rates.long_context_threshold_for_model("threshold-alias"),
        100_000
    );
    assert_eq!(
        rates.long_context_threshold_for_model("gpt-6-luna"),
        600_000
    );
    let restored: CostRates =
        serde_json::from_value(serde_json::to_value(&rates).unwrap()).unwrap();
    assert_eq!(
        restored.long_context_threshold_for_model("private-model"),
        100_000
    );
}

#[test]
fn invalid_thresholds_are_rejected_for_remote_and_local_models() {
    for threshold in [0, PRESET_CATALOG.max_long_context_threshold_tokens + 1] {
        let mut rates = configured_rates();
        rates
            .model_long_context_thresholds
            .insert("gpt-6-sol".into(), Some(threshold));
        assert!(rates.validate().is_err());
        rates.model_long_context_thresholds.clear();
        rates.preset_catalog.as_mut().unwrap().models[0].long_context_threshold_tokens =
            Some(threshold);
        assert!(rates.validate().is_err());
    }
    for value in [json!(-1), json!(1.5), json!("272000"), json!(true)] {
        assert!(serde_json::from_value::<CostRates>(json!({
            "modelLongContextThresholds": {"gpt-6-sol": value}
        }))
        .is_err());
    }
}
