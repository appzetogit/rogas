/**
 * Amendment 1 #7 - food safety. A customer's note to the kitchen is flagged RED when it mentions an allergen or an
 * intolerance (English, Polish, German), AMBER otherwise. Matching is deliberately generous: a false alarm only means the
 * vendor reads the note carefully, a miss could hurt someone.
 */
const ALLERGEN_PATTERN = new RegExp(
    [
        'allerg', 'alerg', 'intoleran', 'nietoleran', 'unvertr', 'anaphyl', 'celiac', 'coeliac', 'cel[ia]aki',
        'gluten', 'lactos', 'laktoz', '\\bnuts?\\b', 'peanut', 'orzech', 'orzeszk', 'n[uü]ss', 'erdn[uü]ss',
        'soy', 'soj', 'egg', 'jaj', '\\bei(er)?\\b', 'milk', 'mleko', 'milch', 'dairy', 'nabia[lł]',
        'fish', 'ryb', 'shellfish', 'skorupiak', 'sesame', 'sezam', 'celery', 'seler', 'mustard', 'gorczyc', 'senf',
        'sulphite', 'sulfite', 'siarczy', 'lupin', 'molluscs?', 'mi[eę]czak'
    ].join('|'),
    'i'
);

export const isAllergenNote = (text) => ALLERGEN_PATTERN.test(String(text || ''));
export const cleanInstructions = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
