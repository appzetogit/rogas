/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */



export const INITIAL_MEALS = [
{
  id: 'm1',
  name: 'Rosol z kurczaka',
  price: 18.00,
  description: 'Classic Polish chicken broth with vegetable mirepoix and thin egg noodles, slowly simmered to perfection.',
  imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDpWQRQIS01PQ5QzZ92J_MbnhfqpTNe-1MsukLb99JWU83WxSJxZA7MXWhmOq0UpzbJ5Qmcr6fMrU0VWlJ4F9tb_Rpb6dZ5BE3ZZwKf-NMV7z99im4yiprq3W6TBAHmzpoLqjBuizemyCgGnCr9TMbONBFJS2gooGXZ-got7BBRnQmNyCz9ICypYQsq5MJ3ywl5TkqddwGkuvDpdL8QXYkSjX7bMM7odMGUc0Nj45WxtfAFBxrdNiXszPnKkGAJ7evVjitlRk5kOQ',
  vat: '8% — Restaurant/processed food',
  calories: '345 kcal',
  prot: '26.5 g',
  carb: '20.9 g',
  fat: '12.0 g',
  allergens: ['Gluten', 'Celery'],
  status: 'Active',
  portions: 14
},
{
  id: 'm2',
  name: 'Pierogi ruskie',
  price: 22.00,
  description: 'Traditional handmade dumplings filled with potatoes, cottage cheese, and caramelized onions, garnished with sour cream.',
  imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBjpMcSg5eJFeWfzRstfN2YbHeUI-0s6cycYUxnUOcLucJ90vDLxJhdc7nYLQksav-IlAybrCGCgggvfZxfang03tGn1Z8IGhJ47hwQaexe8U1lQYsvalCZRtEAkAr9EtmEY1aBmeMnqORpqvJ-VBpL4NKdHqiwALmOshQ5x-FxVpLIT7c2SV07ysNAm62RPcuqfvmPwN_irLToT-tELfbcqfatpC9z3bv3YX6QrQFvwSpLfdxJWRv2BhOPYfmZsEPKz-GEbJdsZQ',
  vat: '8% — Restaurant/processed food',
  calories: '445 kcal',
  prot: '14.2 g',
  carb: '58.4 g',
  fat: '16.8 g',
  allergens: ['Gluten', 'Dairy'],
  status: 'Active',
  portions: 10
},
{
  id: 'm3',
  name: 'Salad grecka',
  price: 14.00,
  description: 'Fresh Mediterranean salad with juicy heirloom tomatoes, crisp cucumbers, kalamata olives, feta cheese blocks, and cold-pressed olive oil.',
  imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDtl3jti1dij7maPZszpp24_4meJO-IIj9_e-ujqITHanS2NQS4CJ3CqnAsKS7oYf1QZdancVOREENf0ZL-6OXEr2zqFHvvhhxd3pbib_iDKFnMl7U5Y_XyIeTE5xBASD0MT4OEBAQ0rQpVnCxve0pwfAjEjeCPyvQgdQythfT2k6i92YL3U5Z0-daIVo9WElKrrxbVSPZ7lIbhi2B2rSCwEQ-QapKM2DC3jzmxOefAEXccN_Fzg4qWqsKsm-41Pa24In35f8L40Q',
  vat: '8% — Restaurant/processed food',
  calories: '220 kcal',
  prot: '6.5 g',
  carb: '9.2 g',
  fat: '18.1 g',
  allergens: ['Dairy'],
  status: 'Draft',
  portions: 7
}];


// Empty shape only: every value is filled from the signed-in kitchen's real record.
export const INITIAL_PROFILE = {
  name: '',
  type: '',
  bio: '',
  phone: '',
  email: '',
  city: '',
  licenseFile: '',
  partner: '',
  rating: 0,
  isRegistered: true,
  avatarInitials: ''
};

export const INITIAL_VACATION = {
  isKitchenOpen: true,
  fromDate: '',
  toDate: '',
  reason: '',
  subscribersNotified: true,
  subscriptionsPaused: true,
  autoResume: true,
  adminAlerted: true,
  kitchenBackPush: true
};

export const INITIAL_CUTOFF = {
  type: 'Previous evening 8pm',
  cutoffTime: '20:00 (8pm)',
  portionsCap: 15,
  closedDays: ['Sun 18 May', 'Mon 19 May']
};

