import jwt from 'jsonwebtoken';
import { config } from '../../config/env.js';

export const signAccessToken = (payload, expiresIn = config.jwtAccessExpiresIn) => {
    return jwt.sign(payload, config.jwtAccessSecret, { expiresIn });
};

export const signRefreshToken = (payload) => {
    return jwt.sign(payload, config.jwtRefreshSecret, {
        expiresIn: config.jwtRefreshExpiresIn
    });
};

export const verifyAccessToken = (token) => {
    return jwt.verify(token, config.jwtAccessSecret);
};

export const verifyRefreshToken = (token) => {
    return jwt.verify(token, config.jwtRefreshSecret);
};

