/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, type ReactNode } from "react";
import { useActiveLocation } from "@/store/useMapStore";
import { hasLoadAsPanoId } from "@/types";
import type { PanoTime } from "@/lib/sv/lookup.add";

export interface CurrentPano {
	panoId: string;
	lat: number;
	lng: number;
	imageDate: Date | null;
}

interface PanoViewerContextValue {
	currentPano: CurrentPano | null;
	setCurrentPano: React.Dispatch<React.SetStateAction<CurrentPano | null>>;
	panoDates: PanoTime[];
	setPanoDates: React.Dispatch<React.SetStateAction<PanoTime[]>>;
	isFullscreen: boolean;
	setIsFullscreen: React.Dispatch<React.SetStateAction<boolean>>;
	panoReady: boolean;
	setPanoReady: React.Dispatch<React.SetStateAction<boolean>>;
	altitude: number;
	setAltitude: React.Dispatch<React.SetStateAction<number>>;
	selectedPanoId: string | null;
}

const PanoViewerContext = createContext<PanoViewerContextValue | null>(null);

export function PanoViewerProvider({ children }: { children: ReactNode }) {
	const location = useActiveLocation();
	const [currentPano, setCurrentPano] = useState<CurrentPano | null>(null);
	const [panoDates, setPanoDates] = useState<PanoTime[]>([]);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [panoReady, setPanoReady] = useState(false);
	const [altitude, setAltitude] = useState(0);

	const selectedPanoId =
		location && hasLoadAsPanoId(location) && currentPano?.panoId ? currentPano.panoId : null;

	return (
		<PanoViewerContext.Provider
			value={{
				currentPano,
				setCurrentPano,
				panoDates,
				setPanoDates,
				isFullscreen,
				setIsFullscreen,
				panoReady,
				setPanoReady,
				altitude,
				setAltitude,
				selectedPanoId,
			}}
		>
			{children}
		</PanoViewerContext.Provider>
	);
}

export function usePanoViewer(): PanoViewerContextValue {
	const ctx = useContext(PanoViewerContext);
	if (!ctx) throw new Error("usePanoViewer must be used within PanoViewerProvider");
	return ctx;
}
