// TEMPORARY harness (deleted after use): verifies the checkout-draft persistence / empty-state guard.
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../src/shared/i18n';
import '../src/shared/styles/global.css';
import { CheckoutScreen } from '../src/modules/CustomerApp/components/CheckoutScreen';

const mode = new URLSearchParams(window.location.search).get('mode');
localStorage.setItem('user_accessToken', 'e2e-token');

const CHECKOUT_DRAFT_KEY = 'dmb_checkout_draft';
const CHECKOUT_DRAFT_MAX_AGE_MS = 30 * 60 * 1000;

const plan = {
  vendorId: 'v1', vendorName: 'Green Bowl', durationLabel: 'Weekly', duration: 'weekly', deliveryDays: 'mon_fri', deliverySlot: 'lunch',
  subscriptionPlanId: 'plan1',
  meals: [{ mealPlanId: 'm1', name: 'Veg Thali', pricePerDay: 12, quantity: 1 }],
  pricing: { basePricePerDay: 12, subtotal: 60, foodVat: 8, foodVatAmount: 4.8, deliveryCharge: 10, deliveryVatAmount: 0.8, platformFeeAmount: 2.5, totalPrice: 78.1 },
};

let selectedPlanDetails = null;
if (mode === 'expired') {
  sessionStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify({ data: plan, savedAt: Date.now() - CHECKOUT_DRAFT_MAX_AGE_MS - 1000 }));
} else if (mode === 'fresh') {
  sessionStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify({ data: plan, savedAt: Date.now() }));
} else if (mode === 'none') {
  sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
}
// Mirrors the CustomerAppMain rehydration logic exactly.
try {
  const saved = JSON.parse(sessionStorage.getItem(CHECKOUT_DRAFT_KEY) || 'null');
  if (saved && Date.now() - saved.savedAt < CHECKOUT_DRAFT_MAX_AGE_MS) selectedPlanDetails = saved.data;
} catch {}

createRoot(document.getElementById('root')).render(
  <MemoryRouter>
    <CheckoutScreen selectedPlanDetails={selectedPlanDetails} onGoBack={() => { document.title = 'went-back'; }} onConfirmSubscription={() => {}} onGoToInvoiceSettings={() => {}} onShowNotificationToast={() => {}} invoicePrefs={{}} setInvoicePrefs={() => {}} />
  </MemoryRouter>
);
