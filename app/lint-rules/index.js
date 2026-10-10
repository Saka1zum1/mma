import noDuplicateCommandIcons from "./no-duplicate-command-icons.js";
import noEffectEventInMemo from "./no-effect-event-in-memo.js";
import noIpcInLoop from "./no-ipc-in-loop.js";
import noNativeDialog from "./no-native-dialog.js";
import noPrimitiveClass from "./no-primitive-class.js";
import noRedundantMutateGuard from "./no-redundant-mutate-guard.js";
import noSelectionAlias from "./no-selection-alias.js";
import noUndefinedCssClass from "./no-undefined-css-class.js";
import restrictedSyntax from "./restricted-syntax.js";

export default {
	meta: { name: "local" },
	rules: {
		"no-duplicate-command-icons": noDuplicateCommandIcons,
		"no-effect-event-in-memo": noEffectEventInMemo,
		"no-ipc-in-loop": noIpcInLoop,
		"no-native-dialog": noNativeDialog,
		"no-primitive-class": noPrimitiveClass,
		"no-redundant-mutate-guard": noRedundantMutateGuard,
		"no-selection-alias": noSelectionAlias,
		"no-undefined-css-class": noUndefinedCssClass,
		"restricted-syntax": restrictedSyntax,
	},
};
