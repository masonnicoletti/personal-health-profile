/* Personal Health Profile: schema
 * Single source of truth for the form and the PDF.
 *
 * Section kinds
 *   profile : one record of fields
 *   list    : repeating entries. L.kind = 'current' (updatable) or 'history' (permanent record)
 *             L.split = 'current' groups entries into Current and Past by that checkbox
 * Field: { k, label, type, w, opts, ph, showIf(values), suggest(), meta, defaultOn }
 *   type: text | long | date | phone | select | check | checklist
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
    if (!y) return Infinity; // undated entries float to the top while being filled in
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
  PHP.currentProviderNames = () => uniq(PHP.providers().filter(PHP.isCurrent).map((p) => p.name));

  const YN = ['Yes', 'No'];
  const STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'Other'];
  const SPECIALTIES = ['Primary care', 'Audiology', 'Cardiology', 'Dentistry', 'Dermatology', 'Endocrinology', 'Gastroenterology', 'Geriatrics', 'Nephrology', 'Neurology', 'Oncology', 'Ophthalmology', 'Optometry', 'Orthopedics', 'Physical therapy', 'Podiatry', 'Psychiatry', 'Counseling', 'Pulmonology', 'Rheumatology', 'Urology', 'Other'];
  const RELATIONS = ['Spouse', 'Partner', 'Son', 'Daughter', 'Parent', 'Sibling', 'Grandchild', 'Other relative', 'Friend', 'Neighbor', 'Caregiver', 'Other'];
  const notStopped = (v) => v.current === false;
  const fullName = (t) => [t.first, t.last].filter(Boolean).join(' ');
  const range = (a, b) => [PHP.fmtDate(a), PHP.fmtDate(b)].filter(Boolean).join(' to ');

  const SECTIONS = [
    {
      id: 'basic',
      title: 'Basic Information',
      kind: 'profile',
      fields: [
        { k: 'first', label: 'First name', type: 'text', w: 'half' },
        { k: 'last', label: 'Last name', type: 'text', w: 'half' },
        { k: 'dob', label: 'Date of birth', type: 'date', w: 'third' },
        { k: 'sex', label: 'Sex', type: 'select', opts: ['Female', 'Male', 'Other'], w: 'third' },
        { k: 'blood', label: 'Blood type', type: 'select', opts: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'], w: 'third' },
        { k: 'phone', label: 'Phone', type: 'phone', w: 'third' },
        { k: 'email', label: 'Email', type: 'text', w: 'third' },
        { k: 'lang', label: 'Primary language', type: 'text', w: 'third' },
        { k: 'street', label: 'Street address', type: 'text', w: 'twothird' },
        { k: 'unit', label: 'Apt or unit', type: 'text', w: 'third' },
        { k: 'city', label: 'City', type: 'text', w: 'third' },
        { k: 'state', label: 'State', type: 'select', opts: STATES, w: 'third' },
        { k: 'zip', label: 'ZIP code', type: 'text', w: 'third', inputmode: 'numeric', maxlength: 10 },
      ],
      merge: [
        { label: 'Name', keys: ['first', 'last'], join: fullName },
        {
          label: 'Address',
          keys: ['street', 'unit', 'city', 'state', 'zip'],
          long: true,
          join: (t) => [[t.street, t.unit].filter(Boolean).join(', '), [[t.city, t.state].filter(Boolean).join(', '), t.zip].filter(Boolean).join(' ')].filter(Boolean).join('\n'),
        },
      ],
    },

    {
      id: 'lifestyle',
      title: 'Lifestyle & Social',
      kind: 'profile',
      info: {
        what: 'Everyday habits and living situation.',
        why: 'Habits and support at home shape your health and care options.',
      },
      fields: [
        { k: 'smoking', label: 'Tobacco', type: 'select', opts: ['Never', 'Former', 'Current'], w: 'half' },
        { k: 'quit', label: 'Year quit', type: 'text', w: 'half', showIf: (v) => v.smoking === 'Former' },
        { k: 'amount', label: 'Amount per day', type: 'text', w: 'half', showIf: (v) => v.smoking === 'Current' },
        { k: 'alcohol', label: 'Alcohol', type: 'select', opts: ['None', 'Occasional', 'Weekly', 'Daily'], w: 'half' },
        { k: 'drinks', label: 'Drinks per week', type: 'text', w: 'half', showIf: (v) => !!v.alcohol && v.alcohol !== 'None' },
        { k: 'exercise', label: 'Exercise', type: 'select', opts: ['None', 'Light', 'Regular', 'Vigorous'], w: 'half' },
        { k: 'exerciseDesc', label: 'What kind', type: 'text', w: 'half', showIf: (v) => !!v.exercise && v.exercise !== 'None' },
        { k: 'diet', label: 'Diet', type: 'text', w: 'full', ph: 'e.g. low sodium' },
        { k: 'living', label: 'Living situation', type: 'select', opts: ['Live alone', 'With spouse or partner', 'With family', 'Assisted living', 'Nursing home', 'Other'], w: 'half' },
        { k: 'caregiver', label: 'Caregiver', type: 'text', w: 'half' },
        { k: 'help', label: 'Needs help with daily tasks', type: 'select', opts: ['No', 'Some', 'Often'], w: 'half' },
        { k: 'helpDesc', label: 'Which tasks', type: 'text', w: 'half', showIf: (v) => v.help === 'Some' || v.help === 'Often' },
        { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
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
          { k: 'rel', label: 'Relative', type: 'text', w: 'half', ph: 'e.g. Mother' },
          { k: 'name', label: 'Condition', type: 'text', w: 'half' },
          { k: 'age', label: 'Age at diagnosis', type: 'text', w: 'half' },
          { k: 'status', label: 'Status', type: 'select', opts: ['Living', 'Deceased'], w: 'half' },
          { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
        ],
        title_: (e) => [e.rel, e.name].filter(Boolean).join(': '),
        sub: (e) => [e.age && 'Age ' + e.age, e.status].filter(Boolean).join(' · '),
      },
    },

    {
      id: 'allergies',
      title: 'Allergies',
      kind: 'list',
      info: {
        what: 'Anything that causes you a reaction: medicines, foods, latex, insect stings.',
        why: 'Helps every provider avoid treatments that could harm you.',
      },
      list: {
        key: 'main',
        kind: 'current',
        itemLabel: 'allergy',
        noneLabel: 'No known allergies',
        fields: [
          { k: 'name', label: 'Allergic to', type: 'text', w: 'half' },
          { k: 'reaction', label: 'Reaction', type: 'text', w: 'half' },
          { k: 'severity', label: 'Severity', type: 'select', opts: ['Mild', 'Moderate', 'Severe'], w: 'half' },
          { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
        ],
        title_: (e) => e.name,
        sub: (e) => [e.reaction, e.severity].filter(Boolean).join(' · '),
      },
    },

    {
      id: 'conditions',
      title: 'Current Conditions',
      kind: 'list',
      info: {
        what: 'Health conditions you have now or are managing.',
        why: 'Gives a quick picture of your health. When a condition resolves, move it to Diagnosis History.',
      },
      list: {
        key: 'main',
        kind: 'current',
        itemLabel: 'condition',
        historyId: 'dxhistory',
        historyName: 'Diagnosis History',
        toHistory: { name: 'name', diagnosed: 'diagnosed', by: 'by', notes: 'notes' },
        endField: 'resolved',
        endLabel: 'Resolved',
        fields: [
          { k: 'name', label: 'Condition', type: 'text', w: 'full' },
          { k: 'diagnosed', label: 'Date diagnosed', type: 'date', w: 'half' },
          { k: 'by', label: 'Managed by', type: 'text', w: 'half', suggest: () => PHP.currentProviderNames() },
          { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
        ],
        title_: (e) => e.name,
        sub: (e) => [e.diagnosed && 'Since ' + PHP.fmtDate(e.diagnosed), e.by].filter(Boolean).join(' · '),
      },
    },

    {
      id: 'dxhistory',
      title: 'Diagnosis History',
      kind: 'list',
      info: {
        what: 'Past conditions, resolved or no longer active.',
        why: 'Past diagnoses still matter to future care.',
      },
      list: {
        key: 'main',
        kind: 'history',
        itemLabel: 'diagnosis',
        sortBy: 'diagnosed',
        fields: [
          { k: 'name', label: 'Condition', type: 'text', w: 'full' },
          { k: 'diagnosed', label: 'Diagnosed', type: 'date', w: 'half' },
          { k: 'resolved', label: 'Resolved', type: 'date', w: 'half' },
          { k: 'by', label: 'Treated by', type: 'text', w: 'full' },
          { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
        ],
        title_: (e) => e.name,
        sub: (e) => range(e.diagnosed, e.resolved),
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
          { k: 'name', label: 'Medication', type: 'text', w: 'half' },
          { k: 'dose', label: 'Dose', type: 'text', w: 'half', ph: 'e.g. 10 mg' },
          { k: 'freq', label: 'How often', type: 'text', w: 'half', ph: 'e.g. twice daily' },
          { k: 'purpose', label: 'For', type: 'text', w: 'half' },
          { k: 'prescriber', label: 'Prescribed by', type: 'text', w: 'half', suggest: () => PHP.currentProviderNames() },
          { k: 'start', label: 'Started', type: 'date', w: 'half' },
          { k: 'current', label: 'Currently taking', type: 'check', w: 'full', meta: true, defaultOn: true },
          { k: 'end', label: 'Stopped', type: 'date', w: 'half', showIf: notStopped },
          { k: 'reason', label: 'Reason stopped', type: 'text', w: 'half', showIf: notStopped },
          { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
        ],
        title_: (e) => e.name,
        sub: (e) =>
          PHP.isCurrent(e) ? [e.dose, e.freq, e.purpose].filter(Boolean).join(' · ') : [e.dose, range(e.start, e.end), e.reason].filter(Boolean).join(' · '),
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
          { k: 'name', label: 'Name', type: 'text', w: 'half' },
          { k: 'specialty', label: 'Specialty', type: 'select', opts: SPECIALTIES, w: 'half' },
          { k: 'office', label: 'Office', type: 'text', w: 'half', suggest: () => PHP.officeNames() },
          { k: 'phone', label: 'Phone', type: 'phone', w: 'half' },
          { k: 'address', label: 'Address', type: 'long', w: 'full' },
          { k: 'start', label: 'Started seeing', type: 'date', w: 'half' },
          { k: 'current', label: 'Currently seeing', type: 'check', w: 'half', meta: true, defaultOn: true },
          { k: 'end', label: 'Stopped seeing', type: 'date', w: 'half', showIf: notStopped },
          { k: 'reason', label: 'Reason for leaving', type: 'text', w: 'half', showIf: notStopped },
          { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
        ],
        merge: [{ label: 'Office', keys: ['office', 'address'], join: (t) => [t.office, t.address.replace(/\s*\n\s*/g, ', ')].filter(Boolean).join('\n') }],
        // Typing an office that is already listed fills in its address and phone
        autofill: (e, k) => {
          if (k !== 'office' || !PHP.isFilled(e.office)) return null;
          const key = e.office.trim().toLowerCase();
          const m = PHP.providers().find((p) => p !== e && String(p.office || '').trim().toLowerCase() === key);
          if (!m) return null;
          const out = {};
          if (e.office !== m.office) out.office = m.office; // match the existing spelling
          if (!PHP.isFilled(e.address) && PHP.isFilled(m.address)) out.address = m.address;
          if (!PHP.isFilled(e.phone) && PHP.isFilled(m.phone)) out.phone = m.phone;
          return out;
        },
        title_: (e) => e.name || e.office,
        sub: (e) => [PHP.ov(e, 'specialty'), e.name && e.office, !PHP.isCurrent(e) && range(e.start, e.end)].filter(Boolean).join(' · '),
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
      id: 'immunizations',
      title: 'Immunizations',
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
          { k: 'name', label: 'Vaccine', type: 'text', w: 'half', ph: 'e.g. Flu, Shingles' },
          { k: 'date', label: 'Date', type: 'date', w: 'half' },
          { k: 'where', label: 'Given at', type: 'text', w: 'full' },
          { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
        ],
        title_: (e) => e.name,
        sub: (e) => [PHP.fmtDate(e.date), e.where].filter(Boolean).join(' · '),
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
        ],
        merge: [{ label: 'Name', keys: ['first', 'last'], join: fullName }],
        title_: (e) => fullName(e),
        sub: (e) => [PHP.ov(e, 'rel'), e.phone].filter(Boolean).join(' · '),
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
          { k: 'pulse', label: 'Pulse', type: 'text', w: 'third' },
          { k: 'weight', label: 'Weight', type: 'text', w: 'third' },
          { k: 'glucose', label: 'Glucose', type: 'text', w: 'third' },
          { k: 'notes', label: 'Notes', type: 'text', w: 'full' },
        ],
        title_: (e) => [e.bp && 'BP ' + e.bp, e.pulse && 'Pulse ' + e.pulse].filter(Boolean).join(' · ') || PHP.fmtDate(e.date),
        sub: (e) => [PHP.fmtDate(e.date), e.weight, e.glucose && 'Glucose ' + e.glucose].filter(Boolean).join(' · '),
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
      id: 'senses',
      title: 'Vision, Hearing & Dental',
      optional: true,
      blurb: 'Glasses, hearing aids, dental visits',
      kind: 'profile',
      info: { what: 'Eye, ear and dental care details.', why: 'These checkups are easy to lose track of.' },
      fields: [
        { k: 'glasses', label: 'Glasses or contacts', type: 'select', opts: YN, w: 'half' },
        { k: 'rx', label: 'Prescription', type: 'text', w: 'half', showIf: (v) => v.glasses === 'Yes' },
        { k: 'eyeExam', label: 'Last eye exam', type: 'date', w: 'half' },
        { k: 'hearing', label: 'Hearing aids', type: 'select', opts: YN, w: 'half' },
        { k: 'hearingExam', label: 'Last hearing test', type: 'date', w: 'half' },
        { k: 'dental', label: 'Last dental visit', type: 'date', w: 'half' },
        { k: 'dentures', label: 'Dentures or implants', type: 'select', opts: YN, w: 'half' },
        { k: 'notes', label: 'Notes', type: 'long', w: 'full' },
      ],
    },
  ];

  // Display order of the core sections; optional sections follow in the order defined above
  const ORDER = ['basic', 'lifestyle', 'family', 'conditions', 'dxhistory', 'meds', 'surgeries', 'immunizations', 'allergies', 'providers', 'insurance', 'emergency', 'notes'];
  const defined = new Map(SECTIONS.map((s, i) => [s.id, i]));
  const rank = (s) => (ORDER.includes(s.id) ? ORDER.indexOf(s.id) : ORDER.length + defined.get(s.id));
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

  PHP.fieldFilled = (f, obj) => (f.type === 'checklist' ? f.items.some((i) => obj[i.k] === true) : PHP.isFilled(obj[f.k]));
  PHP.fieldText = (f, obj) => {
    const v = obj[f.k];
    if (f.type === 'checklist')
      return f.items
        .filter((i) => obj[i.k] === true)
        .map((i) => (PHP.isFilled(obj[i.k + 'Note']) ? `${i.label}: ${obj[i.k + 'Note'].trim()}` : i.label))
        .join('\n');
    if (f.type === 'date') return PHP.fmtDate(v);
    if (f.type === 'check') return v ? 'Yes' : '';
    if (f.type === 'select') return PHP.ov(obj, f.k);
    return String(v == null ? '' : v).trim();
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
      if (f.meta || merged.has(f.k)) continue;
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
        cols.push({ label: f.label, k: f.k, long: f.type === 'long' || f.type === 'checklist', type: f.type, text: (o) => (vis(o) ? PHP.fieldText(f, o) : ''), filled: (o) => vis(o) && PHP.fieldFilled(f, o) });
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

  /* ---------- Upgrade data saved by earlier versions ---------- */
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
    const b = d.basic;
    if (b && b.values) {
      const v = b.values;
      if (v.name && !v.first && !v.last) Object.assign(v, splitName(v.name));
      delete v.name;
      if (v.address && !v.street) {
        const lines = v.address.split('\n').map((s) => s.trim()).filter(Boolean);
        const m = lines.length > 1 && lines[lines.length - 1].match(/^(.*?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
        if (m) {
          const st = m[2].toUpperCase();
          Object.assign(v, { street: lines.slice(0, -1).join(', '), city: m[1], zip: m[3] }, STATES.includes(st) ? { state: st } : { state: 'Other', stateOther: m[2] });
        } else v.street = lines.join(', ');
      }
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
    if (d.medhistory) {
      const meds = list('meds');
      ((d.medhistory.lists || {}).main || []).forEach((e) => meds.push({ ...e, current: false }));
      delete d.medhistory;
    }
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
    return d;
  };
})();
