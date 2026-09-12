/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";
import { Switch } from "@/components/primitives/Switch";
import { useSetting, setSetting, type AppSettings } from "@/store/settings";
import { matches } from "@/lib/search";

type SearchCtx = {
	query: string;
	searching: boolean;
	sectionMatched: boolean;
	sectionTitle: string;
};

/** Drives per-row filtering inside the Settings dialog (matching via lib/search);
 *  `sectionMatched` is true when the section title itself matches (then every
 *  row and auxiliary block in the section shows). */
export const SettingsSearchContext = createContext<SearchCtx>({
	query: "",
	searching: false,
	sectionMatched: true,
	sectionTitle: "",
});

const SettingsGroupContext = createContext<{ title: string; matched: boolean }>({
	title: "",
	matched: false,
});

export function useSettingsSearch() {
	const ctx = useContext(SettingsSearchContext);
	return { ...ctx, auxVisible: !ctx.searching || ctx.sectionMatched };
}

/** A labelled cluster of rows. When the group title matches the search, every
 *  child row stays visible even if its own label does not. */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
	const { query, searching, sectionMatched } = useContext(SettingsSearchContext);
	const matched = searching && !sectionMatched && matches(query, title);
	return (
		<SettingsGroupContext.Provider value={{ title, matched }}>
			<div className="settings-group-block">
				<h3 className="settings-group">{title}</h3>
				{children}
			</div>
		</SettingsGroupContext.Provider>
	);
}

/** `label` stays a plain string so settings search can match on it; `badge` is the escape hatch
 *  for a marker sitting beside it, like the flask on an experimental plugin card. */
type Base = {
	label: string;
	badge?: ReactNode;
	description?: string;
	disabled?: boolean;
	sub?: boolean;
	keywords?: string[];
};
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
	const { query, searching, sectionMatched, sectionTitle } = useContext(SettingsSearchContext);
	const group = useContext(SettingsGroupContext);
	if ("setting" in props) return <AutoWiredRow {...(props as AutoBoolRow)} />;

	const { label, badge, description, disabled, sub, keywords } = props;

	if (searching && !sectionMatched && !group.matched) {
		const path = [sectionTitle, group.title, label, description, ...(keywords ?? [])];
		if (!matches(query, ...path)) return null;
	}

	const boolean = !("control" in props);
	return (
		<div
			className={`setting-row${sub ? " setting-row--sub" : ""}${boolean ? " setting-row--boolean" : ""}`}
			aria-disabled={disabled || undefined}
			onClick={"control" in props ? undefined : () => !disabled && props.onChange(!props.checked)}
		>
			<div className="setting-row__label">
				<span className="setting-row__title">
					{label}
					{badge}
				</span>
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
