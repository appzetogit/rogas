import * as diningService from '../services/dining.service.js';

// User endpoints
export async function createBooking(req, res, next) {
    try {
        const userId = req.user?.userId;
        const booking = await diningService.createDiningBooking(userId, req.body);
        res.status(201).json({ success: true, message: 'Booking created successfully', data: booking });
    } catch (error) {
        next(error);
    }
}

export async function getMyBookings(req, res, next) {
    try {
        const userId = req.user?.userId;
        const bookings = await diningService.getUserDiningBookings(userId);
        res.status(200).json({ success: true, message: 'Bookings fetched successfully', data: bookings });
    } catch (error) {
        next(error);
    }
}

export async function createReview(req, res, next) {
    try {
        const { bookingId } = req.params;
        const booking = await diningService.createDiningBookingReview(bookingId, req.body);
        res.status(200).json({ success: true, message: 'Review submitted successfully', data: booking });
    } catch (error) {
        next(error);
    }
}

// Restaurant / Admin endpoints
export async function getRestaurantBookings(req, res, next) {
    try {
        const { restaurantId } = req.params;
        const bookings = await diningService.getRestaurantDiningBookings(restaurantId);
        res.status(200).json({ success: true, message: 'Restaurant bookings fetched successfully', data: bookings });
    } catch (error) {
        next(error);
    }
}

export async function updateBookingStatus(req, res, next) {
    try {
        const { bookingId } = req.params;
        const { status } = req.body;
        const booking = await diningService.updateDiningBookingStatus(bookingId, status);
        res.status(200).json({ success: true, message: 'Booking status updated successfully', data: booking });
    } catch (error) {
        next(error);
    }
}
