import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'ndjdhjhdasdjdhasdjadaskdjasndaskdjadasndaskdjsndaskdjasdkasnddjkdndkjdnda';

const token = jwt.sign(
    { userId: new mongoose.Types.ObjectId().toString(), role: 'ADMIN' },
    JWT_ACCESS_SECRET,
    { expiresIn: '1h' }
);
console.log(token);
