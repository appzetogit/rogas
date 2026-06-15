/**
 * Auth API – new backend (USER, ADMIN, RESTAURANT, DELIVERY).
 * Food-prefixed: POST /food/auth/...
 */

import apiClient, { userClient, restaurantClient, deliveryClient, adminClient } from "./axios.js";
import { EMAIL_REGEX } from "@/shared/utils/emailValidation";
import { SUPPORTED_COUNTRIES } from "../../config/countries";

const AUTH = {
  USER_REQUEST_OTP: "/food/auth/user/request-otp",
  USER_VERIFY_OTP: "/food/auth/user/verify-otp",
  ADMIN_LOGIN: "/food/auth/admin/login",
  RESTAURANT_REQUEST_OTP: "/food/auth/restaurant/request-otp",
  RESTAURANT_VERIFY_OTP: "/food/auth/restaurant/verify-otp",
  DELIVERY_REQUEST_OTP: "/food/auth/delivery/request-otp",
  DELIVERY_VERIFY_OTP: "/food/auth/delivery/verify-otp",
  REFRESH_TOKEN: "/food/auth/refresh-token",
  LOGOUT: "/food/auth/logout",
  ME: "/food/auth/me",
};

/**
 * Normalize and validate phone to digits only based on country configuration.
 * @param {string} phone - e.g. "+91 9876543210" or "48123456789"
 */
function validateAndNormalizePhone(phone) {
  if (!phone) {
    throw new Error("Phone number is required");
  }
  let digits = String(phone).replace(/\D/g, "");

  // If it's exactly 10 digits without code, assume India (+91)
  if (digits.length === 10) {
    digits = "91" + digits;
  }

  // Sort countries by code digits length descending to match longest prefix first
  const sortedCountries = [...SUPPORTED_COUNTRIES].sort(
    (a, b) => b.code.replace(/\D/g, "").length - a.code.replace(/\D/g, "").length
  );

  // Look for a matching country code in configuration
  for (const country of sortedCountries) {
    const codeDigits = country.code.replace(/\D/g, "");
    if (digits.startsWith(codeDigits)) {
      const localPart = digits.slice(codeDigits.length);
      if (localPart.length === country.phoneLength) {
        return digits; // e.g. "919876543210" or "48123456789"
      }
    }
  }

  throw new Error("Invalid phone number format or length for country");
}

/**
 * Request OTP for user login.
 * @param {string} phone
 * @returns {Promise<{ data }>}
 */
