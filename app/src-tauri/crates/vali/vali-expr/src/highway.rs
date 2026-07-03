// Vendored from vali-rs @ e70fadd. Do not edit; regenerate instead.

const NAMES: [(&str, i32); 17] = [
    ("Unknown", 0),
    ("Motorway", 1),
    ("Trunk", 2),
    ("Primary", 4),
    ("Secondary", 8),
    ("Tertiary", 16),
    ("Motorway_link", 32),
    ("Trunk_link", 64),
    ("Primary_link", 128),
    ("Secondary_link", 256),
    ("Tertiary_link", 512),
    ("Unclassified", 1024),
    ("Residential", 2048),
    ("Living_street", 4096),
    ("Service", 8192),
    ("Track", 16384),
    ("Road", 32768),
];
fn try_parse_road_type(s: Option<&str>) -> Option<i32> {
    let s = s?.trim();
    if s.is_empty() {
        return None;
    }
    let first = s.chars().next().unwrap();
    if first.is_ascii_digit() || first == '-' || first == '+' {
        match parse_int_like_dotnet(s) {
            IntParse::Ok(v) => return Some(v),
            IntParse::Overflow => return None,
            IntParse::Format => {}
        }
    }
    let mut total = 0i32;
    for part in s.split(',') {
        let name = part.trim();
        let value = NAMES.iter().find(|(n, _)| n.eq_ignore_ascii_case(name))?.1;
        total |= value;
    }
    Some(total)
}
enum IntParse {
    Ok(i32),
    Overflow,
    Format,
}
fn parse_int_like_dotnet(s: &str) -> IntParse {
    match s.parse::<i32>() {
        Ok(v) => IntParse::Ok(v),
        Err(_) => {
            let body = s.strip_prefix(['-', '+']).unwrap_or(s);
            if !body.is_empty() && body.chars().all(|c| c.is_ascii_digit()) {
                IntParse::Overflow
            } else {
                IntParse::Format
            }
        }
    }
}
pub fn highway_eq_str(road_type: u32, s: Option<&str>) -> bool {
    let flag = try_parse_road_type(s).unwrap_or(0);
    (road_type as i32) & flag == flag
}
