import React, { useEffect, useState, useRef, useMemo } from 'react';
import { GoogleMap, Marker, Polyline, useJsApiLoader, InfoWindow } from '@react-google-maps/api';
import { Loader2, AlertCircle } from 'lucide-react';
import { useDeliveryStore } from '../store/useDeliveryStore';

const LIBRARIES = ['geometry'];

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  minHeight: '450px',
  borderRadius: '1.25rem',
  boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
  border: '1px solid rgba(0, 0, 0, 0.05)'
};

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  scaleControl: true,
  streetViewControl: false,
  rotateControl: false,
  fullscreenControl: true,
  styles: [
    { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'on' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] }
  ]
};

export const RoutesMap = ({ stops = [] }) => {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: ["places", "drawing", "geometry"]
  });

  const [activeMarker, setActiveMarker] = useState(null);
  const mapRef = useRef(null);
  const riderLocation = useDeliveryStore((state) => state.riderLocation);

  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [currentSimStop, setCurrentSimStop] = useState(0);

  const watchIdRef = useRef(null);
  const simIntervalRef = useRef(null);

  // Reset simulation when stops list changes
  useEffect(() => {
    setCurrentSimStop(0);
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    setIsSimulating(false);
  }, [stops]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const handleLiveClick = () => {
    if (isLiveActive) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsLiveActive(false);
    } else {
      if (!navigator.geolocation) {
        alert("Location services are not supported by your browser!");
        return;
      }
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          useDeliveryStore.getState().setRiderLocation({ lat: latitude, lng: longitude });
          if (mapRef.current) {
            mapRef.current.panTo({ lat: latitude, lng: longitude });
          }
        },
        (err) => {
          alert("Location services are disabled or access is denied. Please enable location access in your browser settings!");
          setIsLiveActive(false);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
      setIsLiveActive(true);
    }
  };

  const startSimulation = () => {
    if (stopsData.length === 0) return;
    if (currentSimStop >= stopsData.length) {
      alert("All stops on the route have been completed!");
      return;
    }

    setIsSimulating(true);

    const startPos = riderLocation || (currentSimStop > 0 ? stopsData[currentSimStop - 1].position : stopsData[0].position);
    const targetPos = stopsData[currentSimStop].position;

    let progress = 0;
    const steps = 60; // 3 seconds simulation (60 steps * 50ms)

    if (simIntervalRef.current) clearInterval(simIntervalRef.current);

    simIntervalRef.current = setInterval(() => {
      progress += 1 / steps;
      if (progress >= 1) {
        clearInterval(simIntervalRef.current);
        simIntervalRef.current = null;
        setIsSimulating(false);

        const finalPos = { lat: targetPos.lat, lng: targetPos.lng };
        useDeliveryStore.getState().setRiderLocation(finalPos);
        if (mapRef.current) {
          mapRef.current.panTo(finalPos);
        }

        setCurrentSimStop((prev) => prev + 1);
      } else {
        const lat = startPos.lat + (targetPos.lat - startPos.lat) * progress;
        const lng = startPos.lng + (targetPos.lng - startPos.lng) * progress;
        const nextPos = { lat, lng };

        useDeliveryStore.getState().setRiderLocation(nextPos);
        if (mapRef.current) {
          mapRef.current.panTo(nextPos);
        }
      }
    }, 50);
  };

  // Default center: Indore, India
  const defaultCenter = { lat: 22.7196, lng: 75.8577 };

  // Parse stops coordinates and offset duplicates slightly so they don't overlap completely
  const stopsData = useMemo(() => {
    const coordsMap = {};
    return stops
      .map((stop, index) => {
        let lat = parseFloat(stop.lat || stop.latitude);
        let lng = parseFloat(stop.lng || stop.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
          if (coordsMap[key] !== undefined) {
            const count = coordsMap[key];
            coordsMap[key] = count + 1;
            // Radial displacement of ~12 meters per duplicate to make overlap visible
            const angle = count * 0.8;
            const radius = 0.00012 * (1 + Math.floor(count / 8));
            lat += Math.cos(angle) * radius;
            lng += Math.sin(angle) * radius;
          } else {
            coordsMap[key] = 1;
          }
          return {
            ...stop,
            position: { lat, lng }
          };
        }
        return null;
      })
      .filter(Boolean);
  }, [stops]);

  // Path coordinates for the polyline connecting stops in sequence
  const path = useMemo(() => {
    return stopsData.map((s) => s.position);
  }, [stopsData]);

  // Fit bounds to show all markers including rider location
  useEffect(() => {
    if (isLoaded && mapRef.current && (stopsData.length > 0 || riderLocation) && window.google) {
      const bounds = new window.google.maps.LatLngBounds();
      stopsData.forEach((s) => bounds.extend(s.position));
      if (riderLocation) {
        const rLat = parseFloat(riderLocation.lat || riderLocation.latitude);
        const rLng = parseFloat(riderLocation.lng || riderLocation.longitude);
        if (Number.isFinite(rLat) && Number.isFinite(rLng)) {
          bounds.extend({ lat: rLat, lng: rLng });
        }
      }
      mapRef.current.fitBounds(bounds);
      // Limit zoom level so it doesn't get too close for a single marker
      const listener = window.google.maps.event.addListener(mapRef.current, 'bounds_changed', () => {
        if (mapRef.current.getZoom() > 16) {
          mapRef.current.setZoom(15);
        }
        window.google.maps.event.removeListener(listener);
      });
    }
  }, [isLoaded, stopsData, riderLocation]);

  const onMapLoad = (mapInstance) => {
    mapRef.current = mapInstance;
  };

  // Build arrow symbol for polyline decoration
  const arrowIcon = useMemo(() => {
    if (!isLoaded || !window.google) return null;
    return {
      path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      strokeColor: '#1F7A63', // Deep green outline
      fillColor: '#1F7A63', // Deep green fill
      fillOpacity: 1,
      scale: 3
    };
  }, [isLoaded]);

  if (loadError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 flex flex-col items-center gap-3 text-center min-h-[300px] justify-center">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-sm font-semibold text-red-700">Failed to load Google Map. Please check your config.</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="bg-white border rounded-2xl min-h-[450px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-[#1F7A63] animate-spin" />
          <p className="text-xs font-semibold text-gray-500">Loading map canvas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[450px] rounded-2xl overflow-hidden shadow-sm">
      {/* Side Control Overlay */}
      <div className="absolute top-4 left-4 z-[10] flex flex-col gap-2">
        <button
          onClick={handleLiveClick}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md ${
            isLiveActive
              ? 'bg-[#1F7A63] text-white border border-[#1F7A63] animate-pulse'
              : 'bg-white/95 backdrop-blur-md text-gray-700 border border-gray-200 hover:bg-white'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isLiveActive ? 'bg-white' : 'bg-green-500'}`} />
          {isLiveActive ? 'Live ON' : 'Live'}
        </button>

        <button
          onClick={startSimulation}
          disabled={stopsData.length === 0}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md ${
            isSimulating
              ? 'bg-amber-500 text-white border border-amber-500'
              : 'bg-white/95 backdrop-blur-md text-gray-700 border border-gray-200 hover:bg-white disabled:opacity-50'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isSimulating ? 'bg-white animate-pulse' : 'bg-amber-500'}`} />
          {isSimulating ? 'Streaming…' : 'Stream'}
        </button>
      </div>

      <GoogleMap
        onLoad={onMapLoad}
        mapContainerStyle={mapContainerStyle}
        center={stopsData[0]?.position || defaultCenter}
        zoom={13}
        options={mapOptions}
      >
        {/* Polyline connecting the stops in optimized VRP sequence */}
        {path.length > 1 && (
          <Polyline
            path={path}
            options={{
              strokeColor: '#1F7A63', // Deep green path matching UI theme
              strokeOpacity: 0.8,
              strokeWeight: 6,
              geodesic: true,
              zIndex: 10,
              ...(arrowIcon ? {
                icons: [{
                  icon: arrowIcon,
                  offset: '50%',
                  repeat: '100px'
                }]
              } : {})
            }}
          />
        )}

        {/* Markers for each stop */}
        {stopsData.map((stop, idx) => {
          const isPickup = stop.type === 'pickup' || stop.type === 'P';
          const isCompleted = stop.status === 'completed' || stop.status === 'COMPLETED';

          const labelText = String(stop.stopIndex !== undefined && stop.stopIndex !== null ? stop.stopIndex : idx + 1);

          return (
            <Marker
              key={`${stop.orderId}-${stop.type}`}
              position={stop.position}
              onClick={() => setActiveMarker(stop)}
              label={{
                text: labelText,
                color: '#ffffff',
                fontWeight: '900',
                fontSize: '12px'
              }}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                fillColor: isCompleted ? '#9CA3AF' : isPickup ? '#1F7A63' : '#3B82F6',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 3,
                scale: 16
              }}
            />
          );
        })}

        {/* Rider Current Location Marker */}
        {riderLocation && (() => {
          const rLat = parseFloat(riderLocation.lat || riderLocation.latitude);
          const rLng = parseFloat(riderLocation.lng || riderLocation.longitude);
          if (Number.isFinite(rLat) && Number.isFinite(rLng)) {
            return (
              <Marker
                position={{ lat: rLat, lng: rLng }}
                title="My Current Location"
                icon={{
                  url: "/MapRider.png",
                  anchor: window.google ? new window.google.maps.Point(35, 35) : null,
                  scaledSize: window.google ? new window.google.maps.Size(70, 70) : null
                }}
              />
            );
          }
          return null;
        })()}

        {/* InfoWindow for clicked marker */}
        {activeMarker && (
          <InfoWindow
            position={activeMarker.position}
            onCloseClick={() => setActiveMarker(null)}
          >
            <div className="p-1 font-poppins max-w-[200px]">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider mb-1 ${activeMarker.type === 'pickup' || activeMarker.type === 'P'
                ? 'bg-[#1F7A63]/10 text-[#1F7A63]'
                : 'bg-[#3B82F6]/10 text-[#3B82F6]'
                }`}>
                Stop #{activeMarker.stopIndex} — {activeMarker.type === 'pickup' || activeMarker.type === 'P' ? 'Pickup' : 'Delivery'}
              </span>
              <h4 className="text-xs font-bold text-gray-900 leading-tight mb-1">
                {activeMarker.name}
              </h4>
              <p className="text-[10px] text-gray-500 leading-normal line-clamp-2">
                {activeMarker.address}
              </p>
              {activeMarker.phone && (
                <p className="text-[10px] text-gray-400 font-medium mt-1">
                  📞 {activeMarker.phone}
                </p>
              )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
};

export default RoutesMap;
