export type CommandGroup = "Map" | "Selections" | "Bulk Operations" | "Tags";

export interface Command {
	id: string;
	label: string;
	icon?: string;
	group: CommandGroup;
	defaultBinding?: string;
	execute: () => void;
	enabled?: () => boolean;
}

const commands: Command[] = [];

export function registerCommand(cmd: Command): void {
	commands.push(cmd);
}

export function getCommands(): readonly Command[] {
	return commands;
}

export function getCommand(id: string): Command | undefined {
	return commands.find((c) => c.id === id);
}

import { getSettings, setSetting } from "./settings";

export function togglePinnedCommand(id: string): void {
	const pinned = [...getSettings().pinnedCommands];
	const idx = pinned.indexOf(id);
	if (idx >= 0) {
		pinned.splice(idx, 1);
	} else {
		pinned.push(id);
	}
	setSetting("pinnedCommands", pinned);
}
