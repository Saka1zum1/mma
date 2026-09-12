import { useState } from "react";
import { Popover } from "@base-ui-components/react/popover";
import { RgbColorPicker } from "react-colorful";
import { useDebouncedCallback } from "@/lib/hooks/useDebouncedCallback";
import { asRgb, type RGB } from "@/lib/util/color";
import { t } from "@/lib/i18n";

/** A color swatch that opens the picker in a popover on click. */
export function ColorPicker({
	color,
	onChange,
	ariaLabel = t("Pick color"),
}: {
	color: RGB;
	onChange: (color: RGB) => void;
	ariaLabel?: string;
}) {
	const [open, setOpen] = useState(false);
	const rgb = asRgb(color) ?? { r: 0, g: 0, b: 0 };
	const debouncedOnChange = useDebouncedCallback(onChange, 60, { flush: true });
	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<Popover.Trigger
				className="color-picker__swatch"
				aria-label={ariaLabel}
				style={{ backgroundColor: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` }}
			/>
			<Popover.Portal>
				<Popover.Positioner sideOffset={4} align="start" collisionPadding={8}>
					<Popover.Popup className="color-picker__popover">
						<RgbColorPicker color={rgb} onChange={debouncedOnChange} />
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}
