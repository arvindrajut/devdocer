import next from 'eslint-config-next';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  ...next,
  ...nextTypescript,
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
];

export default config;
