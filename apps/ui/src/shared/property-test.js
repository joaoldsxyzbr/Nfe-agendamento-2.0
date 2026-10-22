export function createArbitrary(generator, shrinker = null) {
  return { generate: generator, shrink: shrinker };
}

export function forAll(arbitrary, predicate, options = {}) {
  const { iterations = 100, seed = Date.now() } = options;
  let rng = seed;

  const random = () => {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  };

  for (let i = 0; i < iterations; i += 1) {
    const value = arbitrary.generate(random);
    const result = predicate(value);
    if (!result.valid) {
      return {
        valid: false,
        counterexample: value,
        error: result.error,
        iteration: i,
      };
    }
  }

  return { valid: true, iterations };
}

export const arbitraries = {
  accessKey: createArbitrary((random) => {
    const digits = '0123456789';
    const alphanum = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let key = '';
    key += String(Math.floor(random() * 90 + 10));
    key += String(Math.floor(random() * 90 + 10)).slice(0, 4);
    for (let i = 0; i < 12; i += 1) {
      key += alphanum[Math.floor(random() * alphanum.length)];
    }
    for (let i = 0; i < 26; i += 1) {
      key += digits[Math.floor(random() * digits.length)];
    }
    return key.slice(0, 44);
  }),

  validAccessKey: createArbitrary((random) => {
    const ufs = ['35', '33', '41', '42', '43', '31', '32', '52', '29', '23'];
    const uf = ufs[Math.floor(random() * ufs.length)];
    const year = String(Math.floor(random() * 30) + 20).padStart(2, '0');
    const month = String(Math.floor(random() * 12) + 1).padStart(2, '0');
    const cnpj = String(Math.floor(random() * 1e14)).padStart(14, '0');
    const model = random() > 0.5 ? '55' : '65';
    const series = String(Math.floor(random() * 999) + 1).padStart(3, '0');
    const number = String(Math.floor(random() * 999999999) + 1).padStart(9, '0');
    const tpEmis = '1';
    const randomCode = String(Math.floor(random() * 1e8)).padStart(8, '0');

    const prefix = `${uf}${year}${month}${cnpj}${model}${series}${number}${tpEmis}${randomCode}`;
    let sum = 0;
    let weight = 2;
    for (let i = prefix.length - 1; i >= 0; i -= 1) {
      sum += (prefix.charCodeAt(i) - 48) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const digit = 11 - (sum % 11);
    const checkDigit = digit >= 10 ? 0 : digit;

    return `${prefix}${checkDigit}`;
  }),

  string: createArbitrary((random) => {
    const length = Math.floor(random() * 50);
    const chars = 'abcXYZ019 ';
    let str = '';
    for (let i = 0; i < length; i += 1) {
      str += chars[Math.floor(random() * chars.length)];
    }
    return str;
  }),

  xmlFragment: createArbitrary((random) => {
    const tags = ['nfeProc', 'infNFe', 'ide', 'emit', 'dest', 'det', 'ICMSTot'];
    const tag = tags[Math.floor(random() * tags.length)];
    const attrs = random() > 0.5 ? ` Id="NFe${'0'.repeat(44)}"` : '';
    return `<${tag}${attrs}></${tag}>`;
  }),
};
