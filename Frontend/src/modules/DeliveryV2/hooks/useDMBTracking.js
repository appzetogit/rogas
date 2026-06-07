import { useEffect, useRef, useCallback } from 'react';
import { useDeliveryStore } from '../store/useDeliveryStore';

const BACKEND_URL = (import.meta.env.VITE_API_BASE_URL ? import.meta.env.VITE_API_BASE_URL.replace(/\/v1$/, '') : 'http://localhost:5000/api');
const GPS_UPDATE_INTERVAL = 5000; // 5 seconds

/**
 * useDMBTracking — DailyMealBox GPS Tracking Hook for Driver App
 * 
 * - Sends driver GPS to backend every 5s when online
 * - Backend broadcasts location to customer tracking rooms + admin map
 * - Handles go-online / go-offline API calls
 * 
 * PRD Reference: DA-03 (GPS stream), ACM-23 (Customer tracking)
 */
export const useDMBTracking = () => {
    const { isOnline, setRiderLocation } = useDeliveryStore();
    const intervalRef = useRef(null);
    const watchIdRef = useRef(null);
    const currentLocationRef = useRef(null);

    // ─── Get Auth Token ────────────────────────────────────────────────────────
    const getAuthHeaders = () => {
        const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
        return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    };

    // ─── Send Location to Backend ─────────────────────────────────────────────
    const sendLocationUpdate = useCallback(async (lat, lng) => {
        try {
            await fetch(`${BACKEND_URL}/v1/dmb/driver/location`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ lat, lng })
            });
        } catch (err) {
            // Silent fail on GPS — don't disrupt driver UI
            console.warn('[DMBTracking] GPS send failed:', err.message);
        }
    }, []);

    // ─── Start GPS Tracking ────────────────────────────────────────────────────
    const startTracking = useCallback(() => {
        if (!navigator.geolocation) {
            console.warn('[DMBTracking] Geolocation not supported');
            return;
        }

        // Watch position for accurate readings
        watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude: lat, longitude: lng, accuracy } = position.coords;
                currentLocationRef.current = { lat, lng, accuracy };
                setRiderLocation({ lat, lng });
            },
            (err) => console.warn('[DMBTracking] GPS error:', err.message),
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        );

        // Send to backend every 5s
        intervalRef.current = setInterval(() => {
            if (currentLocationRef.current) {
                const { lat, lng } = currentLocationRef.current;
                sendLocationUpdate(lat, lng);
            }
        }, GPS_UPDATE_INTERVAL);

    }, [sendLocationUpdate, setRiderLocation]);

    // ─── Stop GPS Tracking ─────────────────────────────────────────────────────
    const stopTracking = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        currentLocationRef.current = null;
    }, []);

    // ─── Go Online ─────────────────────────────────────────────────────────────
    const goOnline = useCallback(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/v1/dmb/driver/go-online`, {
                method: 'PATCH',
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.success) {
                startTracking();
                return true;
            }
        } catch (err) {
            console.error('[DMBTracking] Go online failed:', err);
        }
        return false;
    }, [startTracking]);

    // ─── Go Offline ────────────────────────────────────────────────────────────
    const goOffline = useCallback(async () => {
        try {
            stopTracking();
            await fetch(`${BACKEND_URL}/v1/dmb/driver/go-offline`, {
                method: 'PATCH',
                headers: getAuthHeaders()
            });
            return true;
        } catch (err) {
            console.error('[DMBTracking] Go offline failed:', err);
        }
        return false;
    }, [stopTracking]);

    // ─── Auto-start tracking when driver is online ────────────────────────────
    useEffect(() => {
        if (isOnline) {
            startTracking();
        } else {
            stopTracking();
        }
        return () => stopTracking();
    }, [isOnline, startTracking, stopTracking]);

    return { goOnline, goOffline, currentLocation: currentLocationRef };
};
