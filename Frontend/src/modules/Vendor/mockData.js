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


export const INITIAL_ORDERS = [
{
  id: 'o1',
  zone: 'Ursynow',
  itemsName: 'Rosol + Pierogi',
  type: 'Subscription',
  status: 'Preparing',
  code: 'C-009',
  day: 'Monday 12 May'
},
{
  id: 'o2',
  zone: 'Ochota',
  itemsName: 'Bigos',
  type: 'Subscription',
  status: 'Ready',
  code: 'C-007',
  day: 'Monday 12 May'
},
{
  id: 'o3',
  zone: 'Ursynow',
  itemsName: 'Grochowka',
  type: 'One-time',
  status: 'Preparing',
  code: 'C-018',
  day: 'Monday 12 May'
},
{
  id: 'o4',
  zone: 'Mokotow',
  itemsName: 'Kotlet schabowy',
  type: 'Subscription',
  status: 'Accepted',
  code: 'C-012',
  day: 'Monday 12 May'
}];


export const INITIAL_TRANSACTIONS = [
{
  id: 't1',
  date: 'Mon 12 May',
  type: 'Delivery',
  amount: 337,
  description: '22 deliveries completed',
  details: 'Daily automated revenue clearance'
},
{
  id: 't2',
  date: 'Fri 9 May',
  type: 'Payout',
  amount: -474,
  description: 'Payout to bank',
  details: 'Bank Transfer completed · ID: 9821'
}];


export const INITIAL_PROFILE = {
  name: 'Maria Kowalska',
  type: 'Home Cook',
  bio: 'Passionate local chef delivering authentic home-style Polish classics crafted with local seasonal ingredients.',
  phone: '+48 789 123 456',
  city: 'Warsaw — Mokotow',
  licenseFile: 'licence_food_pl_2026.pdf',
  partner: 'FreshKitchen Partners Sp. z o.o.',
  rating: 4.9,
  isRegistered: true,
  avatarInitials: 'MK'
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

export const INITIAL_SURPRISE_BOXES = [
{
  id: 'sb1',
  mealId: 'm1',
  mealName: 'Rosol z kurczaka box',
  portions: 3,
  discount: 50,
  originalPrice: 18.00,
  discountedPrice: 9.00,
  closesAt: '14:00 today',
  claimedCount: 3,
  status: 'Active'
}];