import { z } from 'zod';
import { ValidationError } from '../../core/auth/errors.js';

const genderEnum = z.enum(['male', 'female', 'other', 'prefer-not-to-say']);

const isoDate = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (expected YYYY-MM-DD)');

const schema = z.object({
    name: z.string().max(200).optional(),
    email: z.union([z.string().email().max(200), z.literal('')]).optional(),
    phone: z.string().max(30).optional(),
    profileImage: z.string().max(2000).optional(),
    dateOfBirth: z.union([isoDate, z.literal(''), z.null()]).optional(),
    anniversary: z.union([isoDate, z.literal(''), z.null()]).optional(),
    gender: z.union([genderEnum, z.literal('')]).optional()
});

export const validateUserProfileUpdateDto = (body) => {
    const result = schema.safeParse(body ?? {});
    if (!result.success) {
        const msg = result.error.errors[0]?.message || 'Invalid profile data';
        throw new ValidationError(msg);
    }
    return result.data;
};

