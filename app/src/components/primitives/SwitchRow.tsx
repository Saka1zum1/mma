import type { ReactNode } from "react";
import { Switch } from "@/components/primitives/Switch";

/** A compact, control-left row whose whole surface toggles an immediate-effect
 *  boolean. The Switch owns keyboard + a11y; the row forwards mouse clicks to
 *  the same toggle. The control wrapper stops propagation so a direct switch
 *  click does not also fire the row handler. Used by MapSettingsPanel and any
 *  surface outside the Settings dialog (SettingRow is the Settings dialog row). */
export function SwitchRow({
	checked,
	onChange,
	label,
	disabled,
	className = "settings-popup__item",
	children,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
	label: string;
	disabled?: boolean;
	className?: string;
	children?: ReactNode;
}) {
	return (
		<div
			className={`${className} switch-row`}
			aria-disabled={disabled || undefined}
			onClick={() => !disabled && onChange(!checked)}
		>
			<span className="switch-row__control" onClick={(e) => e.stopPropagation()}>
				<Switch checked={checked} onChange={onChange} disabled={disabled} label={label} />
			</span>
			{children ?? label}
		</div>
	);
}
