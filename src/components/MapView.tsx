import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { FoodSpot } from "@/data/types";
import { getPlacesPhotoCache } from "@/hooks/usePlacesPhoto";

const MAPBOX_TOKEN = "pk.eyJ1Ijoiam90aGFtbGltIiwiYSI6ImNtbGJzbXJzMzBxd2kzZm9yYnRvdDFuMHEifQ.XVBAE0qZM1ZoDM7QQZrjQQ";

export const TIME_PRESETS = ["day", "night"] as const;
export type TimePreset = (typeof TIME_PRESETS)[number];

export function getTimeOfDay(): TimePreset {
  const now = new Date();
  const sgHour = (now.getUTCHours() + 8) % 24;
  if (sgHour >= 7 && sgHour < 19) return "day";
  return "night";
}

export interface MapViewHandle {
  toggle3D: () => void;
  geolocate: () => void;
  flyToSpot: (lat: number, lng: number) => void;
  resetView: () => void;
  fitToSpots: (spots: { lat: number; lng: number }[]) => void;
  is3D: boolean;
}

interface MapViewProps {
  spots: FoodSpot[];
  onSpotSelect: (spot: FoodSpot) => void;
  flyTo?: [number, number] | null;
  timePreset?: TimePreset;
  onTimeChange?: (preset: TimePreset) => void;
  onBoundsChange?: (bounds: { sw: [number, number]; ne: [number, number] }) => void;
}

