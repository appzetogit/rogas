import crypto from "crypto";
import ms from "ms";
import { FoodUser } from "../users/user.model.js";
import { FoodAdmin } from "../admin/admin.model.js";
import { AdminResetOtp } from "../admin/adminResetOtp.model.js";
import { FoodRestaurant } from "../../modules/food/restaurant/models/restaurant.model.js";
import { FoodDeliveryPartner } from "../../modules/food/delivery/models/deliveryPartner.model.js";
import { FoodReferralSettings } from "../../modules/food/admin/models/referralSettings.model.js";
import { FoodReferralLog } from "../../modules/food/admin/models/referralLog.model.js";
import { createOrUpdateOtp, verifyOtp } from "../otp/otp.service.js";
import { signAccessToken, signRefreshToken } from "./token.util.js";
import { FoodRefreshToken } from "../refreshTokens/refreshToken.model.js";
import { ValidationError, AuthError } from "./errors.js";
import { config } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { sendAdminResetOtpEmail } from "../../utils/email.js";
import mongoose from "mongoose";
import { creditReferralReward } from "../../modules/food/user/services/userWallet.service.js";
import { getCurrentRestaurantProfile } from "../../modules/food/restaurant/services/restaurant.service.js";

const ROLES = {
  USER: "USER",
  RESTAURANT: "RESTAURANT",
  DELIVERY_PARTNER: "DELIVERY_PARTNER",
  ADMIN: "ADMIN",
};

const toSafeImageUrl = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return value.url || value.secure_url || "";
  return "";
};

const sanitizeUserForAuthResponse = (userDoc = {}) => {
  const id = userDoc?._id?.toString?.() || userDoc?.id?.toString?.() || userDoc?._id || userDoc?.id || null;
  return {
    id,
    _id: id,
    name: userDoc?.name || "",
    phone: userDoc?.phone || "",
    email: userDoc?.email || "",
    role: userDoc?.role || ROLES.USER,
    isVerified: Boolean(userDoc?.isVerified),
    isActive: userDoc?.isActive !== false,
    profileImage: toSafeImageUrl(userDoc?.profileImage),
    gender: userDoc?.gender || null,
    referralCode: userDoc?.referralCode || "",
    refCode: userDoc?.referralCode || "",
    referralCount: Number(userDoc?.referralCount || 0),
    walletAmount: Number(userDoc?.walletAmount || 0),
  };
};

const sanitizeRestaurantForAuthResponse = (restaurantDoc = {}) => {
  const id =
    restaurantDoc?._id?.toString?.() ||
    restaurantDoc?.id?.toString?.() ||
    restaurantDoc?._id ||
    restaurantDoc?.id ||
    null;

  return {
    id,
    _id: id,
    name: restaurantDoc?.restaurantName || restaurantDoc?.name || "",
    restaurantName: restaurantDoc?.restaurantName || "",
    phone: restaurantDoc?.ownerPhone || restaurantDoc?.primaryContactNumber || "",
    email: restaurantDoc?.ownerEmail || "",
    status: restaurantDoc?.status || "",
    vendorType: restaurantDoc?.vendorType || "restaurant",
    profileImage: toSafeImageUrl(restaurantDoc?.profileImage),
    createdAt: restaurantDoc?.createdAt,
  };
};

const sanitizeDeliveryForAuthResponse = (deliveryDoc = {}) => {
  const id =
    deliveryDoc?._id?.toString?.() ||
    deliveryDoc?.id?.toString?.() ||
    deliveryDoc?._id ||
    deliveryDoc?.id ||
    null;

  return {
    id,
    _id: id,
    name: deliveryDoc?.name || "",
    phone: deliveryDoc?.phone || "",
    email: deliveryDoc?.email || "",
    status: deliveryDoc?.status || "",
    profileImage: toSafeImageUrl(deliveryDoc?.profilePhoto),
    walletAmount: Number(deliveryDoc?.walletAmount || 0),
    refCode: deliveryDoc?.referralCode || "",
    createdAt: deliveryDoc?.createdAt,
  };
};

