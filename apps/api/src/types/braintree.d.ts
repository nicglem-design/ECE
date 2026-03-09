declare module "braintree" {
  export interface BraintreeGateway {
    clientToken: { generate(options?: object): Promise<{ clientToken: string }> };
    transaction: {
      sale(params: {
        amount: string;
        paymentMethodNonce: string;
        options?: { submitForSettlement?: boolean };
      }): Promise<{ success: boolean; transaction?: { id?: string; processorResponseText?: string }; message?: string }>;
    };
  }

  export const Environment: { Sandbox: string; Production: string };
  export class BraintreeGateway {
    constructor(config: {
      environment: string;
      merchantId: string;
      publicKey: string;
      privateKey: string;
    });
  }
}
