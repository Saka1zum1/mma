import { useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { Command } from "cmdk";
import * as RadixDialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Icon } from "@/components/primitives/Icon";
import { mdiUndo, mdiPin, mdiPinOutline } from "@mdi/js";
import { BulkOperationModal, type BulkOperation } from "@/components/dialogs/BulkOperationModal";
import { getCommands, togglePinnedCommand, type CommandGroup } from "@/store/commands";
import { useSetting } from "@/store/settings";
import { useHotkey } from "@/lib/hooks/useHotkey";
import { getBinding, useBinding } from "@/lib/util/hotkeys";

interface PaletteContext {
	close: () => void;
	setPage: (page: string | null) => void;
}
const Ctx = createContext<PaletteContext>({ close: () => {}, setPage: () => {} });

function PaletteItem({
	label,
	icon,
	onSelect,
	disabled = false,
	closeOnSelect = true,
	shortcut,
	commandId,
	pinned,
}: {
	label: string;
	icon?: React.ReactNode;
	onSelect: () => void;
	disabled?: boolean;
	closeOnSelect?: boolean;
	shortcut?: string;
	commandId?: string;
	pinned?: boolean;
}) {
	const ctx = useContext(Ctx);
	const handleSelect = useCallback(() => {
		try {
			onSelect();
		} finally {
			if (closeOnSelect) ctx.close();
		}
	}, [onSelect, closeOnSelect, ctx]);

	return (
		<Command.Item
			value={label}
			onSelect={handleSelect}
			disabled={disabled}
			className="command-palette__item"
			onContextMenu={commandId ? (e) => {
				e.preventDefault();
				togglePinnedCommand(commandId);
			} : undefined}
		>
			{icon && <span className="command-palette__icon">{icon}</span>}
			<span className="command-palette__label">{label}</span>
			{shortcut && <kbd className="command-palette__kbd">{shortcut}</kbd>}
			{commandId && (
				<button
					className="command-palette__pin"
					title={pinned ? "Unpin from toolbar" : "Pin to toolbar"}
					onPointerDown={(e) => {
						e.preventDefault();
						e.stopPropagation();
					}}
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						togglePinnedCommand(commandId);
					}}
				>
					<Icon path={pinned ? mdiPin : mdiPinOutline} size={18} />
				</button>
			)}
		</Command.Item>
	);
}

const UndoIcon = () => <Icon path={mdiUndo} size={18} />;

function formatBinding(binding: string): string {
	return binding
		.replace("Mod+", navigator.platform.includes("Mac") ? "⌘" : "Ctrl+")
		.replace("Shift+", "⇧")
		.replace("ArrowLeft", "←")
		.replace("ArrowRight", "→")
		.replace("ArrowUp", "↑")
		.replace("ArrowDown", "↓");
}

const COMMAND_GROUPS: CommandGroup[] = ["Map", "Bulk Operations", "Selections", "Tags"];

function MainCommands() {
	const ctx = useContext(Ctx);
	const commands = getCommands();
	const pinnedSet = new Set(useSetting("pinnedCommands"));

	return (
		<>
			{COMMAND_GROUPS.map((group) => {
				const groupCmds = commands.filter((c) => c.group === group);
				if (groupCmds.length === 0) return null;
				return (
					<Command.Group key={group} heading={group}>
						{groupCmds.map((cmd) => (
							<PaletteItem
								key={cmd.id}
								label={cmd.label}
								icon={cmd.icon ? <Icon path={cmd.icon} size={18} /> : undefined}
								onSelect={cmd.execute}
								disabled={cmd.enabled ? !cmd.enabled() : false}
								shortcut={cmd.defaultBinding ? formatBinding(getBinding(cmd.id)) : undefined}
								commandId={cmd.id}
								pinned={pinnedSet.has(cmd.id)}
							/>
						))}
						{group === "Map" && (
							<PaletteItem
								label="Open map..."
								onSelect={() => ctx.setPage("maps")}
								closeOnSelect={false}
							/>
						)}
					</Command.Group>
				);
			})}
		</>
	);
}

function PaletteContent({ onChangeOpen }: { onChangeOpen: (v: boolean) => void }) {
	const [inputValue, setInputValue] = useState("");
	const [page, setPage] = useState<string | null>(null);

	const ctx = useMemo(
		() => ({
			close: () => onChangeOpen(false),
			setPage: (p: string | null) => {
				setPage(p);
				setInputValue("");
			},
		}),
		[onChangeOpen],
	);

	return (
		<Ctx.Provider value={ctx}>
			<Command
				onKeyDown={(e) => {
					if (e.key === "Escape" && page !== null) {
						e.preventDefault();
						setPage(null);
						setInputValue("");
					}
				}}
				loop
			>
				<Command.Input
					value={inputValue}
					onValueChange={setInputValue}
					autoFocus
					placeholder="Type command"
					className="command-palette__input"
				/>
				<Command.List className="command-palette__scroll">
					{page === null && <MainCommands />}
					{page === "maps" && (
						<Command.Group heading="Maps">
							<PaletteItem
								label="Back"
								onSelect={() => {
									setPage(null);
									setInputValue("");
								}}
								icon={<UndoIcon />}
								closeOnSelect={false}
							/>
							<Command.Empty>No maps found.</Command.Empty>
						</Command.Group>
					)}
				</Command.List>
				<p className="command-palette__footer" style={{ margin: 0, padding: ".5rem 1.375rem" }} />
			</Command>
		</Ctx.Provider>
	);
}

export function CommandPalette() {
	const [open, setOpen] = useState(false);
	const [bulkOp, setBulkOp] = useState<BulkOperation | null>(null);
	useHotkey(useBinding("openCommandPalette"), () => setOpen((v) => !v));

	useEffect(() => {
		const handler = () => setOpen(true);
		document.addEventListener("open-command-palette", handler);
		return () => document.removeEventListener("open-command-palette", handler);
	}, []);

	useEffect(() => {
		const handler = (e: Event) => setBulkOp((e as CustomEvent).detail as BulkOperation);
		document.addEventListener("open-bulk-op", handler);
		return () => document.removeEventListener("open-bulk-op", handler);
	}, []);

	return (
		<>
			<RadixDialog.Root open={open} onOpenChange={setOpen}>
				<RadixDialog.Portal>
					<RadixDialog.Overlay className="modal__backdrop" />
					<RadixDialog.Content className="modal command-palette" aria-describedby={undefined}>
						<VisuallyHidden.Root>
							<RadixDialog.Title>Command Palette</RadixDialog.Title>
						</VisuallyHidden.Root>
						<PaletteContent onChangeOpen={setOpen} />
					</RadixDialog.Content>
				</RadixDialog.Portal>
			</RadixDialog.Root>
			{bulkOp && <BulkOperationModal operation={bulkOp} onClose={() => setBulkOp(null)} />}
		</>
	);
}