const validatePhoneCountryAndLength = (phone) => {
  if (!phone) {
    throw new ValidationError("Phone is required");
  }

  // Strip all non-digits
  const digits = String(phone).replace(/\D/g, "");

  // Comprehensive map of major country codes to expected local phone number lengths
  const dialCodeLengthMap = {
    "1": 10, "7": 10, "20": 10, "27": 9, "30": 10, "31": 9, "32": 9, "33": 9, "34": 9, "351": 9,
    "352": 9, "353": 9, "354": 7, "355": 9, "356": 8, "357": 8, "358": 9, "359": 9, "36": 9,
    "370": 8, "371": 8, "372": 7, "374": 8, "375": 9, "376": 6, "377": 8, "380": 9, "381": 9,
    "382": 8, "385": 9, "386": 8, "387": 8, "389": 8, "39": 10, "40": 9, "41": 9, "420": 9,
    "421": 9, "423": 7, "43": 10, "44": 10, "45": 8, "46": 9, "47": 8, "48": 9, "49": 10,
    "51": 9, "52": 10, "53": 8, "54": 10, "55": 11, "56": 9, "57": 10, "58": 10, "60": 9,
    "61": 9, "62": 10, "63": 10, "64": 9, "65": 8, "66": 9, "81": 10, "82": 10, "84": 9,
    "86": 11, "90": 10, "91": 10, "92": 10, "93": 9, "94": 9, "95": 9, "98": 10, "212": 9,
    "213": 9, "220": 7, "221": 9, "222": 8, "223": 8, "224": 8, "226": 8, "228": 8, "229": 8,
    "230": 7, "231": 7, "233": 9, "234": 10, "240": 9, "241": 7, "242": 9, "244": 9, "250": 9,
    "251": 9, "252": 9, "254": 9, "255": 9, "256": 9, "258": 9, "260": 9, "261": 9, "263": 9,
    "264": 8, "265": 9, "266": 8, "267": 8, "269": 7, "291": 7, "501": 7, "502": 8, "503": 8,
    "504": 8, "505": 8, "506": 8, "507": 8, "591": 8, "592": 7, "593": 9, "595": 9, "598": 8,
    "880": 10, "886": 9, "960": 7, "961": 8, "962": 9, "964": 10, "965": 8, "966": 9, "967": 9,
    "968": 8, "971": 9, "972": 9, "973": 8, "975": 8, "976": 8, "977": 10, "992": 9, "993": 8,
    "994": 9, "995": 9, "996": 9, "998": 9
  };

  const sortedCodes = Object.keys(dialCodeLengthMap).sort((a, b) => b.length - a.length);

  for (const code of sortedCodes) {
    if (digits.startsWith(code)) {
      const localPart = digits.slice(code.length);
      const expectedLength = dialCodeLengthMap[code];
      if (localPart.length === expectedLength) {
        return; // Valid!
      }
      throw new ValidationError(`Invalid phone number length for country code +${code}. Expected ${expectedLength} digits, but got ${localPart.length}.`);
    }
  }

  // For backward compatibility (if a 10-digit number without country code is passed)
  if (digits.length === 10) {
    return; // Valid (implied India)
  }

  // Fallback for unmapped codes
  if (digits.length >= 8 && digits.length <= 15) {
    return; // Valid fallback
  }

  throw new ValidationError("Invalid phone number format or unsupported country code prefix.");
};

export const checkPhoneConflict = async (phone, expectedRole) => {
  // Cross-role conflict checks removed to allow the same mobile number 
  // to be used independently for Customer, Vendor, and Delivery Partner accounts.
  return;
};

export const checkPhoneAlreadyExists = async (phone, role) => {
  if (!phone) return false;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return false;
  const last10 = digits.slice(-10);
  const candidates = [phone, digits, last10].filter(Boolean);

  if (role === "USER") {
    const userQuery = {
      $or: [
        { phone: { $in: candidates } },
        ...(last10 ? [{ phone: { $regex: new RegExp(last10 + "$") } }] : [])
      ]
    };
    const user = await FoodUser.findOne(userQuery).lean();
    return !!user;
  }

  if (role === "RESTAURANT") {
    const phoneOrFields = (field) => [
      { [field]: { $in: candidates } },
      ...(last10 ? [{ [field]: { $regex: new RegExp(last10 + "$") } }] : []),
    ];
    const restaurant = await FoodRestaurant.findOne({
      $or: [
        ...phoneOrFields("ownerPhone"),
        ...phoneOrFields("primaryContactNumber"),
        ...phoneOrFields("ownerPhoneDigits"),
        ...phoneOrFields("ownerPhoneLast10"),
      ],
    }).lean();
    return restaurant && restaurant.status !== 'rejected';
  }

  if (role === "DELIVERY_PARTNER") {
    const deliveryPartner = await FoodDeliveryPartner.findOne({
      $or: [
        { phone: { $in: candidates } },
        ...(last10 ? [{ phone: { $regex: new RegExp(last10 + "$") } }] : [])
      ]
    }).lean();
    return deliveryPartner && deliveryPartner.status !== 'rejected';
  }

  return false;
};

