import type { ComponentPropsWithRef } from "react";
import clsx from "clsx";

export function Radio({ className, ...props }: ComponentPropsWithRef<"input">) {
	return <input {...props} type="radio" className={clsx("radio", className)} />;
}
