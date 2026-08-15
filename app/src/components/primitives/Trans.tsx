import { Fragment, type ReactNode } from "react";
import { splitMessage, type MessageParams, type MessageSource } from "@/lib/i18n";

/** A translated message whose params are React nodes, for sentences that contain inline markup.
 *  `<Trans msg="Rename {n} tags in {name}" n={count} name={<b>{tag.name}</b>} />`
 *  Params that are plain strings or numbers behave exactly as they do in `t()`. */
export function Trans({
	msg: src,
	...params
	// The index signature has to admit MessageSource too, or the plural-object form of `msg`
	// fails to satisfy it.
}: {
	msg: MessageSource;
	[param: string]: ReactNode | MessageSource;
}): ReactNode {
	const scalars: MessageParams = {};
	for (const [key, value] of Object.entries(params)) {
		if (typeof value === "string" || typeof value === "number") scalars[key] = value;
	}
	const parts = splitMessage(src, scalars).map((part) => {
		if (typeof part === "string") return part;
		return part.param in params ? (params[part.param] as ReactNode) : `{${part.param}}`;
	});
	return (
		<>
			{parts.map((part, i) => (
				<Fragment key={i}>{part}</Fragment>
			))}
		</>
	);
}