export const requestUserOtp = async (phone) => {
  validatePhoneCountryAndLength(phone);
  await checkPhoneConflict(phone, "USER");

  const otp = await createOrUpdateOtp(phone);
  // TODO: integrate SMS provider here
  const shouldExposeOtp =
    config.nodeEnv !== "production" || config.useDefaultOtp;
  return shouldExposeOtp ? { otp } : {};
};

export const verifyUserOtpAndLogin = async (
  phone,
  otp,
  ref,
  fcmToken,
  platform,
  name,
) => {
  validatePhoneCountryAndLength(phone);
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const existingUser = await FoodUser.findOne({ phone });

  // For first-time signup, require name before OTP verification so OTP is not consumed prematurely.
  if (!existingUser && !trimmedName) {
    throw new ValidationError("Name is required for first-time signup");
  }

  const result = await verifyOtp(phone, otp);

  if (!result.valid) {
    throw new AuthError(result.reason || "OTP verification failed");
  }

  let userDoc = existingUser;
  
  // Ensure user exists and mark as verified on successful OTP.
  // Check if user is new or hasn't provided a name yet
  const needsNamePrompt = !userDoc || !userDoc.name || String(userDoc.name).trim() === "" || String(userDoc.name).toLowerCase() === "null";
  const isNewUser = needsNamePrompt;

  if (!userDoc) {
    userDoc = await FoodUser.create({
      phone,
      isVerified: true,
      name: trimmedName,
    });
  } else {
    let needsSave = false;
    if (!userDoc.isVerified) {
      userDoc.isVerified = true;
      needsSave = true;
    }
    if (trimmedName && !userDoc.name) {
      userDoc.name = trimmedName;
      needsSave = true;
    }
    if (needsSave) await userDoc.save();
  }

  // Block login for deactivated users
  if (userDoc.isActive === false) {
    throw new AuthError(
      "Your account has been deactivated. Please contact support.",
    );
  }

  // Update FCM token if provided
  if (fcmToken) {
    let isModified = false;
    if (platform === "mobile") {
      if (!userDoc.fcmTokenMobile) userDoc.fcmTokenMobile = [];
      if (!userDoc.fcmTokenMobile.includes(fcmToken)) {
        userDoc.fcmTokenMobile.push(fcmToken);
        isModified = true;
      }
    } else {
      // Default to web if not explicitly mobile
      if (!userDoc.fcmTokens) userDoc.fcmTokens = [];
      if (!userDoc.fcmTokens.includes(fcmToken)) {
        userDoc.fcmTokens.push(fcmToken);
        isModified = true;
      }
    }
    if (isModified) {
      await userDoc.save();
    }
  }

  // Ensure referralCode exists (used for share links on older accounts).
  if (!userDoc.referralCode) {
    userDoc.referralCode = String(userDoc._id);
    await userDoc.save();
  }

  // Referral crediting: only for brand new accounts.
  const refRaw = typeof ref === "string" ? String(ref).trim() : "";
  if (isNewUser && refRaw) {
    try {
      if (mongoose.Types.ObjectId.isValid(refRaw)) {
        const referrerId = new mongoose.Types.ObjectId(refRaw);
        if (String(referrerId) !== String(userDoc._id)) {
          const [referrer, settingsDoc] = await Promise.all([
            FoodUser.findById(referrerId).select("_id referralCount").lean(),
            FoodReferralSettings.findOne({ isActive: true })
              .sort({ createdAt: -1 })
              .lean(),
          ]);

          if (referrer && settingsDoc) {
            const reward = Math.max(
              0,
              Number(settingsDoc.referralRewardUser) || 0,
            );
            const limit = Math.max(
              0,
              Number(settingsDoc.referralLimitUser) || 0,
            );

            if (
              reward > 0 &&
              limit > 0 &&
              Number(referrer.referralCount || 0) < limit
            ) {
              userDoc.referredBy = referrerId;
              await userDoc.save();

              const log = await FoodReferralLog.create({
                referrerId,
                refereeId: userDoc._id,
                role: "USER",
                rewardAmount: reward,
                status: "credited",
              });

              await Promise.all([
                FoodUser.updateOne(
                  { _id: referrerId },
                  { $inc: { referralCount: 1 } },
                ),
                creditReferralReward(referrerId, reward, {
                  role: "USER",
                  refereeId: String(userDoc._id),
                  referralLogId: String(log._id),
                }),
              ]);
            } else {
              await FoodReferralLog.create({
                referrerId,
                refereeId: userDoc._id,
                role: "USER",
                rewardAmount: reward,
                status: "rejected",
                reason:
                  reward <= 0
                    ? "reward_disabled"
                    : limit <= 0
                      ? "limit_disabled"
                      : "limit_reached",
              });
            }
          }
        }
      }
    } catch (e) {
      // Never fail login due to referral errors.
      logger?.warn?.({ err: e }, "Referral crediting failed (user)");
    }
  }

  const user = userDoc.toObject();
  const payload = { userId: user._id.toString(), role: user.role || "USER" };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const ttlMs = ms(config.jwtRefreshExpiresIn || "7d");
  const expiresAt = new Date(Date.now() + ttlMs);

  await FoodRefreshToken.create({
    userId: user._id,
    token: refreshToken,
    expiresAt,
  });

  return {
    token: accessToken,
    accessToken,
    refreshToken,
    user: sanitizeUserForAuthResponse(user),
    isNewUser,
  };
};

