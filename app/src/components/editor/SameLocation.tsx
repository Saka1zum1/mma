import { useMemo, useState, useCallback } from "react";
import { Tooltip } from "@/components/primitives/Tooltip";
import type { Location } from "@/bindings.gen";
import {
	useDuplicateLocations,
	useCurrentMap,
	openDuplicateLocation,
	closeDuplicates,
	removeDuplicate,
	removeLocations,
} from "@/store/useMapStore";
import { svThumbnailUrl } from "@/lib/sv/lookup";
import { textColorFor } from "@/lib/util/color";
import { Button } from "@/components/primitives/Button";
import { Checkbox } from "@/components/primitives/Checkbox";

function DuplicateItem({
	location,
	selected,
	onDelete,
	onSelect,
	onClick,
	tagMap,
}: {
	location: Location;
	selected: boolean;
	onDelete: () => void;
	onSelect: (checked: boolean) => void;
	onClick: () => void;
	tagMap: Record<number, { name: string; color: string }>;
}) {
	const thumbSrc = location.panoId ? svThumbnailUrl(location.panoId, location.heading) : null;

	return (
		<li className="duplicate-item">
			<label className="duplicate-item__select">
				<Checkbox checked={selected} onChange={(e) => onSelect(e.target.checked)} />
			</label>
			<button className="duplicate-item__thumbnail" onClick={onClick}>
				{thumbSrc ? (
					<img src={thumbSrc} style={{ minHeight: 96 }} />
				) : (
					<div style={{ minHeight: 96 }} />
				)}
			</button>
			<div className="duplicate-item__tags">
				{location.tags.length > 0 ? (
					<>
						<strong>Tags:</strong>{" "}
						{location.tags.map((tid) => {
							const tag = tagMap[tid];
							if (!tag) return null;
							return (
								<span
									key={tid}
									className="tag is-small"
									style={{
										backgroundColor: tag.color,
										color: textColorFor(tag.color),
									}}
								>
									<span className="tag__text">{tag.name}</span>
								</span>
							);
						})}
					</>
				) : (
					<em>No tags</em>
				)}
			</div>
			<div className="duplicate-item__meta">{Math.round(location.heading)}&deg;</div>
			<div className="duplicate-item__actions">
				<Button variant="destructive" onClick={onDelete}>
					Delete
				</Button>
			</div>
		</li>
	);
}

export default function SameLocation() {
	const locations = useDuplicateLocations();
	const map = useCurrentMap();
	const tagMap = map?.meta.tags ?? {};

	const [selected, setSelected] = useState<Set<number>>(() => new Set());

	const sorted = useMemo(
		() =>
			[...locations].sort((a, b) =>
				a.tags.length !== b.tags.length ? b.tags.length - a.tags.length : a.createdAt - b.createdAt,
			),
		[locations],
	);

	const toggleSelect = useCallback((loc: Location, checked: boolean) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (checked) next.add(loc.id);
			else next.delete(loc.id);
			return next;
		});
	}, []);

	const deleteSingle = useCallback(
		(loc: Location) => {
			removeLocations(new Set([loc.id]));
			removeDuplicate(loc.id);
			const remaining = locations.filter((l) => l.id !== loc.id);
			if (remaining.length <= 1) {
				if (remaining.length === 1) openDuplicateLocation(remaining[0]);
				else closeDuplicates();
			}
		},
		[locations],
	);

	const keepSelected = useCallback(() => {
		const toDelete = new Set(locations.filter((l) => !selected.has(l.id)).map((l) => l.id));
		removeLocations(toDelete);
		const remaining = locations.find((l) => selected.has(l.id));
		if (remaining) openDuplicateLocation(remaining);
		else closeDuplicates();
	}, [locations, selected]);

	const deleteSelected = useCallback(() => {
		removeLocations(new Set(selected));
		const remaining = locations.find((l) => !selected.has(l.id));
		if (remaining) openDuplicateLocation(remaining);
		else closeDuplicates();
	}, [locations, selected]);

	return (
		<section className="duplicates">
			<h2>
				<span className="mono">{locations.length}</span> locations
			</h2>
			<p>
				Multiple locations were selected around this coordinate. Click one of the thumbnails below
				to view that location.
			</p>
			<ul className="duplicates__location-list">
				{sorted.map((loc) => (
					<DuplicateItem
						key={loc.id}
						location={loc}
						selected={selected.has(loc.id)}
						onDelete={() => deleteSingle(loc)}
						onSelect={(checked) => toggleSelect(loc, checked)}
						onClick={() => openDuplicateLocation(loc)}
						tagMap={tagMap}
					/>
				))}
			</ul>
			<div className="duplicates__actions">
				<Tooltip content="Delete all duplicate locations, except the selected ones" side="bottom">
					<Button variant="destructive" disabled={selected.size === 0} onClick={keepSelected}>
						Keep selected
					</Button>
				</Tooltip>
				<Tooltip content="Delete selected locations" side="bottom">
					<Button variant="destructive" disabled={selected.size === 0} onClick={deleteSelected}>
						Delete selected
					</Button>
				</Tooltip>
				<Button onClick={closeDuplicates}>Cancel</Button>
			</div>
		</section>
	);
}
