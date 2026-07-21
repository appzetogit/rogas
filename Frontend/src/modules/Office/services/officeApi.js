import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const officeClient = axios.create({
    baseURL: `${baseURL}/dmb/office`,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Request interceptor to add token
officeClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('office_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

// Response interceptor to handle 401
officeClient.interceptors.response.use((response) => response, (error) => {
    if (error.response?.status === 401) {
        localStorage.removeItem('office_token');
        // Redirect to login handled by UI components
    }
    return Promise.reject(error);
});

// Employees
export const getEmployeesApi = (params) => officeClient.get('/employees', { params });
export const addEmployeeApi = (data) => officeClient.post('/employees', data);
export const updateEmployeeApi = (id, data) => officeClient.put(`/employees/${id}`, data);
export const deleteEmployeeApi = (id) => officeClient.delete(`/employees/${id}`);

// Vendors & Assignments
export const getVendorsApi = () => officeClient.get('/vendors');
export const createAssignmentOrderApi = (data) => officeClient.post('/assignments/create-order', data);
export const assignMealsApi = (data) => officeClient.post('/assignments', data);
export const getAssignmentsApi = () => officeClient.get('/assignments');
export const deleteAssignmentApi = (id) => officeClient.delete(`/assignments/${id}`);

// Subscription Plans
export const getSubscriptionPlansApi = () => axios.get(`${baseURL}/dmb/subscriptions/plans`);

// Company
export const getCompanyDetailsApi = () => officeClient.get('/company');
export const updateCompanyDetailsApi = (data) => officeClient.put('/company', data);

// Onboarding
export const getOnboardingStatusApi = () => officeClient.get('/onboarding/status');
export const startOnboardingApi = (data) => officeClient.post('/onboarding/start', data);
export const updateOnboardingStepApi = (step, data) => officeClient.put(`/onboarding/step/${step}`, data);
export const completeOnboardingApi = () => officeClient.post('/onboarding/complete');

export const uploadDocumentApi = (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'office_onboarding_docs');
    return axios.post(`${baseURL}/uploads/document`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${localStorage.getItem('office_token')}`
        }
    });
};