export const adminLogin = async (email, password) => {
  if (!email || !password) {
    throw new ValidationError("Email and password are required");
  }

  const admin = await FoodAdmin.findOne({ email });
  if (!admin) {
    throw new AuthError("Invalid credentials");
  }

  const isMatch = await admin.comparePassword(password);
  if (!isMatch) {
    throw new AuthError("Invalid credentials");
  }

  const payload = { userId: admin._id.toString(), role: admin.role };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const ttlMs = ms(config.jwtRefreshExpiresIn || "7d");
  const expiresAt = new Date(Date.now() + ttlMs);

  await FoodRefreshToken.create({
    userId: admin._id,
    token: refreshToken,
    expiresAt,
  });

  const userObj = admin.toObject();
  delete userObj.password;
  return { accessToken, refreshToken, user: userObj };
};

export const requestRestaurantOtp = async (phone) => {
  validatePhoneCountryAndLength(phone);
  await checkPhoneConflict(phone, "RESTAURANT");
  const otp = await createOrUpdateOtp(phone);
  // Only expose OTP in response when in default/dev mode — never in production with real SMS
  const shouldExposeOtp =
    config.nodeEnv !== "production" || config.useDefaultOtp;
  return shouldExposeOtp ? { otp } : {};
};

export const verifyRestaurantOtpAndLogin = async (phone, otp, fcmToken, platform) => {
  validatePhoneCountryAndLength(phone);
  const result = await verifyOtp(phone, otp);
  if (!result.valid) {
    throw new AuthError(result.reason || "OTP verification failed");
  }

  // Restaurants may store ownerPhone with country code or formatting, or normalized fields.
  // Match by exact phone, last-10 digits, suffix match, or normalized fields to avoid false "needsRegistration".
  const digits = String(phone || "").replace(/\D/g, "");
  const last10 = digits.slice(-10);
  const phoneCandidates = [phone, digits, last10].filter(Boolean);
  const phoneOrFields = (field) => [
    { [field]: { $in: phoneCandidates } },
    ...(last10 ? [{ [field]: { $regex: new RegExp(last10 + "$") } }] : []),
  ];

  const restaurant = await FoodRestaurant.findOne({
    $or: [
      ...phoneOrFields("ownerPhone"),
      ...phoneOrFields("primaryContactNumber"),
      ...phoneOrFields("ownerPhoneDigits"),
      ...phoneOrFields("ownerPhoneLast10"),
    ],
  });
    const restaurantDoc = restaurant;
    if (!restaurantDoc) {
      return {
        needsRegistration: true,
        phone,
      };
    }

  // Update FCM token if provided
  if (fcmToken) {
    let isModified = false;
    if (platform === "mobile") {
      if (!restaurantDoc.fcmTokenMobile) restaurantDoc.fcmTokenMobile = [];
      if (!restaurantDoc.fcmTokenMobile.includes(fcmToken)) {
        restaurantDoc.fcmTokenMobile.push(fcmToken);
        isModified = true;
      }
    } else {
      if (!restaurantDoc.fcmTokens) restaurantDoc.fcmTokens = [];
      if (!restaurantDoc.fcmTokens.includes(fcmToken)) {
        restaurantDoc.fcmTokens.push(fcmToken);
        isModified = true;
      }
    }
    if (isModified) {
      await restaurantDoc.save();
    }
  }

  // If restaurant approval status is used, handle pending/rejected states by returning info instead of throwing errors.
  // Legacy restaurants created before this feature was rolled out (May 26, 2026) bypass this block.
  const isLegacyRestaurant = restaurantDoc.createdAt && new Date(restaurantDoc.createdAt) < new Date("2026-05-26T00:00:00Z");
  if (restaurantDoc.status && restaurantDoc.status !== "approved" && !isLegacyRestaurant) {
    return {
      pendingApproval: true,
      status: restaurantDoc.status,
      isRejected: restaurantDoc.status === "rejected",
      rejectionReason: restaurantDoc.rejectionReason || null,
      restaurantName: restaurantDoc.restaurantName,
      phone,
    };
  }

  const payload = { userId: restaurantDoc._id.toString(), role: ROLES.RESTAURANT };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const ttlMs = ms(config.jwtRefreshExpiresIn || "7d");
  const expiresAt = new Date(Date.now() + ttlMs);

  await FoodRefreshToken.create({
    userId: restaurantDoc._id,
    token: refreshToken,
    expiresAt,
  });

  return {
    token: accessToken,
    accessToken,
    refreshToken,
    user: sanitizeRestaurantForAuthResponse(restaurantDoc?.toObject?.() || restaurantDoc),
    needsRegistration: false,
  };
};

