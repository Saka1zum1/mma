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
