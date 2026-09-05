import { tesseraPlugin } from 'tessera-learn/plugin';

export default {
  plugins: [tesseraPlugin({ standardOverride: process.env.TESSERA_STANDARD })],
};
