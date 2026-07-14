const fs = require('fs');

const SOURCE_URL =
  'https://guyc-yemen.com/price-ar/';

const OUTPUT_FILE =
  'prices.json';

const SOURCE_NAME =
  'منصة الاتحاد';

const DEFAULT_CITY =
  'صنعاء';

const categoryNames = [
  'حديد التسليح',
  'الخرسانه',
  'الخرسانة',
  'الأسمنت',
  'الاسمنت',
  'النيس',
  'الكري',
  'البلوك',
  'الأحجار',
  'الاحجار',
  'الياجور',
  'القرميد',
  'الطوب',
  'الخشب',
];

const ignoreLines = [
  'نبذة عنا',
  'تسجيل نشاط المقاول',
  'الانضمام لعضوية الاتحاد',
  'اسئلة وأجوبة الاعضاء',
  'دليل اسعار مواد البناء',
  'منتدى الاتحاد',
  'أسعار مواد البناء الأساسية',
  'أسعار اليد العاملة',
  'أسعار مواد التشطيبات',
  'حاسبة البناء',
  'حاسبة الطرقات',
  'اتصل بنا',
  'تسجيل الدخول',
  'استخدام رقم الهاتف',
  'استخدام عنوان البريد الإلكتروني',
  'استمر',
  'لست عضو الآن',
  'إعادة تعيين كلمة المرور',
  'الحقل مطلوب',
  'كلمة المرور',
  'اسم المستخدم',
];

const htmlDecode = (text) => {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;/g, '-')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '-')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
};

const normalizeArabicDigits = (text) => {
  const map = {
    '٠': '0',
    '١': '1',
    '٢': '2',
    '٣': '3',
    '٤': '4',
    '٥': '5',
    '٦': '6',
    '٧': '7',
    '٨': '8',
    '٩': '9',
    '۰': '0',
    '۱': '1',
    '۲': '2',
    '۳': '3',
    '۴': '4',
    '۵': '5',
    '۶': '6',
    '۷': '7',
    '۸': '8',
    '۹': '9',
  };

  return String(text).replace(
    /[٠-٩۰-۹]/g,
    (d) => map[d] || d
  );
};

const cleanText = (html) => {
  return htmlDecode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '\n')
      .replace(/<style[\s\S]*?<\/style>/gi, '\n')
      .replace(/<\/(h1|h2|h3|h4|p|div|section|article|li|tr|td|th)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n');
};

