import Mux from "@mux/mux-node";

let muxClient: Mux | null = null;

const isPlaceholderCredential = (value?: string) =>
  !value ||
  /^your_/i.test(value) ||
  /^replace_/i.test(value) ||
  /^todo$/i.test(value) ||
  /^xxx+$/i.test(value);

export const getMux = () => {
  if (
    isPlaceholderCredential(process.env.MUX_TOKEN_ID) ||
    isPlaceholderCredential(process.env.MUX_TOKEN_SECRET)
  ) {
    throw new Error("Mux credentials are not set");
  }

  muxClient ??= new Mux({
    tokenId: process.env.MUX_TOKEN_ID,
    tokenSecret: process.env.MUX_TOKEN_SECRET,
  });

  return muxClient;
};
