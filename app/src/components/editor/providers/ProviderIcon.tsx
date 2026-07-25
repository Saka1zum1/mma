import { Icon } from "@/components/primitives/Icon";
import { BaiduIcon } from "@/components/editor/providers/BaiduIcon";
import { PROVIDER_CATALOG } from "@/lib/sv/providers/settings";
import type { AltSvProviderId } from "@/lib/sv/providers/types";
import { mdiQqchat } from "@mdi/js";

function YandexIcon({
	size = 16,
	className,
}: {
	size?: number;
	className?: string;
}) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 48 48"
			aria-label="Yandex"
			className={className}
		>
			<circle cx="24" cy="24" r="24" fill="#fc3f1d" />
			<g transform="translate(4, 4) scale(0.83)">
				<path
					fill="#FFFFFF"
					d="M32,24h-7l8-18h7L32,24z M27,36.689c0-4.168-0.953-8.357-2.758-12.117L15,6H8l10.833,21.169 C20.251,30.123,21,33.415,21,36.689V42h6V36.689z"
				/>
			</g>
		</svg>
	);
}

/** Provider brand icon (MDI path or custom SVG). */
export function ProviderIcon({
	id,
	size = 16,
	className,
}: {
	id: AltSvProviderId;
	size?: number;
	className?: string;
}) {
	if (id === "baidu") return <BaiduIcon size={size} className={className} />;
	if (id === "tencent") return <Icon path={mdiQqchat} size={size} className={className} />;
	if (id === "yandex") return <YandexIcon size={size} className={className} />;
	const path = PROVIDER_CATALOG.find((p) => p.id === id)?.icon;
	if (!path) return null;
	return <Icon path={path} size={size} className={className} />;
}
