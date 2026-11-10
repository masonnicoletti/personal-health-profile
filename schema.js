/* Personal Health Profile: schema
 * Single source of truth for the form and the PDF.
 *
 * Section kinds
 *   profile : one record of fields
 *   list    : repeating entries. L.kind = 'current' (updatable) or 'history' (permanent record)
 *     L.split         group entries into Current and Past by the "current" checkbox
 *     L.questionnaire checklist shown above the entries; each checked item becomes an entry
 *     L.choices       the whole section is a checklist of common choices, each with detail fields
 * Field: { k, label, type, w, opts, ph, showIf(values), suggest(), meta, defaultOn, unit, pdfLabel }
 *   type: text | long | date | phone | number | height | select | check | checklist | heading
 *   w:    full | half | third | twothird
 *   select options may be a function; any select that includes 'Other' gets a text box for it
 */
(function () {
  const PHP = (window.PHP = window.PHP || {});

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Dates are stored as "YYYY-MM-DD" with any part allowed to be blank (e.g. "2014-03-" or "2014--").
  PHP.parseDate = function (v) {
    const p = String(v || '').split('-');
    return { y: p[0] || '', m: p[1] || '', d: p[2] || '' };
  };
  PHP.joinDate = function (y, m, d) {
    return y || m || d ? [y, m, d].join('-') : '';
  };
  PHP.fmtDate = function (v) {
    const { y, m, d } = PHP.parseDate(v);
    const mi = parseInt(m, 10);
    const mon = mi >= 1 && mi <= 12 ? MONTHS[mi - 1] : '';
    const day = d && parseInt(d, 10) ? String(parseInt(d, 10)) : '';
    if (mon && day && y) return `${mon} ${day}, ${y}`;
    return [mon, mon ? day : '', y].filter(Boolean).join(' ');
  };
  PHP.dateSortKey = function (v) {
    const { y, m, d } = PHP.parseDate(v);
    if (!y) return -Infinity; // undated entries sort to the bottom of newest-first lists
    return parseInt(y, 10) * 10000 + (parseInt(m, 10) || 0) * 100 + (parseInt(d, 10) || 0);
  };
  PHP.fmtPhone = function (v) {
    let d = String(v || '').replace(/\D/g, '');
    if (d.length === 11 && d[0] === '1') d = d.slice(1);
    d = d.slice(0, 10);
    if (!d) return '';
    if (d.length < 4) return '(' + d;
    if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  };
  // Height is stored as "feet-inches" (either part may be blank), or as centimetres when its unit is "cm"
  PHP.fmtHeight = function (v, unit) {
    if (unit === 'cm') return PHP.isFilled(v) ? `${String(v).trim()} cm` : '';
    const [ft, inch] = String(v || '').split('-');
    return [ft && ft + ' ft', inch && inch + ' in'].filter(Boolean).join(' ');
  };
  // Converting between units keeps what was entered when someone switches the unit dropdown
  PHP.convertHeight = function (v, toUnit) {
    if (toUnit === 'cm') {
      const [ft, inch] = String(v || '').split('-');
      const totalIn = (+ft || 0) * 12 + (+inch || 0);
      return totalIn ? String(Math.round(totalIn * 2.54)) : '';
    }
    const cm = parseFloat(v);
    if (!cm) return '';
    const totalIn = Math.round(cm / 2.54);
    return `${Math.floor(totalIn / 12)}-${totalIn % 12}`;
  };
  PHP.convertWeight = function (v, toUnit) {
    const n = parseFloat(v);
    if (!n) return '';
    return toUnit === 'kg' ? String(Math.round(n * 0.45359237 * 10) / 10) : String(Math.round(n / 0.45359237));
  };

  // Value of a select, with the typed text when "Other" was chosen
  PHP.ov = (obj, k) => (obj[k] === 'Other' && PHP.isFilled(obj[k + 'Other']) ? obj[k + 'Other'].trim() : obj[k] || '');
  PHP.isCurrent = (e) => e.current !== false;

  // Live data from other sections (set by app.js) for dropdowns that list providers and offices
  PHP.getState = PHP.getState || (() => ({ data: {} }));
  PHP.providers = () => {
    const d = PHP.getState().data.providers;
    return ((d && d.lists && d.lists.main) || []).filter((p) => PHP.isFilled(p.name) || PHP.isFilled(p.office));
  };
  // Unique, ignoring capitalization; the first spelling entered wins
  const uniq = (arr) => {
    const seen = new Map();
    arr.forEach((s) => {
      const t = String(s || '').trim();
      if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
    });
    return [...seen.values()];
  };
  PHP.officeNames = () => uniq(PHP.providers().map((p) => p.office));
  // "Dr. Anita Patel", "Sam Rivera, PA-C"
  PHP.providerName = (p) => {
    const base = [PHP.ov(p, 'prefix'), p.name].filter((x) => PHP.isFilled(x)).join(' ');
    const cred = PHP.ov(p, 'credentials');
    return base && PHP.isFilled(cred) ? `${base}, ${cred}` : base;
  };
  PHP.currentProviderNames = () => uniq(PHP.providers().filter(PHP.isCurrent).map(PHP.providerName));
  // Pharmacies listed under Providers, plus any already typed on a medication
  PHP.pharmacyNames = () => {
    const d = PHP.getState().data;
    const fromProviders = PHP.providers()
      .filter((p) => p.specialty === 'Pharmacy')
      .map((p) => p.office || p.name);
    const fromMeds = ((d.meds && d.meds.lists && d.meds.lists.main) || []).map((m) => m.pharmacy);
    return uniq(fromProviders.concat(fromMeds));
  };

  // Medication wording shared by the form, the full PDF and the emergency summary
  PHP.medStrength = (e) => [PHP.isFilled(e.strength) && [e.strength, PHP.ov(e, 'unit')].filter(Boolean).join(' '), PHP.isFilled(e.form) && PHP.ov(e, 'form').toLowerCase()].filter(Boolean).join(' ');
  PHP.medFreq = (e) => {
    const f = PHP.ov(e, 'freq');
    return f === 'As needed' && PHP.isFilled(e.prnFor) ? `As needed for ${e.prnFor.trim()}` : f;
  };

  const STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'Other'];
  const SPECIALTIES = ['Primary care', 'Audiology', 'Cardiology', 'Dentistry', 'Dermatology', 'Endocrinology', 'Gastroenterology', 'Geriatrics', 'Nephrology', 'Neurology', 'Oncology', 'Ophthalmology', 'Optometry', 'Orthopedics', 'Physical therapy', 'Podiatry', 'Psychiatry', 'Counseling', 'Pulmonology', 'Rheumatology', 'Urology', 'Pharmacy', 'Other'];
  const CREDENTIALS = ['MD', 'DO', 'NP', 'PA-C', 'RN', 'DDS', 'DMD', 'OD', 'PharmD', 'DPT', 'PhD', 'PsyD', 'LCSW', 'Other'];
  const FREQUENCIES = ['Once daily', 'Twice daily', 'Three times daily', 'Four times daily', 'At bedtime', 'Every other day', 'Once weekly', 'Once monthly', 'As needed', 'Other'];
  const UNITS = ['mg', 'mcg', 'g', 'mL', 'units', '%', 'Other'];
  const FORMS = ['Tablet', 'Capsule', 'Liquid', 'Inhaler', 'Injection', 'Patch', 'Cream or ointment', 'Drops', 'Spray', 'Other'];
  // Reproductive health questions follow the sex chosen in Personal Information (both show when it's blank or Other)
  const sexOf = () => {
    const b = PHP.getState().data.basic;
    return (b && b.values && b.values.sex) || '';
  };
  const notMale = () => sexOf() !== 'Male';
  const notFemale = () => sexOf() !== 'Female';
  const RELATIONS = ['Spouse', 'Partner', 'Son', 'Daughter', 'Parent', 'Sibling', 'Grandchild', 'Other relative', 'Friend', 'Neighbor', 'Caregiver', 'Other'];
  const PREFIXES = ['Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Mx.', 'Prof.', 'Other'];
  const RELATIVES = [
    'Mother',
    'Father',
    'Sister',
    'Brother',
    'Daughter',
    'Son',
    'Maternal grandmother',
    'Maternal grandfather',
    'Paternal grandmother',
    'Paternal grandfather',
    'Aunt',
    'Uncle',
    'Cousin',
    'Half-sister',
    'Half-brother',
    'Other',
  ];
  const VACCINES = [
    'Flu (influenza)',
    'COVID-19',
    'Shingles (Shingrix)',
    'Pneumonia (PCV20)',
    'Pneumonia (PCV21)',
    'Pneumonia (PCV15)',
    'Pneumonia (PPSV23)',
    'RSV',
    'Tdap (tetanus, diphtheria, whooping cough)',
    'Td (tetanus, diphtheria)',
    'Hepatitis A',
    'Hepatitis B',
    'MMR (measles, mumps, rubella)',
    'Chickenpox (varicella)',
    'HPV',
    'Meningitis',
    'Polio',
    'Other',
  ];
  const ALLERGIES = [
    'Penicillin',
    'Sulfa drugs',
    'Aspirin or NSAIDs',
    'Codeine or opioids',
    'Latex',
    'Iodine or contrast dye',
    'Peanuts',
    'Tree nuts',
    'Shellfish',
    'Fish',
    'Eggs',
    'Milk',
    'Soy',
    'Wheat or gluten',
    'Bee or wasp stings',
    'Pollen',
    'Dust mites',
    'Mold',
    'Pet dander',
  ];
  const CONDITIONS = [
    'High blood pressure',
    'High cholesterol',
    'Heart disease',
    'Heart attack',
    'Heart failure',
    'Irregular heartbeat (AFib)',
    'Stroke or mini-stroke (TIA)',
    'Blood clots',
    'Diabetes',
    'Thyroid disease',
    'Asthma',
    'COPD or emphysema',
    'Sleep apnea',
    'Cancer',
    'Kidney disease',
    'Liver disease',
    'Acid reflux (GERD)',
    'Arthritis',
    'Osteoporosis',
    'Anemia',
    'Glaucoma',
    'Seizures',
    'Memory loss or dementia',
    'Depression',
    'Anxiety',
  ];

  const notCurrent = (v) => v.current === false;
  const fullName = (t) => [t.first, t.last].filter(Boolean).join(' ');
  const range = (a, b) => [PHP.fmtDate(a), PHP.fmtDate(b)].filter(Boolean).join(' to ');
  const oneLine = (t) => [[t.street, t.unit].filter(Boolean).join(', '), [[t.city, t.state].filter(Boolean).join(', '), t.zip].filter(Boolean).join(' ')].filter(Boolean);
  const addressFields = () => [
    { k: 'street', label: 'Street address', type: 'text', w: 'twothird' },
    { k: 'unit', label: 'Suite or unit', type: 'text', w: 'third' },
    { k: 'city', label: 'City', type: 'text', w: 'third' },
    { k: 'state', label: 'State', type: 'select', opts: STATES, w: 'third' },
    { k: 'zip', label: 'ZIP code', type: 'text', w: 'third', inputmode: 'numeric', maxlength: 10 },
  ];
  const ADDRESS_KEYS = ['street', 'unit', 'city', 'state', 'stateOther', 'zip'];

  const SECTIONS = [
    {
      id: 'basic',
      title: 'Personal Information',
      kind: 'profile',
      fields: [
        { k: 'first', label: 'First name', type: 'text', w: 'third' },
        { k: 'last', label: 'Last name', type: 'text', w: 'third' },
        { k: 'preferred', label: 'Preferred name', type: 'text', w: 'third' },
        { k: 'dob', label: 'Date of birth', type: 'date', w: 'third' },
        { k: 'sex', label: 'Sex', type: 'select', opts: ['Female', 'Male', 'Other'], w: 'third' },
        { k: 'marital', label: 'Marital status', type: 'select', opts: ['Single', 'Married', 'Partnered', 'Divorced', 'Separated', 'Widowed'], w: 'third' },
        { k: 'height', label: 'Height', type: 'height', w: 'third' },
        { k: 'weight', label: 'Weight', type: 'number', units: ['lb', 'kg'], w: 'third' },
        { k: 'blood', label: 'Blood type', type: 'select', opts: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'], w: 'third' },
        { k: 'phone', label: 'Phone', type: 'phone', w: 'third' },
        { k: 'email', label: 'Email', type: 'text', w: 'third' },
        { k: 'donor', label: 'Organ donor', type: 'select', opts: ['Yes', 'No', 'Undecided'], w: 'third' },
        { k: 'street', label: 'Street address', type: 'text', w: 'twothird' },
        { k: 'unit', label: 'Apt or unit', type: 'text', w: 'third' },
        { k: 'city', label: 'City', type: 'text', w: 'third' },
        { k: 'state', label: 'State', type: 'select', opts: STATES, w: 'third' },
        { k: 'zip', label: 'ZIP code', type: 'text', w: 'third', inputmode: 'numeric', maxlength: 10 },
      ],
      merge: [
        { label: 'Name', keys: ['first', 'last'], join: fullName },
        { label: 'Address', keys: ['street', 'unit', 'city', 'state', 'zip'], long: true, join: (t) => oneLine(t).join('\n') },
      ],
    },

    {
      id: 'lifestyle',
      title: 'Lifestyle',
      kind: 'profile',
      info: {
        what: 'A few questions about daily habits, work and home life.',
        why: 'Habits, sleep, stress and support at home all shape your health and care options.',
      },
      // Each collapsible heading opens the questions below it, up to the next heading
      fields: [
        { type: 'heading', label: 'Sleep', collapsible: true },
        { k: 'sleepHours', label: 'Hours of sleep per night', pdfLabel: 'Sleep per night', type: 'number', unit: 'hours', w: 'half' },
        { k: 'sleepQuality', label: 'How well do you sleep?', pdfLabel: 'Sleep quality', type: 'select', opts: ['Well', 'Fairly well', 'Poorly'], w: 'half' },
        { k: 'sleepTrouble', label: 'Trouble sleeping', type: 'check', w: 'full' },
        { k: 'sleepDesc', label: 'What kind of trouble?', pdfLabel: 'Sleep trouble', type: 'text', ph: 'e.g. waking at night, snoring', w: 'full', showIf: (v) => v.sleepTrouble === true },

        { type: 'heading', label: 'Activity', collapsible: true },
        { k: 'activity', label: 'How physically active are you?', pdfLabel: 'Physical activity', type: 'select', opts: ['Not active', 'Lightly active', 'Moderately active', 'Very active'], w: 'half' },
        { k: 'activityType', label: 'What do you do?', pdfLabel: 'Activity type', type: 'text', ph: 'e.g. walking, swimming', w: 'half', showIf: (v) => !!v.activity && v.activity !== 'Not active' },
        { k: 'activityDays', label: 'Days per week', type: 'select', opts: ['1', '2', '3', '4', '5', '6', '7'], w: 'half', showIf: (v) => !!v.activity && v.activity !== 'Not active' },
        { k: 'activityMins', label: 'Minutes each time', type: 'number', w: 'half', showIf: (v) => !!v.activity && v.activity !== 'Not active' },
        { k: 'mobility', label: 'Do you use a mobility aid?', pdfLabel: 'Mobility aid', type: 'select', opts: ['No', 'Cane', 'Walker', 'Wheelchair', 'Other'], w: 'half' },
        { k: 'falls', label: 'Any falls in the past year?', pdfLabel: 'Falls in past year', type: 'select', opts: ['No', 'Yes'], w: 'half' },
        { k: 'fallCount', label: 'How many?', pdfLabel: 'Number of falls', type: 'number', w: 'half', showIf: (v) => v.falls === 'Yes' },

        { type: 'heading', label: 'Habits', collapsible: true },
        { k: 'smoking', label: 'Do you use tobacco?', pdfLabel: 'Tobacco', type: 'select', opts: ['Never', 'Used to', 'Yes'], w: 'half' },
        { k: 'tobaccoType', label: 'What kind?', pdfLabel: 'Tobacco type', type: 'select', opts: ['Cigarettes', 'Cigars', 'Pipe', 'Chewing tobacco', 'Vaping', 'Other'], w: 'half', showIf: (v) => v.smoking === 'Yes' },
        { k: 'amount', label: 'How much per day?', pdfLabel: 'Amount per day', type: 'text', w: 'half', showIf: (v) => v.smoking === 'Yes' },
        { k: 'quit', label: 'Year you quit', pdfLabel: 'Year quit', type: 'number', w: 'half', showIf: (v) => v.smoking === 'Used to' },
        { k: 'smokedYears', label: 'How many years did you use it?', pdfLabel: 'Years used', type: 'number', w: 'half', showIf: (v) => v.smoking === 'Used to' },
        { k: 'alcohol', label: 'Do you drink alcohol?', pdfLabel: 'Alcohol', type: 'select', opts: ['No', 'Occasionally', 'Weekly', 'Daily'], w: 'half' },
        { k: 'drinks', label: 'Drinks per week', type: 'number', w: 'half', showIf: (v) => !!v.alcohol && v.alcohol !== 'No' },
        { k: 'caffeine', label: 'Cups of coffee, tea or soda per day', pdfLabel: 'Caffeine per day', type: 'number', w: 'half' },
        { k: 'drugs', label: 'Do you use cannabis or other drugs?', pdfLabel: 'Cannabis or drugs', type: 'select', opts: ['No', 'Used to', 'Yes'], w: 'half' },
        { k: 'drugsDesc', label: 'What and how often?', pdfLabel: 'Details', type: 'text', w: 'full', showIf: (v) => v.drugs === 'Yes' || v.drugs === 'Used to' },
        { k: 'diet', label: 'Do you follow a special diet?', pdfLabel: 'Diet', type: 'select', opts: ['No', 'Low sodium', 'Low sugar or diabetic', 'Heart healthy', 'Low fat', 'Vegetarian', 'Vegan', 'Gluten free', 'Other'], w: 'half' },

        { type: 'heading', label: 'Stress', collapsible: true },
        { k: 'stress', label: 'How would you rate your stress?', pdfLabel: 'Stress', type: 'select', opts: ['Low', 'Moderate', 'High'], w: 'half' },
        { k: 'stressDesc', label: 'Main sources of stress', type: 'text', w: 'half', showIf: (v) => v.stress === 'Moderate' || v.stress === 'High' },

        { type: 'heading', label: 'Occupation', collapsible: true },
        { k: 'work', label: 'Work status', type: 'select', opts: ['Working full time', 'Working part time', 'Retired', 'Not working', 'Disabled', 'Student', 'Homemaker', 'Other'], w: 'half' },
        { k: 'occupation', label: 'Occupation', type: 'text', w: 'half', showIf: (v) => /^Working|^Student/.test(v.work || '') },
        { k: 'formerOccupation', label: 'Former occupation', type: 'text', w: 'half', showIf: (v) => /^(Retired|Not working|Disabled)$/.test(v.work || '') },

        { type: 'heading', label: 'Home', collapsible: true },
        { k: 'living', label: 'Who do you live with?', pdfLabel: 'Living situation', type: 'select', opts: ['Live alone', 'Spouse or partner', 'Family', 'Assisted living', 'Nursing home', 'Other'], w: 'half' },
        { k: 'caregiver', label: 'Do you have a caregiver?', pdfLabel: 'Caregiver', type: 'select', opts: ['No', 'Yes'], w: 'half' },
        { k: 'caregiverName', label: 'Caregiver name and phone', pdfLabel: 'Caregiver details', type: 'text', w: 'half', showIf: (v) => v.caregiver === 'Yes' },
        { k: 'help', label: 'Do you need help with daily tasks?', pdfLabel: 'Help with daily tasks', type: 'select', opts: ['No', 'Some', 'Often'], w: 'half' },
        { k: 'helpDesc', label: 'Which tasks?', pdfLabel: 'Tasks', type: 'text', ph: 'e.g. bathing, shopping, driving', w: 'half', showIf: (v) => v.help === 'Some' || v.help === 'Often' },
        { k: 'driving', label: 'Do you drive?', pdfLabel: 'Driving', type: 'select', opts: ['Yes', 'Daytime only', 'No'], w: 'half' },

        // Always visible, outside the groups
        { k: 'notes', label: 'Anything else', pdfLabel: 'Notes', type: 'long', w: 'full', ungrouped: true },
      ],
    },

    {
      id: 'family',
      title: 'Family Medical History',
      kind: 'list',
      info: {
        what: 'Health conditions in your blood relatives.',
        why: 'Many conditions run in families. This helps your doctor judge your risks.',
      },
      list: {
        key: 'main',
        kind: 'history',
        itemLabel: 'relative',
        fields: [
          { k: 'rel', label: 'Relative', type: 'select', opts: RELATIVES, w: 'half' },
          { k: 'status', label: 'Status', type: 'select', opts: ['Living', 'Deceased'], w: 'half' },
          { k: 'ageDeath', label: 'Age at death', type: 'number', w: 'half', showIf: (v) => v.status === 'Deceased' },
          {
            k: 'conditions',
            label: 'Conditions',
            type: 'group',
            itemLabel: 'condition',
            w: 'full',
            fields: [
              { k: 'name', label: 'Condition', type: 'text', w: 'half' },
              { k: 'age', label: 'Age at diagnosis', type: 'number', w: 'half' },
              { k: 'notes', label: 'Notes', type: 'text', w: 'full' },
            ],
            format: (c) => [c.name, PHP.isFilled(c.age) && `(age ${c.age})`].filter(Boolean).join(' ') + (PHP.isFilled(c.notes) ? ` - ${c.notes.trim()}` : ''),
          },
        ],
        title_: (e) => PHP.ov(e, 'rel'),
        sub: (e) =>
          [(e.conditions || []).map((c) => c.name).filter((x) => PHP.isFilled(x)).join(', '), e.status === 'Deceased' && (PHP.isFilled(e.ageDeath) ? `Deceased at ${e.ageDeath}` : 'Deceased')]
            .filter(Boolean)
            .join(' · '),
      },
    },

    {
      id: 'conditions',
      title: 'Medical History',
      kind: 'list',
      info: {
        what: 'Health conditions you have now or have had in the past.',
        why: 'Start with the checklist, then add details or anything not listed. Uncheck "Current condition" once something has resolved.',
      },
      list: {
        key: 'main',
        kind: 'current',
        itemLabel: 'condition',
        split: 'current',
        pastTitle: 'Past conditions',
        pastSortBy: 'resolved',
        questionnaire: { prompt: 'Have you ever been diagnosed with any of these?', items: CONDITIONS },
        fields: [
          { k: 'current', label: 'Current condition', type: 'check', w: 'full', meta: true, defaultOn: true },
          { k: 'name', label: 'Condition', type: 'text', w: 'full' },
          { k: 'diagnosed', label: 'Date diagnosed', type: 'date', w: 'half' },
          { k: 'resolved', label: 'Date resolved', type: 'date', w: 'half', showIf: notCurrent },
          { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
        ],
        title_: (e) => e.name,
        sub: (e) => (PHP.isCurrent(e) ? (e.diagnosed ? 'Since ' + PHP.fmtDate(e.diagnosed) : '') : range(e.diagnosed, e.resolved)),
      },
    },

    {
      id: 'meds',
      title: 'Medications',
      kind: 'list',
      info: {
        what: 'Prescriptions you take now and ones you have stopped.',
        why: 'The most useful page to bring to any appointment. When you stop one, uncheck "Currently taking" to keep it as history.',
      },
      list: {
        key: 'main',
        kind: 'current',
        itemLabel: 'medication',
        split: 'current',
        pastTitle: 'Past medications',
        pastSortBy: 'end',
        fields: [
          { k: 'current', label: 'Currently taking', type: 'check', w: 'full', meta: true, defaultOn: true },
          { k: 'name', label: 'Medication', type: 'text', w: 'half' },
          { k: 'type', label: 'Prescription or over-the-counter', type: 'select', opts: ['Prescription', 'Over-the-counter'], w: 'half' },
          { k: 'strength', label: 'Strength', type: 'number', w: 'third', ph: 'e.g. 10' },
          { k: 'unit', label: 'Unit', type: 'select', opts: UNITS, w: 'third' },
          { k: 'form', label: 'Form', type: 'select', opts: FORMS, w: 'third' },
          { k: 'amount', label: 'How much each time', type: 'text', w: 'half', ph: 'e.g. 1 tablet' },
          { k: 'freq', label: 'How often', type: 'select', opts: FREQUENCIES, w: 'half' },
          { k: 'prnFor', label: 'Take it for', type: 'text', w: 'full', ph: 'e.g. pain, trouble sleeping', showIf: (v) => v.freq === 'As needed' },
          { k: 'prescriber', label: 'Prescribed by', type: 'text', w: 'half', suggest: () => PHP.currentProviderNames() },
          { k: 'pharmacy', label: 'Pharmacy', type: 'text', w: 'half', suggest: () => PHP.pharmacyNames() },
          { k: 'start', label: 'Started', type: 'date', w: 'half' },
          { k: 'lastFilled', label: 'Last filled', type: 'date', w: 'half', showIf: (v) => v.current !== false },
          { k: 'refills', label: 'Refills left', type: 'number', w: 'half', showIf: (v) => v.current !== false },
          { k: 'end', label: 'Stopped', type: 'date', w: 'half', showIf: notCurrent },
          { k: 'reason', label: 'Reason stopped', type: 'text', w: 'full', showIf: notCurrent },
          { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
        ],
        // The PDF combines related boxes so the table stays readable
        merge: [
          { label: 'Medication', keys: ['name', 'type'], join: (t) => [t.name, t.type === 'Over-the-counter' && '(over-the-counter)'].filter(Boolean).join(' ') },
          { label: 'Strength', keys: ['strength', 'unit', 'form'], join: (t) => [[t.strength, t.strength && t.unit].filter(Boolean).join(' '), t.form && t.form.toLowerCase()].filter(Boolean).join(' ') },
          { label: 'How often', keys: ['freq', 'prnFor'], join: (t) => (t.freq === 'As needed' && t.prnFor ? `As needed for ${t.prnFor}` : t.freq) },
          { label: 'Refills', keys: ['refills', 'lastFilled'], join: (t) => [t.refills && `${t.refills} left`, t.lastFilled && `last filled ${t.lastFilled}`].filter(Boolean).join(', ') },
        ],
        title_: (e) => e.name,
        sub: (e) =>
          PHP.isCurrent(e)
            ? [PHP.medStrength(e), e.amount, PHP.medFreq(e)].filter(Boolean).join(' · ')
            : [PHP.medStrength(e), range(e.start, e.end), e.reason].filter(Boolean).join(' · '),
      },
    },

    {
      id: 'surgeries',
      title: 'Surgeries & Procedures',
      kind: 'list',
      info: {
        what: 'Operations and major procedures, with dates.',
        why: 'Past surgeries affect risks, imaging and future treatment.',
      },
      list: {
        key: 'main',
        kind: 'history',
        itemLabel: 'procedure',
        sortBy: 'date',
        fields: [
          { k: 'name', label: 'Procedure', type: 'text', w: 'half' },
          { k: 'date', label: 'Date', type: 'date', w: 'half' },
          { k: 'where', label: 'Hospital or surgeon', type: 'text', w: 'full' },
          { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
        ],
        title_: (e) => e.name,
        sub: (e) => [PHP.fmtDate(e.date), e.where].filter(Boolean).join(' · '),
      },
    },

    {
      id: 'immunizations',
      title: 'Immunizations',
      optional: true,
      blurb: 'Vaccines and when you got them',
      kind: 'list',
      info: {
        what: 'Vaccines you have received, with dates.',
        why: 'Shows what is up to date and what may be due.',
      },
      list: {
        key: 'main',
        kind: 'history',
        itemLabel: 'vaccine',
        sortBy: 'date',
        fields: [
          { k: 'name', label: 'Vaccine', type: 'select', opts: VACCINES, w: 'half' },
          { k: 'date', label: 'Date', type: 'date', w: 'half' },
          { k: 'location', label: 'Administered at', type: 'text', ph: 'e.g. pharmacy or doctor\'s office', w: 'full', suggest: () => PHP.officeNames() },
          { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
        ],
        title_: (e) => PHP.ov(e, 'name'),
        sub: (e) => [PHP.fmtDate(e.date), e.location].filter((x) => PHP.isFilled(x)).join(' · '),
      },
    },

    {
      id: 'allergies',
      title: 'Allergies',
      kind: 'list',
      info: {
        what: 'Check anything that causes you a reaction, then add details.',
        why: 'Helps every provider avoid treatments that could harm you.',
      },
      list: {
        key: 'main',
        kind: 'current',
        itemLabel: 'allergy',
        noneLabel: 'No known allergies',
        choices: ALLERGIES,
        fields: [
          { k: 'name', label: 'Allergic to', type: 'text', w: 'full' },
          { k: 'severity', label: 'Severity', type: 'select', opts: ['Mild', 'Moderate', 'Severe'], w: 'half' },
          { k: 'reaction', label: 'Reaction', type: 'select', opts: ['Hives or rash', 'Itching', 'Swelling', 'Trouble breathing', 'Anaphylaxis', 'Nausea or vomiting', 'Diarrhea', 'Dizziness', 'Other'], w: 'half' },
          { k: 'notes', label: 'Notes', type: 'text', w: 'full' },
        ],
        title_: (e) => e.name,
        sub: (e) => [PHP.ov(e, 'reaction'), e.severity].filter(Boolean).join(' · '),
      },
    },

    {
      id: 'providers',
      title: 'Providers',
      kind: 'list',
      info: {
        what: 'Doctors, therapists and other providers you see now or used to see.',
        why: 'Keeps contact details in one place, and helps when records must be requested from past providers.',
      },
      list: {
        key: 'main',
        kind: 'current',
        itemLabel: 'provider',
        split: 'current',
        pastTitle: 'Past providers',
        pastSortBy: 'end',
        fields: [
          { k: 'current', label: 'Currently seeing', type: 'check', w: 'full', meta: true, defaultOn: true },
          { k: 'prefix', label: 'Prefix', type: 'select', opts: PREFIXES, w: 'third' },
          { k: 'name', label: 'Name', type: 'text', w: 'third' },
          { k: 'credentials', label: 'Credentials', type: 'select', opts: CREDENTIALS, w: 'third' },
          { k: 'specialty', label: 'Specialty', type: 'select', opts: SPECIALTIES, w: 'half' },
          { k: 'office', label: 'Office', type: 'text', w: 'half', suggest: () => PHP.officeNames() },
          { k: 'phone', label: 'Phone', type: 'phone', w: 'half' },
          ...addressFields(),
          { k: 'start', label: 'Started seeing', type: 'date', w: 'half' },
          { k: 'end', label: 'Stopped seeing', type: 'date', w: 'half', showIf: notCurrent },
          { k: 'reason', label: 'Reason for leaving', type: 'text', w: 'full', showIf: notCurrent },
          { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
        ],
        merge: [
          { label: 'Name', keys: ['prefix', 'name', 'credentials'], join: (t) => [t.prefix, t.name].filter(Boolean).join(' ') + (t.name && t.credentials ? `, ${t.credentials}` : '') },
          { label: 'Office', keys: ['office', 'street', 'unit', 'city', 'state', 'zip'], join: (t) => [t.office, oneLine(t).join(', ')].filter(Boolean).join('\n') },
        ],
        // Typing an office that is already listed fills in its address and phone
        autofill: (e, k) => {
          if (k !== 'office' || !PHP.isFilled(e.office)) return null;
          const key = e.office.trim().toLowerCase();
          const m = PHP.providers().find((p) => p !== e && String(p.office || '').trim().toLowerCase() === key);
          if (!m) return null;
          const out = {};
          if (e.office !== m.office) out.office = m.office; // match the existing spelling
          if (!ADDRESS_KEYS.some((a) => PHP.isFilled(e[a]))) ADDRESS_KEYS.forEach((a) => PHP.isFilled(m[a]) && (out[a] = m[a]));
          if (!PHP.isFilled(e.phone) && PHP.isFilled(m.phone)) out.phone = m.phone;
          return out;
        },
        title_: (e) => PHP.providerName(e) || e.office,
        sub: (e) => [PHP.ov(e, 'specialty'), PHP.providerName(e) && e.office, !PHP.isCurrent(e) && range(e.start, e.end)].filter(Boolean).join(' · '),
      },
    },

    {
      id: 'insurance',
      title: 'Insurance',
      kind: 'list',
      info: {
        what: 'Health, supplemental and prescription plans.',
        why: 'Saves time at check-in and when filling prescriptions.',
      },
      list: {
        key: 'main',
        kind: 'current',
        itemLabel: 'plan',
        fields: [
          { k: 'type', label: 'Plan type', type: 'select', opts: ['Medicare', 'Medicaid', 'Medicare Advantage', 'Supplemental', 'Prescription', 'Private', 'Other'], w: 'half' },
          { k: 'provider', label: 'Insurance company', type: 'text', w: 'half' },
          { k: 'member', label: 'Member ID', type: 'text', w: 'half' },
          { k: 'group', label: 'Group number', type: 'text', w: 'half' },
          { k: 'phone', label: 'Phone', type: 'phone', w: 'half' },
          { k: 'effective', label: 'Effective date', type: 'date', w: 'half' },
          { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
        ],
        title_: (e) => e.provider || PHP.ov(e, 'type'),
        sub: (e) => [e.provider && PHP.ov(e, 'type'), e.member && 'ID ' + e.member].filter(Boolean).join(' · '),
      },
    },

    {
      id: 'emergency',
      title: 'Emergency Contacts',
      kind: 'list',
      info: {
        what: 'People to call if something happens to you.',
        why: 'Hospitals and clinics ask for this at every visit.',
      },
      list: {
        key: 'main',
        kind: 'current',
        itemLabel: 'contact',
        fields: [
          { k: 'first', label: 'First name', type: 'text', w: 'half' },
          { k: 'last', label: 'Last name', type: 'text', w: 'half' },
          { k: 'rel', label: 'Relationship', type: 'select', opts: RELATIONS, w: 'half' },
          { k: 'phone', label: 'Phone', type: 'phone', w: 'half' },
          { k: 'email', label: 'Email', type: 'text', w: 'full' },
          { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
        ],
        merge: [{ label: 'Name', keys: ['first', 'last'], join: fullName }],
        title_: (e) => fullName(e),
        sub: (e) => [PHP.ov(e, 'rel'), e.phone].filter(Boolean).join(' · '),
      },
    },

    {
      id: 'notes',
      title: 'Notes & Questions',
      kind: 'list',
      info: {
        what: 'A running log: advice from your doctor, new symptoms, questions for your next visit.',
        why: 'Easy to forget in the moment. Bring this list to appointments.',
      },
      list: {
        key: 'main',
        kind: 'history',
        itemLabel: 'note',
        sortBy: 'date',
        fields: [
          { k: 'date', label: 'Date', type: 'date', w: 'half' },
          { k: 'type', label: 'Type', type: 'select', opts: ['Doctor recommendation', 'New symptom', 'Question for next visit', 'Other'], w: 'half' },
          { k: 'text', label: 'Note', type: 'long', w: 'full' },
          { k: 'resolved', label: 'Resolved or discussed', type: 'check', w: 'full' },
        ],
        title_: (e) => (e.text || '').split('\n')[0].slice(0, 70),
        sub: (e) => [PHP.fmtDate(e.date), PHP.ov(e, 'type'), e.resolved && 'Resolved'].filter(Boolean).join(' · '),
      },
    },

    /* Optional sections */
    {
      id: 'appointments',
      title: 'Appointment Log',
      optional: true,
      blurb: 'What happened at each visit',
      kind: 'list',
      info: {
        what: 'A record of each visit: who you saw and what came out of it.',
        why: 'Helps you remember changes and follow up on referrals or tests. Offices and providers come from your Providers section.',
      },
      list: {
        key: 'main',
        kind: 'history',
        itemLabel: 'appointment',
        sortBy: 'date',
        fields: [
          { k: 'date', label: 'Date', type: 'date', w: 'third' },
          { k: 'office', label: 'Office', type: 'select', opts: () => PHP.officeNames().concat('Other'), w: 'third' },
          { k: 'provider', label: 'Provider', type: 'select', opts: () => PHP.currentProviderNames().concat('Other'), w: 'third' },
          { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
          {
            k: 'outcomes',
            label: 'From this visit',
            type: 'checklist',
            w: 'full',
            items: [
              { k: 'rx', label: 'New prescription' },
              { k: 'medChange', label: 'Medication change' },
              { k: 'dx', label: 'New diagnosis' },
              { k: 'tests', label: 'Tests or labs ordered' },
              { k: 'referral', label: 'Referral' },
              { k: 'followup', label: 'Follow-up visit' },
              { k: 'otherOutcome', label: 'Other' },
            ],
          },
        ],
        title_: (e) => PHP.ov(e, 'provider') || PHP.ov(e, 'office'),
        sub: (e) => [PHP.fmtDate(e.date), e.provider && PHP.ov(e, 'office')].filter(Boolean).join(' · '),
      },
    },
    {
      id: 'supplements',
      title: 'Supplements & Over-the-Counter',
      optional: true,
      blurb: 'Vitamins, herbs, non-prescription drugs',
      kind: 'list',
      info: {
        what: 'Vitamins, herbs and non-prescription products you take.',
        why: 'These can interact with prescriptions.',
      },
      list: {
        key: 'main',
        kind: 'current',
        itemLabel: 'item',
        fields: [
          { k: 'name', label: 'Product', type: 'text', w: 'half' },
          { k: 'dose', label: 'Dose', type: 'text', w: 'half' },
          { k: 'freq', label: 'How often', type: 'text', w: 'half' },
          { k: 'purpose', label: 'For', type: 'text', w: 'half' },
        ],
        title_: (e) => e.name,
        sub: (e) => [e.dose, e.freq].filter(Boolean).join(' · '),
      },
    },
    {
      id: 'hospital',
      title: 'Hospital Stays',
      optional: true,
      blurb: 'Admissions and emergency visits',
      kind: 'list',
      info: { what: 'Overnight stays and emergency room visits.', why: 'Gives context for your medical timeline.' },
      list: {
        key: 'main',
        kind: 'history',
        itemLabel: 'stay',
        sortBy: 'date',
        fields: [
          { k: 'reason', label: 'Reason', type: 'text', w: 'full' },
          { k: 'date', label: 'Admitted', type: 'date', w: 'half' },
          { k: 'discharged', label: 'Discharged', type: 'date', w: 'half' },
          { k: 'where', label: 'Hospital', type: 'text', w: 'full' },
          { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
        ],
        title_: (e) => e.reason,
        sub: (e) => [PHP.fmtDate(e.date), e.where].filter(Boolean).join(' · '),
      },
    },
    {
      id: 'screenings',
      title: 'Tests & Screenings',
      optional: true,
      blurb: 'Labs, scans, colonoscopy, mammogram',
      kind: 'list',
      info: { what: 'Test results and routine screenings, with dates.', why: 'Shows what is due and how results change over time.' },
      list: {
        key: 'main',
        kind: 'history',
        itemLabel: 'test',
        sortBy: 'date',
        fields: [
          { k: 'name', label: 'Test', type: 'text', w: 'half' },
          { k: 'date', label: 'Date', type: 'date', w: 'half' },
          { k: 'result', label: 'Result', type: 'long', w: 'full' },
          { k: 'next', label: 'Next due', type: 'date', w: 'half' },
        ],
        title_: (e) => e.name,
        sub: (e) => [PHP.fmtDate(e.date), e.result && e.result.split('\n')[0].slice(0, 50)].filter(Boolean).join(' · '),
      },
    },
    {
      id: 'reproductive',
      title: 'Reproductive Health',
      optional: true,
      blurb: 'Pregnancies, menopause, sex-specific screenings',
      kind: 'profile',
      info: {
        what: 'Pregnancies, menopause and screenings specific to your sex.',
        why: 'Doctors ask about these on most intake forms, and they affect screening and treatment choices. Questions follow the sex chosen in Personal Information.',
      },
      fields: [
        { type: 'heading', label: 'Pregnancy', showIf: notMale },
        { k: 'pregnancies', label: 'Number of pregnancies', type: 'number', w: 'third', showIf: notMale },
        { k: 'births', label: 'Number of births', type: 'number', w: 'third', showIf: notMale },
        { k: 'cesareans', label: 'C-sections', type: 'number', w: 'third', showIf: notMale },
        { k: 'pregnancyNotes', label: 'Complications or notes', pdfLabel: 'Pregnancy notes', type: 'text', w: 'full', showIf: notMale },

        { type: 'heading', label: 'Periods & menopause', showIf: notMale },
        { k: 'menopause', label: 'Have you gone through menopause?', pdfLabel: 'Menopause', type: 'select', opts: ['No', 'Going through it now', 'Yes'], w: 'half', showIf: notMale },
        { k: 'menopauseAge', label: 'Age at menopause', type: 'number', w: 'half', showIf: (v) => notMale() && v.menopause === 'Yes' },
        { k: 'lastPeriod', label: 'First day of last period', type: 'date', w: 'half', showIf: (v) => notMale() && !!v.menopause && v.menopause !== 'Yes' },
        { k: 'hormones', label: 'Hormone therapy or birth control', pdfLabel: 'Hormones', type: 'select', opts: ['No', 'Yes'], w: 'half', showIf: notMale },
        { k: 'hormonesDesc', label: 'Which one?', pdfLabel: 'Hormone details', type: 'text', w: 'half', showIf: (v) => notMale() && v.hormones === 'Yes' },

        { type: 'heading', label: 'Screenings' },
        { k: 'mammogram', label: 'Last mammogram', type: 'date', w: 'half', showIf: notMale },
        { k: 'pap', label: 'Last Pap test', type: 'date', w: 'half', showIf: notMale },
        { k: 'psa', label: 'Last prostate screening (PSA)', type: 'date', w: 'half', showIf: notFemale },
        { k: 'boneDensity', label: 'Last bone density scan', type: 'date', w: 'half' },
        { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
      ],
    },
    {
      id: 'vitals',
      title: 'Vitals Log',
      optional: true,
      blurb: 'Blood pressure, weight, glucose',
      kind: 'list',
      info: { what: 'Readings you take at home.', why: 'Trends over time help your doctor adjust treatment.' },
      list: {
        key: 'main',
        kind: 'history',
        itemLabel: 'reading',
        sortBy: 'date',
        fields: [
          { k: 'date', label: 'Date', type: 'date', w: 'half' },
          { k: 'bp', label: 'Blood pressure', type: 'text', w: 'half', ph: '120/80' },
          { k: 'pulse', label: 'Pulse', type: 'number', w: 'third' },
          { k: 'weight', label: 'Weight', type: 'number', units: ['lb', 'kg'], w: 'third' },
          { k: 'glucose', label: 'Glucose', type: 'number', w: 'third' },
          { k: 'notes', label: 'Notes', type: 'text', w: 'full' },
        ],
        title_: (e) => [e.bp && 'BP ' + e.bp, e.pulse && 'Pulse ' + e.pulse].filter(Boolean).join(' · ') || PHP.fmtDate(e.date),
        sub: (e) => [PHP.fmtDate(e.date), e.weight && `${e.weight} ${e.weightUnit || 'lb'}`, e.glucose && 'Glucose ' + e.glucose].filter(Boolean).join(' · '),
      },
    },
    {
      id: 'devices',
      title: 'Devices & Implants',
      optional: true,
      blurb: 'Pacemaker, joint replacement, hearing aid',
      kind: 'list',
      info: { what: 'Implanted or worn medical devices.', why: 'Important for MRI safety and emergencies.' },
      list: {
        key: 'main',
        kind: 'current',
        itemLabel: 'device',
        fields: [
          { k: 'name', label: 'Device', type: 'text', w: 'half' },
          { k: 'date', label: 'Date placed', type: 'date', w: 'half' },
          { k: 'notes', label: 'Model or notes', type: 'long', w: 'full' },
        ],
        title_: (e) => e.name,
        sub: (e) => PHP.fmtDate(e.date),
      },
    },
    {
      id: 'vision',
      title: 'Vision',
      optional: true,
      blurb: 'Glasses, eye exams, eye conditions',
      kind: 'profile',
      info: { what: 'Glasses, eye exams and eye conditions.', why: 'Eye checkups are easy to lose track of, and some conditions affect other treatment.' },
      fields: [
        { k: 'glasses', label: 'Glasses or contacts', type: 'select', opts: ['No', 'Glasses', 'Contacts', 'Both'], w: 'half' },
        { k: 'rx', label: 'Prescription', type: 'text', w: 'half', showIf: (v) => !!v.glasses && v.glasses !== 'No' },
        { k: 'eyeExam', label: 'Last eye exam', type: 'date', w: 'half' },
        { k: 'eyeDoctor', label: 'Eye doctor', type: 'text', w: 'half', suggest: () => PHP.currentProviderNames() },
        { k: 'eyeConditions', label: 'Eye conditions', type: 'text', ph: 'e.g. cataracts, glaucoma', w: 'full' },
        { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
      ],
    },
    {
      id: 'hearing',
      title: 'Hearing',
      optional: true,
      blurb: 'Hearing loss, hearing aids, tests',
      kind: 'profile',
      info: { what: 'Hearing changes, hearing aids and hearing tests.', why: 'Lets providers know how best to communicate with you.' },
      fields: [
        { k: 'loss', label: 'Hearing loss', type: 'select', opts: ['None', 'Mild', 'Moderate', 'Severe'], w: 'half' },
        { k: 'aids', label: 'Hearing aids', type: 'select', opts: ['No', 'Left ear', 'Right ear', 'Both ears'], w: 'half' },
        { k: 'hearingExam', label: 'Last hearing test', type: 'date', w: 'half' },
        { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
      ],
    },
    {
      id: 'dental',
      title: 'Dental',
      optional: true,
      blurb: 'Dental visits, dentures, implants',
      kind: 'profile',
      info: { what: 'Dental visits, dentures and implants.', why: 'Dental health affects nutrition and some procedures.' },
      fields: [
        { k: 'dental', label: 'Last dental visit', type: 'date', w: 'half' },
        { k: 'dentist', label: 'Dentist', type: 'text', w: 'half', suggest: () => PHP.currentProviderNames() },
        { k: 'dentures', label: 'Dentures or implants', type: 'select', opts: ['None', 'Partial dentures', 'Full dentures', 'Implants'], w: 'half' },
        { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
      ],
    },
  ];

  // Display order, following a doctor's history: who you are, conditions, allergies, medications, procedures,
  // family and social history, then reference details. Additional sections (in brackets) sit beside their
  // natural partner and only appear once added. The form, side menu, PDF and Additional Sections list all follow it.
  const ORDER = [
    'basic',
    'conditions',
    'reproductive', //    [after Medical History]
    'allergies',
    'meds',
    'supplements', //     [after Medications]
    'surgeries',
    'immunizations', //   [after Surgeries]
    'screenings', //      [after Surgeries]
    'hospital', //        [with the procedure group]
    'devices', //         [with the procedure group]
    'family',
    'lifestyle',
    'vision', //          [after Lifestyle]
    'hearing', //         [after Lifestyle]
    'dental', //          [after Lifestyle]
    'providers',
    'insurance',
    'emergency',
    'vitals', //          [with the logs]
    'appointments', //    [just before Notes]
    'notes', // always last
  ];
  const defined = new Map(SECTIONS.map((s, i) => [s.id, i]));
  // Any section missing from ORDER goes just before Notes, so a new one is never lost
  const rank = (s) => (ORDER.includes(s.id) ? ORDER.indexOf(s.id) : ORDER.length - 1.5 + defined.get(s.id) / 1000);
  SECTIONS.sort((a, b) => rank(a) - rank(b));

  PHP.SECTIONS = SECTIONS;
  PHP.sectionById = (id) => SECTIONS.find((s) => s.id === id);
  PHP.listsOf = (sec) => (sec.list ? [sec.list] : []);
  PHP.entryTitle = (L, e) => (L.title_ ? L.title_(e) : '') || '';
  PHP.fullName = fullName;

  /* ---------- Data helpers shared by the form and the PDF ---------- */
  PHP.todayISO = () => {
    const t = new Date();
    return [t.getFullYear(), String(t.getMonth() + 1).padStart(2, '0'), String(t.getDate()).padStart(2, '0')].join('-');
  };
  PHP.isFilled = (v) => v === true || (typeof v === 'string' && v.replace(/-/g, '').trim() !== '');
  PHP.visibleFields = (fields, obj) => fields.filter((f) => !f.showIf || f.showIf(obj || {}));

  const groupItems = (f, obj) => (Array.isArray(obj[f.k]) ? obj[f.k] : []).filter((it) => f.fields.some((sf) => PHP.fieldFilled(sf, it)));
  PHP.fieldFilled = (f, obj) => {
    if (f.type === 'heading') return false;
    if (f.type === 'group') return groupItems(f, obj).length > 0;
    if (f.type === 'checklist') return f.items.some((i) => obj[i.k] === true);
    return PHP.isFilled(obj[f.k]);
  };
  PHP.fieldText = (f, obj) => {
    const v = obj[f.k];
    if (f.type === 'heading') return '';
    if (f.type === 'group') return groupItems(f, obj).map((it) => (f.format ? f.format(it) : f.fields.map((sf) => PHP.fieldText(sf, it)).filter(Boolean).join(', '))).join('\n');
    if (f.type === 'checklist')
      return f.items
        .filter((i) => obj[i.k] === true)
        .map((i) => (PHP.isFilled(obj[i.k + 'Note']) ? `${i.label}: ${obj[i.k + 'Note'].trim()}` : i.label))
        .join('\n');
    if (f.type === 'date') return PHP.fmtDate(v);
    if (f.type === 'height') return PHP.fmtHeight(v, obj[f.k + 'Unit']);
    if (f.type === 'check') return v ? 'Yes' : '';
    if (f.type === 'select') return PHP.ov(obj, f.k);
    const s = String(v == null ? '' : v).trim();
    // A fixed unit, or the one chosen from the field's unit dropdown (the first is the default)
    const unit = f.units ? obj[f.k + 'Unit'] || f.units[0] : f.unit;
    return unit && s ? `${s} ${unit}` : s;
  };
  PHP.entryHasData = (L, e) => PHP.visibleFields(L.fields, e).some((f) => !f.meta && PHP.fieldFilled(f, e));
  PHP.sectionHasData = (sec, d) => {
    if (!d) return false;
    const vals = d.values || {};
    if (sec.kind === 'profile') return PHP.visibleFields(sec.fields, vals).some((f) => PHP.fieldFilled(f, vals));
    if (sec.list.noneLabel && d.none) return true;
    return ((d.lists || {})[sec.list.key] || []).some((e) => PHP.entryHasData(sec.list, e));
  };

  // Output columns: plain fields plus merged ones (e.g. first + last = Name)
  PHP.outputCols = (fields, merge) => {
    const cols = [];
    const merged = new Set();
    for (const f of fields) {
      if (f.meta || f.type === 'heading' || merged.has(f.k)) continue;
      const m = (merge || []).find((g) => g.keys.includes(f.k));
      if (m) {
        m.keys.forEach((k) => merged.add(k));
        const parts = m.keys.map((k) => fields.find((x) => x.k === k));
        const text = (o) => {
          const t = {};
          parts.forEach((p) => (t[p.k] = PHP.fieldText(p, o)));
          return m.join(t);
        };
        cols.push({ label: m.label, long: !!m.long, type: 'text', text, filled: (o) => text(o) !== '' });
      } else {
        const vis = (o) => !f.showIf || f.showIf(o);
        cols.push({
          label: f.pdfLabel || f.label,
          k: f.k,
          long: f.type === 'long' || f.type === 'checklist' || f.type === 'group',
          type: f.type,
          text: (o) => (vis(o) ? PHP.fieldText(f, o) : ''),
          filled: (o) => vis(o) && PHP.fieldFilled(f, o),
        });
      }
    }
    return cols;
  };

  // History lists show newest first; current lists keep the order they were entered
  PHP.sortByDate = (arr, key) =>
    arr.slice().sort((a, b) => {
      const ka = PHP.dateSortKey(a[key]);
      const kb = PHP.dateSortKey(b[key]);
      return ka === kb ? 0 : kb > ka ? 1 : -1;
    });
  PHP.sortEntries = (L, arr) => (L.kind === 'history' && L.sortBy ? PHP.sortByDate(arr, L.sortBy) : arr.slice());
  // For lists split by a "current" checkbox: { current: [...], past: [...] }
  PHP.splitEntries = (L, arr) => ({
    current: arr.filter(PHP.isCurrent),
    past: PHP.sortByDate(arr.filter((e) => !PHP.isCurrent(e)), L.pastSortBy || 'end'),
  });
  // Allergies: list order follows the checklist, then anything typed in under Other
  PHP.choiceOrder = (L, arr) => {
    const pos = (e) => (L.choices.includes(e.q) ? L.choices.indexOf(e.q) : L.choices.length);
    return arr.slice().sort((a, b) => pos(a) - pos(b));
  };

  /* ---------- Upgrade data saved by earlier versions ---------- */
  const parseAddress = (text) => {
    const lines = String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return {};
    const m = lines.length > 1 && lines[lines.length - 1].match(/^(.*?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (!m) return { street: lines.join(', ') };
    const st = m[2].toUpperCase();
    return Object.assign({ street: lines.slice(0, -1).join(', '), city: m[1], zip: m[3] }, STATES.includes(st) ? { state: st } : { state: 'Other', stateOther: m[2] });
  };
  const addNote = (e, text) => {
    if (!PHP.isFilled(text)) return;
    e.notes = [e.notes, text].filter((s) => PHP.isFilled(s)).join('\n');
  };
  const matchLabel = (name, labels) => labels.find((l) => l.toLowerCase() === String(name || '').trim().toLowerCase());

  PHP.migrate = (data) => {
    const d = data || {};
    const list = (id) => {
      d[id] = d[id] || {};
      d[id].lists = d[id].lists || {};
      return (d[id].lists.main = d[id].lists.main || []);
    };
    const splitName = (n) => {
      const p = String(n || '').trim().split(/\s+/).filter(Boolean);
      return { first: p.length > 1 ? p.slice(0, -1).join(' ') : p[0] || '', last: p.length > 1 ? p[p.length - 1] : '' };
    };

    // Basic information
    const b = d.basic;
    if (b && b.values) {
      const v = b.values;
      if (v.name && !v.first && !v.last) Object.assign(v, splitName(v.name));
      delete v.name;
      if (v.address && !v.street) Object.assign(v, parseAddress(v.address));
      if (v.phone) v.phone = PHP.fmtPhone(v.phone);
      ['address', 'pharmacy', 'directive', 'directiveLoc', 'proxy', 'proxyPhone'].forEach((k) => delete v[k]);
      if (b.lists && b.lists.emergency) {
        const em = list('emergency');
        b.lists.emergency.forEach((c) => {
          const known = RELATIONS.includes(c.rel);
          em.push({ id: c.id, ...splitName(c.name), rel: c.rel ? (known ? c.rel : 'Other') : '', relOther: known ? '' : c.rel, phone: PHP.fmtPhone(c.phone) });
        });
        delete b.lists.emergency;
      }
    }

    // Medications: history merged in, "For" moved to notes
    if (d.medhistory) {
      const meds = list('meds');
      ((d.medhistory.lists || {}).main || []).forEach((e) => meds.push({ ...e, current: false }));
      delete d.medhistory;
    }
    ((d.meds && d.meds.lists && d.meds.lists.main) || []).forEach((e) => {
      if (PHP.isFilled(e.purpose)) addNote(e, 'For: ' + e.purpose);
      delete e.purpose;
    });

    // Providers: doctors merged in, address split into parts
    if (d.doctors || d.formerdoctors) {
      const pv = list('providers');
      ((d.doctors && d.doctors.lists.main) || []).forEach((e) => pv.push({ id: e.id, name: e.name, specialty: 'Other', specialtyOther: e.specialty, office: e.practice, phone: e.phone, start: e.since, notes: e.notes, current: true }));
      ((d.formerdoctors && d.formerdoctors.lists.main) || []).forEach((e) =>
        pv.push({ id: e.id, name: e.name, specialty: 'Other', specialtyOther: e.specialty, office: e.practice, phone: e.phone, start: e.from, end: e.to, reason: e.reason, current: false })
      );
      pv.forEach((p) => {
        const s = SPECIALTIES.find((x) => x.toLowerCase() === String(p.specialtyOther || '').toLowerCase());
        if (s) (p.specialty = s), delete p.specialtyOther;
        if (!p.specialtyOther && p.specialty === 'Other') delete p.specialty;
      });
      delete d.doctors;
      delete d.formerdoctors;
    }
    ((d.providers && d.providers.lists && d.providers.lists.main) || []).forEach((p) => {
      if (typeof p.address === 'string') {
        if (!ADDRESS_KEYS.some((a) => PHP.isFilled(p[a]))) Object.assign(p, parseAddress(p.address));
        delete p.address;
      }
    });

    // Conditions and diagnosis history become one Medical History list
    if (d.dxhistory) {
      const cs = list('conditions');
      ((d.dxhistory.lists || {}).main || []).forEach((e) => cs.push({ ...e, current: false }));
      delete d.dxhistory;
    }
    ((d.conditions && d.conditions.lists && d.conditions.lists.main) || []).forEach((e) => {
      if (PHP.isFilled(e.by)) addNote(e, 'Managed by: ' + e.by);
      delete e.by;
      if (!e.q) {
        const hit = matchLabel(e.name, CONDITIONS);
        if (hit) e.q = hit;
      }
    });

    // Allergies: link to the checklist, anything else goes under Other
    ((d.allergies && d.allergies.lists && d.allergies.lists.main) || []).forEach((e) => {
      if (e.q) return;
      const hit = matchLabel(e.name, ALLERGIES);
      e.q = hit || 'Other';
      if (hit) e.name = hit;
      // "Hives" matches "Hives or rash", "Vomiting" matches "Nausea or vomiting"
      const typed = String(e.reaction || '').trim().toLowerCase();
      const r = ['Hives or rash', 'Itching', 'Swelling', 'Trouble breathing', 'Anaphylaxis', 'Nausea or vomiting', 'Diarrhea', 'Dizziness'].find(
        (l) => l.toLowerCase() === typed || l.toLowerCase().split(' or ').includes(typed)
      );
      if (PHP.isFilled(e.reaction) && !r && e.reaction !== 'Other') (e.reactionOther = e.reaction), (e.reaction = 'Other');
      else if (r) e.reaction = r;
    });

    // Immunizations: vaccine picked from a list, "Given at" moved to notes
    ((d.immunizations && d.immunizations.lists && d.immunizations.lists.main) || []).forEach((e) => {
      if (PHP.isFilled(e.name) && !VACCINES.includes(e.name)) {
        const short = { flu: 'Flu (influenza)', 'covid-19': 'COVID-19', 'covid-19 booster': 'COVID-19', rsv: 'RSV' }[e.name.trim().toLowerCase()];
        if (short) e.name = short;
        else (e.nameOther = e.name), (e.name = 'Other');
      }
      if (PHP.isFilled(e.where) && !PHP.isFilled(e.location)) e.location = e.where.trim();
      delete e.where;
      // An earlier version moved "Given at" into notes; move it back to its own field
      if (!PHP.isFilled(e.location) && PHP.isFilled(e.notes)) {
        const lines = e.notes.split('\n');
        const i = lines.findIndex((l) => /^Given at: /.test(l));
        if (i >= 0) {
          e.location = lines[i].replace(/^Given at: /, '').trim();
          lines.splice(i, 1);
          e.notes = lines.join('\n');
          if (!PHP.isFilled(e.notes)) delete e.notes;
        }
      }
    });

    // Providers: a title typed into the name ("Dr. Patel") becomes the prefix
    ((d.providers && d.providers.lists && d.providers.lists.main) || []).forEach((p) => {
      if (PHP.isFilled(p.prefix) || !PHP.isFilled(p.name)) return;
      const m = p.name.trim().match(/^(Dr|Mr|Mrs|Ms|Mx|Prof)\.?\s+(.+)$/i);
      if (m) {
        p.prefix = PREFIXES.find((x) => x.toLowerCase() === m[1].toLowerCase() + '.');
        p.name = m[2];
      }
    });

    // Providers: credentials typed after the name ("Sam Rivera, PA-C") move to their own box
    ((d.providers && d.providers.lists && d.providers.lists.main) || []).forEach((p) => {
      if (PHP.isFilled(p.credentials) || !PHP.isFilled(p.name)) return;
      const m = p.name.trim().match(/^(.+?),?\s+([A-Za-z.-]+)$/);
      const cred = m && CREDENTIALS.find((c) => c !== 'Other' && c.toLowerCase() === m[2].replace(/\./g, '').toLowerCase().replace('pac', 'pa-c'));
      if (cred) {
        p.name = m[1].replace(/,$/, '').trim();
        p.credentials = cred;
      }
    });

    // Medications: a typed dose ("20 mg") becomes strength and unit; typed frequency matched to the list
    ((d.meds && d.meds.lists && d.meds.lists.main) || []).forEach((e) => {
      if (PHP.isFilled(e.dose)) {
        const m = e.dose.trim().match(/^([\d.]+)\s*(mg|mcg|g|ml|units?|%)$/i);
        if (m && !PHP.isFilled(e.strength)) {
          e.strength = m[1];
          e.unit = UNITS.find((u) => u.toLowerCase() === m[2].toLowerCase().replace(/^unit$/, 'units'));
        } else if (!PHP.isFilled(e.amount)) e.amount = e.dose.trim();
        delete e.dose;
      }
      if (PHP.isFilled(e.freq) && !FREQUENCIES.includes(e.freq)) {
        // Exact matches only; anything else ("Once daily, morning") is kept word for word under Other
        const hit = FREQUENCIES.find((f) => f !== 'Other' && f.toLowerCase() === e.freq.trim().toLowerCase());
        if (hit) e.freq = hit;
        else (e.freqOther = e.freq.trim()), (e.freq = 'Other');
      }
    });

    // Family history: one entry per relative, each with any number of conditions
    const fam = d.family && d.family.lists && d.family.lists.main;
    if (fam && fam.some((e) => !Array.isArray(e.conditions))) {
      const merged = [];
      const byKey = new Map();
      fam.forEach((e) => {
        if (Array.isArray(e.conditions)) return merged.push(e);
        const typed = String(e.rel || '').trim();
        const hit = RELATIVES.find((r) => r !== 'Other' && r.toLowerCase() === typed.toLowerCase());
        const cond = { name: e.name, age: e.age, notes: e.notes };
        const hasCond = Object.values(cond).some((x) => PHP.isFilled(x));
        const key = typed.toLowerCase() + '|' + (e.status || '');
        if (typed && byKey.has(key)) {
          if (hasCond) byKey.get(key).conditions.push(cond);
          return;
        }
        const entry = { id: e.id, rel: hit || (typed ? 'Other' : ''), status: e.status, conditions: hasCond ? [cond] : [] };
        if (!hit && typed) entry.relOther = typed;
        if (typed) byKey.set(key, entry);
        merged.push(entry);
      });
      d.family.lists.main = merged;
    }

    // Lifestyle: earlier fill-in answers mapped onto the new questions
    const ls = d.lifestyle && d.lifestyle.values;
    if (ls) {
      if (ls.smoking === 'Former') ls.smoking = 'Used to';
      if (ls.smoking === 'Current') ls.smoking = 'Yes';
      if (ls.alcohol === 'None') ls.alcohol = 'No';
      if (ls.exercise && !ls.activity) ls.activity = { None: 'Not active', Light: 'Lightly active', Regular: 'Moderately active', Vigorous: 'Very active' }[ls.exercise] || '';
      if (ls.exerciseDesc && !ls.activityType) ls.activityType = ls.exerciseDesc;
      delete ls.exercise;
      delete ls.exerciseDesc;
      if (PHP.isFilled(ls.diet) && !['No', 'Low sodium', 'Low sugar or diabetic', 'Heart healthy', 'Low fat', 'Vegetarian', 'Vegan', 'Gluten free', 'Other'].includes(ls.diet)) (ls.dietOther = ls.diet), (ls.diet = 'Other');
      if (PHP.isFilled(ls.caregiver) && !['Yes', 'No'].includes(ls.caregiver)) (ls.caregiverName = ls.caregiver), (ls.caregiver = 'Yes');
      ls.living = { 'With spouse or partner': 'Spouse or partner', 'With family': 'Family' }[ls.living] || ls.living;
    }

    // Vision, hearing and dental become three sections
    const sv = d.senses && d.senses.values;
    if (sv) {
      const put = (id, vals) => {
        const clean = Object.fromEntries(Object.entries(vals).filter(([, x]) => PHP.isFilled(x)));
        if (Object.keys(clean).length) d[id] = { values: Object.assign((d[id] && d[id].values) || {}, clean), lists: {} };
      };
      // An earlier "Yes" is kept as "Yes" rather than guessing which kind
      put('vision', { glasses: sv.glasses, rx: sv.rx, eyeExam: sv.eyeExam, notes: sv.notes });
      put('hearing', { aids: sv.hearing, hearingExam: sv.hearingExam });
      put('dental', { dental: sv.dental, dentures: sv.dentures === 'No' ? 'None' : sv.dentures });
      delete d.senses;
    }
    return d;
  };
})();
