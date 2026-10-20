use super::*;

#[test]
fn retina_video_preserves_backing_pixels_instead_of_logical_points() {
    let logical = Size {
        width: 1920.0,
        height: 1080.0,
    };
    assert_eq!(oriented_pixels(3840, 2160, logical).unwrap(), (3840, 2160));
    assert_eq!(oriented_pixels(1920, 1080, logical).unwrap(), (1920, 1080));
}

#[test]
fn rotated_retina_displays_match_quartz_input_orientation() {
    let portrait = Size {
        width: 1080.0,
        height: 1920.0,
    };
    assert_eq!(oriented_pixels(3840, 2160, portrait).unwrap(), (2160, 3840));
    assert_eq!(oriented_pixels(2160, 3840, portrait).unwrap(), (2160, 3840));
    let landscape = Size {
        width: 1920.0,
        height: 1080.0,
    };
    assert_eq!(
        oriented_pixels(2160, 3840, landscape).unwrap(),
        (3840, 2160)
    );
}

#[test]
fn unavailable_or_unrepresentable_display_pixels_are_rejected() {
    let logical = Size {
        width: 1920.0,
        height: 1080.0,
    };
    assert!(oriented_pixels(0, 2160, logical).is_err());
    assert!(oriented_pixels(3840, 0, logical).is_err());
    assert!(oriented_pixels(usize::MAX, 2160, logical).is_err());
}
