import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const authClient = axios.create({
    baseURL: `${baseURL}/dmb`,
    headers: {
        'Content-Type': 'application/json'
    }
});

export const sendOfficeOtpApi = (email) => {
    return authClient.post('/office/auth/send-otp', { email });
};

export const loginOfficeAccountApi = (email, password) => {
    return authClient.post('/office/auth/login', { email, password });
};

export const registerOfficeAccountApi = (email, password, otp) => {
    return authClient.post('/office/auth/register', { email, password, otp });
};

export const requestPasswordResetApi = (email) => {
    return authClient.post('/office/auth/forgot-password', { email });
};

export const resetPasswordApi = (email, otp, newPassword) => {
    return authClient.post('/office/auth/reset-password', { email, otp, newPassword });
};
