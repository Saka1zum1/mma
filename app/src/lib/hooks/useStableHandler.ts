import { useCallback, useRef } from "react";

/** Identity-stable handler that always calls the latest render's implementation.
 *  Not useEffectEvent: its contract forbids passing the handler down to children
 *  (and in React 19.2 its closures freeze at mount values inside memo()/forwardRef()
 *  components). */
export function useStableHandler<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
	const ref = useRef(fn);
	ref.current = fn;
	return useCallback((...args: A) => ref.current(...args), []);
}
