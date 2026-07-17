import {
	useState,
	useEffect,
	useLayoutEffect,
	useRef,
	type ReactNode,
	type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

/** Autocomplete input: owns open/close state, outside-click dismissal,
 *  Enter-picks-first, and Escape-closes. Suggestion sourcing stays at the call
 *  site (sync filter or debounced fetch) — the dropdown shows whenever
 *  `suggestions` is non-empty and not dismissed. Default classes render the
 *  standard `.search-results` dropdown; override them for other skins. */
export function SuggestInput<T>({
	value,
	onChange,
	suggestions,
	onPick,
	renderItem,
	getKey,
	placeholder,
	containerClassName,
	inputClassName = "text-input",
	listClassName = "search-results",
	itemClassName = "search-result",
	listStyle,
	autoFocus,
	disabled,
	pickOnEnter = true,
	portal = false,
}: {
	value: string;
	onChange: (v: string) => void;
	suggestions: T[];
	onPick: (item: T) => void;
	renderItem: (item: T) => ReactNode;
	getKey: (item: T) => string | number;
	placeholder?: string;
	containerClassName?: string;
	inputClassName?: string;
	listClassName?: string;
	itemClassName?: string;
	listStyle?: CSSProperties;
	autoFocus?: boolean;
	disabled?: boolean;
	/** When false, Enter closes the dropdown and falls through (e.g. to a form submit). */
	pickOnEnter?: boolean;
	/** Render the dropdown in a body portal (fixed, anchored to the input) so it floats
	 *  over clipping ancestors like `.modal__content`. Clicks on it are exempted from
	 *  dialog outside-dismissal via the `suggest-portal` class (see DialogContent). */
	portal?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [highlight, setHighlight] = useState(0);
	const [anchor, setAnchor] = useState<DOMRect | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLOListElement>(null);

	useLayoutEffect(() => {
		if (!portal || !open) return;
		const update = () => setAnchor(containerRef.current?.getBoundingClientRect() ?? null);
		update();
		window.addEventListener("resize", update);
		window.addEventListener("scroll", update, true);
		return () => {
			window.removeEventListener("resize", update);
			window.removeEventListener("scroll", update, true);
		};
	}, [portal, open]);

	useEffect(() => {
		setHighlight(0);
	}, [suggestions]);

	useEffect(() => {
		if (!open) return;
		listRef.current?.children[highlight]?.scrollIntoView({ block: "nearest" });
	}, [highlight, open]);

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			const t = e.target as Node;
			if (
				containerRef.current &&
				!containerRef.current.contains(t) &&
				!listRef.current?.contains(t)
			) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	const pick = (item: T) => {
		onPick(item);
		setOpen(false);
	};

	const list = (
		<ol
			ref={listRef}
			className={portal ? `${listClassName} suggest-portal` : listClassName}
			hidden={!open || suggestions.length === 0}
			style={
				portal
					? {
							position: "fixed",
							top: anchor?.bottom ?? 0,
							left: anchor?.left ?? 0,
							width: anchor?.width,
							zIndex: 100,
							pointerEvents: "auto",
							...listStyle,
						}
					: listStyle
			}
		>
			{suggestions.map((item, i) => (
				<li key={getKey(item)} aria-selected={i === highlight}>
					<button
						type="button"
						className={itemClassName}
						onMouseMove={() => setHighlight(i)}
						onClick={() => pick(item)}
					>
						{renderItem(item)}
					</button>
				</li>
			))}
		</ol>
	);

	return (
		<div
			ref={containerRef}
			className={containerClassName}
			style={{ position: "relative" }}
			aria-expanded={open && suggestions.length > 0}
		>
			<input
				className={inputClassName}
				type="text"
				placeholder={placeholder}
				value={value}
				autoFocus={autoFocus}
				disabled={disabled}
				onChange={(e) => {
					onChange(e.target.value);
					setOpen(true);
				}}
				onFocus={() => suggestions.length > 0 && setOpen(true)}
				onKeyDown={(e) => {
					if (e.key === "ArrowDown" && open && suggestions.length > 0) {
						e.preventDefault();
						setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
					}
					if (e.key === "ArrowUp" && open && suggestions.length > 0) {
						e.preventDefault();
						setHighlight((h) => Math.max(h - 1, 0));
					}
					if (e.key === "Enter" && open) {
						if (pickOnEnter && suggestions.length > 0) {
							e.preventDefault();
							pick(suggestions[Math.min(highlight, suggestions.length - 1)]);
						} else {
							setOpen(false);
						}
					}
					if (e.key === "Escape" && open) {
						e.stopPropagation();
						setOpen(false);
					}
				}}
			/>
			{portal ? createPortal(list, document.body) : list}
		</div>
	);
}
