import { waitForReady, createAndOpenMap, closeMap, deleteMap } from "./helpers";

const CONTROL = ".map-type-control";
const VISIBLE_ROW = `${CONTROL}__row:not(${CONTROL}__row--measure)`;
const PANEL = `${CONTROL} .settings-popup`;

/** The control collapses to a single menu button when the basemap row would overlap the
 * top-right controls, so the trigger depends on window width. */
async function triggerSelector(): Promise<string> {
	const toggle = `${VISIBLE_ROW} ${CONTROL}__toggle`;
	return (await browser.$(toggle).isExisting()) ? toggle : `${CONTROL} .map-control__menu-button`;
}

async function panelOpen(): Promise<boolean> {
	return browser.$(PANEL).isExisting();
}

async function waitForPanel(open: boolean, msg: string) {
	await browser.waitUntil(async () => (await panelOpen()) === open, {
		timeout: 3000,
		timeoutMsg: msg,
	});
}

async function setPanel(open: boolean) {
	if ((await panelOpen()) === open) return;
	await browser.$(await triggerSelector()).click();
	await waitForPanel(open, `panel never became ${open ? "open" : "closed"}`);
}

describe("Map type control", () => {
	let mapId: string;

	before(async () => {
		await waitForReady();
		mapId = await createAndOpenMap("E2E Map Type Control");
	});

	after(async () => {
		await setPanel(false);
		await closeMap();
		await deleteMap(mapId);
	});

	afterEach(async () => {
		await setPanel(false);
	});

	it("does not open on hover", async () => {
		const row = await browser.$(VISIBLE_ROW);
		const target = (await row.isExisting())
			? await browser.$(`${VISIBLE_ROW} ${CONTROL}__button[data-state="on"]`)
			: await browser.$(await triggerSelector());
		await target.moveTo();
		// eslint-disable-next-line no-restricted-syntax -- settle: asserting the panel never opens
		await browser.pause(500);
		expect(await panelOpen()).toBe(false);
	});

	it("opens and closes from the trigger", async () => {
		const trigger = await triggerSelector();
		await browser.$(trigger).click();
		await waitForPanel(true, "panel did not open");

		await browser.$(trigger).click();
		await waitForPanel(false, "panel did not close");
	});

	it("clicking the active basemap does not open the panel", async () => {
		const row = await browser.$(VISIBLE_ROW);
		if (!(await row.isExisting())) return; // compact mode: basemaps live inside the panel
		await browser.$(`${VISIBLE_ROW} ${CONTROL}__button[data-state="on"]`).click();
		// eslint-disable-next-line no-restricted-syntax -- settle: asserting the panel never opens
		await browser.pause(300);
		expect(await panelOpen()).toBe(false);
	});

	it("closes on Escape", async () => {
		await setPanel(true);
		await browser.keys("Escape");
		await waitForPanel(false, "Escape did not close the panel");
	});

	it("closes on an outside press", async () => {
		await setPanel(true);
		// Dismissal keys off mousedown; a synthetic one avoids picking a click target in
		// the sidebar that would fire its own handler.
		await browser.execute(() =>
			document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })),
		);
		await waitForPanel(false, "outside press did not close the panel");
	});
});
