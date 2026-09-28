/* eslint-disable react-refresh/only-export-components */
import {
	createContext,
	useContext,
	useRef,
	type ComponentProps,
	type ComponentPropsWithRef,
	type ReactNode,
} from "react";
import { Dialog as BaseDialog } from "@base-ui-components/react/dialog";
import clsx from "clsx";
import { Button } from "@/components/primitives/Button";
import { ConfirmButton } from "@/components/primitives/ConfirmButton";
import { Icon } from "@/components/primitives/Icon";
import { t } from "@/lib/i18n";
import { mdiClose } from "@mdi/js";

const CloseContext = createContext<(() => void) | null>(null);

/** Controlled open/close pair every dialog component takes. */
export interface DialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function useCloseDialog() {
	const close = useContext(CloseContext);
	if (!close) throw new Error("useCloseDialog: not in a dialog context");
	return close;
}

const OUTSIDE_KEEP = ".suggest-portal, .color-picker__popover, .date-picker__popover";

export function Dialog({
	open,
	onOpenChange,
	children,
	...props
}: Omit<ComponentProps<typeof BaseDialog.Root>, "onOpenChange"> & {
	onOpenChange?: (open: boolean) => void;
}) {
	return (
		<CloseContext.Provider value={() => onOpenChange?.(false)}>
			<BaseDialog.Root
				open={open}
				onOpenChange={(next, details) => {
					// Portaled overlays live outside the popup in the DOM; interacting
					// with them must not dismiss the dialog.
					if (
						!next &&
						details.reason === "outside-press" &&
						(details.event.target as Element | null)?.closest?.(OUTSIDE_KEEP)
					) {
						details.cancel();
						return;
					}
					onOpenChange?.(next);
				}}
				{...props}
			>
				{children}
			</BaseDialog.Root>
		</CloseContext.Provider>
	);
}

export const DialogTrigger = BaseDialog.Trigger;

/** A dialog's fixed width: small, medium, large or extra large. */
export type DialogSize = "sm" | "md" | "lg" | "xl";

export function DialogContent({
	className,
	title,
	size,
	initialFocus,
	children,
	headerExtra,
	...props
}: ComponentProps<typeof BaseDialog.Popup> & {
	title: string;
	size?: DialogSize;
	headerExtra?: ReactNode;
}) {
	const popupRef = useRef<HTMLDivElement>(null);
	return (
		<BaseDialog.Portal>
			<BaseDialog.Backdrop className="modal__backdrop" />
			<BaseDialog.Popup
				{...props}
				ref={popupRef}
				className="modal"
				initialFocus={
					// Landing on the first tabbable would put a focus ring on the close X.
					// Park focus on the popup instead unless a child already claimed it (autoFocus).
					initialFocus ??
					(() => {
						const popup = popupRef.current;
						return popup && !popup.contains(document.activeElement) ? popup : false;
					})
				}
			>
				<div className={clsx("modal__dialog", size && `modal__dialog--${size}`, className)}>
					<header className={clsx("modal__header", className ? `${className}__header` : null)}>
						<BaseDialog.Title className="modal__title">{title}</BaseDialog.Title>
						<div className="modal__header-actions">
							{headerExtra}
							<BaseDialog.Close className="icon-button modal__close">
								<Icon path={mdiClose} />
							</BaseDialog.Close>
						</div>
					</header>
					<div className="modal__content">{children}</div>
				</div>
			</BaseDialog.Popup>
		</BaseDialog.Portal>
	);
}

/** One button in a dialog footer. */
export interface DialogAction {
	label: ReactNode;
	/** Runs on click. Without it the button submits the form it sits in. */
	onClick?: () => void;
	disabled?: boolean;
	/** An identifier for automated tests. */
	"data-qa"?: string;
}

function actionProps({ onClick, disabled, "data-qa": qa }: DialogAction) {
	return { type: onClick ? "button" : "submit", onClick, disabled, "data-qa": qa } as const;
}

/** A dialog's footer: side content on the left, then Cancel, then the main action on the right. */
export function DialogActions({
	start,
	destructive,
	cancel,
	primary,
}: {
	/** Content held to the left: a summary, a meter, paging or secondary buttons. */
	start?: ReactNode;
	/** An action that destroys something, held to the far left. With `confirm` it asks "Are you
	 *  sure?" on the first click and acts on the second. */
	destructive?: DialogAction & { confirm?: boolean };
	/** The dismiss button, labelled Cancel and closing the dialog unless told otherwise. */
	cancel?: true | Partial<DialogAction>;
	/** The action the dialog exists for, always rightmost. */
	primary?: DialogAction & { tone?: "primary" | "destructive" };
}) {
	const close = useContext(CloseContext);
	const dismiss = cancel === true ? {} : cancel;
	return (
		<div className="modal__actions">
			{(destructive || start) && (
				<div className="modal__actions-start">
					{destructive?.confirm ? (
						<ConfirmButton
							variant="destructive"
							disabled={destructive.disabled}
							data-qa={destructive["data-qa"]}
							onConfirm={() => destructive.onClick?.()}
						>
							{destructive.label}
						</ConfirmButton>
					) : (
						destructive && (
							<Button variant="destructive" {...actionProps(destructive)}>
								{destructive.label}
							</Button>
						)
					)}
					{start}
				</div>
			)}
			{dismiss && (
				<Button
					onClick={dismiss.onClick ?? close ?? undefined}
					disabled={dismiss.disabled}
					data-qa={dismiss["data-qa"]}
				>
					{dismiss.label ?? t("Cancel")}
				</Button>
			)}
			{primary && (
				<Button variant={primary.tone ?? "primary"} {...actionProps(primary)}>
					{primary.label}
				</Button>
			)}
		</div>
	);
}

/** A dialog body laid out as a column that runs `onSubmit` when submitted, Enter included. */
export function DialogForm({
	onSubmit,
	className,
	...props
}: Omit<ComponentPropsWithRef<"form">, "onSubmit"> & { onSubmit: () => void }) {
	return (
		<form
			{...props}
			className={clsx("modal__stack", className)}
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit();
			}}
		/>
	);
}
