/* Sample profile for demos and usability testing. Fictional person. */
(function () {
  const PHP = window.PHP;
  let n = 0;
  const L = (arr) => arr.map((e) => ({ id: 's' + ++n, ...e }));
  const ALBEMARLE = { street: '1450 Ivy Road', unit: 'Suite 200', city: 'Charlottesville', state: 'VA', zip: '22903' };
  const UVA = { street: '1215 Lee Street', city: 'Charlottesville', state: 'VA', zip: '22908' };

  PHP.sampleData = () => ({
    data: {
      basic: {
        values: {
          first: 'Margaret',
          last: 'Ellis',
          preferred: 'Peggy',
          dob: '1949-04-17',
          sex: 'Female',
          marital: 'Widowed',
          height: '5-4',
          weight: '148',
          blood: 'O+',
          phone: '(434) 555-0142',
          donor: 'Yes',
          street: '212 Maple Row',
          city: 'Charlottesville',
          state: 'VA',
          zip: '22903',
        },
      },
      lifestyle: {
        values: {
          smoking: 'Used to',
          quit: '1988',
          smokedYears: '15',
          alcohol: 'Occasionally',
          drinks: '2',
          caffeine: '2',
          drugs: 'No',
          diet: 'Low sugar or diabetic',
          activity: 'Lightly active',
          activityType: 'Walking',
          activityDays: '5',
          activityMins: '20',
          mobility: 'Cane',
          falls: 'Yes',
          fallCount: '1',
          sleepHours: '6',
          sleepQuality: 'Fairly well',
          sleepTrouble: true,
          sleepDesc: 'Wakes up at night with knee pain',
          stress: 'Moderate',
          stressDesc: 'Managing appointments alone',
          work: 'Retired',
          formerOccupation: 'Elementary school teacher',
          living: 'Live alone',
          caregiver: 'No',
          help: 'Some',
          helpDesc: 'Grocery shopping, driving at night',
          driving: 'Daytime only',
        },
      },
      family: {
        lists: {
          main: L([
            { rel: 'Mother', name: 'Heart disease', age: '70', status: 'Deceased' },
            { rel: 'Brother', name: 'Type 2 diabetes', age: '58', status: 'Living' },
          ]),
        },
      },
      conditions: {
        lists: {
          main: L([
            { q: 'High blood pressure', name: 'High blood pressure', diagnosed: '2008--', current: true },
            { q: 'Diabetes', name: 'Type 2 diabetes', diagnosed: '2015-06-', notes: 'A1c checked every 3 months', current: true },
            { q: 'Arthritis', name: 'Osteoarthritis, both knees', diagnosed: '2019--', current: true },
            { q: 'Cancer', name: 'Breast cancer, stage I', diagnosed: '2011-02-', resolved: '2012-01-', notes: 'Lumpectomy and radiation. In remission.', current: false },
          ]),
        },
      },
      meds: {
        lists: {
          main: L([
            { current: true, name: 'Lisinopril', dose: '20 mg', freq: 'Once daily, morning', prescriber: 'Dr. Anita Patel', start: '2008-09-' },
            { current: true, name: 'Metformin', dose: '500 mg', freq: 'Twice daily with meals', prescriber: 'Dr. Linh Nguyen', start: '2015-06-' },
            { current: true, name: 'Atorvastatin', dose: '10 mg', freq: 'Once daily, evening', prescriber: 'Dr. Anita Patel', start: '2017-03-' },
            { current: false, name: 'Tamoxifen', dose: '20 mg', start: '2012-02-', end: '2017-02-', prescriber: 'Dr. Chidi Okafor', reason: 'Completed 5-year course' },
            { current: false, name: 'Amlodipine', dose: '5 mg', start: '2008-02-', end: '2008-09-', reason: 'Ankle swelling' },
          ]),
        },
      },
      surgeries: {
        lists: {
          main: L([
            { name: 'Lumpectomy, left breast', date: '2011-03-08', where: 'UVA Medical Center' },
            { name: 'Cataract surgery, right eye', date: '2021-10-', where: 'Blue Ridge Eye Center' },
          ]),
        },
      },
      immunizations: {
        lists: {
          main: L([
            { name: 'Flu (influenza)', date: '2026-10-02' },
            { name: 'COVID-19', date: '2026-10-02' },
            { name: 'RSV', date: '2024-09-' },
            { name: 'Pneumonia (PCV20)', date: '2023-11-' },
            { name: 'Shingles (Shingrix)', date: '2022-05-', notes: 'Both doses' },
          ]),
        },
      },
      allergies: {
        lists: {
          main: L([
            { q: 'Penicillin', name: 'Penicillin', severity: 'Severe', reaction: 'Hives or rash', notes: 'Also swelling of the lips' },
            { q: 'Shellfish', name: 'Shellfish', severity: 'Mild', reaction: 'Nausea or vomiting' },
          ]),
        },
      },
      providers: {
        lists: {
          main: L([
            { current: true, name: 'Dr. Anita Patel', specialty: 'Primary care', office: 'Albemarle Family Medicine', phone: '(434) 555-0100', ...ALBEMARLE, start: '2006--' },
            { current: true, name: 'Sam Rivera, PA-C', specialty: 'Primary care', office: 'Albemarle Family Medicine', phone: '(434) 555-0100', ...ALBEMARLE, start: '2022--' },
            { current: true, name: 'Dr. Linh Nguyen', specialty: 'Endocrinology', office: 'UVA Endocrinology', phone: '(434) 555-0155', ...UVA, start: '2015--' },
            { current: false, name: 'Dr. Chidi Okafor', specialty: 'Oncology', office: 'UVA Cancer Center', phone: '(434) 555-0160', ...UVA, start: '2011--', end: '2017--', reason: 'Completed treatment' },
          ]),
        },
      },
      insurance: {
        lists: {
          main: L([
            { type: 'Medicare', provider: 'Medicare Part A & B', member: '1EG4-TE5-MK72' },
            { type: 'Supplemental', provider: 'Blue Cross Medigap Plan G', member: 'XJH448213', phone: '(800) 555-0111' },
          ]),
        },
      },
      emergency: {
        lists: {
          main: L([
            { first: 'Daniel', last: 'Ellis', rel: 'Son', phone: '(434) 555-0177', email: 'daniel.ellis@example.com', notes: 'Health care proxy. Call first.' },
            { first: 'Ruth', last: 'Carter', rel: 'Neighbor', phone: '(434) 555-0123', notes: 'Has a spare key' },
          ]),
        },
      },
      notes: {
        lists: {
          main: L([
            { date: '2026-11-01', type: 'New symptom', text: 'Tingling in both feet at night, started about 3 weeks ago.' },
            { date: '2026-10-20', type: 'Question for next visit', text: 'Should I still take baby aspirin?' },
            { date: '2026-09-12', type: 'Doctor recommendation', text: 'Dr. Patel: check blood pressure at home twice a week and bring the log.', resolved: true },
          ]),
        },
      },
      appointments: {
        lists: {
          main: L([
            {
              date: '2026-09-12',
              office: 'Albemarle Family Medicine',
              provider: 'Dr. Anita Patel',
              notes: 'Annual physical. Blood pressure a little high (142/88).',
              tests: true,
              testsNote: 'A1c and lipid panel',
              followup: true,
              followupNote: 'December 4',
            },
            {
              date: '2026-07-08',
              office: 'UVA Endocrinology',
              provider: 'Dr. Linh Nguyen',
              medChange: true,
              medChangeNote: 'Metformin timing moved to meals',
              referral: true,
              referralNote: 'Podiatry for foot check',
            },
          ]),
        },
      },
      vision: { values: { glasses: 'Glasses', rx: 'Reading +2.00', eyeExam: '2026-03-', eyeConditions: 'Early cataract, left eye' } },
    },
    added: ['appointments', 'vision'],
    open: { basic: true },
  });
})();