export const requestDeliveryOtp = async (phone) => {
  validatePhoneCountryAndLength(phone);
  await checkPhoneConflict(phone, "DELIVERY_PARTNER");
  const otp = await createOrUpdateOtp(phone);
  // Only expose OTP in response when in default/dev mode — never in production with real SMS
  const shouldExposeOtp =
    config.nodeEnv !== "production" || config.useDefaultOtp;
  return shouldExposeOtp ? { otp } : {};
};

const normalizePhoneForDelivery = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.slice(-10) || null;
};

export const verifyDeliveryOtpAndLogin = async (phone, otp, fcmToken, platform) => {
  validatePhoneCountryAndLength(phone);
  const result = await verifyOtp(phone, otp);
  if (!result.valid) {
    throw new AuthError(result.reason || "OTP verification failed");
  }

  const normalized = normalizePhoneForDelivery(phone);
  if (!normalized) {
    return { needsRegistration: true, phone };
  }

  const deliveryPartner = await FoodDeliveryPartner.findOne({
    $or: [
      { phone: normalized },
      { phone: { $regex: new RegExp(normalized + "$") } },
    ],
  });

  if (!deliveryPartner) {
    return { needsRegistration: true, phone };
  }

  // Update FCM token if provided - CRITICAL: do this BEFORE returning pendingApproval
  // so we can notify them when approved.
  if (fcmToken) {
    let isModified = false;
    if (platform === "mobile") {
      if (!deliveryPartner.fcmTokenMobile) deliveryPartner.fcmTokenMobile = [];
      if (!deliveryPartner.fcmTokenMobile.includes(fcmToken)) {
        deliveryPartner.fcmTokenMobile.push(fcmToken);
        isModified = true;
      }
    } else {
      if (!deliveryPartner.fcmTokens) deliveryPartner.fcmTokens = [];
      if (!deliveryPartner.fcmTokens.includes(fcmToken)) {
        deliveryPartner.fcmTokens.push(fcmToken);
        isModified = true;
      }
    }
    if (isModified) {
      await deliveryPartner.save();
    }
  }

  // Bypass for legacy delivery partners created before this feature was rolled out.
  const isLegacyDelivery = deliveryPartner.createdAt && new Date(deliveryPartner.createdAt) < new Date("2026-05-26T00:00:00Z");
  if (deliveryPartner.status && deliveryPartner.status !== "approved" && !isLegacyDelivery) {
    const isRejected = deliveryPartner.status === "rejected";
    return {
      pendingApproval: true,
      isRejected,
      rejectionReason: isRejected ? deliveryPartner.rejectionReason : null,
      message:
        isRejected
          ? (deliveryPartner.rejectionReason 
              ? `Your account was rejected: ${deliveryPartner.rejectionReason}`
              : "Your delivery account was not approved. Please contact support.")
          : "Your account is pending admin verification. You will be notified once approved.",
    };
  }

  const payload = {
    userId: deliveryPartner._id.toString(),
    role: ROLES.DELIVERY_PARTNER,
  };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const ttlMs = ms(config.jwtRefreshExpiresIn || "7d");
  const expiresAt = new Date(Date.now() + ttlMs);

  await FoodRefreshToken.create({
    userId: deliveryPartner._id,
    token: refreshToken,
    expiresAt,
  });

  return {
    token: accessToken,
    accessToken,
    refreshToken,
    user: sanitizeDeliveryForAuthResponse(
      deliveryPartner?.toObject?.() || deliveryPartner,
    ),
    needsRegistration: false,
  };
};

