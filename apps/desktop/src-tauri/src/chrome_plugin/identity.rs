//! Allow only our unpacked extension and the separately signed Chrome Web Store item.

const UNPACKED_ID: &str = include_str!("../../resources/chrome-extension/extension-id.txt");
const STORE_ID: &str = include_str!("../../resources/chrome-extension/store-extension-id.txt");

pub(super) fn allowed_origins() -> [String; 2] {
    [UNPACKED_ID, STORE_ID].map(|id| format!("chrome-extension://{}/", id.trim()))
}

pub(super) fn is_allowed_origin(origin: &str) -> bool {
    allowed_origins().iter().any(|allowed| allowed == origin)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_both_distribution_channels() {
        assert!(is_allowed_origin(
            "chrome-extension://hgdkdomojacbaehnmlahndjmhglbjjim/"
        ));
        assert!(is_allowed_origin(
            "chrome-extension://ocngjhjonejkndmlkjmbgjdlghkdhpjj/"
        ));
        assert_ne!(UNPACKED_ID.trim(), STORE_ID.trim());
    }

    #[test]
    fn rejects_other_origins_and_partial_matches() {
        for origin in [
            "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/",
            "https://ocngjhjonejkndmlkjmbgjdlghkdhpjj/",
            "chrome-extension://ocngjhjonejkndmlkjmbgjdlghkdhpjj",
            "chrome-extension://ocngjhjonejkndmlkjmbgjdlghkdhpjj/popup.html",
            "chrome-extension://ocngjhjonejkndmlkjmbgjdlghkdhpjj.evil/",
        ] {
            assert!(!is_allowed_origin(origin), "unexpected origin: {origin}");
        }
    }
}
