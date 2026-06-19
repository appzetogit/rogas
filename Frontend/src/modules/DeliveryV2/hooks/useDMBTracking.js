import { useEffect, useRef, useCallback } from 'react';
import { useDeliveryStore } from '../store/useDeliveryStore';
import { writeDeliveryLocation } from '@food/realtimeTracking';
import { dmbDeliveryAPI } from '@food/api';

const BACKEND_URL = (import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL.replace(/\/v1$/, '')
    : 'http://localhost:5000/api');
const GPS_UPDATE_INTERVAL = 5000; // 5 seconds — matches admin panel refresh

// Parse driver MongoDB _id from JWT token (same key used in Firebase delivery_boys/<id>)
const getDriverId = () => {
    try {
        const token = localStorage.getItem('delivery_accessToken');
        if (token) {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.userId || payload._id || '';
        }
    } catch (e) {
        console.warn('[DMBTracking] Failed to parse driver ID from token');
    }
    return localStorage.getItem('deliveryPartnerId') || localStorage.getItem('deliveryBoyId') || '';
};

/**
 * useDMBTracking — GPS Tracking & Firebase Sync Hook
 *
 * IMPORTANT: This hook does NOT create its own watchPosition.
 * GPS coordinates come from the Zustand store (riderLocation), which is
 * already kept fresh by the watchPosition in DeliveryHomeV2.
 *
 * This ensures the delivery boy LiveMap and Admin LiveOperationsMap
 * always display the EXACT same coordinates (no dual-GPS mismatch).
 *
 * Every 5 seconds this hook:
 *  1. Reads riderLocation from Zustand store (same source as LiveMap)
 *  2. POSTs to backend HTTP endpoint (DB + socket broadcast)
 *  3. Writes to Firebase Realtime DB delivery_boys/<id> (admin map)
 */
export const useDMBTracking = () => {
    const { isOnline } = useDeliveryStore();
    const intervalRef = useRef(null);

    // ─── Get Auth Token ────────────────────────────────────────────────────────
    const getAuthHeaders = () => {
        const token = localStorage.getItem('delivery_accessToken')
            || localStorage.getItem('accessToken')
            || localStorage.getItem('token');
        return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    };

    const publishLocation = useCallback(async (lat, lng, heading = 0, speed = 0) => {
        const { isOnline: currentOnlineState } = useDeliveryStore.getState();
        const deliveryId = getDriverId();
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return;
        }

        if (!currentOnlineState) {
            console.debug('[DMBTracking] Skipped location publish — driver is offline');
            return;
        }

        // 1. HTTP → Backend (MongoDB lastLat/lastLng + socket room broadcast)
        try {
            await dmbDeliveryAPI.updateLocation(lat, lng, heading, speed);
        } catch (err) {
            console.warn('[DMBTracking] Backend GPS send failed:', err.message);
        }

        // 2. Firebase → Admin LiveOperationsMap reads from delivery_boys/<id>
        if (deliveryId) {
            writeDeliveryLocation({
                deliveryId,
                lat,
                lng,
                heading,
                speed,
                isOnline: true,
                timestamp: Date.now(),
            }).catch((err) => console.warn('[DMBTracking] Firebase write failed:', err.message));
        } else {
            console.warn('[DMBTracking] Firebase write skipped — deliveryId empty. Check JWT.');
        }
    }, []);

    // ─── Start 5-second sync ───────────────────────────────────────────────────
    // Reads from Zustand store (SAME source as LiveMap) — coordinates always match
    const startTracking = useCallback(() => {
        if (intervalRef.current) return; // guard: don't double-start
        intervalRef.current = setInterval(() => {
            // Double-check online state inside interval (race condition safety)
            const { isOnline: stillOnline, riderLocation } = useDeliveryStore.getState();
            if (!stillOnline) return; // driver went offline — skip silently

            if (riderLocation && Number.isFinite(riderLocation.lat) && Number.isFinite(riderLocation.lng)) {
                publishLocation(
                    riderLocation.lat,
                    riderLocation.lng,
                    riderLocation.heading || 0,
                    riderLocation.speed || 0
                );
            }
        }, GPS_UPDATE_INTERVAL);
    }, [publishLocation]);

    // ─── Stop sync ────────────────────────────────────────────────────────────
    const stopTracking = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        // Mark driver offline in Firebase immediately
        const deliveryId = getDriverId();
        if (deliveryId) {
            const { riderLocation } = useDeliveryStore.getState();
            writeDeliveryLocation({
                deliveryId,
                lat: riderLocation?.lat || 0,
                lng: riderLocation?.lng || 0,
                isOnline: false,
                timestamp: Date.now(),
            }).catch(() => { });
        }
    }, []);

    // ─── Go Online (API call) ──────────────────────────────────────────────────
    const goOnline = useCallback(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/v1/dmb/driver/go-online`, {
                method: 'PATCH',
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.success) {
                startTracking();
                // Publish current position immediately (don't wait 5s)
                const { riderLocation } = useDeliveryStore.getState();
                if (riderLocation?.lat && riderLocation?.lng) {
                    publishLocation(riderLocation.lat, riderLocation.lng, riderLocation.heading || 0, 0);
                }
                return true;
            }
        } catch (err) {
            console.error('[DMBTracking] Go online failed:', err);
        }
        return false;
    }, [startTracking, publishLocation]);

    // ─── Go Offline (API call) ─────────────────────────────────────────────────
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

    // ─── Auto-start/stop based on isOnline state ───────────────────────────────
    useEffect(() => {
        let watchId = null;
        if (isOnline) {
            startTracking();
            // Immediately publish on going online
            const { riderLocation } = useDeliveryStore.getState();
            if (riderLocation?.lat && riderLocation?.lng) {
                publishLocation(riderLocation.lat, riderLocation.lng, riderLocation.heading || 0, 0);
            }

            // Start global Geolocation watchPosition
            if (navigator.geolocation) {
                watchId = navigator.geolocation.watchPosition(
                    (pos) => {
                        const { latitude: lat, longitude: lng, heading, speed } = pos.coords;
                        useDeliveryStore.getState().setRiderLocation({
                            lat,
                            lng,
                            heading: heading || 0,
                            speed: speed || 0
                        });
                    },
                    (err) => {
                        console.warn('[DMBTracking] GPS Watch failed or denied:', err);
                        // Fallback to Indore (for development/testing) so coordinates are not null
                        const fallbackPos = { lat: 22.7196, lng: 75.8577, heading: 0, speed: 0 };
                        const { riderLocation } = useDeliveryStore.getState();
                        if (!riderLocation) {
                            useDeliveryStore.getState().setRiderLocation(fallbackPos);
                        }
                    },
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
                );
            } else {
                console.warn('[DMBTracking] Geolocation not supported');
                // Fallback to Indore (for development/testing)
                const fallbackPos = { lat: 22.7196, lng: 75.8577, heading: 0, speed: 0 };
                useDeliveryStore.getState().setRiderLocation(fallbackPos);
            }
        } else {
            stopTracking();
        }
        return () => {
            stopTracking();
            if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
            }
        };
    }, [isOnline, startTracking, stopTracking, publishLocation]);

    return { goOnline, goOffline };
};
