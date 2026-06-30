import { useEffect, useRef } from "react";

/** A stable debounced wrapper around `fn`. The returned function keeps a constant
 *  identity; the latest `fn`/`ms` are always used, and the pending timer is cancelled
 *  on unmount (the missing-cleanup bug most hand-rolled versions have). */
export function useDebouncedCallback<A extends unknown[]>(
	fn: (...args: A) => void,
	ms: number,
): (...args: A) => void {
	const fnRef = useRef(fn);
	const msRef = useRef(ms);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	fnRef.current = fn;
	msRef.current = ms;

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);

	return useRef((...args: A) => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => fnRef.current(...args), msRef.current);
	}).current;
}
