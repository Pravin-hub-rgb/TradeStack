declare module "upstox-js-sdk" {
  const UpstoxClient: {
    ApiClient: {
      instance: {
        authentications: {
          OAUTH2: {
            accessToken: string;
          };
        };
      };
    };
    MarketDataStreamerV3: new (
      instrumentKeys?: string[],
      mode?: string,
    ) => {
      streamer: {
        protobufRoot: any;
        disconnect(): void;
      };
      connect(): void;
      disconnect(): void;
      subscribe(instrumentKeys: string[], mode: string): void;
      unsubscribe(instrumentKeys: string[]): void;
      changeMode(instrumentKeys: string[], newMode: string): void;
      autoReconnect(enable: boolean, interval?: number, retryCount?: number): void;
      on(event: string, callback: (...args: any[]) => void): void;
    };
  };
  export default UpstoxClient;
}
