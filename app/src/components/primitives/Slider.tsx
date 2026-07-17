import type { ComponentPropsWithRef, CSSProperties } from "react";
import clsx from "clsx";

/** Range input whose track fills with the accent up to the current value.
 *  Controlled only: the fill derives from the value prop. */
export function Slider({ className, ...props }: ComponentPropsWithRef<"input">) {
	const min = Number(props.min ?? 0);
	const max = Number(props.max ?? 100);
	const value = Number(props.value ?? min);
	const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
	return (
		<input
			{...props}
			type="range"
			className={clsx("slider", className)}
			style={{ ...props.style, "--fill": `${pct}%` } as CSSProperties}
		/>
	);
}
