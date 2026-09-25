import mongoose from 'mongoose';

/** Source strings owned by the code. The English text *is* the key. */
const translationKeySchema = new mongoose.Schema({
    namespace: { type: String, required: true, index: true },
    key: { type: String, required: true }
}, { collection: 'i18n_keys' });
translationKeySchema.index({ namespace: 1, key: 1 }, { unique: true });

/** One translated string for one language. A missing row means "fall back to English". */
const translationSchema = new mongoose.Schema({
    language: { type: String, required: true },
    namespace: { type: String, required: true },
    key: { type: String, required: true },
    value: { type: String, required: true }
}, {
    timestamps: true,
    collection: 'i18n_translations'
});
translationSchema.index({ language: 1, namespace: 1, key: 1 }, { unique: true });

/** Tracks which seed files have already been applied so a restart never overwrites admin edits. */
const metaSchema = new mongoose.Schema({
    _id: { type: String },
    seedHash: { type: String, default: '' },
    languagesSeeded: { type: Boolean, default: false }
}, { collection: 'i18n_meta' });

export const TranslationKey = mongoose.model('I18nTranslationKey', translationKeySchema);
export const Translation = mongoose.model('I18nTranslation', translationSchema);
export const I18nMeta = mongoose.model('I18nMeta', metaSchema);
