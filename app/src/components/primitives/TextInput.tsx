import type { ComponentPropsWithRef } from "react";
import clsx from "clsx";

export function TextInput({ className, ...props }: ComponentPropsWithRef<"input">) {
	return <input {...props} className={clsx("text-input", className)} />;
}