export const logout = async (refreshToken, fcmToken, platform) => {
  if (!refreshToken) {
    throw new ValidationError("Refresh token is required");
  }

  // 1. Remove specific FCM token from ALL collections if provided
  if (fcmToken) {
    console.log(`[FCM-Logout] Starting logout-driven token removal: platform=${platform}, tokenPreview=${fcmToken?.slice(0, 10)}...`);
    
    // We try to remove the token from all 4 possible models regardless of the user ID, 
    // ensuring no stale connections are left across any role or app the user was logged into.
    const models = [FoodUser, FoodRestaurant, FoodDeliveryPartner, FoodAdmin];
    
    try {
      await Promise.all(
        models.map((model) =>
          model.updateMany(
            { $or: [{ fcmTokens: fcmToken }, { fcmTokenMobile: fcmToken }] },
            { $pull: { fcmTokens: fcmToken, fcmTokenMobile: fcmToken } },
          ),
        ),
      );
      console.log("[FCM-Logout] Token removed from all collections successfully");
    } catch (err) {
      logger.warn({ err }, "Failed to remove FCM token from all collections during logout");
    }
  }

  // 2. Invalidate the refresh token (standard logout procedure)
  const deleted = await FoodRefreshToken.deleteOne({ token: refreshToken });
  return { invalidated: deleted.deletedCount > 0 };
};