const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  { spots, onSpotSelect, flyTo, timePreset, onTimeChange, onBoundsChange },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const lastUserPos = useRef<[number, number] | null>(null);
  const onSpotSelectRef = useRef(onSpotSelect);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const [is3D, setIs3D] = useState(false);
  const geolocatedRef = useRef(false);
  const suppressBoundsRef = useRef(false);

  useEffect(() => { onSpotSelectRef.current = onSpotSelect; }, [onSpotSelect]);
  useEffect(() => { onBoundsChangeRef.current = onBoundsChange; }, [onBoundsChange]);

  const emitBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map || !onBoundsChangeRef.current || suppressBoundsRef.current) return;
    const b = map.getBounds();
    onBoundsChangeRef.current({
      sw: [b.getSouth(), b.getWest()],
      ne: [b.getNorth(), b.getEast()],
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: [103.8198, 1.3121],
      zoom: 14,
      pitch: 0,
      bearing: 0,
      antialias: true,
      attributionControl: false,
      logoPosition: "bottom-left",
      renderWorldCopies: false,
    });

    const style = document.createElement("style");
    style.textContent = `.mapboxgl-ctrl-logo, .mapboxgl-ctrl-attrib { display: none !important; }`;
    containerRef.current.appendChild(style);

    map.on("style.load", () => {
      try {
        (map as any).setConfigProperty("basemap", "theme", "default");
        (map as any).setConfigProperty("basemap", "showPointOfInterestLabels", false);
        (map as any).setConfigProperty("basemap", "showTransitLabels", true);
        (map as any).setConfigProperty("basemap", "showPlaceLabels", true);
        (map as any).setConfigProperty("basemap", "lightPreset", "day");
        (map as any).setConfigProperty("basemap", "show3dObjects", false);
      } catch (e) {
        const layers = map.getStyle()?.layers || [];
        layers.forEach((layer) => {
          if (layer.id.includes("poi") && layer.type === "symbol") {
            map.setLayoutProperty(layer.id, "visibility", "none");
          }
        });
      }
    });

    mapRef.current = map;

    let watchId: number | null = null;
    const startWatch = () => {
      if (!navigator.geolocation) return;
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, heading } = pos.coords;
          const rotation = heading && !isNaN(heading) ? heading : 0;

          if (!userMarkerRef.current) {
            const el = document.createElement("div");
            el.className = "user-location-marker";
            el.innerHTML = `
              <div class="user-loc-heading"></div>
              <div class="user-loc-dot"></div>
              <div class="user-loc-pulse"></div>
            `;
            userMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "center" })
              .setLngLat([longitude, latitude])
              .addTo(map);
          } else {
            userMarkerRef.current.setLngLat([longitude, latitude]);
          }
          lastUserPos.current = [longitude, latitude];

          const headingEl = userMarkerRef.current.getElement().querySelector(".user-loc-heading") as HTMLElement;
          if (headingEl) headingEl.style.transform = `rotate(${rotation}deg)`;

          if (!geolocatedRef.current) {
            geolocatedRef.current = true;
            map.flyTo({ center: [longitude, latitude], zoom: 14, duration: 800 });
          }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
    };

    map.once("load", startWatch);
    if (map.loaded()) startWatch();

    let boundsTimer: ReturnType<typeof setTimeout>;
    const debouncedEmitBounds = () => {
      clearTimeout(boundsTimer);
      boundsTimer = setTimeout(emitBounds, 300);
    };
    map.on("idle", debouncedEmitBounds);

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(boundsTimer);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      map.off("idle", debouncedEmitBounds);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Photo cache for markers
  const photoCacheRef = useRef<Map<string, string>>(new Map());
  const zoomHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    getPlacesPhotoCache().then((cache) => { photoCacheRef.current = cache; });
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(spots.map((s) => s.id));
    const existing = markersRef.current;

    existing.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        existing.delete(id);
      }
    });

    spots.forEach((spot) => {
      if (existing.has(spot.id)) return;
      const photoUrl = photoCacheRef.current.get(spot.name) || spot.image;
      const el = document.createElement("div");
      el.className = "map-marker-photo";
      el.innerHTML = `
        <div class="marker-photo-wrapper">
          <img src="${photoUrl}" alt="${spot.name}" />
        </div>
        <span class="marker-label">${spot.name}</span>
      `;
      el.addEventListener("click", () => onSpotSelectRef.current(spot));
      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([spot.lng, spot.lat])
        .addTo(map);
      existing.set(spot.id, marker);
    });

    if (zoomHandlerRef.current) map.off("zoom", zoomHandlerRef.current);
    const updateSizes = () => {
      const z = map.getZoom();
      markersRef.current.forEach((marker) => {
        const el = marker.getElement();
        const size = z < 12 ? 28 : z < 14 ? 34 : 40;
        const wrapper = el.querySelector(".marker-photo-wrapper") as HTMLElement;
        const label = el.querySelector(".marker-label") as HTMLElement;
        if (wrapper) { wrapper.style.width = `${size}px`; wrapper.style.height = `${size}px`; }
        if (label) { label.style.display = z >= 15 ? "block" : "none"; }
      });
    };
    zoomHandlerRef.current = updateSizes;
    updateSizes();
    map.on("zoom", updateSizes);
  }, [spots]);

  useEffect(() => {
    if (!flyTo || !mapRef.current) return;
    mapRef.current.flyTo({ center: [flyTo[1], flyTo[0]], zoom: 16, duration: 800 });
  }, [flyTo]);

  const flyToSpot = useCallback((lat: number, lng: number) => {
    const map = mapRef.current;
    if (!map) return;
    suppressBoundsRef.current = true;
    setIs3D(true);
    try { (map as any).setConfigProperty("basemap", "show3dObjects", true); } catch {}
    map.flyTo({ center: [lng, lat], zoom: 17, pitch: 55, bearing: -15, duration: 1200, essential: true });
  }, []);

  const resetView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    suppressBoundsRef.current = false;
    setIs3D(false);
    try { (map as any).setConfigProperty("basemap", "show3dObjects", false); } catch {}
    map.flyTo({ center: [103.8198, 1.3121], zoom: 14, pitch: 0, bearing: 0, duration: 800 });
  }, []);

  const toggle3D = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const next = !is3D;
    setIs3D(next);
    try { (map as any).setConfigProperty("basemap", "show3dObjects", next); } catch {}
    map.easeTo({ pitch: next ? 60 : 0, bearing: next ? -17 : 0, duration: 800 });
  }, [is3D]);

  const geolocate = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const animateToUser = (lng: number, lat: number) => {
      map.flyTo({ center: [lng, lat], zoom: 16, duration: 800, essential: true });

      const onIdle = () => {
        map.off("idle", onIdle);
        const sorted = [...spots]
          .map((s) => ({ ...s, dist: Math.sqrt((s.lat - lat) ** 2 + (s.lng - lng) ** 2) }))
          .sort((a, b) => a.dist - b.dist);
        const MAX_RADIUS = 0.027;
        const nearby = sorted.filter((s) => s.dist <= MAX_RADIUS).slice(0, 10);
        if (nearby.length > 0) {
          const bounds = new mapboxgl.LngLatBounds();
          bounds.extend([lng, lat]);
          nearby.forEach((s) => bounds.extend([s.lng, s.lat]));
          setTimeout(() => {
            map.fitBounds(bounds, {
              padding: { top: 80, bottom: 180, left: 40, right: 40 },
              maxZoom: 15,
              duration: 1000,
            });
          }, 400);
        }
      };
      map.once("idle", onIdle);
    };

    if (lastUserPos.current) {
      animateToUser(lastUserPos.current[0], lastUserPos.current[1]);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => animateToUser(pos.coords.longitude, pos.coords.latitude),
      () => {},
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 3000 }
    );
  }, [spots]);

  const fitToSpots = useCallback((spots: { lat: number; lng: number }[]) => {
    const map = mapRef.current;
    if (!map || spots.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds();
    spots.forEach((s) => bounds.extend([s.lng, s.lat]));
    map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 600 });
  }, []);

  useImperativeHandle(ref, () => ({ toggle3D, geolocate, flyToSpot, resetView, fitToSpots, is3D }), [toggle3D, geolocate, flyToSpot, resetView, fitToSpots, is3D]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
});

export default MapView;
