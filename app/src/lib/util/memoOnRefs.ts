/** Single-slot memo keyed by reference identity of each input. Re-derives only
 *  when an input reference changes, so repeated calls return the same object. */
export function memoOnRefs<const I extends readonly unknown[], O>(
	getInputs: () => I,
	derive: (...inputs: I) => O,
): () => O {
	let slot: { inputs: I; output: O } | null = null;
	return () => {
		const inputs = getInputs();
		if (!slot || slot.inputs.some((v, i) => v !== inputs[i])) {
			slot = { inputs, output: derive(...inputs) };
		}
		return slot.output;
	};
}
