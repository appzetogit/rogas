/**
 * Seeds the privacy policies the three apps show at their public privacy URLs:
 *   privacy             → customer app  (/user/privacy)
 *   privacy_restaurant  → vendor app    (/vendor/privacy)
 *   privacy_delivery    → delivery app  (/food/delivery/profile/privacy)
 * Admin can edit them afterwards in Settings → Legal → Privacy (tabs User / Restaurant / Delivery).
 *
 *   node scripts/seed_privacy_pages.mjs           dry run: shows what is stored now
 *   node scripts/seed_privacy_pages.mjs --apply   backs up the current pages to the temp folder, then writes
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';
import os from 'os';
import path from 'path';

dotenv.config();

const BRAND = 'Dailymealbox';
const EMAIL = 'dailymealbox.com@gmail.com';
const PHONE = '+91 7698911823';
const EFFECTIVE = '26 October 2026';

// The apps render this HTML without a typography stylesheet, so the spacing and bullets are inline.
const H = (text) => `<h2 style="font-size:17px;font-weight:700;margin:22px 0 8px;">${text}</h2>`;
const P = (text) => `<p style="margin:0 0 10px;line-height:1.6;">${text}</p>`;
const UL = (items) => `<ul style="list-style:disc;padding-left:20px;margin:0 0 12px;">${items.map((i) => `<li style="margin:0 0 6px;line-height:1.55;">${i}</li>`).join('')}</ul>`;

const intro = (appName, audience) =>
    P(`<strong>Effective date:</strong> ${EFFECTIVE}`) +
    P(`This Privacy Policy explains how ${BRAND} ("we", "us", "our") collects, uses, shares and protects personal data when you use the ${appName} and the related services (together, the "Services") as ${audience}. ${BRAND} is the controller of your personal data.`) +
    P('By using the Services you acknowledge that you have read this policy. If you do not agree with it, please do not use the Services.');

const rights =
    H('Your rights') +
    P('Depending on where you live, and in particular under the EU General Data Protection Regulation (GDPR), you have the right to:') +
    UL([
        'access the personal data we hold about you and receive a copy of it;',
        'have inaccurate data corrected;',
        'have your data deleted ("right to be forgotten"), unless we must keep it by law;',
        'restrict or object to certain processing, including processing based on our legitimate interests and direct marketing;',
        'receive your data in a portable, machine-readable format;',
        'withdraw consent at any time where processing is based on consent (this does not affect processing that took place before);',
        'lodge a complaint with your local data protection authority.'
    ]) +
    P(`To exercise any of these rights, contact us at <a href="mailto:${EMAIL}">${EMAIL}</a>. We will respond within one month and may need to verify your identity first. You can also delete your account by contacting support.`);

const security =
    H('How we protect your data') +
    P('We use technical and organisational measures appropriate to the risk, including encrypted connections (HTTPS), encryption of sensitive fields, access controls limited to staff who need the data, one-time-password (OTP) sign-in and activity logging. No method of transmission or storage is completely secure, so we cannot guarantee absolute security, but we work to protect your data and will notify you and the authorities of a personal data breach where the law requires it.');

const transfers =
    H('International transfers') +
    P('Some of our service providers (for example cloud hosting, maps, notifications and payment providers) may process data outside your country or the European Economic Area. Where this happens we rely on adequacy decisions, the European Commission’s Standard Contractual Clauses or other lawful safeguards.');

const changes =
    H('Changes to this policy') +
    P('We may update this policy from time to time. The effective date at the top shows when it last changed. If the changes are significant we will notify you in the app or by email before they take effect.');

const contact =
    H('Contact us') +
    P(`If you have any questions about this policy or how we handle your data, contact ${BRAND}:`) +
    UL([`Email: <a href="mailto:${EMAIL}">${EMAIL}</a>`, `Phone: <a href="tel:${PHONE.replace(/\s/g, '')}">${PHONE}</a>`]);

const PAGES = {
    privacy: {
        title: 'Privacy Policy',
        content:
            intro(`${BRAND} customer app`, 'a customer ordering meal subscriptions, single meals or pantry items') +
            H('1. Data we collect') +
            UL([
                '<strong>Account data:</strong> your name, mobile phone number (used to sign in with a one-time code), email address and profile photo if you add one.',
                '<strong>Delivery data:</strong> the delivery addresses you save, including the map pin you place, building or flat details and delivery instructions.',
                '<strong>Food preferences:</strong> your diet type, goals and the allergens you tell us about, so we can show suitable meals and warn kitchens. Allergen information can reveal health information; we only use it to prepare and deliver your food safely, and only with your consent, which you can withdraw by removing it from your profile.',
                '<strong>Order data:</strong> your subscriptions, meal choices, delivery dates and time slots, skipped or paused days, pantry orders, ratings, reviews, tips and complaints.',
                '<strong>Payment and billing data:</strong> amounts, payment status, wallet balance, loyalty points and, if you request VAT invoices, your company name, tax number (NIP), billing address and billing email. Card and bank details are entered directly with our payment providers; we never see or store your full card number.',
                '<strong>Location data:</strong> if you allow it, your device location is used to find your address and check that we deliver there. You can refuse and enter the address manually.',
                '<strong>Device and usage data:</strong> device type, operating system, app version, language, notification token, IP address, and technical logs. With your consent we also use analytics cookies to understand how the app is used.',
                '<strong>Communications:</strong> messages you send to our support team and your notification preferences.'
            ]) +
            H('2. How we use your data') +
            UL([
                'to create and manage your account and sign you in securely (performance of a contract);',
                'to take, prepare, schedule and deliver your orders and subscriptions, and to let you skip, pause or change meals (performance of a contract);',
                'to process payments, refunds, wallet credits and invoices, and to meet tax and accounting obligations (contract and legal obligation);',
                'to send order updates, delivery notifications and service messages (contract);',
                'to show meals that match your diet and allergens (consent);',
                'to provide customer support and handle complaints (contract and legitimate interest);',
                'to prevent fraud, abuse and security incidents (legitimate interest);',
                'to improve our menus and app through aggregated statistics, and with your consent, analytics (legitimate interest or consent);',
                'to send promotional messages only where you have agreed; you can opt out at any time in notification settings.'
            ]) +
            H('3. Who we share your data with') +
            UL([
                '<strong>Kitchens (vendors):</strong> your first name, meal choices, delivery slot, allergens and special instructions, so they can prepare your order.',
                '<strong>Delivery partners:</strong> your name, delivery address and map pin, phone number, delivery instructions and delivery PIN, so they can deliver your order.',
                '<strong>Your employer,</strong> if your meals are provided through a company (office) plan: your name and meal usage under that plan.',
                '<strong>Payment providers</strong> such as Przelewy24 and Stripe, to process payments and refunds.',
                '<strong>Service providers</strong> acting on our instructions: cloud hosting and databases, maps and address lookup (Google Maps), push notifications (Firebase), file storage, SMS and email delivery, and analytics.',
                '<strong>Authorities and advisers</strong> where required by law, to enforce our terms, or to protect the rights and safety of our users and others.'
            ]) +
            P('We do not sell your personal data.') +
            H('4. How long we keep your data') +
            P('We keep your account data for as long as your account is active. Order, payment and invoice records are kept for as long as tax and accounting law requires (typically up to 5 years). Support messages are kept for up to 2 years after the case is closed. When data is no longer needed we delete or anonymise it.') +
            H('5. Children') +
            P('The Services are not intended for anyone under 16. We do not knowingly collect data from children under 16; if you believe a child has given us personal data, contact us and we will delete it.') +
            rights + security + transfers + changes + contact
    },

    privacy_restaurant: {
        title: 'Privacy Policy',
        content:
            intro(`${BRAND} vendor app`, 'a kitchen partner (home cook, restaurant or pantry shop) offering food through our platform') +
            H('1. Data we collect') +
            UL([
                '<strong>Account and contact data:</strong> the owner’s name, mobile phone number (used to sign in with a one-time code), email address and profile photo.',
                '<strong>Business data:</strong> kitchen or business name, business type, address and the map pin of your kitchen, registration and tax numbers, opening hours, delivery days, cut-off times and holiday (vacation) dates.',
                '<strong>Verification documents:</strong> food-safety, registration and identity documents you upload so we can approve your account.',
                '<strong>Payout data:</strong> bank account details used to pay your earnings.',
                '<strong>Menu content:</strong> meal plans, dish names, descriptions, photos, prices, portions, nutrition values and allergen information.',
                '<strong>Operational data:</strong> orders received, preparation and hand-over status, pickup PINs, earnings, commissions, payouts, ratings and reviews from customers and your replies.',
                '<strong>Device and usage data:</strong> device type, app version, notification token, IP address and technical logs.',
                '<strong>Communications:</strong> messages with our support and partner teams.'
            ]) +
            H('2. How we use your data') +
            UL([
                'to register, verify and approve your kitchen and manage your partner account (contract and legal obligation);',
                'to publish your kitchen and menu to customers in your delivery area (contract);',
                'to send you orders, forecasts and pickup details, and to coordinate hand-over to delivery partners (contract);',
                'to calculate commissions and pay your earnings, and to keep tax and accounting records (contract and legal obligation);',
                'to show customer ratings and reviews and to monitor food safety and service quality (legitimate interest);',
                'to provide partner support and resolve disputes or complaints (contract and legitimate interest);',
                'to prevent fraud and keep the platform secure (legitimate interest);',
                'to send you service announcements and, where you agree, news about partner programmes.'
            ]) +
            H('3. Who we share your data with') +
            UL([
                '<strong>Customers:</strong> your kitchen name, area, menu, photos, prices, ratings and reviews. Your personal phone number and bank details are not shown to customers.',
                '<strong>Delivery partners:</strong> your kitchen name, pickup address and map pin, contact phone number and pickup PIN, so they can collect orders.',
                '<strong>Payment and payout providers</strong> such as Przelewy24 and Stripe, and our bank, to process payments and payouts.',
                '<strong>Service providers</strong> acting on our instructions: cloud hosting and databases, maps (Google Maps), push notifications (Firebase), file storage, SMS and email delivery.',
                '<strong>Authorities</strong> such as tax, food-safety or law-enforcement bodies where required by law, and professional advisers.'
            ]) +
            P('We do not sell your personal data.') +
            H('4. How long we keep your data') +
            P('We keep your partner account data while your account is active. Payout, commission and invoice records are kept for as long as tax and accounting law requires (typically up to 5 years). Verification documents are deleted within 12 months after your account is closed, unless we must keep them longer by law or for an ongoing dispute.') +
            H('5. Eligibility') +
            P('You must be at least 18 years old and legally allowed to run a food business to use the vendor app.') +
            rights + security + transfers + changes + contact
    },

    privacy_delivery: {
        title: 'Privacy Policy',
        content:
            intro(`${BRAND} delivery partner app`, 'a delivery partner collecting and delivering orders') +
            H('1. Data we collect') +
            UL([
                '<strong>Account and contact data:</strong> your name, mobile phone number (used to sign in with a one-time code), email address and profile photo.',
                '<strong>Verification documents:</strong> driving licence, national identity document, vehicle type and registration number, and any other documents you upload so we can approve you.',
                '<strong>Payout data:</strong> bank account details used to pay your earnings.',
                '<strong>Location data:</strong> your precise device location <strong>while you are online or carrying out a delivery</strong>, used to offer you routes, guide you to stops, show customers and kitchens where their order is, and confirm pickups and deliveries. We do not track your location while you are offline.',
                '<strong>Delivery data:</strong> routes and stops, pickup and delivery times, delivery PIN confirmations, proof-of-delivery photos (which may include the time and location they were taken), failed-delivery and pickup-problem reports.',
                '<strong>Earnings data:</strong> delivery earnings, bonuses, tips, cash collected, withdrawals, shifts and availability.',
                '<strong>Ratings:</strong> ratings and feedback customers give about your deliveries.',
                '<strong>Device and usage data:</strong> device type, app version, notification token, IP address and technical logs.',
                '<strong>Communications:</strong> support tickets and messages with our team.'
            ]) +
            H('2. How we use your data') +
            UL([
                'to register, verify and approve you as a delivery partner and manage your account (contract and legal obligation);',
                'to offer and assign routes, guide you to pickups and drop-offs, and share live delivery progress with customers and kitchens (contract);',
                'to confirm pickups and deliveries and resolve problems with an order (contract and legitimate interest);',
                'to calculate and pay your earnings, bonuses and tips, and to keep tax and accounting records (contract and legal obligation);',
                'to maintain service quality and safety, including reviewing ratings and incident reports (legitimate interest);',
                'to prevent fraud and misuse of the platform (legitimate interest);',
                'to provide support and send you service messages and shift notifications (contract).'
            ]) +
            H('3. Who we share your data with') +
            UL([
                '<strong>Customers:</strong> your first name, profile photo, vehicle type and your live location while you are delivering their order.',
                '<strong>Kitchens (vendors):</strong> your name, phone number, photo and vehicle number when you collect their orders.',
                '<strong>Payment and payout providers</strong> and our bank, to pay your earnings.',
                '<strong>Service providers</strong> acting on our instructions: cloud hosting and databases, maps and navigation (Google Maps), push notifications and live tracking (Firebase), file storage, SMS and email delivery.',
                '<strong>Authorities</strong> where required by law (for example tax or law-enforcement requests), insurers in case of an incident, and professional advisers.'
            ]) +
            P('We do not sell your personal data.') +
            H('4. How long we keep your data') +
            P('We keep your account data while your account is active. Detailed location history is kept for up to 90 days, unless it is needed for an open complaint, incident or legal claim. Earnings and payout records are kept for as long as tax and accounting law requires (typically up to 5 years). Verification documents are deleted within 12 months after your account is closed, unless the law requires us to keep them longer.') +
            H('5. Eligibility') +
            P('You must be at least 18 years old and hold the licences and documents required for your vehicle to use the delivery partner app.') +
            rights + security + transfers + changes + contact
    }
};

const apply = process.argv.includes('--apply');
const uri = process.env.MONGO_URI;
if (!uri) {
    console.error('MONGO_URI is not set');
    process.exit(1);
}

await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
const col = mongoose.connection.collection('food_page_contents');
const keys = Object.keys(PAGES);
const existing = await col.find({ key: { $in: keys } }).toArray();

console.log(`Database: ${mongoose.connection.db.databaseName}`);
for (const key of keys) {
    const doc = existing.find((d) => d.key === key);
    const text = String(doc?.legal?.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    console.log(`  ${key.padEnd(20)} now: ${doc ? `"${doc.legal?.title || ''}" (${text.length} chars) "${text.slice(0, 80)}"` : '(empty)'}`);
}

if (!apply) {
    console.log('\nDry run. Re-run with --apply to write the new policies.');
} else {
    const backup = path.join(os.tmpdir(), `privacy-pages-backup-${Date.now()}.json`);
    fs.writeFileSync(backup, JSON.stringify(existing, null, 2));
    console.log(`\nBacked up current pages to ${backup}`);
    const now = new Date();
    for (const [key, { title, content }] of Object.entries(PAGES)) {
        await col.updateOne(
            { key },
            { $set: { key, legal: { title, content }, updatedByRole: 'ADMIN', updatedAt: now }, $setOnInsert: { createdAt: now, updatedBy: null } },
            { upsert: true }
        );
        console.log(`  wrote ${key} (${content.length} chars)`);
    }
}
await mongoose.disconnect();