export function requestUserOtp(phone) {
  try {
    const normalized = validateAndNormalizePhone(phone);
    return userClient.post(AUTH.USER_REQUEST_OTP, { phone: normalized });
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Verify OTP and login (user).
 * @param {string} phone
 * @param {string} otp
 */
export function verifyUserOtp(
  phone,
  otp,
  ref,
  name = null,
  fcmToken = null,
  platform = "web",
) {
  let normalized;
  try {
    normalized = validateAndNormalizePhone(phone);
  } catch (error) {
    return Promise.reject(error);
  }

  const otpStr = String(otp ?? "")
    .replace(/\D/g, "")
    .slice(0, 6);
  if (!otpStr) {
    return Promise.reject(new Error("OTP is required"));
  }
  if (otpStr.length !== 6) {
    return Promise.reject(new Error("OTP must be exactly 6 digits"));
  }
  const refValue = typeof ref === "string" ? ref.trim() : "";
  return userClient.post(AUTH.USER_VERIFY_OTP, {
    phone: normalized,
    otp: otpStr,
    ...(refValue ? { ref: refValue } : {}),
    ...(name ? { name } : {}),
    ...(fcmToken ? { fcmToken, platform } : {}),
  });
}

/**
 * Admin login (email + password).
 * Validation: email required and valid format, password required and min 6 characters.
 * Backend returns { accessToken, refreshToken, user } (key is "user" not "admin").
 */
export function adminLogin(email, password) {
  const trimmedEmail = typeof email === "string" ? email.trim() : "";
  if (!trimmedEmail) {
    return Promise.reject(new Error("Email is required"));
  }
  if (!EMAIL_REGEX.test(trimmedEmail)) {
    return Promise.reject(new Error("Please enter a valid email address"));
  }
  const passwordStr = String(password ?? "");
  if (!passwordStr) {
    return Promise.reject(new Error("Password is required"));
  }
  if (passwordStr.length < 6) {
    return Promise.reject(new Error("Password must be at least 6 characters"));
  }
  return adminClient.post(AUTH.ADMIN_LOGIN, {
    email: trimmedEmail,
    password: passwordStr,
  });
}

/**
 * Refresh access token.
 * @param {string} refreshToken
 * @returns {Promise<{ data }>} data.accessToken
 */
export function refreshToken(refreshToken) {
  if (!refreshToken)
    return Promise.reject(new Error("Refresh token is required"));
  return apiClient.post(AUTH.REFRESH_TOKEN, { refreshToken });
}

/**
 * Logout (invalidate refresh token).
 * @param {string} refreshToken
 * @param {string} fcmToken
 * @param {string} platform
 */
export function logout(refreshToken, fcmToken = null, platform = "web") {
  if (!refreshToken) return Promise.resolve({ data: { success: true } });

  const payload = { refreshToken };
  if (fcmToken) {
    payload.fcmToken = fcmToken;
    payload.platform = platform;
  }

  clearMeCache();
  return apiClient.post(AUTH.LOGOUT, payload);
}

/** 
 * Clear all local /me caches (resets on logout or new login) 
 */
export function clearMeCache() {
  meCache.clear();
  meInFlight.clear();
}

/**
 * Get current profile (requires Bearer).
 * @param {string} [module] - "user" | "admin" | "restaurant" | "delivery" (which token to send; default "user")
 */
export function getMe(module = "user") {
  const m = String(module || "user");
  // Deduplicate /me calls to avoid request storms (and accidental 429s)
  // across multiple components mounting at once.
  return getMeOnce(m);
}

// ---- /me in-flight + short cache (per module) ----
const ME_CACHE_MS = 3000;
const meCache = new Map(); // module -> { at, res }
const meInFlight = new Map(); // module -> Promise

function hasAccessToken(module) {
  try {
    return Boolean(localStorage.getItem(`${module}_accessToken`));
  } catch {
    return false;
  }
}

// module -> { at, backoffUntil }
const meBackoff = new Map();
const BACKOFF_MS = 10000; // 10s wait on 429

function getMeOnce(module) {
  const now = Date.now();
  
  // 1. Check Backoff (e.g. from previous 429)
  const backoff = meBackoff.get(module);
  if (backoff && now < backoff) {
    return Promise.reject(new Error("Rate limited. Retrying too soon."));
  }

  // 2. Check Cache
  const cached = meCache.get(module);
  if (cached && now - cached.at < ME_CACHE_MS) {
    return Promise.resolve(cached.res);
  }

  // 3. Check Auth Status
  if (!hasAccessToken(module)) {
    return Promise.reject(new Error("Not authenticated"));
  }

  // 4. Return In-Flight Promise
  const existing = meInFlight.get(module);
  if (existing) return existing;

  const clients = {
    user: userClient,
    restaurant: restaurantClient,
    delivery: deliveryClient,
    admin: adminClient,
  };
  const client = clients[module] || apiClient;

  const p = client
    .get(AUTH.ME)
    .then((res) => {
      meCache.set(module, { at: Date.now(), res });
      return res;
    })
    .catch((err) => {
      if (err?.response?.status === 429) {
        meBackoff.set(module, Date.now() + BACKOFF_MS);
      }
      throw err;
    })
    .finally(() => {
      meInFlight.delete(module);
    });

  meInFlight.set(module, p);
  return p;
}

/**
 * Restaurant OTP auth (backend: same phone format as user, 6-digit OTP e.g. 123456).
 */
export function requestRestaurantOtp(phone) {
  try {
    const normalized = validateAndNormalizePhone(phone);
    return restaurantClient.post(AUTH.RESTAURANT_REQUEST_OTP, { phone: normalized });
  } catch (error) {
    return Promise.reject(error);
  }
}

export function verifyRestaurantOtp(phone, otp, fcmToken = null, platform = "web") {
  let normalized;
  try {
    normalized = validateAndNormalizePhone(phone);
  } catch (error) {
    return Promise.reject(error);
  }
  const otpStr = String(otp).replace(/\D/g, "").slice(0, 6);
  if (otpStr.length < 6) {
    return Promise.reject(new Error("6-digit OTP is required"));
  }
  return restaurantClient.post(AUTH.RESTAURANT_VERIFY_OTP, {
    phone: normalized,
    otp: otpStr,
    ...(fcmToken ? { fcmToken, platform } : {}),
  });
}

/**
 * Delivery partner OTP auth (backend: same phone + 6-digit OTP).
 */
export function requestDeliveryOtp(phone) {
  try {
    const normalized = validateAndNormalizePhone(phone);
    return deliveryClient.post(AUTH.DELIVERY_REQUEST_OTP, { phone: normalized });
  } catch (error) {
    return Promise.reject(error);
  }
}

export function verifyDeliveryOtp(phone, otp, fcmToken = null, platform = "web") {
  let normalized;
  try {
    normalized = validateAndNormalizePhone(phone);
  } catch (error) {
    return Promise.reject(error);
  }
  const otpStr = String(otp).replace(/\D/g, "").slice(0, 6);
  if (otpStr.length < 6) {
    return Promise.reject(new Error("6-digit OTP is required"));
  }
  return deliveryClient.post(AUTH.DELIVERY_VERIFY_OTP, {
    phone: normalized,
    otp: otpStr,
    ...(fcmToken ? { fcmToken, platform } : {}),
  });
}
