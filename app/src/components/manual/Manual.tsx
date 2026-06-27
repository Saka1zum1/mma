import {
	useEffect,
	useRef,
	createContext,
	useContext,
	type ReactNode,
	type ReactElement,
	type ComponentPropsWithoutRef,
} from "react";
import { Icon } from "@/components/primitives/Icon";
import { mdiClose, mdiChevronLeft, mdiChevronRight } from "@mdi/js";
import { MANUAL_IMG_DIMS } from "@/components/manual/manual-img-dims.gen";
import { CHAPTERS, chapterTitle, chapterIdFromPath } from "@/components/manual/search";
import "@/components/manual/manual.css";

// --- Content primitives, provided to every MDX chapter via the `components` prop ---

function Kbd({ children }: { children: ReactNode }) {
	return <kbd className="manual-kbd">{children}</kbd>;
}

function Note({ children }: { children: ReactNode }) {
	return <div className="manual-note">{children}</div>;
}

// Images are fetched from GitHub at runtime so the manual ships without bundling
// screenshots. If the file is missing or the user is offline, the <img> hides
// itself and only the caption remains, keeping the layout clean.
const MANUAL_IMG_BASE = "https://raw.githubusercontent.com/ccmdi/mma/master/img/manual/";

function Img({ name, caption }: { name: string; caption: string }) {
	const dim = MANUAL_IMG_DIMS[name];
	return (
		<figure className="manual-figure">
			<img
				key={name}
				className="manual-figure__img"
				src={MANUAL_IMG_BASE + name}
				alt={caption}
				loading="lazy"
				width={dim?.w}
				height={dim?.h}
				style={dim ? { aspectRatio: `${dim.w} / ${dim.h}` } : undefined}
				onError={(e) => {
					(e.currentTarget as HTMLImageElement).style.display = "none";
				}}
			/>
			<figcaption className="manual-figure__caption">{caption}</figcaption>
		</figure>
	);
}

// Navigation injected by the Manual component so cross-references can jump chapters.
const ManualNav = createContext<(id: string) => void>(() => {});

// A clickable cross-reference to another chapter. Renders that chapter's current
// title (single source of truth, so references never drift from renamed chapters).
function ChapterLink({ id }: { id: string }) {
	const go = useContext(ManualNav);
	return (
		<button type="button" className="manual-xref" onClick={() => go(id)}>
			{chapterTitle(id)}
		</button>
	);
}

// Markdown links render as <a>; route external ones to the browser.
function MdxLink({ href, children, ...rest }: ComponentPropsWithoutRef<"a">) {
	const external = !!href && /^https?:/i.test(href);
	const target = external ? { target: "_blank", rel: "noopener noreferrer" } : {};
	return (
		<a href={href} {...target} {...rest}>
			{children}
		</a>
	);
}

const MANUAL_COMPONENTS = { Kbd, Note, Img, ChapterLink, a: MdxLink };

// Compiled chapter bodies, keyed by chapter id (the chapter list + metadata come
// from ./search, which derives both from the same .mdx files).
type ChapterComponent = (props: { components?: Record<string, unknown> }) => ReactElement;
const chapterModules = import.meta.glob<{ default: ChapterComponent }>("./chapters/*.mdx", {
	eager: true,
});
const BODY_BY_ID: Record<string, ChapterComponent> = {};
for (const [p, m] of Object.entries(chapterModules)) BODY_BY_ID[chapterIdFromPath(p)] = m.default;

export function Manual({
	chapterId,
	onNavigate,
	onClose,
}: {
	chapterId: string;
	onNavigate: (id: string) => void;
	onClose: () => void;
}) {
	const found = CHAPTERS.findIndex((c) => c.id === chapterId);
	const index = found >= 0 ? found : 0;
	const contentRef = useRef<HTMLDivElement>(null);
	const chapter = CHAPTERS[index];
	const Body = BODY_BY_ID[chapter.id];

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	useEffect(() => {
		contentRef.current?.scrollTo(0, 0);
	}, [chapterId]);

	const go = (i: number) => {
		if (i >= 0 && i < CHAPTERS.length) onNavigate(CHAPTERS[i].id);
	};

	return (
		<ManualNav.Provider value={onNavigate}>
			<div className="manual">
				<aside className="manual__sidebar">
					<div className="manual__sidebar-head">
						<span className="manual__title">Manual</span>
						<button className="icon-button" onClick={onClose} aria-label="Close manual">
							<Icon path={mdiClose} />
						</button>
					</div>
					<nav className="manual__toc">
						<ol>
							{CHAPTERS.map((c, i) => (
								<li key={c.id}>
									<button
										className={i === index ? "manual__toc-link is-active" : "manual__toc-link"}
										onClick={() => go(i)}
									>
										{c.title}
									</button>
								</li>
							))}
						</ol>
					</nav>
				</aside>
				<main className="manual__main" ref={contentRef}>
					<article className="manual__content">
						<h1>{chapter.title}</h1>
						<Body components={MANUAL_COMPONENTS} />
					</article>
					<nav className="manual__nav">
						{index > 0 && (
							<button className="manual__nav-btn" onClick={() => go(index - 1)}>
								<Icon path={mdiChevronLeft} size={18} />
								{CHAPTERS[index - 1].title}
							</button>
						)}
						{index < CHAPTERS.length - 1 && (
							<button
								className="manual__nav-btn manual__nav-btn--next"
								onClick={() => go(index + 1)}
							>
								{CHAPTERS[index + 1].title}
								<Icon path={mdiChevronRight} size={18} />
							</button>
						)}
					</nav>
				</main>
			</div>
		</ManualNav.Provider>
	);
}