export const getProfile = async (userId, role) => {
  if (!userId || !role) {
    throw new AuthError("Invalid token payload");
  }
  let profile = null;
  const id = userId;

  switch (role) {
    case ROLES.USER:
      profile = await FoodUser.findById(id).lean();
      break;
    case ROLES.ADMIN:
      profile = await FoodAdmin.findById(id).select("-password").lean();
      break;
    case ROLES.RESTAURANT:
      profile = await getCurrentRestaurantProfile(id);
      break;
    case ROLES.DELIVERY_PARTNER: {
      const partner = await FoodDeliveryPartner.findById(id).lean();
      if (!partner) break;
      const deliveryId = partner._id
        ? `DP-${partner._id.toString().slice(-8).toUpperCase()}`
        : null;
      profile = {
        ...partner,
        email: partner.email || null,
        deliveryId,
        status: partner.status === "rejected" ? "blocked" : partner.status,
        profileImage: partner.profilePhoto
          ? { url: partner.profilePhoto }
          : null,
        documents: {
          aadhar:
            partner.aadharPhoto || partner.aadharNumber
              ? {
                  number: partner.aadharNumber || null,
                  document: partner.aadharPhoto || null,
                }
              : null,
          pan:
            partner.panPhoto || partner.panNumber
              ? {
                  number: partner.panNumber || null,
                  document: partner.panPhoto || null,
                }
              : null,
          drivingLicense: partner.drivingLicensePhoto || partner.drivingLicenseNumber
            ? {
                number: partner.drivingLicenseNumber || null,
                document: partner.drivingLicensePhoto || null,
              }
            : null,
          bankDetails:
            partner.bankAccountHolderName ||
            partner.bankAccountNumber ||
            partner.bankIfscCode ||
            partner.bankName ||
            partner.upiId ||
            partner.upiQrCode
              ? {
                  accountHolderName: partner.bankAccountHolderName || null,
                  accountNumber: partner.bankAccountNumber || null,
                  ifscCode: partner.bankIfscCode || null,
                  bankName: partner.bankName || null,
                  upiId: partner.upiId || null,
                  upiQrCode: partner.upiQrCode || null,
                }
              : null,
        },
        location:
          partner.address || partner.city || partner.state
            ? {
                addressLine1: partner.address,
                city: partner.city,
                state: partner.state,
              }
            : null,
        vehicle:
          partner.vehicleType || partner.vehicleName || partner.vehicleNumber
            ? {
                type: partner.vehicleType,
                brand: partner.vehicleName,
                model: partner.vehicleName,
                number: partner.vehicleNumber,
              }
            : null,
      };
      break;
    }
    default:
      throw new AuthError("Unknown role");
  }

  if (!profile) {
    throw new AuthError("Profile not found");
  }
  return { user: profile };
};

const ADMIN_SERVICES_ALLOWED = ["food", "quickCommerce", "taxi"];

/** Update admin profile (name, email, phone, profileImage). Only for ADMIN role. */
export const updateAdminProfile = async (userId, body) => {
  if (!userId) {
    throw new AuthError("Invalid token payload");
  }
  const admin = await FoodAdmin.findById(userId);
  if (!admin) {
    throw new AuthError("Profile not found");
  }
  if (body.name !== undefined) admin.name = String(body.name || "").trim();
  if (body.email !== undefined) {
    const normalizedEmail = String(body.email || "")
      .trim()
      .toLowerCase();
    if (!normalizedEmail) {
      throw new ValidationError("Email is required");
    }
    if (normalizedEmail !== admin.email) {
      const duplicateAdmin = await FoodAdmin.findOne({
        _id: { $ne: admin._id },
        email: normalizedEmail,
      })
        .select("_id")
        .lean();
      if (duplicateAdmin) {
        throw new ValidationError("Email is already in use");
      }
    }
    admin.email = normalizedEmail;
  }
  if (body.phone !== undefined) admin.phone = String(body.phone || "").trim();
  if (body.profileImage !== undefined)
    admin.profileImage = String(body.profileImage || "").trim();
  // Normalize servicesAccess so legacy values (e.g. 'zomato') don't fail schema validation on save
  if (Array.isArray(admin.servicesAccess)) {
    const valid = admin.servicesAccess.filter((s) =>
      ADMIN_SERVICES_ALLOWED.includes(s),
    );
    admin.servicesAccess = valid.length ? valid : ["food"];
  } else {
    admin.servicesAccess = ["food"];
  }
  await admin.save();
  const profile = admin.toObject();
  delete profile.password;
  return { user: profile };
};

/** Change admin password. Only for ADMIN role. */
export const changeAdminPassword = async (
  userId,
  currentPassword,
  newPassword,
) => {
  if (!userId) {
    throw new AuthError("Invalid token payload");
  }
  const admin = await FoodAdmin.findById(userId);
  if (!admin) {
    throw new AuthError("Profile not found");
  }
  const isMatch = await admin.comparePassword(currentPassword);
  if (!isMatch) {
    throw new AuthError("Current password is incorrect");
  }
  if (!newPassword || String(newPassword).length < 6) {
    throw new ValidationError("New password must be at least 6 characters");
  }
  admin.password = newPassword;
  await admin.save();

  try {
    const { notifyAdminsSafely } = await import("../../core/notifications/firebase.service.js");
    void notifyAdminsSafely({
      title: "Security Alert: Password Changed 🔐",
      body: `The password for admin account ${admin.email} has been changed. If this was not you, please contact support immediately.`,
      data: {
        type: "security_alert",
        subType: "password_change",
        email: admin.email
      }
    });
  } catch (e) {
    console.error("Failed to notify admins of password change:", e);
  }

  return { success: true };
};

