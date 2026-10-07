import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env.js';

export const signAccessToken = (payload, expiresIn = config.jwtAccessExpiresIn) => {
    return jwt.sign(payload, config.jwtAccessSecret, { expiresIn });
};

export const signRefreshToken = (payload) => {
    // Every refresh token is unique (jti). Without it two tokens made for the same person in the same second were
    // identical text, and the second one failed on the unique index (a 500 while several tabs renewed at once).
    return jwt.sign(payload, config.jwtRefreshSecret, {
        expiresIn: config.jwtRefreshExpiresIn,
        jwtid: crypto.randomUUID()
    });
};

export const verifyAccessToken = (token) => {
    return jwt.verify(token, config.jwtAccessSecret);
};

export const verifyRefreshToken = (token) => {
    return jwt.verify(token, config.jwtRefreshSecret);
};

