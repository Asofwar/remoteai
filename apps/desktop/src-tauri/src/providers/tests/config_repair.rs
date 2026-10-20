    #[test]
    fn config_repair_fully_replaces_invalid_config_and_stale_backup() {
        let paths = test_paths();
        write_text_atomic(&paths.current_config, "[broken").unwrap();
        write_text_atomic(&paths.config_backup, "model = \"stale\"\n").unwrap();
        let expected = codex_config::default_official(
            DEFAULT_OFFICIAL_MODEL,
            DEFAULT_OFFICIAL_REASONING_EFFORT,
        );

        replace_codex_config(&paths, &expected, false).unwrap();

        let compatible = codex_config::ensure_official_provider_compatibility(&expected).unwrap();
        assert_eq!(fs::read_to_string(&paths.current_config).unwrap(), compatible);
        assert!(!paths.config_backup.exists());
        fs::remove_dir_all(paths.codex_home.parent().unwrap()).unwrap();
    }

    #[test]
    fn config_repair_prepares_fresh_official_backup_before_proxy_reapply() {
        let paths = test_paths();
        let expected = codex_config::default_official(
            DEFAULT_OFFICIAL_MODEL,
            DEFAULT_OFFICIAL_REASONING_EFFORT,
        );

        replace_codex_config(&paths, &expected, true).unwrap();

        let compatible = codex_config::ensure_official_provider_compatibility(&expected).unwrap();
        assert_eq!(fs::read_to_string(&paths.current_config).unwrap(), compatible);
        assert_eq!(fs::read_to_string(&paths.config_backup).unwrap(), expected);
        fs::remove_dir_all(paths.codex_home.parent().unwrap()).unwrap();
    }

    #[test]
    fn startup_repairs_missing_old_chat_provider_without_changing_model() {
        let paths = test_paths();
        let config = "model_provider = 'openai'\nmodel = 'my-model'\n";
        write_text_atomic(&paths.current_config, config).unwrap();

        cleanup_non_proxy_provider_state(&paths).unwrap();
        let repaired = fs::read_to_string(&paths.current_config).unwrap();
        let document = repaired.parse::<toml_edit::DocumentMut>().unwrap();
        assert_eq!(document["model"].as_str(), Some("my-model"));
        assert_eq!(
            document["model_providers"][codex_config::LOCAL_PROXY_PROVIDER_ID]["requires_openai_auth"]
                .as_bool(),
            Some(true)
        );
        assert!(!config_contains_local_proxy(&repaired));
        cleanup_non_proxy_provider_state(&paths).unwrap();
        assert_eq!(fs::read_to_string(&paths.current_config).unwrap(), repaired);
        fs::remove_dir_all(paths.codex_home.parent().unwrap()).unwrap();
    }
