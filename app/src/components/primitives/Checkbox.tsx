import type { ComponentPropsWithRef } from "react";
import clsx from "clsx";

export function Checkbox({ className, ...props }: ComponentPropsWithRef<"input">) {
	return <input {...props} type="checkbox" className={clsx("checkbox", className)} />;
}
