import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { RgbColorPicker } from "react-colorful";
import { useDebouncedCallback } from "@/lib/hooks/useDebouncedCallback";
import type { RGB } from "@/lib/util/color";

/** A color swatch that opens the picker in a popover on click. */
export function ColorPicker({
	color,
	onChange,
	ariaLabel = "Pick color",
}: {
	color: RGB;
	onChange: (color: RGB) => void;
	ariaLabel?: string;
}) {
	const [open, setOpen] = useState(false);
	const debouncedOnChange = useDebouncedCallback(onChange, 60, { flush: true });
	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<Popover.Trigger asChild>
				<button
					type="button"
					className="color-picker__swatch"
					aria-label={ariaLabel}
					style={{ backgroundColor: `rgb(${color.r}, ${color.g}, ${color.b})` }}
				/>
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Content
					className="color-picker__popover"
					sideOffset={4}
					align="start"
					collisionPadding={8}
				>
					<RgbColorPicker color={color} onChange={debouncedOnChange} />
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	);
}
