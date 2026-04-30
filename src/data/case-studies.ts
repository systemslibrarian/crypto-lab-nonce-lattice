// Historical case studies for nonce leakage and lattice attacks

export interface CaseStudy {
  title: string;
  year: number;
  category: string;
  whatFailed: string;
  whatLeaked: string;
  lesson: string;
  reference: string;
  realityLabel: string;
}

export const caseStudies: CaseStudy[] = [
  {
    title: 'Sony PS3 ECDSA Nonce Reuse',
    year: 2010,
    category: 'Historical / Real-World Failure',
    whatFailed: 'ECDSA implementation reused nonces',
    whatLeaked: 'Repeated nonce',
    lesson: 'Never reuse nonces in ECDSA',
    reference: 'https://www.fail0verflow.com/blog/2010/ps3-epic-fail/',
    realityLabel: 'Historical / Real-World Failure',
  },
  {
    title: 'Android SecureRandom Bitcoin Wallet Failures',
    year: 2013,
    category: 'Historical / Real-World Failure',
    whatFailed: 'Weak randomness in SecureRandom',
    whatLeaked: 'Predictable/repeated nonce',
    lesson: 'Use strong randomness for cryptography',
    reference: 'https://bitcoin.org/en/alert/2013-08-11-android',
    realityLabel: 'Historical / Real-World Failure',
  },
  {
    title: 'Minerva Timing Attack',
    year: 2019,
    category: 'Implementation Side-Channel Class',
    whatFailed: 'Timing side-channel in ECDSA',
    whatLeaked: 'Partial nonce bits',
    lesson: 'Constant-time implementation is critical',
    reference: 'https://minerva.crocs.fi.muni.cz/',
    realityLabel: 'Implementation Side-Channel Class',
  },
  {
    title: 'TPM-FAIL Timing Attack',
    year: 2019,
    category: 'Implementation Side-Channel Class',
    whatFailed: 'Timing side-channel in TPMs',
    whatLeaked: 'Partial nonce bits',
    lesson: 'Hardware can leak via timing',
    reference: 'https://tpm.fail/',
    realityLabel: 'Implementation Side-Channel Class',
  },
  {
    title: 'RFC6979 as Defense',
    year: 2013,
    category: 'Defender Mode',
    whatFailed: 'N/A (defense)',
    whatLeaked: 'No leakage',
    lesson: 'Deterministic nonces prevent these attacks',
    reference: 'https://tools.ietf.org/html/rfc6979',
    realityLabel: 'Defender Mode',
  },
  {
    title: 'General HNP / Lattice Attacks',
    year: 2000,
    category: 'Educational Leakage Model',
    whatFailed: 'Partial nonce leakage',
    whatLeaked: 'MSB/LSB/fixed bits',
    lesson: 'Partial leakage can be fatal',
    reference: 'https://eprint.iacr.org/2000/010',
    realityLabel: 'Educational Leakage Model',
  },
];
