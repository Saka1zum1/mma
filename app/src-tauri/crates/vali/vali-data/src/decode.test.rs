use super::Reader;

/// A length or skip count from the wire must not overflow the cursor into a panic.
#[test]
fn wire_lengths_near_usize_max_error_rather_than_panic() {
    let huge = {
        let mut v = vec![0x0au8]; // field 1, wire 2
        let mut n = u64::MAX;
        while n >= 0x80 {
            v.push((n as u8 & 0x7f) | 0x80);
            n >>= 7;
        }
        v.push(n as u8);
        v
    };

    let mut r = Reader::new(&huge);
    assert!(r.read_tag().is_ok());
    assert!(r.read_len_slice().is_err());

    let mut r = Reader::new(&huge);
    r.advance(1).unwrap();
    assert!(r.advance(usize::MAX).is_err());
}

#[test]
fn read_string_lossy_replaces_invalid_utf8() {
    let buf = [0x02u8, 0xff, 0x41];
    let mut r = Reader::new(&buf);
    assert_eq!(r.read_string_lossy().unwrap(), "\u{fffd}A");
    assert!(r.at_end());
}

#[test]
fn truncated_varint_errors() {
    let buf = [0x80u8];
    assert!(Reader::new(&buf).read_varint().is_err());
}
