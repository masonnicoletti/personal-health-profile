/* Sample profile for demos and usability testing. Fictional person. */
(function () {
  const PHP = window.PHP;
  let n = 0;
  const L = (arr) => arr.map((e) => ({ id: 's' + ++n, ...e }));
  const ALBEMARLE = '1450 Ivy Road, Suite 200\nCharlottesville, VA 22903';
  const UVA = '1215 Lee Street\nCharlottesville, VA 22908';

  PHP.sampleData = () => ({
    data: {
      basic: {
        values: {
          first: 'Margaret',
          last: 'Ellis',
          dob: '1949-04-17',
          sex: 'Female',
          blood: 'O+',
          phone: '(434) 555-0142',
          lang: 'English',
          street: '212 Maple Row',
          city: 'Charlottesville',
          state: 'VA',
          zip: '22903',
        },
      },
      lifestyle: {
        values: { smoking: 'Former', quit: '1988', alcohol: 'Occasional', drinks: '1 to 2', exercise: 'Light', exerciseDesc: 'Walking 20 minutes most days', diet: 'Low sugar, low sodium', living: 'Live alone', help: 'Some', helpDesc: 'Grocery shopping, driving at night' },
      },
      family: {
        lists: {
          main: L([
            { rel: 'Mother', name: 'Heart disease', age: '70', status: 'Deceased' },
            { rel: 'Brother', name: 'Type 2 diabetes', age: '58', status: 'Living' },
          ]),
        },
      },
      allergies: {
        lists: {
          main: L([
            { name: 'Penicillin', reaction: 'Hives, swelling', severity: 'Severe' },
            { name: 'Shellfish', reaction: 'Upset stomach', severity: 'Mild' },
          ]),
        },
      },
      conditions: {
        lists: {
          main: L([
            { name: 'High blood pressure', diagnosed: '2008--', by: 'Dr. Anita Patel' },
            { name: 'Type 2 diabetes', diagnosed: '2015-06-', by: 'Dr. Linh Nguyen', notes: 'A1c checked every 3 months' },
            { name: 'Osteoarthritis, both knees', diagnosed: '2019--', by: 'Dr. Anita Patel' },
          ]),
        },
      },
      dxhistory: {
        lists: {
          main: L([{ name: 'Breast cancer, stage I', diagnosed: '2011-02-', resolved: '2012-01-', by: 'UVA Cancer Center', notes: 'Lumpectomy and radiation. In remission.' }]),
        },
      },
      meds: {
        lists: {
          main: L([
            { name: 'Lisinopril', dose: '20 mg', freq: 'Once daily, morning', purpose: 'Blood pressure', prescriber: 'Dr. Anita Patel', start: '2008-09-', current: true },
            { name: 'Metformin', dose: '500 mg', freq: 'Twice daily with meals', purpose: 'Diabetes', prescriber: 'Dr. Linh Nguyen', start: '2015-06-', current: true },
            { name: 'Atorvastatin', dose: '10 mg', freq: 'Once daily, evening', purpose: 'Cholesterol', prescriber: 'Dr. Anita Patel', start: '2017-03-', current: true },
            { name: 'Tamoxifen', dose: '20 mg', start: '2012-02-', end: '2017-02-', prescriber: 'Dr. Chidi Okafor', reason: 'Completed 5-year course', current: false },
            { name: 'Amlodipine', dose: '5 mg', start: '2008-02-', end: '2008-09-', reason: 'Ankle swelling', current: false },
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
      providers: {
        lists: {
          main: L([
            { name: 'Dr. Anita Patel', specialty: 'Primary care', office: 'Albemarle Family Medicine', phone: '(434) 555-0100', address: ALBEMARLE, start: '2006--', current: true },
            { name: 'Sam Rivera, PA-C', specialty: 'Primary care', office: 'Albemarle Family Medicine', phone: '(434) 555-0100', address: ALBEMARLE, start: '2022--', current: true },
            { name: 'Dr. Linh Nguyen', specialty: 'Endocrinology', office: 'UVA Endocrinology', phone: '(434) 555-0155', address: UVA, start: '2015--', current: true },
            { name: 'Dr. Chidi Okafor', specialty: 'Oncology', office: 'UVA Cancer Center', phone: '(434) 555-0160', address: UVA, start: '2011--', end: '2017--', reason: 'Completed treatment', current: false },
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
      immunizations: {
        lists: {
          main: L([
            { name: 'Flu', date: '2026-10-02', where: 'Main Street Pharmacy' },
            { name: 'COVID-19 booster', date: '2026-10-02', where: 'Main Street Pharmacy' },
            { name: 'Shingles (Shingrix), 2 doses', date: '2022-05-', where: 'Dr. Patel' },
            { name: 'Pneumonia (PCV20)', date: '2023-11-' },
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
      emergency: {
        lists: {
          main: L([
            { first: 'Daniel', last: 'Ellis', rel: 'Son', phone: '(434) 555-0177', email: 'daniel.ellis@example.com' },
            { first: 'Ruth', last: 'Carter', rel: 'Neighbor', phone: '(434) 555-0123' },
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
    },
    added: ['appointments'],
    open: { basic: true, meds: true },
  });
})();
