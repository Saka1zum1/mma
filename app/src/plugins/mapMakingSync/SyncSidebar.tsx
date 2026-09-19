import { useCallback, useEffect, useState } from "react";
import { Field } from "@/components/primitives/Sidebar";
import { mapMakingApp } from "@/components/primitives/Icon";
import { ConnectionUser, SyncSidebar as SharedSyncSidebar } from "@/lib/sync/ui/SyncSidebar";
import type { User } from "./remote-types";
import * as auth from "./controller";
import { controller } from "./controller";
import { errText } from "@/lib/util/util";
import { t } from "@/lib/i18n";

/** The shared sync sidebar, with map-making.app's API-key auth plugged into it. */
export function SyncSidebar({ onClose }: { onClose: () => void }) {
	const [keyDraft, setKeyDraft] = useState("");
	const [user, setUser] = useState<User | null>(auth.getCachedUser());
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [checking, setChecking] = useState(() => !auth.getCachedUser());

	const validate = useCallback(async (key?: string) => {
		setBusy(true);
		setError(null);
		try {
			// Validate before persisting: a typo'd key must not replace a working one.
			const next = await auth.validate(key);
			if (key !== undefined) await auth.setApiKey(key);
			setUser(next);
		} catch (e) {
			setError(errText(e));
			setUser(null);
		} finally {
			setBusy(false);
			setChecking(false);
		}
	}, []);

	// Validate once when a key exists but nothing is cached yet; cached opens are instant.
	useEffect(() => {
		if (auth.getCachedUser()) {
			setChecking(false);
			return;
		}
		void (async () => {
			if (await auth.hasApiKey()) await validate();
			else setChecking(false);
		})();
	}, [validate]);

	const authUi = user ? (
		// map-making.app's API-key surface exposes no avatar (auth is Discord-side), so the
		// initial-letter fallback is permanent here.
		<ConnectionUser
			name={user.username}
			action={
				<button
					className="button"
					onClick={() => {
						auth.forgetAuth();
						setUser(null);
						setKeyDraft("");
						setError(null);
					}}
				>
					{t("Change key")}
				</button>
			}
		/>
	) : (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				void validate(keyDraft);
			}}
		>
			{/* Hidden username satisfies the password-form a11y heuristic. */}
			<input
				type="text"
				autoComplete="username"
				defaultValue="map-making.app"
				tabIndex={-1}
				aria-hidden
				style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
			/>
			<Field label={t("API key")} hint={t("Get one at map-making.app/keys")}>
				<input
					className="input"
					type="password"
					autoComplete="current-password"
					value={keyDraft}
					onChange={(e) => setKeyDraft(e.target.value)}
					placeholder={t("paste API key")}
				/>
			</Field>
			<button className="button button--primary" type="submit" disabled={busy || !keyDraft}>
				{busy ? t("Validating...") : t("Validate")}
			</button>
			{error && (
				<p className="mma-input__help" style={{ color: "var(--red-9, #e5484d)" }}>
					{error}
				</p>
			)}
		</form>
	);

	return (
		<SharedSyncSidebar
			onClose={onClose}
			controller={controller}
			auth={authUi}
			identity={checking ? undefined : user ? { id: String(user.id) } : null}
			listMaps={auth.listMaps}
			brand={{ path: mapMakingApp, color: "#CC2F2D" }}
		/>
	);
}
