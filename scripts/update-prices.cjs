const fs = require('fs');

const SOURCE_URL =
  'https://guyc-yemen.com/price-ar/';

const SOURCE_NAME =
  'منصة الاتحاد';

const CITY =
  'صنعاء';

const normalizeDigits = (text) => {
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
    d => map[d] || d
  );
};

const decodeHtml = (html) => {
  return html
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

const htmlToText = (html) => {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '\n')
      .replace(/<style[\s\S]*?<\/style>/gi, '\n')
      .replace(/<\/(h1|h2|h3|h4|h5|h6|p|div|section|article|li|tr|td|th)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n');
};

const cleanLine = (line) => {
  return normalizeDigits(line)
    .replace(/\s+/g, ' ')
    .trim();
};

const escapeHtml = (text) => {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

const isHeaderLine = (line) => {
  return (
    line.includes('اسم المنتج') ||
    line.includes('أسم المنتج') ||
    line.includes('نوع المنتج') ||
    line.includes('السعر من') ||
    line.includes('السعر الى') ||
    line.includes('السعر إلى') ||
    line.includes('العملة') ||
    line.includes('العمله')
  );
};

const isStopLine = (line) => {
  return (
    line.includes('يهدف الأتحاد') ||
    line.includes('يهدف الاتحاد') ||
    line.includes('©') ||
    line.includes('جميع الحقوق')
  );
};

const isBadLine = (line) => {
  return (
    !line ||
    line.includes('تسجيل الدخول') ||
    line.includes('اسم المستخدم') ||
    line.includes('كلمة المرور') ||
    line.includes('رقم الهاتف') ||
    line.includes('استخدام رقم الهاتف') ||
    line.includes('البريد الإلكتروني') ||
    line.includes('اتصل بنا') ||
    line.includes('الدعم') ||
    line.includes('واتساب') ||
    line.includes('@') ||
    line.includes('www.') ||
    line.includes('http') ||
    line.includes('جوال') ||
    line.includes('هاتف')
  );
};

const isSectionTitle = (line) => {
  const titles = [
    'حديد التسليح',
    'الخرسانه المركزية',
    'الخرسانة المركزية',
    'الأسمنت',
    'الاسمنت',
    'النيس',
    'الكري',
    'البلوك',
    'عقود النوافذ',
    'المرادم',
    'أحجار',
    'احجار',
    'الحجر',
    'الياجور',
    'القرميد',
    'الطوب',
    'الزخارف',
    'خشب البناء',
    'خشب المقاولة',
    'الجسور المعدنية',
    'الواح خشب',
    'ألواح خشب',
  ];

  return titles.some(title =>
    line.includes(title)
  );
};

const isCurrencyLine = (line) => {
  return /(يمني|سعودي|دولار)\s*$/.test(line);
};

const getCurrency = (line) => {
  if (line.includes('سعودي')) return 'ريال سعودي';
  if (line.includes('دولار')) return 'دولار أمريكي';
  return 'ريال يمني';
};

const getCurrencyCode = (line) => {
  if (line.includes('سعودي')) return 'SAR';
  if (line.includes('دولار')) return 'USD';
  return 'YER';
};

const getUnit = (text) => {
  const units = [
    'المتر المكعب',
    'المتر المربع',
    'المتر الطولي',
    'حجم القلاب',
    '100 حبة',
    'طن',
    'الكيس',
    'كيس',
    'م3',
    'م٣',
    'م²',
    'م2',
    'م٢',
    'حبة',
    'حبه',
    'قلاب',
    'عقد',
    'مردم',
    'لوح',
    'المربوع',
    'متر',
  ];

  for (const unit of units) {
    if (text.includes(unit)) {
      return normalizeDigits(unit)
        .replace('م3', 'م³')
        .replace('م٣', 'م³')
        .replace('م2', 'م²')
        .replace('م٢', 'م²')
        .replace('حبه', 'حبة');
    }
  }

  return '';
};

const getDate = (text) => {
  const normalized =
    normalizeDigits(text);

  const match =
    normalized.match(
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/
    );

  if (!match) {
    return new Date()
      .toISOString()
      .slice(0, 10);
  }

  const day =
    match[1].padStart(2, '0');

  const month =
    match[2].padStart(2, '0');

  const year =
    match[3];

  return `${year}-${month}-${day}`;
};

const parseRow = (
  line,
  section,
  updatedAt,
  index
) => {
  if (!isCurrencyLine(line)) {
    return null;
  }

  const currency =
    getCurrency(line);

  const currencyCode =
    getCurrencyCode(line);

  const withoutCurrency =
    line
      .replace(/(يمني|سعودي|دولار)\s*$/, '')
      .replace(/[,،]/g, '')
      .trim();

  if (
    withoutCurrency.includes('قريبا') ||
    withoutCurrency.includes('قريباً')
  ) {
    return {
      id: index,
      section,
      name: withoutCurrency,
      unit: getUnit(withoutCurrency),
      priceFrom: '',
      priceTo: '',
      currency,
      currencyCode,
      city: CITY,
      sourceName: SOURCE_NAME,
      sourceUrl: SOURCE_URL,
      updatedAt,
      raw: line,
    };
  }

  const nums =
    withoutCurrency.match(/\d+(?:\.\d+)?/g) || [];

  if (nums.length < 2) {
    return null;
  }

  const priceFrom =
    nums[nums.length - 2];

  const priceTo =
    nums[nums.length - 1];

  const fromIndex =
    withoutCurrency.lastIndexOf(priceFrom);

  if (fromIndex <= 0) {
    return null;
  }

  const beforePrice =
    withoutCurrency
      .slice(0, fromIndex)
      .trim();

  const unit =
    getUnit(beforePrice);

  const name =
    beforePrice
      .replace(/\s+/g, ' ')
      .trim();

  if (!name) {
    return null;
  }

  return {
    id: index,
    section,
    name,
    unit,
    priceFrom,
    priceTo,
    currency,
    currencyCode,
    city: CITY,
    sourceName: SOURCE_NAME,
    sourceUrl: SOURCE_URL,
    updatedAt,
    raw: line,
  };
};

const parsePage = (text) => {
  const lines =
    text
      .split('\n')
      .map(cleanLine)
      .filter(Boolean);

  const start =
    lines.findIndex(line =>
      line.includes('أسعار مواد البناء الأساسية')
    );

  if (start < 0) {
    throw new Error(
      'لم يتم العثور على بداية أسعار مواد البناء'
    );
  }

  const wanted =
    lines.slice(start);

  const updatedAt =
    getDate(wanted.join('\n'));

  let section =
    'أسعار مواد البناء';

  let buffer = '';

  const rows = [];

  for (const line of wanted) {
    if (isStopLine(line)) {
      break;
    }

    if (isBadLine(line)) {
      buffer = '';
      continue;
    }

    if (
      line.includes('أسعار مواد البناء الأساسية') ||
      /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(line)
    ) {
      continue;
    }

    if (isHeaderLine(line)) {
      buffer = '';
      continue;
    }

    if (isSectionTitle(line)) {
      section = line;
      buffer = '';
      continue;
    }

    const candidate =
      buffer
        ? `${buffer} ${line}`
        : line;

    if (isCurrencyLine(candidate)) {
      const row =
        parseRow(
          candidate,
          section,
          updatedAt,
          rows.length + 1
        );

      if (row) {
        rows.push(row);
      }

      buffer = '';
      continue;
    }

    if (
      candidate.length < 160 &&
      !/\d{7,}/.test(candidate)
    ) {
      buffer = candidate;
    } else {
      buffer = '';
    }
  }

  return {
    updatedAt,
    rows,
  };
};

const groupBySection = (rows) => {
  const groups = [];

  for (const row of rows) {
    let group =
      groups.find(g => g.section === row.section);

    if (!group) {
      group = {
        section: row.section,
        rows: [],
      };

      groups.push(group);
    }

    group.rows.push(row);
  }

  return groups;
};

const makeHtml = ({
  updatedAt,
  rows,
}) => {
  const groups =
    groupBySection(rows);

  const sectionsHtml =
    groups.map(group => {
      const rowsHtml =
        group.rows.map((row, idx) => `
          <tr>
            <td class="num">${idx + 1}</td>
            <td class="name">${escapeHtml(row.name)}</td>
            <td>${escapeHtml(row.unit || '-')}</td>
            <td class="price">${escapeHtml(row.priceFrom || '-')}</td>
            <td class="price">${escapeHtml(row.priceTo || '-')}</td>
            <td>${escapeHtml(row.currency)}</td>
          </tr>
        `).join('');

      return `
        <section class="price-section">
          <h2>${escapeHtml(group.section)}</h2>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>اسم المنتج</th>
                  <th>الوحدة</th>
                  <th>السعر من</th>
                  <th>السعر إلى</th>
                  <th>العملة</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </section>
      `;
    }).join('');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />
  <title>أسعار مواد البناء اليوم</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #f3f6ff;
      color: #1f2937;
      font-family: Arial, Tahoma, sans-serif;
      line-height: 1.7;
    }

    .hero {
      background: linear-gradient(135deg, #0f3f8c, #155ed1);
      color: #fff;
      padding: 18px 14px;
      text-align: center;
      border-bottom-left-radius: 24px;
      border-bottom-right-radius: 24px;
      box-shadow: 0 10px 28px rgba(15, 63, 140, .25);
    }

    .hero h1 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 800;
    }

    .hero p {
      margin: 8px 0 0;
      font-size: .82rem;
      opacity: .92;
    }

    .container {
      padding: 12px;
      max-width: 960px;
      margin: 0 auto;
    }

    .info-card {
      background: #fff;
      border-radius: 18px;
      padding: 12px;
      margin-bottom: 12px;
      box-shadow: 0 8px 24px rgba(15, 63, 140, .08);
      border: 1px solid #e5e7eb;
      font-size: .86rem;
    }

    .info-card a {
      color: #0f3f8c;
      font-weight: 800;
      text-decoration: none;
    }

    .price-section {
      background: #fff;
      border-radius: 18px;
      margin-bottom: 14px;
      overflow: hidden;
      box-shadow: 0 8px 24px rgba(15, 63, 140, .08);
      border: 1px solid #e5e7eb;
    }

    .price-section h2 {
      margin: 0;
      padding: 11px 12px;
      background: #0f3f8c;
      color: #fff;
      font-size: .95rem;
      font-weight: 800;
    }

    .table-wrap {
      width: 100%;
      overflow-x: auto;
    }

    table {
      width: 100%;
      min-width: 620px;
      border-collapse: collapse;
      background: #fff;
    }

    th {
      background: #eef4ff;
      color: #003366;
      font-size: .78rem;
      padding: 9px 7px;
      border: 1px solid #dbeafe;
      white-space: nowrap;
    }

    td {
      font-size: .78rem;
      padding: 9px 7px;
      border: 1px solid #e5e7eb;
      text-align: center;
      white-space: nowrap;
    }

    td.name {
      text-align: right;
      white-space: normal;
      min-width: 210px;
      font-weight: 700;
    }

    td.price {
      font-weight: 800;
      color: #0f3f8c;
    }

    td.num {
      color: #6b7280;
      width: 42px;
    }

    .footer {
      text-align: center;
      color: #6b7280;
      font-size: .75rem;
      padding: 18px 10px 28px;
    }
  </style>
</head>

<body>
  <div class="hero">
    <h1>🏷️ أسعار مواد البناء الأساسية اليوم</h1>
    <p>المصدر: ${escapeHtml(SOURCE_NAME)} - ${escapeHtml(CITY)}</p>
  </div>

  <main class="container">
    <div class="info-card">
      <b>آخر تحديث:</b>
      ${escapeHtml(updatedAt)}
      <br />
      <b>المصدر:</b>
      <a href="${SOURCE_URL}" target="_blank" rel="noreferrer">
        فتح صفحة منصة الاتحاد
      </a>
    </div>

    ${sectionsHtml}

    <div class="footer">
      يتم تحديث هذه الصفحة تلقائيًا من المصدر عند تشغيل GitHub Actions.
    </div>
  </main>
</body>
</html>`;
};

const main = async () => {
  console.log('Fetching:', SOURCE_URL);

  const res =
    await fetch(SOURCE_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 dftr-material-prices',
        Accept: 'text/html',
      },
    });

  if (!res.ok) {
    throw new Error(
      `فشل جلب صفحة المصدر: ${res.status}`
    );
  }

  const html =
    await res.text();

  const text =
    htmlToText(html);

  const result =
    parsePage(text);

  if (!result.rows.length) {
    throw new Error(
      'لم يتم استخراج أي صف أسعار'
    );
  }

  fs.writeFileSync(
    'prices.json',
    JSON.stringify(result.rows, null, 2),
    'utf8'
  );

  fs.writeFileSync(
    'index.html',
    makeHtml(result),
    'utf8'
  );

  fs.writeFileSync(
    'source-text-preview.txt',
    text.slice(0, 20000),
    'utf8'
  );

  console.log(
    `Saved ${result.rows.length} rows`
  );
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
