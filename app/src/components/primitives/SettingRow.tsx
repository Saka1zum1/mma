/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";
import { Switch } from "@/components/primitives/Switch";
import { useSetting, setSetting, type AppSettings } from "@/store/settings";

type SearchCtx = { query: string; searching: boolean; sectionMatched: boolean };

/** Drives per-row filtering inside the Settings dialog. `query` is lowercased;
 *  `sectionMatched` is true when the section title itself matches (then every
 *  row and auxiliary block in the section shows). */
export const SettingsSearchContext = createContext<SearchCtx>({
	query: "",
	searching: false,
	sectionMatched: true,
});

export function useSettingsSearch() {
	const ctx = useContext(SettingsSearchContext);
	return { ...ctx, auxVisible: !ctx.searching || ctx.sectionMatched };
}

type Base = { label: string; description?: string; disabled?: boolean; sub?: boolean };
type BoolRow = Base & { checked: boolean; onChange: (v: boolean) => void };
type AutoBoolRow = Base & { setting: keyof AppSettings };
type ControlRow = Base & { control: ReactNode };

function AutoWiredRow({ setting, ...rest }: AutoBoolRow) {
	const value = useSetting(setting);
	return (
		<SettingRow
			checked={value as boolean}
			onChange={(v) => setSetting(setting, v as never)}
			{...rest}
		/>
	);
}

export function SettingRow(props: BoolRow | ControlRow | AutoBoolRow) {
	const { query, searching, sectionMatched } = useContext(SettingsSearchContext);
	if ("setting" in props) return <AutoWiredRow {...(props as AutoBoolRow)} />;

	const { label, description, disabled, sub } = props;

	if (searching && !sectionMatched) {
		if (!`${label} ${description ?? ""}`.toLowerCase().includes(query)) return null;
	}

	const boolean = !("control" in props);
	return (
		<div
			className={`setting-row${sub ? " setting-row--sub" : ""}${boolean ? " setting-row--boolean" : ""}`}
			aria-disabled={disabled || undefined}
			onClick={"control" in props ? undefined : () => !disabled && props.onChange(!props.checked)}
		>
			<div className="setting-row__label">
				<span className="setting-row__title">{label}</span>
				{description && <span className="setting-row__desc">{description}</span>}
			</div>
			<div
				className="setting-row__control"
				onClick={"control" in props ? undefined : (e) => e.stopPropagation()}
			>
				{"control" in props ? (
					props.control
				) : (
					<Switch
						checked={props.checked}
						onChange={props.onChange}
						disabled={disabled}
						label={label}
					/>
				)}
			</div>
		</div>
	);
}
