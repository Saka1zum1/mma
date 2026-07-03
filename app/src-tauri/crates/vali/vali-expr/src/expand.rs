// Vendored from vali-rs @ e70fadd. Do not edit; regenerate instead.

pub fn expand(named_expressions: &[(String, String)], expression: &str) -> String {
    let mut new_expression = expression.to_string();
    let mut iterations = 0u32;
    loop {
        let mut new_expr = new_expression.clone();
        for (key, value) in named_expressions {
            new_expr = new_expr.replace(key.as_str(), &format!("({value})"));
        }
        let something_changed = new_expr != new_expression;
        new_expression = new_expr;
        if !something_changed {
            break;
        }
        let old = iterations;
        iterations += 1;
        if old >= 10_000 {
            break;
        }
    }
    new_expression
}
