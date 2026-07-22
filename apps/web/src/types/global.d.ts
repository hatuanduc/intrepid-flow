export {};

declare global {
  interface Window {
    __INTREPID__?: {
      apiBaseUrl?: string;
    };
    // Minimal Google Identity Services surface — only what the login page uses.
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            login_hint?: string;
          }): void;
          renderButton(
            parent: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              width?: number;
              locale?: string;
            },
          ): void;
        };
      };
    };
  }
}
