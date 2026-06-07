import { useEffect, useRef, useCallback, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * useOrderTracking — DailyMealBox Customer Live Tracking Hook
 * 
 * Connects to Socket.IO room: order_tracking_{orderId}
 * Receives: driver_location_update, order_status_changed, arriving_soon
 * 
 * PRD Reference: CA-14 (Live Tracking), ACM-23 (Driver pin shows on map)
 */
export const useOrderTracking = (orderId) => {
    const socketRef = useRef(null);
    const [driverLocation, setDriverLocation] = useState(null);   // { lat, lng }
    const [orderStatus, setOrderStatus] = useState(null);
    const [eta, setEta] = useState(null);                          // minutes
    const [arrivingSoon, setArrivingSoon] = useState(false);
    const [deliveryPin, setDeliveryPin] = useState(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!orderId) return;

        const token = localStorage.getItem('accessToken') || localStorage.getItem('token');

        // Create Socket.IO connection
        const socket = io(SOCKET_URL, {
            auth: { token },
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 2000
        });

        socketRef.current = socket;

        // ─── Connection Events ─────────────────────────────────────────────────
        socket.on('connect', () => {
            setIsConnected(true);
            // Join the order's tracking room
            socket.emit('join_order_tracking', { orderId });
        });

        socket.on('disconnect', () => {
            setIsConnected(false);
        });

        // ─── Driver Location Update (every 5s from backend) ───────────────────
        socket.on('driver_location_update', (data) => {
            if (data.orderId === orderId || !data.orderId) {
                setDriverLocation({ lat: data.lat, lng: data.lng });
                if (data.eta) setEta(data.eta);
            }
        });

        // ─── Order Status Changed ─────────────────────────────────────────────
        socket.on('order_status_changed', (data) => {
            if (data.orderId === orderId) {
                setOrderStatus(data.status);
            }
        });

        // ─── Arriving Soon (< 500m) ───────────────────────────────────────────
        socket.on('arriving_soon', (data) => {
            if (data.orderId === orderId) {
                setArrivingSoon(true);
                if (data.pin) setDeliveryPin(data.pin);
            }
        });

        // ─── Operations Snapshot (initial state on connect) ───────────────────
        socket.on('operations_snapshot', (data) => {
            // Find driver for this order
            if (data.activeOrder?.orderId === orderId && data.driver) {
                setDriverLocation({ lat: data.driver.lat, lng: data.driver.lng });
            }
        });

        return () => {
            socket.emit('leave_order_tracking', { orderId });
            socket.disconnect();
        };
    }, [orderId]);

    return {
        driverLocation,
        orderStatus,
        eta,
        arrivingSoon,
        deliveryPin,
        isConnected
    };
};


/**
 * useAdminLiveMap — DailyMealBox Admin Live Operations Map Hook
 * 
 * Connects to Socket.IO room: admin_{city}
 * Receives: all_driver_locations (every 5s), operations_snapshot (on connect)
 * 
 * PRD Reference: AP-02 (Live Operations Map)
 */
export const useAdminLiveMap = (city) => {
    const socketRef = useRef(null);
    const [drivers, setDrivers] = useState([]);          // All online drivers
    const [pendingPickups, setPendingPickups] = useState([]);
    const [liveStats, setLiveStats] = useState({ online: 0, delivered_today: 0, pending_pickups: 0 });
    const [isConnected, setIsConnected] = useState(false);

    const reassignDriver = useCallback(async (orderId, newDriverId) => {
        try {
            const token = localStorage.getItem('accessToken') || localStorage.getItem('adminToken');
            const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/food/admin/orders/${orderId}/reassign`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ new_driver_id: newDriverId })
            });
            return await res.json();
        } catch (err) {
            console.error('[AdminLiveMap] Reassign failed:', err);
        }
    }, []);

    useEffect(() => {
        if (!city) return;

        const token = localStorage.getItem('accessToken') || localStorage.getItem('adminToken');
        const socket = io(SOCKET_URL, {
            auth: { token },
            transports: ['websocket'],
            reconnection: true
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            setIsConnected(true);
            socket.emit('join_admin_room', { city });
        });

        socket.on('disconnect', () => setIsConnected(false));

        // ─── All Driver Locations (every 5s) ──────────────────────────────────
        socket.on('all_driver_locations', (driversData) => {
            setDrivers(driversData);
        });

        // ─── Single Driver Location Update ────────────────────────────────────
        socket.on('driver_location_update', (data) => {
            setDrivers(prev => {
                const existing = prev.findIndex(d => d.driverId === data.driverId);
                if (existing !== -1) {
                    const updated = [...prev];
                    updated[existing] = { ...updated[existing], ...data };
                    return updated;
                }
                return [...prev, data];
            });
        });

        // ─── Initial Snapshot ─────────────────────────────────────────────────
        socket.on('operations_snapshot', (snapshot) => {
            setDrivers(snapshot.drivers || []);
            setPendingPickups(snapshot.pending_pickups || []);
            setLiveStats(snapshot.stats || {});
        });

        // ─── Driver Status Change (online/offline) ────────────────────────────
        socket.on('driver_status_change', (data) => {
            if (data.status === 'offline') {
                setDrivers(prev => prev.filter(d => d.driverId !== data.driverId));
            } else if (data.status === 'online') {
                setDrivers(prev => {
                    const exists = prev.some(d => d.driverId === data.driverId);
                    if (!exists) return [...prev, { driverId: data.driverId, name: data.name, status: 'online', lat: null, lng: null }];
                    return prev;
                });
            }
        });

        return () => {
            socket.emit('leave_admin_room', { city });
            socket.disconnect();
        };
    }, [city]);

    return { drivers, pendingPickups, liveStats, isConnected, reassignDriver };
};
