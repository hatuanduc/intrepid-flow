export {};

declare global {
  interface Window {
    __INTREPID__?: {
      apiBaseUrl?: string;
    };
  }
}
