import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const authClient = axios.create({
    baseURL: `${baseURL}/dmb`,
    headers: {
        'Content-Type': 'application/json'
    }
});

export const loginOfficeAccountApi = (email, password) => {
    return authClient.post('/office/auth/login', { email, password });
};

export const registerOfficeAccountApi = (email, password) => {
    return authClient.post('/office/auth/register', { email, password });
};