/** Admin forgot password: request OTP. Only accepts email that is registered as admin. */
export const requestAdminForgotPasswordOtp = async (email) => {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  if (!normalizedEmail) {
    throw new ValidationError("Email is required");
  }

  const admin = await FoodAdmin.findOne({ email: normalizedEmail });
  if (!admin) {
    throw new AuthError("This email is not registered as an admin account.");
  }

  const otp = config.useDefaultOtp
    ? "123456"
    : String(crypto.randomInt(100000, 999999));
  const ttlMs = (config.otpExpiryMinutes || 10) * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);

  await AdminResetOtp.findOneAndUpdate(
    { email: normalizedEmail },
    { otp, expiresAt, attempts: 0 },
    { upsert: true, new: true },
  );

  if (config.useDefaultOtp) {
    logger.info(`Admin reset OTP for ${normalizedEmail}: ${otp}`);
  }

  const sent = await sendAdminResetOtpEmail(normalizedEmail, otp);
  if (!sent && !config.useDefaultOtp) {
    logger.warn(
      `Admin OTP not sent by email to ${normalizedEmail}; check SMTP config.`,
    );
  }

  return {
    success: true,
    message: "If this email is registered, you will receive an OTP shortly.",
  };
};

/** Admin forgot password: verify OTP and set new password in one call. */
export const resetAdminPasswordWithOtp = async (email, otp, newPassword) => {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const otpStr = String(otp || "").replace(/\D/g, "");
  if (!normalizedEmail || !otpStr) {
    throw new ValidationError("Email and OTP are required");
  }
  if (!newPassword || String(newPassword).length < 6) {
    throw new ValidationError("New password must be at least 6 characters");
  }

  const record = await AdminResetOtp.findOne({ email: normalizedEmail });
  if (!record) {
    throw new AuthError("OTP not found or expired. Please request a new code.");
  }
  if (record.expiresAt < new Date()) {
    await record.deleteOne();
    throw new AuthError("OTP has expired. Please request a new code.");
  }
  if (record.attempts >= (config.otpMaxAttempts || 5)) {
    throw new AuthError("Too many attempts. Please request a new code.");
  }
  record.attempts += 1;
  if (record.otp !== otpStr) {
    await record.save();
    throw new AuthError("Invalid OTP.");
  }

  const admin = await FoodAdmin.findOne({ email: normalizedEmail });
  if (!admin) {
    await record.deleteOne();
    throw new AuthError("Account not found.");
  }

  admin.password = newPassword;
  await admin.save();
  await record.deleteOne();

  try {
    const { notifyAdminsSafely } = await import("../../core/notifications/firebase.service.js");
    void notifyAdminsSafely({
      title: "Security Alert: Password Reset Successful 🔐",
      body: `The password for admin account ${admin.email} has been reset via OTP.`,
      data: {
        type: "security_alert",
        subType: "password_reset",
        email: admin.email
      }
    });
  } catch (e) {
    console.error("Failed to notify admins of password reset:", e);
  }

  return { success: true, message: "Password reset successfully." };
};

export const refreshAccessToken = async (token) => {
  if (!token) {
    throw new ValidationError("Refresh token is required");
  }

  const stored = await FoodRefreshToken.findOne({ token }).lean();
  if (!stored) {
    throw new AuthError("Invalid refresh token");
  }

  const jwt = await import("jsonwebtoken");
  let payload;
  try {
    payload = jwt.default.verify(token, config.jwtRefreshSecret);
  } catch {
    throw new AuthError("Invalid refresh token");
  }

  // If deactivated user, do not issue fresh access tokens (forces logout on client)
  if (payload?.role === "USER") {
    const u = await FoodUser.findById(payload.userId).select("isActive").lean();
    if (!u || u.isActive === false) {
      throw new AuthError("User account is deactivated");
    }
  }

  const newAccessToken = signAccessToken({
    userId: payload.userId,
    role: payload.role,
  });

  return { accessToken: newAccessToken, refreshToken: token };
};
