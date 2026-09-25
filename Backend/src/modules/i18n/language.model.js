import mongoose from 'mongoose';

const languageSchema = new mongoose.Schema({
    // ISO 639-1 style code (en, pl, de) optionally with a region (pt-br). Immutable: it is stored on user profiles.
    code: { type: String, required: true, unique: true, trim: true, lowercase: true, immutable: true },
    name: { type: String, required: true, trim: true },
    nativeName: { type: String, required: true, trim: true },
    flag: { type: String, default: '', trim: true },
    direction: { type: String, enum: ['ltr', 'rtl'], default: 'ltr' },

    isEnabled: { type: Boolean, default: true },
    // Language shown to visitors who have not chosen one yet.
    isDefault: { type: Boolean, default: false },
    // The fallback language (English) can never be disabled or deleted.
    isSystem: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },

    // Bumped on every translation change so clients know when to refetch their cached bundle.
    version: { type: Number, default: 1 }
}, {
    timestamps: true,
    collection: 'i18n_languages'
});

languageSchema.index({ sortOrder: 1, code: 1 });

export const Language = mongoose.model('I18nLanguage', languageSchema);
