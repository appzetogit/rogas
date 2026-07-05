import apiClient from "./axios";

export const kitchenPartnerApi = {
  getPartners: async (params) => {
    // contextModule: 'admin' ensures the token is picked up for admin
    const response = await apiClient.get("/food/admin/kitchen-partners", { 
        params,
        contextModule: 'admin' 
    });
    return response.data;
  },

  addPartner: async (data) => {
    const response = await apiClient.post("/food/admin/kitchen-partners", data, {
        contextModule: 'admin'
    });
    return response.data;
  },

  updatePartnerStatus: async (id, status) => {
    const response = await apiClient.patch(`/food/admin/kitchen-partners/${id}/status`, { status }, {
        contextModule: 'admin'
    });
    return response.data;
  },

  updatePartner: async (id, data) => {
    const response = await apiClient.patch(`/food/admin/kitchen-partners/${id}`, data, {
        contextModule: 'admin'
    });
    return response.data;
  }
};
