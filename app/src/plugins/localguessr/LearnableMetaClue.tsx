import { useEffect, useRef, useState, type PointerEvent } from "react";
import { t, useT } from "@/lib/i18n";
import { loadLearnableMetaClue, type LearnableMetaClue } from "./learnableMeta";

export function LearnableMetaCluePanel({
	mapId,
	panoId,
}: {
	mapId: string;
	panoId: string | null;
}) {
	useT();
	const [clue, setClue] = useState<LearnableMetaClue | null | "loading" | "error" | "empty">(
		"loading",
	);
	const [imageIndex, setImageIndex] = useState(0);
	const [pos, setPos] = useState({ x: 16, y: 16 });
	const drag = useRef<{ dx: number; dy: number } | null>(null);

	useEffect(() => {
		if (!panoId) {
			setClue("empty");
			return;
		}
		let cancelled = false;
		setClue("loading");
		setImageIndex(0);
		loadLearnableMetaClue(mapId, panoId)
			.then((next) => {
				if (!cancelled) setClue(next ?? "empty");
			})
			.catch(() => {
				if (!cancelled) setClue("error");
			});
		return () => {
			cancelled = true;
		};
	}, [mapId, panoId]);

	const images = clue && typeof clue === "object" ? clue.images : [];
	const image = images[imageIndex];

	const onPointerDown = (e: PointerEvent<HTMLElement>) => {
		if ((e.target as HTMLElement).closest("a, button")) return;
		const panel = e.currentTarget.parentElement;
		if (!panel) return;
		const rect = panel.getBoundingClientRect();
		drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
		e.currentTarget.setPointerCapture(e.pointerId);
	};

	const onPointerMove = (e: PointerEvent<HTMLElement>) => {
		if (!drag.current) return;
		const panel = e.currentTarget.parentElement;
		const parent = panel?.offsetParent as HTMLElement | null;
		const bounds = parent?.getBoundingClientRect();
		let x = e.clientX - (bounds?.left ?? 0) - drag.current.dx;
		let y = e.clientY - (bounds?.top ?? 0) - drag.current.dy;
		if (bounds && panel) {
			x = Math.max(0, Math.min(x, bounds.width - panel.offsetWidth));
			y = Math.max(0, Math.min(y, bounds.height - panel.offsetHeight));
		}
		setPos({ x, y });
	};

	return (
		<aside className="gg-lm-clue" data-qa="learnable-meta-clue" style={{ left: pos.x, top: pos.y }}>
			<header
				className="gg-lm-clue__title"
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={() => {
					drag.current = null;
				}}
			>
				{t("Learnable Meta")}
				<a href="https://learnablemeta.com/" target="_blank" rel="noreferrer">
					{t("Open")}
				</a>
			</header>
			{clue === "loading" && <p className="gg-lm-clue__status">{t("Loading clue…")}</p>}
			{clue === "empty" && (
				<p className="gg-lm-clue__status">{t("No clue for this panorama.")}</p>
			)}
			{clue === "error" && (
				<p className="gg-lm-clue__status">{t("Could not load the Learnable Meta clue.")}</p>
			)}
			{clue && typeof clue === "object" && (
				<div className="gg-lm-clue__body">
					{(clue.country || clue.metaName) && (
						<p className="gg-lm-clue__heading">
							{clue.country && <strong>{clue.country}</strong>}
							{clue.country && clue.metaName ? " — " : ""}
							{clue.metaName}
						</p>
					)}
					{clue.note && <p className="gg-lm-clue__note">{clue.note}</p>}
					{clue.footer && <p className="gg-lm-clue__footer">{clue.footer}</p>}
					{image && (
						<div className="gg-lm-clue__images">
							<img src={image} alt="" />
							{images.length > 1 && (
								<div className="gg-lm-clue__nav">
									<button
										type="button"
										onClick={() =>
											setImageIndex((i) => (i + images.length - 1) % images.length)
										}
									>
										‹
									</button>
									<span>
										{imageIndex + 1} / {images.length}
									</span>
									<button
										type="button"
										onClick={() => setImageIndex((i) => (i + 1) % images.length)}
									>
										›
									</button>
								</div>
							)}
						</div>
					)}
				</div>
			)}
		</aside>
	);
}
