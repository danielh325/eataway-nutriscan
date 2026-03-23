import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { FoodSpot } from "@/data/types";

const MAPBOX_TOKEN = "pk.eyJ1Ijoiam90aGFtbGltIiwiYSI6ImNtbGJzbXJzMzBxd2kzZm9yYnRvdDFuMHEifQ.XVBAE0qZM1ZoDM7QQZrjQQ";

export interface MapViewHandle {
  flyToSpot: (lat: number, lng: number) => void;
  resetView: () => void;
  geolocate: () => void;
  toggle3D: () => void;
  is3D: boolean;
}

interface MapViewProps {
  spots: FoodSpot[];
  onSpotSelect: (spot: FoodSpot) => void;
  className?: string;
}

const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  { spots, onSpotSelect, className },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const lastUserPos = useRef<[number, number] | null>(null);
  const onSpotSelectRef = useRef(onSpotSelect);
  const [is3D, setIs3D] = useState(false);
  const geolocatedRef = useRef(false);

  useEffect(() => { onSpotSelectRef.current = onSpotSelect; }, [onSpotSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: [103.8198, 1.3121],
      zoom: 13,
      pitch: 0,
      bearing: 0,
      antialias: true,
      attributionControl: false,
      logoPosition: "bottom-left",
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
      } catch {}
    });

    mapRef.current = map;

    // User location
    let watchId: number | null = null;
    const startWatch = () => {
      if (!navigator.geolocation) return;
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          if (!userMarkerRef.current) {
            const el = document.createElement("div");
            el.className = "user-location-marker";
            el.innerHTML = `<div class="user-loc-dot"></div><div class="user-loc-pulse"></div>`;
            userMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "center" })
              .setLngLat([longitude, latitude])
              .addTo(map);
          } else {
            userMarkerRef.current.setLngLat([longitude, latitude]);
          }
          lastUserPos.current = [longitude, latitude];
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

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(spots.map((s) => s.id));
    const existing = markersRef.current;

    existing.forEach((marker, id) => {
      if (!currentIds.has(id)) { marker.remove(); existing.delete(id); }
    });

    spots.forEach((spot) => {
      if (existing.has(spot.id)) return;
      const el = document.createElement("div");
      el.className = "map-marker-photo";
      el.innerHTML = `
        <div class="marker-photo-wrapper">
          <img src="${spot.image}" alt="${spot.name}" />
        </div>
        <span class="marker-label">${spot.name}</span>
      `;
      el.addEventListener("click", () => onSpotSelectRef.current(spot));
      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([spot.lng, spot.lat])
        .addTo(map);
      existing.set(spot.id, marker);
    });

    // Zoom-based sizing
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
    updateSizes();
    map.on("zoom", updateSizes);
    return () => { map.off("zoom", updateSizes); };
  }, [spots]);

  const flyToSpot = useCallback((lat: number, lng: number) => {
    const map = mapRef.current;
    if (!map) return;
    setIs3D(true);
    try { (map as any).setConfigProperty("basemap", "show3dObjects", true); } catch {}
    map.flyTo({ center: [lng, lat], zoom: 17, pitch: 55, bearing: -15, duration: 1200, essential: true });
  }, []);

  const resetView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setIs3D(false);
    try { (map as any).setConfigProperty("basemap", "show3dObjects", false); } catch {}
    map.flyTo({ center: [103.8198, 1.3121], zoom: 13, pitch: 0, bearing: 0, duration: 800 });
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
    if (lastUserPos.current) {
      map.flyTo({ center: lastUserPos.current, zoom: 15, duration: 800 });
    } else {
      navigator.geolocation.getCurrentPosition(
        (pos) => map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15, duration: 800 }),
        () => {},
        { enableHighAccuracy: false, maximumAge: 30000, timeout: 3000 }
      );
    }
  }, []);

  useImperativeHandle(ref, () => ({ flyToSpot, resetView, geolocate, toggle3D, is3D }), [flyToSpot, resetView, geolocate, toggle3D, is3D]);

  return <div ref={containerRef} className={className || "h-full w-full"} />;
});

export default MapView;
