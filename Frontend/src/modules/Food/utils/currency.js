import { formatMoney } from "@/shared/payments/money";

/**
 * Format an amount for the admin panel.
 * @param {number} amount - Amount to format
 * @param {string} [currency] - ISO currency code of this particular record (e.g. a payment/order/withdrawal's own
 *   `currency` field). Pass it whenever the data has one — admin lists can span more than one country/currency.
 *   Falls back to the platform's default currency (from the customer's own last-seen currency, PLN otherwise) when
 *   the record doesn't carry one.
 * @returns {string} - Formatted amount string, e.g. "12,50 zł" / "PLN 12.50"
 */
export const formatCurrency = (amount, currency) => formatMoney(amount, currency || undefined);
