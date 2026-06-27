declare module "*.mdx" {
	import type { ReactElement } from "react";
	export const title: string;
	const MDXContent: (props: { components?: Record<string, unknown> }) => ReactElement;
	export default MDXContent;
}
