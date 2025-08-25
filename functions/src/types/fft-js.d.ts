// functions/src/types/fft-js.d.ts
declare module 'fft-js' {
  export function fft(input: number[]): Array<[number, number]>;
  export function ifft(input: Array<[number, number]>): number[];

  export namespace util {
    /** Magnitude of complex phasors returned by fft() */
    function fftMag(phasors: Array<[number, number]>): number[];
    /** Optional helpers the lib exposes (add as you need) */
    function conjugate(phasors: Array<[number, number]>): Array<[number, number]>;
    function polar(phasors: Array<[number, number]>): Array<[number, number]>;
  }
}
