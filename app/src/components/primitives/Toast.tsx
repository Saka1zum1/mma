import { useSyncExternalStore } from "react";
import { subscribeToasts, getToasts } from "@/lib/util/toast";

export function ToastContainer() {
	const entries = useSyncExternalStore(subscribeToasts, getToasts);
	if (entries.length === 0) return null;
	return (
		<div className="toast-container">
			{entries.map((t) => (
				<div key={t.id} className="toast-entry">
					{t.message}
				</div>
			))}
		</div>
	);
}
