declare module 'archiver' {
  import type { Transform } from 'node:stream';
  import type { ZlibOptions } from 'node:zlib';

  export interface ArchiverOptions {
    zlib?: ZlibOptions;
    statConcurrency?: number;
  }

  export class Archiver extends Transform {
    pointer(): number;
    directory(dirpath: string, destpath: string | false): this;
    finalize(): Promise<void>;
  }

  export class ZipArchive extends Archiver {
    constructor(options?: ArchiverOptions);
  }

  export class TarArchive extends Archiver {
    constructor(options?: ArchiverOptions);
  }

  export class JsonArchive extends Archiver {
    constructor(options?: ArchiverOptions);
  }
}
