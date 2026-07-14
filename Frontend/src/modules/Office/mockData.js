/**
 * @license
 * SPDX-License-Identifier-2.0
 */



export const INITIAL_EMPLOYEES = [
  {
    id: 'EMP-2204',
    name: 'Sarah Jenkins',
    email: 'sarah.j@company.com',
    department: 'Engineering',
    preferredSlot: '12:30 PM - 1:30 PM',
    monthlyBudget: 240.00,
    status: 'Active',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAZPjIhDc13lFWHTNyDlA8dDg0O_YNJI537TVVlVSrmADmFBrkn-CYbUaCB4oULTaGFciEmjZDBVRl9br48T87qEhpOvEpwP1Bol-b8QK8xdRdskT49VjPf1bpevkCItAhenI9dNVKniNBWm39j7nnGgNyfwn4VzucBEuD8UqGbs9xvdaoKCT_-W_HzXKPpK_QgyFCYJHjrtBd2rZ6xu8yxcHeei8QmM2FYEjl2mmpasC-xmZL-EIaq',
    assignedVendorId: 'vendor-1',
    deliverySlot: 'Lunch'
  },
  {
    id: 'EMP-0482',
    name: 'Marcus Chen',
    email: 'marcus.chen@company.com',
    department: 'Engineering',
    preferredSlot: '12:30 PM - 1:30 PM',
    monthlyBudget: 240.00,
    status: 'Active',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCR_7rufN2pn_K-V8KmyY0MYEfXMr8Fs_jXQM-AwfINtmL0-FR1hKey4JQHgpX8lbGwzafqJvXCuOv8Hf2hao0OFuqbARe6hCu3tQZjBYJFOeRpCmTpOvXpxINCGX9-RoeEphqrmQqpfiIDGgCx3qzVWXntDKvPNGSx1uCjr5UCrtt1BbIBJ0qIvPSD5IRsUITc4HLOSfg37groRMzeSjoqkk1KCVwF5oIdmgj6PHftvItG1B0jWa3f',
    assignedVendorId: 'vendor-3',
    deliverySlot: 'Lunch'
  },
  {
    id: 'EMP-1129',
    name: 'Elena Rodriguez',
    email: 'e.rod@company.com',
    department: 'Operations',
    preferredSlot: '12:00 PM - 1:00 PM',
    monthlyBudget: 210.00,
    status: 'Active',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAlEMTw9zOnAoLWCbuwiGv4tsGSOrXX5hx0C2zKXt-ZlZ4oPoSbT5DEjzZXUZdGYuGRQMDcNpBDWt4fOvSsSXvX-lCapiDCiuI9IThPB48EO43MTXWSCdDYRnrfeS24L8toUcCPAa91gPZWvD95RafoNeapsAjgq2MxbO8ZNpPDoBpoWjrgmNwfX7YaYvRBo-fpRQat_-tLAyqlbd7c3TYvOjVeZjKZE-WDKlVDhSVGXWREr8EeWndR',
    assignedVendorId: 'vendor-4',
    deliverySlot: 'Lunch'
  },
  {
    id: 'EMP-0312',
    name: 'Jordan Smith',
    email: 'j.smith@company.com',
    department: 'Engineering',
    preferredSlot: '1:00 PM - 2:00 PM',
    monthlyBudget: 240.00,
    status: 'Active',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDONR8o_ODQlllv7glKHsczbxBWjPyeny5iS5UXvAm0ob4fi9meGCFYS7jo9wzs_9xDto4FSbwXry2Qb5t67bQvVxOaZxiN7wsZx_9rlXyD76HdVl93UDsBMSp0fwnWZVt6LDw6DoVP3Vt_hUQ00nPhm0okblAg576M1_u_Uj_dftCvNfxC33EdPrlWQEXGFpftOC1IaQRCV7-Ih20hnUDVnMgMTjW8mBLrC2hxCsMcILNdluEELdSH',
    assignedVendorId: 'vendor-1',
    deliverySlot: 'Lunch'
  },
  {
    id: 'EMP-0841',
    name: 'David Miller',
    email: 'd.miller@company.com',
    department: 'Marketing',
    preferredSlot: '1:00 PM - 2:00 PM',
    monthlyBudget: 180.00,
    status: 'Paused',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAEcPS3Yz8_0_bbTcwpjdjv0yPJ9b6GsdeHz6M-qjHdxLNliLP7-sKyfcD3aPXKTm3G6S1e1zCSnhmJTEIraEpGLsou592U8M5u1-ufQh9bdjYwgoK-Yd-SPWa1EN7XfvwT3m3o60-PFegOqYw61sQ0BGf_aGSCLOVTJJ3yMr5Q29JX39084N_1EK5DTW7F2r1aZ8FF75u6-0DCQMt2HBQvcQtNQzSXCvw7scaTn_2yv5YXBH-2kDOM'
  },
  {
    id: 'EMP-0931',
    name: 'Simon Peters',
    email: 'simon.p@company.com',
    department: 'Human Resources',
    preferredSlot: '12:00 PM - 1:00 PM',
    monthlyBudget: 200.00,
    status: 'Active',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCZB-BnroyuBoscim8QewAIi6K3mNW_lHunLrr4-PSoSWfupAFq4v4l24s38oQ2GoJXHqBkKnAsvgtw3k6RhCHvCt6XDSxPvIm5B8UHzHhvqC3rNgJDBpX4dbBpRpoQSrtdzdmasXIVNnBN0LvnZtQ_CsWDNyAcn674I2YJ7FJOXlWdGWUZmzGYEMjJDwGpY9r_otp6ZjbT5BAC1esw6MdApERIii3uZYHSFrGeIhVvRvvmUu8RAoht'
  },
  {
    id: 'EMP-3105',
    name: 'Michael Okafor',
    email: 'm.okafor@company.com',
    department: 'Engineering',
    preferredSlot: '1:00 PM - 2:00 PM',
    monthlyBudget: 240.00,
    status: 'Active',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCloVLgxdy6z75f6VS31KyQTFX-UFooXFJkX9fAt_W0c1I57BuyxkTFHoKEx1ou77cpGUUKmo6MKqPPTJVaLD4yRFkIPF6rLvsut-oON4j4CD4gyNWbr_uGS3L6Cdxm4vsJCHXlOlMjG7EWpblhUVL_Pm_ZZwcpoMIGcQWDRxd2rLVnDdiXsnBxivgv8yszSCN9hf_O2x-B3ngXIC5yw_54oIZBEqwNQQLFwpJzDgDjOdlOptGxg3kk'
  },
  {
    id: 'EMP-1592',
    name: 'Alex Thompson',
    email: 'alex.t@company.com',
    department: 'Engineering',
    preferredSlot: '12:00 PM - 1:00 PM',
    monthlyBudget: 220.00,
    status: 'Active',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCR_7rufN2pn_K-V8KmyY0MYEfXMr8Fs_jXQM-AwfINtmL0-FR1hKey4JQHgpX8lbGwzafqJvXCuOv8Hf2hao0OFuqbARe6hCu3tQZjBYJFOeRpCmTpOvXpxINCGX9-RoeEphqrmQqpfiIDGgCx3qzVWXntDKvPNGSx1uCjr5UCrtt1BbIBJ0qIvPSD5IRsUITc4HLOSfg37groRMzeSjoqkk1KCVwF5oIdmgj6PHftvItG1B0jWa3f'
  },
  {
    id: 'EMP-1048',
    name: 'Sarah Miller',
    email: 'sarah.m@company.com',
    department: 'Marketing',
    preferredSlot: '12:30 PM - 1:30 PM',
    monthlyBudget: 190.00,
    status: 'Active',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAZPjIhDc13lFWHTNyDlA8dDg0O_YNJI537TVVlVSrmADmFBrkn-CYbUaCB4oULTaGFciEmjZDBVRl9br48T87qEhpOvEpwP1Bol-b8QK8xdRdskT49VjPf1bpevkCItAhenI9dNVKniNBWm39j7nnGgNyfwn4VzucBEuD8UqGbs9xvdaoKCT_-W_HzXKPpK_QgyFCYJHjrtBd2rZ6xu8yxcHeei8QmM2FYEjl2mmpasC-xmZL-EIaq'
  },
  {
    id: 'EMP-0752',
    name: 'Jordan Reed',
    email: 'jordan.r@company.com',
    department: 'Operations',
    preferredSlot: '1:00 PM - 2:00 PM',
    monthlyBudget: 210.00,
    status: 'Active',
    avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDONR8o_ODQlllv7glKHsczbxBWjPyeny5iS5UXvAm0ob4fi9meGCFYS7jo9wzs_9xDto4FSbwXry2Qb5t67bQvVxOaZxiN7wsZx_9rlXyD76HdVl93UDsBMSp0fwnWZVt6LDw6DoVP3Vt_hUQ00nPhm0okblAg576M1_u_Uj_dftCvNfxC33EdPrlWQEXGFpftOC1IaQRCV7-Ih20hnUDVnMgMTjW8mBLrC2hxCsMcILNdluEELdSH'
  }
];

