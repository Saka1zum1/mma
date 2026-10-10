/**
 * Flags exported functions whose body is solely `return addSelections([...])` or
 * `addSelections([...])`. These are trivial aliases - callers should use addSelections
 * directly with the selection props inline.
 *
 * @type {import('eslint').Rule.RuleModule}
 */
function isAddSelectionsCall(node) {
	if (!node) return false;
	if (node.type === "CallExpression") {
		return node.callee.type === "Identifier" && node.callee.name === "addSelections";
	}
	if (node.type === "AwaitExpression") return isAddSelectionsCall(node.argument);
	return false;
}

export default {
	meta: {
		type: "suggestion",
		messages: {
			selectionAlias:
				"This function is a trivial alias over addSelections(). Callers should use addSelections([{ type: ... }]) directly.",
		},
	},
	create(context) {
		return {
			ExportNamedDeclaration(node) {
				const decl = node.declaration;
				if (!decl) return;

				let body;
				if (decl.type === "FunctionDeclaration") {
					body = decl.body?.body;
				} else if (decl.type === "VariableDeclaration") {
					const init = decl.declarations[0]?.init;
					if (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression") {
						body = init.body?.type === "BlockStatement" ? init.body.body : null;
						if (!body && isAddSelectionsCall(init.body)) {
							context.report({ node: decl, messageId: "selectionAlias" });
							return;
						}
					}
				}
				if (!body || body.length !== 1) return;
				const stmt = body[0];
				if (stmt.type === "ReturnStatement" && isAddSelectionsCall(stmt.argument)) {
					context.report({ node: decl, messageId: "selectionAlias" });
				}
				if (stmt.type === "ExpressionStatement" && isAddSelectionsCall(stmt.expression)) {
					context.report({ node: decl, messageId: "selectionAlias" });
				}
			},
		};
	},
};
