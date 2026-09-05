declare module '#runtime-provider' {
  export function runtime(): import('./lib/runtime-types').Runtime;
}