export const INITIAL_VENDORS = [
  {
    id: 'vendor-1',
    name: 'Green Nibble',
    shortName: 'GN',
    rating: 4.8,
    reviewsCount: 124,
    tag: 'Health & Wellness',
    categories: ['VEGAN', 'KETO'],
    description: 'Specializing in organic, plant-forward meal prep for corporate teams. High-protein focus with strictly non-GMO ingredients.',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDRJ_9anf7N8atjWZ5ku-Ja-44V5HSodrOF9AABBfA82hOhS7yc77k0d17t61nfafKnT5J0F4c4ho2vzU3JNNOTDkuPRbgBBrzgHJDCISztCF8V8N2F2IX_4yKkoE3PFX6Q0AY106EWAv9wIifx9A50OrwYj5uSASVq0mmiNJRF6pJEs_T6eL-lP9E0T_AxQOg0NP_DqB7VP0jSEJinfpLMwhYvb4B4LlV3puXap9yWI0GYPlUf_sLx'
  },
  {
    id: 'vendor-2',
    name: 'Urban Kitchen',
    shortName: 'UK',
    rating: 5.0,
    reviewsCount: 89,
    tag: 'Artisan Home Cook',
    categories: ['HOME COOK', 'GLUTEN-FREE'],
    description: 'Hand-crafted meals using locally sourced seasonal produce. Each box is packed with nutritional density and artisanal flair.',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuANobNRUqE7ot17C2edY9an-P_EtotbT6qSwFaZJQnqwscG3b8fn1lns-t6mE8_C2OdKMDfGMmvO__L9q-aaQQ8ZwhtjPdP_DJzzs_YVX3i-GIoTXXB_E854qSvcJTiRejt5qeRfrwoE0JDKMx_SZZDoMalwSzDmfXvPe_V85O4EI_0K1II5Sjm7yj0-X3RLkCYzT1Mdo4mhIipK3cqXbVqveL-DbepdItXGpZT2LHc0vah5UYJkT0n'
  },
  {
    id: 'vendor-3',
    name: 'Bento Box Co.',
    shortName: 'BB',
    rating: 4.5,
    reviewsCount: 212,
    tag: 'Asian Fusion',
    categories: ['KETO', 'LOW-CARB'],
    description: 'Efficient, well-balanced bento boxes designed for productivity. Zero-waste packaging and consistent daily menus.',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCRPUECc5Rza3ZB9QXCq--SITKNm2PNYGe6vBm-c49ni9SSoslErwnw2K_SYjyQN5plcYz4x09GYKKKE3kgTgFHYwkV8uOc8mbq7OubsSulA-l1H614K4gTiotCoyYbTuAgnF7eRQ5snWEH8wLVRRhbphS4i4HJQYe5ZRwp-66YnWYIkaU5t8_f2KO-fcONBnH0ZJvwUbRqHVZTrEUs1I0nNpp03Mp8NYyR3wxUJ7vWFkqn-Kl84TjA'
  },
  {
    id: 'vendor-4',
    name: 'Mediterranean Muse',
    shortName: 'MM',
    rating: 4.2,
    reviewsCount: 156,
    tag: 'Cultural Cuisine',
    categories: ['VEGAN', 'WHOLE30'],
    description: 'Authentic Mediterranean flavors reimagined for office lunches. High in healthy fats and heart-friendly ingredients.',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDTpHYrEKWTvy3c5-oPmox8aHs-KgfvLkIBZwQgMkuM_pu0R4S8q8WZI5APkI3cf_tLUWNdn9XeHXi1zNkV8NZBE_ETCT6raYgPfl5e1mfLKdMtcm-D1TOJlouYZVGdhPY9z8mCaqt7W2GQ9FeRnjt_WUWK_TYL15L38LmC-aw6OMjS5F1XsLHijiHatDj5FN9lLbE0DUEHn7dOW-KdTnKe9wYGi4WgseMFwiVC6R-vzMr4aPNLnuXh'
  }
];

export const INITIAL_COMPANY_DETAILS = {
  legalName: 'GreenTech Solutions Sp. z o.o.',
  nip: 'PL 5252003040',
  regon: '012345678',
  registeredAddress: 'ul. Cybernetyki 19A, suite 302, 02-677 Warszawa, Poland',
  deliveryAddress: 'ul. Innowacyjna 4, Building B (Front Desk), 02-700 Warszawa, Poland',
  planType: 'Premium Enterprise Plus',
  billingCycle: 'Monthly (1st of month)',
  paymentMethod: 'Bank Transfer',
  monthlyBudgetCap: 12500.00,
  budgetUtilized: 9850.00,
  contractStartDate: 'January 15, 2024',
  contactName: 'Alexandra Kowalska',
  contactRole: 'Head of Operations',
  contactEmail: 'a.kowalska@greentech.com',
  contactPhone: '+48 600 234 890',
  contactAvatarUrl: undefined, // Will render styled initials
  totalEmployees: 342,
  activeVendorsCount: 12
};
