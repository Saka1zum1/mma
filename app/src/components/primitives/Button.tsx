import type { ComponentPropsWithRef } from "react";
import clsx from "clsx";

type ButtonVariant = "primary" | "destructive" | "ghost";

export function Button({
	variant,
	small,
	type,
	className,
	...props
}: ComponentPropsWithRef<"button"> & { variant?: ButtonVariant; small?: boolean }) {
	return (
		<button
			{...props}
			type={type ?? "button"}
			className={clsx(
				"button",
				variant && `button--${variant}`,
				small && "button--small",
				className,
			)}
		/>
	);
}
