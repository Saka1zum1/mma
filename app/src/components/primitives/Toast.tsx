import { getToasts } from "@/lib/util/toast";
import { useEventValue } from "@/lib/events";

export function ToastContainer() {
	const entries = useEventValue("toasts:changed", getToasts);
	if (entries.length === 0) return null;
	return (
		<div className="toast-container">
			{entries.map((t) => (
				<div key={t.id} className={`toast-entry${t.progress ? " toast-entry--progress" : ""}`}>
					<span>{t.message}</span>
					{t.progress && (
						<>
							<div className="toast-progress__track">
								<div
									className="toast-progress__bar"
									style={{ width: `${Math.round(t.progress.fraction * 100)}%` }}
								/>
							</div>
							{t.progress.label && (
								<span className="toast-progress__label">{t.progress.label}</span>
							)}
						</>
					)}
				</div>
			))}
		</div>
	);
}