const normalizeLine = (line) => {
  return normalizeArabicDigits(line)
    .replace(/[,،]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const isIgnoredLine = (line) => {
  if (!line) return true;

  if (line.length < 2) return true;

  return ignoreLines.some((x) =>
    line.includes(x)
  );
};

const detectCategory = (line) => {
  const pure = line
    .replace(/^#+\s*/, '')
    .trim();

  const found =
    categoryNames.find((cat) =>
      pure.includes(cat)
    );

  if (!found) return '';

  if (found === 'الاسمنت') return 'أسمنت';
  if (found === 'الأسمنت') return 'أسمنت';
  if (found === 'الخرسانه') return 'خرسانة';
  if (found === 'الخرسانة') return 'خرسانة';
  if (found === 'الاحجار') return 'أحجار';
  if (found === 'الأحجار') return 'أحجار';

  return found;
};

const normalizeCurrency = (word) => {
  if (!word) return 'YER';

  if (
    word.includes('سعود') ||
    word.includes('SAR')
  ) {
    return 'SAR';
  }

  if (
    word.includes('دولار') ||
    word.includes('USD')
  ) {
    return 'USD';
  }

  return 'YER';
};

const currencyWordFromLine = (line) => {
  if (line.includes('سعود')) return 'سعودي';
  if (line.includes('دولار')) return 'دولار';
  if (line.includes('USD')) return 'USD';
  if (line.includes('SAR')) return 'SAR';
  return 'يمني';
};

const extractNumbers = (line) => {
  const matches =
    normalizeArabicDigits(line)
      .replace(/[,،]/g, '')
      .match(/\d+(?:\.\d+)?/g) || [];

  return matches
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x));
};

const removeTrailingCurrency = (line) => {
  return line
    .replace(/\s+(يمني|ريال|سعودي|دولار|USD|SAR|YER)\s*$/i, '')
    .trim();
};

const removePricePart = (line, from, to) => {
  let text = removeTrailingCurrency(line);

  const fromText = String(from);
  const toText = String(to);

  const lastFrom =
    text.lastIndexOf(fromText);

  const lastTo =
    text.lastIndexOf(toText);

  const cutAt =
    lastFrom >= 0 && lastTo >= 0
      ? Math.min(lastFrom, lastTo)
      : Math.max(lastFrom, lastTo);

  if (cutAt > 0) {
    text = text.slice(0, cutAt).trim();
  }

  return text
    .replace(/\s+(من|الى|إلى)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const guessUnit = (name) => {
  if (name.includes('طن')) return 'طن';
  if (name.includes('كيس')) return 'كيس';
  if (name.includes('م٣')) return 'م³';
  if (name.includes('م3')) return 'م³';
  if (name.includes('م٢')) return 'م²';
  if (name.includes('م2')) return 'م²';
  if (name.includes('حبه')) return 'حبة';
  if (name.includes('حبة')) return 'حبة';
  if (name.includes('القلاب')) return 'قلاب';
  if (name.includes('متر')) return 'متر';

  return 'وحدة';
};

const cleanName = (name) => {
  return name
    .replace(/\b(أسم|اسم)\s+المنتج\b/g, '')
    .replace(/\bنوع\s+المنتج\b/g, '')
    .replace(/\bالوحده\b/g, '')
    .replace(/\bالوحدة\b/g, '')
    .replace(/\bالسعر\b/g, '')
    .replace(/\bمن\b/g, '')
    .replace(/\bالى\b/g, '')
    .replace(/\bإلى\b/g, '')
    .replace(/\bالعملة\b/g, '')
    .replace(/\bالعمله\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const slugify = (text) => {
  return normalizeArabicDigits(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
};

const parseUpdatedAt = (text) => {
  const normalized =
    normalizeArabicDigits(text);

  const match =
    normalized.match(
      /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/
    ) ||
    normalized.match(
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/
    );

  if (!match) {
    return new Date()
      .toISOString()
      .slice(0, 10);
  }

  if (match[1].length === 4) {
    const y = match[1];
    const m = match[2].padStart(2, '0');
    const d = match[3].padStart(2, '0');

    return `${y}-${m}-${d}`;
  }

  const d = match[1].padStart(2, '0');
  const m = match[2].padStart(2, '0');
  const y = match[3];

  return `${y}-${m}-${d}`;
};

const parsePrices = (pageText) => {
  const updatedAt =
    parseUpdatedAt(pageText);

  const lines =
    pageText
      .split('\n')
      .map(normalizeLine)
      .filter((line) => !isIgnoredLine(line));

  let currentCategory = 'مواد بناء';

  const items = [];

  for (const line of lines) {
    const category =
      detectCategory(line);

    if (category) {
      currentCategory = category;
      continue;
    }

    const lower = line.toLowerCase();

    if (
      lower.includes('السعر') &&
      lower.includes('العملة')
    ) {
      continue;
    }

    if (
      line.includes('الاسعار') ||
      line.includes('الأسعار') ||
      line.includes('تفاوت') ||
      line.includes('تحدد على حسب') ||
      line.includes('داخل صنعاء')
    ) {
      continue;
    }

    const numbers =
      extractNumbers(line);

    if (numbers.length < 2) {
      continue;
    }

    const currencyWord =
      currencyWordFromLine(line);

    const currency =
      normalizeCurrency(currencyWord);

    const priceTo =
      numbers[numbers.length - 1];

    const priceFrom =
      numbers[numbers.length - 2];

    if (
      !Number.isFinite(priceFrom) ||
      !Number.isFinite(priceTo)
    ) {
      continue;
    }

    if (priceFrom <= 0 || priceTo <= 0) {
      continue;
    }

    let name =
      removePricePart(
        line,
        priceFrom,
        priceTo
      );

    name = cleanName(name);

    if (!name || name.length < 2) {
      continue;
    }

    const unit =
      guessUnit(name);

    const id =
      `${slugify(currentCategory)}-${slugify(name)}-${currency}-${slugify(DEFAULT_CITY)}`;

    items.push({
      id,
      category: currentCategory,
      name,
      unit,
      priceFrom,
      priceTo,
      currency,
      city: DEFAULT_CITY,
      sourceName: SOURCE_NAME,
      sourceUrl: SOURCE_URL,
      updatedAt,
      confidence: 'مرتفع',
    });
  }

  const unique = new Map();

  for (const item of items) {
    unique.set(item.id, item);
  }

  return Array.from(unique.values());
};

const main = async () => {
  console.log('Fetching prices from:', SOURCE_URL);

  const res = await fetch(SOURCE_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 dftr-material-prices-updater',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch source page: ${res.status}`
    );
  }

  const html =
    await res.text();

  const text =
    cleanText(html);

  const prices =
    parsePrices(text);

  if (!prices.length) {
    throw new Error(
      'لم يتم استخراج أي أسعار من منصة الاتحاد'
    );
  }

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(prices, null, 2),
    'utf8'
  );

  fs.writeFileSync(
    'source-text-preview.txt',
    text.slice(0, 12000),
    'utf8'
  );

  console.log(
    `Saved ${prices.length} prices to ${OUTPUT_FILE}`
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
